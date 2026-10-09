// Scenario 1 — long-text: inject long text at DECLARED points only.
// We never rewrite the whole DOM: replacing everything produces artificial
// failures unrelated to the app's actual components.
import { judgeOverflow } from "../detectors/overflow.js";
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
      const nth = injection.nth ?? 0;
      const label = `${injection.selector}${nth ? ` (nth ${nth})` : ""}`;
      const locator = ctx.page.locator(injection.selector).nth(nth);
      const count = await locator.count();
      if (count === 0) {
        ctx.signals.push({
          detector: "injection",
          target: label,
          type: "not_applicable",
          summary: `selector ${label} does not match any element; nothing was injected`,
          method: "DOM querySelector via Playwright locator count",
        });
        continue;
      }
      const text = injection.text ?? longText(seed + i);
      const before = (await locator.textContent()) ?? "";
      // Measure the very element we injected into (nth-aware), plus the
      // document-level numbers from a neutral probe.
      const geometry = await locator.evaluate((el, value) => {
        el.textContent = value;
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        const doc = document.documentElement;
        return {
          overflowX: cs.overflowX,
          display: cs.display,
          rect: { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom },
          scrollWidth: el.scrollWidth, clientWidth: el.clientWidth,
          scrollHeight: el.scrollHeight, clientHeight: el.clientHeight,
          viewportWidth: window.innerWidth, viewportHeight: window.innerHeight,
          documentScrollWidth: doc.scrollWidth, documentClientWidth: doc.clientWidth,
        };
      }, text);
      // Register exactly where and how text was replaced.
      ctx.signals.note(`injected ${text.length} chars into ${label}, replacing ${before.trim().length} chars`);
      const measurement = {
        selector: label, found: true, visible: geometry.display !== "none" && geometry.rect.width > 0,
        rect: geometry.rect, scrollWidth: geometry.scrollWidth, clientWidth: geometry.clientWidth,
        scrollHeight: geometry.scrollHeight, clientHeight: geometry.clientHeight,
        overflowX: geometry.overflowX, overflowY: "",
        viewportWidth: geometry.viewportWidth, viewportHeight: geometry.viewportHeight,
        documentScrollWidth: geometry.documentScrollWidth, documentClientWidth: geometry.documentClientWidth,
      };
      const verdict = judgeOverflow(measurement, tolerance);
      if (verdict) {
        ctx.signals.push({
          detector: "overflow",
          target: label,
          type: verdict.confirmed ? "confirmed" : "needs_review",
          summary: verdict.summary,
          method: verdict.method,
          details: verdict.details,
        });
      }
    }
  },
};
