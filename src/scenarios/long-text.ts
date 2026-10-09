// Scenario 1 — long-text: inject long text at DECLARED points only.
// We never rewrite the whole DOM: replacing everything produces artificial
// failures unrelated to the app's actual components.
import { measureOverflow, judgeOverflow } from "../detectors/overflow.js";
import type { ScenarioContext, ScenarioDef } from "./types.js";

const WORDS = [
  "Keyboard", "Accessibility", "Localization", "Internationalization", "Responsible",
  "Configuration", "Notification", "Redundancy", "Interoperability", "Maintainability",
];

/** Deterministic long text derived from the seed: same seed, same text. */
export function longText(seed: number, minChars = 220): string {
  let out = "";
  let state = (seed >>> 0) || 1;
  while (out.length < minChars) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const word = WORDS[state % WORDS.length];
    out += out.length === 0 ? word : ` ${word}`;
    if (state % 7 === 0) out += " —";
  }
  return out;
}

export const longTextScenario: ScenarioDef = {
  id: "long-text",
  title: "Long text at selected points",
  summary:
    "Replaces the text of each declared selector with deterministic long text (derived from the seed) " +
    "after the journey completes, then measures geometry on those elements only. No other DOM changes.",
  paramsDoc: {
    injections: "required. Array of { selector, nth?, text? }: the only elements touched",
    "injections[].text": "optional explicit text; default is generated deterministically from the seed",
    seed: "optional integer seed for the generated text (default 42)",
    overflowTolerancePx: "optional pixel tolerance for geometry checks (default 1)",
  },
  validate(params) {
    const errors: string[] = [];
    if (!params.injections || params.injections.length === 0) {
      errors.push("long-text requires params.injections (at least one { selector })");
    }
    return errors;
  },
  contextOptions() {
    return {};
  },
  async afterJourney(ctx: ScenarioContext) {
    const seed = ctx.params.seed ?? 42;
    const tolerance = ctx.params.overflowTolerancePx ?? 1;
    const injections = ctx.params.injections ?? [];
    if (injections.length === 0) throw new Error("no injections declared");
    for (const [i, injection] of injections.entries()) {
      const locator = ctx.page.locator(injection.selector).nth(injection.nth ?? 0);
      const count = await locator.count();
      if (count === 0) {
        ctx.signals.push({
          detector: "injection",
          target: injection.selector,
          type: "not_applicable",
          summary: `selector ${injection.selector} (nth ${injection.nth ?? 0}) does not match any element; nothing was injected`,
          method: "DOM querySelector via Playwright locator count",
        });
        continue;
      }
      const text = injection.text ?? longText(seed + i);
      const before = (await locator.textContent()) ?? "";
      await locator.evaluate((el, value) => { el.textContent = value; }, text);
      // Register exactly where and how text was replaced.
      ctx.signals.note(`injected ${text.length} chars into ${injection.selector} (nth ${injection.nth ?? 0}), replacing ${before.trim().length} chars`);
      const measurement = await measureOverflow(ctx.page, injection.selector);
      const verdict = judgeOverflow(measurement, tolerance);
      if (verdict) {
        ctx.signals.push({
          detector: "overflow",
          target: injection.selector,
          type: verdict.confirmed ? "confirmed" : "needs_review",
          summary: verdict.summary,
          method: verdict.method,
          details: verdict.details,
        });
      }
    }
  },
};
