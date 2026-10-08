// Scenario 5 — keyboard: walk the tab order after the journey and check the
// declared focusTarget is reachable. Records the full focus sequence.
// Heuristics (focus indicator visibility) are reported for review, never as
// confirmed facts. We do not claim WCAG certification.
import { describeActiveElement } from "../core/selectors.js";
import type { ScenarioContext, ScenarioDef } from "./types.js";

export const keyboardScenario: ScenarioDef = {
  id: "keyboard",
  title: "Keyboard-only traversal",
  summary:
    "After the journey, presses Tab up to maxTabs times from the current focus, recording the focused " +
    "element after each press. The declared focusTarget must receive focus within the budget. If it does, " +
    "a heuristic checks whether a focus indicator (outline/box-shadow/border) is painted. Focus staying " +
    "inside a modal is not treated as a bug.",
  paramsDoc: {
    focusTarget: "required. Selector of the control that must be reachable by keyboard",
    maxTabs: "optional Tab budget (default 12, range 1–100)",
  },
  validate(params) {
    const errors: string[] = [];
    if (!params.focusTarget) {
      errors.push("keyboard requires params.focusTarget (selector of the control that must be reachable)");
    }
    return errors;
  },
  contextOptions() {
    return {};
  },
  async afterJourney(ctx: ScenarioContext) {
    const target = ctx.params.focusTarget ?? "";
    const maxTabs = ctx.params.maxTabs ?? 12;
    const targetCount = await ctx.page.locator(target).count();
    if (targetCount === 0) {
      ctx.signals.push({
        detector: "keyboard",
        target,
        type: "not_applicable",
        summary: `focusTarget ${target} does not match any element`,
        method: "Playwright locator count",
      });
      return;
    }
    const trace: string[] = [`start: ${await describeActiveElement(ctx.page)}`];
    let reached = false;
    for (let i = 0; i < maxTabs; i++) {
      await ctx.page.keyboard.press("Tab");
      const focused = await describeActiveElement(ctx.page);
      trace.push(`Tab ${i + 1}: ${focused}`);
      if (await ctx.page.evaluate((sel) => {
        const el = document.activeElement;
        return el !== null && el !== document.body && el.matches(sel);
      }, target)) {
        reached = true;
        break;
      }
    }
    if (!reached) {
      ctx.signals.push({
        detector: "keyboard",
        target,
        type: "confirmed",
        summary: `${target} never received keyboard focus within ${maxTabs} Tab presses`,
        expected: `${target} is reachable with the keyboard alone`,
        observed: trace.join(" | "),
        method: "focus trace: document.activeElement recorded after each Tab press",
        details: { trace },
      });
      return;
    }
    // Reached: check (heuristically) that focus is visibly indicated.
    const indicator = await ctx.page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return { found: false };
      const cs = getComputedStyle(el);
      return {
        found: true,
        outlineWidth: cs.outlineWidth,
        outlineStyle: cs.outlineStyle,
        boxShadow: cs.boxShadow,
        borderWidth: cs.borderTopWidth,
      };
    }, target);
    if (indicator.found) {
      const visibleIndicator =
        (parseFloat(indicator.outlineWidth ?? "0") > 0 && indicator.outlineStyle !== "none") ||
        (indicator.boxShadow && indicator.boxShadow !== "none") ||
        parseFloat(indicator.borderWidth ?? "0") > 0;
      if (!visibleIndicator) {
        ctx.signals.push({
          detector: "keyboard",
          target,
          type: "needs_review",
          summary: `${target} is keyboard-reachable but no focus indicator was detected while focused (heuristic: outline, box-shadow or border width > 0)`,
          method: "computed style inspection of the focused element (heuristic, not a certification)",
          details: { trace, indicator },
        });
      } else {
        ctx.signals.note(`${target} reached by keyboard with a visible focus indicator (${indicator.outlineStyle} ${indicator.outlineWidth})`);
      }
    }
  },
};
