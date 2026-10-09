// Scenario 4 — slow-network: apply delay or error to SELECTED requests via
// Playwright routes, capture how the page behaves within a bound, and remove
// the handlers with the context (one clean context per scenario).
import type { ScenarioContext, ScenarioDef } from "./types.js";
import { reportRouteMatches } from "./empty-data.js";

export const slowNetworkScenario: ScenarioDef = {
  id: "slow-network",
  title: "Slow or failing selected request",
  summary:
    "Intercepts the declared route(s): mode \"delay\" holds the real response for delayMs, mode \"fail\" " +
    "responds with the configured HTTP error status after delayMs. Other requests pass through. The " +
    "scenario waits at most settleMs (default: max delayMs + 1500) for the perturbed requests to settle, " +
    "then records what the page shows.",
  paramsDoc: {
    routes: 'required. [{ urlPattern, mode: "delay" | "fail", delayMs?, status? }]',
    settleMs: "optional observation bound in ms (default: max delayMs + 1500)",
  },
  validate(params) {
    const errors: string[] = [];
    const routes = params.routes ?? [];
    if (routes.length === 0) {
      errors.push('slow-network requires params.routes with at least one { urlPattern, mode: "delay"|"fail" }');
    }
    for (const r of routes) {
      if (r.mode === "fulfill") {
        errors.push('slow-network routes must use mode "delay" or "fail"; use the empty-data scenario for fixture bodies');
      }
      if (r.mode === "fail" && r.status === undefined) {
        errors.push('slow-network route mode "fail" requires a status (e.g. 500)');
      }
    }
    return errors;
  },
  contextOptions() {
    return {};
  },
  minBudgetMs(params) {
    // Journey + delay + settle window + render allowance: a configured delay
    // must never turn into a "budget exceeded" infrastructure error.
    const maxDelay = Math.max(0, ...(params.routes ?? []).map((r) => r.delayMs ?? 0));
    const settle = params.settleMs ?? Math.min(maxDelay + 1500, 15000);
    return settle + 10000;
  },
  async beforeJourney(ctx: ScenarioContext) {
    const matches: Record<string, number> = {};
    ctx.store.routeMatches = matches;
    for (const route of ctx.params.routes ?? []) {
      matches[route.urlPattern] = 0;
      await ctx.context.route(route.urlPattern, async (intercepted) => {
        matches[route.urlPattern] = (matches[route.urlPattern] ?? 0) + 1;
        const delay = route.delayMs ?? 0;
        if (delay > 0) await new Promise((r) => setTimeout(r, delay));
        if (route.mode === "fail") {
          await intercepted.fulfill({
            status: route.status ?? 500,
            contentType: "text/plain",
            body: `hard-mode fixture: ${route.status ?? 500} (label: ${route.label ?? "none"})`,
          });
        } else {
          // Pass the real response through after the delay.
          const response = await intercepted.fetch().catch(() => null);
          if (response) {
            await intercepted.fulfill({ response });
          } else {
            await intercepted.abort("failed");
          }
        }
      });
      ctx.signals.note(`route ${route.urlPattern}: mode=${route.mode} delayMs=${route.delayMs ?? 0} status=${route.status ?? "-"} (label: ${route.label ?? "none"})`);
    }
  },
  async afterJourney(ctx: ScenarioContext) {
    const maxDelay = Math.max(0, ...(ctx.params.routes ?? []).map((r) => r.delayMs ?? 0));
    const settle = ctx.params.settleMs ?? Math.min(maxDelay + 1500, 15000);
    await ctx.page.waitForTimeout(settle);
    reportRouteMatches(ctx);
    // What does the page show right now for the perturbed area? A text snapshot
    // of the body is recorded as run evidence; findings come from detectors
    // and declared expectations.
    const bodyText = (await ctx.page.evaluate(() => document.body.innerText)).slice(0, 2000);
    ctx.store.bodyText = bodyText;
    for (const route of ctx.params.routes ?? []) {
      const loadingLike = /loading|spinner|skeleton/i.test(bodyText);
      if (loadingLike) {
        ctx.signals.push({
          detector: "network-observation",
          target: route.urlPattern,
          type: "needs_review",
          summary: `after ${settle}ms with ${route.mode}${route.delayMs ? `(${route.delayMs}ms)` : ""}${route.status ? ` ${route.status}` : ""} on ${route.urlPattern}, the page still shows loading-like text; intended behavior must come from declared expectations`,
          method: `Playwright route handler + body innerText snapshot after settle window (${settle}ms)`,
          details: { bodyTextHead: bodyText.slice(0, 300) },
        });
      }
    }
  },
};
