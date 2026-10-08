// Scenario 2 — narrow-viewport: real viewport change plus typographic
// enlargement. We say exactly what was perturbed: this is NOT a phone
// emulator and NOT a faithful simulation of browser zoom or device pixel
// density. deviceScaleFactor stays at 1.
import { measureOverflow, judgeOverflow } from "../detectors/overflow.js";
import type { ScenarioContext, ScenarioDef } from "./types.js";

export const narrowViewportScenario: ScenarioDef = {
  id: "narrow-viewport",
  title: "Narrow viewport and enlarged text",
  summary:
    "Creates the context with a narrow viewport (params.viewportWidth/viewportHeight) and, after the " +
    "journey, multiplies the root element's font-size by params.textScale via an inline style " +
    "(layout-level typographic enlargement — not browser zoom, not deviceScaleFactor). Then measures " +
    "document-level horizontal overflow and the geometry of any declared injections selectors.",
  paramsDoc: {
    viewportWidth: "optional; narrow viewport width in px (default 360)",
    viewportHeight: "optional; viewport height in px (default 800)",
    textScale: "optional; root font-size multiplier (default 1.5, range 1–3)",
    injections: "optional selectors additionally measured for clipping after enlargement",
    overflowTolerancePx: "optional pixel tolerance (default 1)",
  },
  validate(params) {
    const errors: string[] = [];
    if (params.viewportWidth !== undefined && params.viewportHeight === undefined) {
      errors.push("narrow-viewport: viewportHeight should be set together with viewportWidth");
    }
    return errors;
  },
  contextOptions(params, config) {
    return {
      viewport: {
        width: params.viewportWidth ?? config.viewport?.width ?? 360,
        height: params.viewportHeight ?? config.viewport?.height ?? 800,
      },
    };
  },
  async afterJourney(ctx: ScenarioContext) {
    const scale = ctx.params.textScale ?? 1.5;
    const tolerance = ctx.params.overflowTolerancePx ?? 1;
    const applied = await ctx.page.evaluate((s) => {
      const root = document.documentElement;
      const previous = root.style.fontSize;
      const computed = getComputedStyle(root).fontSize;
      root.style.fontSize = `${parseFloat(computed) * s}px`;
      return { previousInline: previous, computedBefore: computed, appliedScale: s };
    }, scale);
    ctx.signals.note(`root font-size: ${applied.computedBefore} multiplied by ${scale} via inline style (deviceScaleFactor unchanged at 1)`);
    // Let layout settle, then measure.
    await ctx.page.waitForTimeout(150);

    // Document-level measurement via a neutral probe element.
    const probe = await measureOverflow(ctx.page, "html");
    const docOverflow = probe.documentScrollWidth > probe.documentClientWidth + tolerance;
    if (docOverflow) {
      ctx.signals.push({
        detector: "overflow",
        target: "document",
        type: "confirmed",
        summary: `page requires ${probe.documentScrollWidth}px of horizontal space at viewport ${probe.documentClientWidth}px × ${probe.viewportHeight}px with text ×${scale}: horizontal scrolling appears`,
        method: `geometry: documentElement.scrollWidth vs clientWidth at declared viewport and root font-size ×${scale}`,
        details: {
          documentScrollWidth: probe.documentScrollWidth,
          documentClientWidth: probe.documentClientWidth,
          viewport: `${probe.viewportWidth}x${probe.viewportHeight}`,
          textScale: scale,
        },
      });
    }
    for (const injection of ctx.params.injections ?? []) {
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
