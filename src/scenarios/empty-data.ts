// Scenario 3 — empty-data: intercept ONLY the selected endpoint(s) and
// fulfill them with the fixture body from the config. The body must be a
// valid empty shape for that API's contract — the config author decides it,
// we never blindly rewrite JSON to [].
import { observeRegion, judgeRegion } from "../detectors/blank.js";
import type { ScenarioContext, ScenarioDef } from "./types.js";

export const emptyDataScenario: ScenarioDef = {
  id: "empty-data",
  title: "Empty but valid API data",
  summary:
    "Intercepts the declared route(s) and fulfills them with the configured body (e.g. a valid empty " +
    "collection for that API). Only the declared patterns are touched; every other request passes " +
    "through untouched. After the journey, declared content regions are inspected for empty-without-empty-state.",
  paramsDoc: {
    routes: "required. [{ urlPattern, mode: \"fulfill\", body, contentType?, label? }] — the agreed empty shape",
    contentRegions: "optional. [{ selector, emptyIndicator? }] regions inspected for blank states",
    settleMs: "optional ms to wait after the journey before observing (default 300)",
  },
  validate(params) {
    const errors: string[] = [];
    const routes = params.routes ?? [];
    if (routes.length === 0) {
      errors.push('empty-data requires params.routes with at least one { urlPattern, mode: "fulfill", body }');
    }
    for (const r of routes) {
      if (r.mode !== "fulfill") {
        errors.push('empty-data routes must use mode "fulfill"; use the slow-network scenario for delays and errors');
      }
      if (r.body === undefined) {
        errors.push("empty-data route fixtures must declare an explicit body (the agreed empty shape)");
      }
    }
    return errors;
  },
  contextOptions() {
    return {};
  },
  async beforeJourney(ctx: ScenarioContext) {
    await installFulfillRoutes(ctx);
  },
  async afterJourney(ctx: ScenarioContext) {
    await ctx.page.waitForTimeout(ctx.params.settleMs ?? 300);
    reportRouteMatches(ctx);
    for (const region of ctx.params.contentRegions ?? []) {
      const observation = await observeRegion(ctx.page, region);
      if (!observation.regionFound) {
        ctx.signals.push({
          detector: "blank-region",
          target: region.selector,
          type: "not_applicable",
          summary: `content region ${region.selector} does not exist in the page`,
          method: "DOM querySelector",
        });
        continue;
      }
      const verdict = judgeRegion(observation);
      if (verdict) {
        ctx.signals.push({
          detector: "blank-region",
          target: region.selector,
          type: "needs_review",
          summary: verdict.summary,
          method: verdict.method,
          details: { ...observation },
        });
      }
    }
  },
};

/** Shared with slow-network: install fulfill routes and record match counts in ctx.store. */
export async function installFulfillRoutes(ctx: ScenarioContext): Promise<void> {
  const routes = ctx.params.routes ?? [];
  const matches: Record<string, number> = (ctx.store.routeMatches as Record<string, number>) ?? {};
  ctx.store.routeMatches = matches;
  for (const route of routes) {
    matches[route.urlPattern] = 0;
    await ctx.context.route(route.urlPattern, async (intercepted) => {
      matches[route.urlPattern] = (matches[route.urlPattern] ?? 0) + 1;
      await intercepted.fulfill({
        status: 200,
        contentType: route.contentType ?? "application/json",
        body: JSON.stringify(route.body ?? null),
      });
    });
    ctx.signals.note(`route ${route.urlPattern} fulfilled with configured fixture (label: ${route.label ?? "none"})`);
  }
}

/** Called in afterJourney: flag patterns that never matched (fixture never applied). */
export function reportRouteMatches(ctx: ScenarioContext): void {
  const matches = (ctx.store.routeMatches as Record<string, number> | undefined) ?? {};
  for (const route of ctx.params.routes ?? []) {
    const n = matches[route.urlPattern] ?? 0;
    if (n === 0) {
      ctx.signals.push({
        detector: "route",
        target: route.urlPattern,
        type: "not_applicable",
        summary: `route pattern ${route.urlPattern} did not match any request during the journey; the fixture never applied`,
        method: "Playwright context.route handler invocation counter",
      });
    } else {
      ctx.signals.note(`route ${route.urlPattern} matched ${n} request(s)`);
    }
  }
}
