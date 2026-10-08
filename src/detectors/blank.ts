// Blank-region detector for the empty-data scenario: a content region that
// finished loading empty, with no empty-state indicator visible, deserves
// review. Absence of content is not automatically a bug — that is why the
// signal type is needs_review unless a declared expectation says otherwise.
import type { Page } from "playwright";
import type { ContentRegion } from "../config/types.js";

export interface RegionObservation {
  region: string;
  regionFound: boolean;
  regionVisible: boolean;
  textLength: number;
  childElementCount: number;
  emptyIndicator?: string;
  emptyIndicatorVisible: boolean;
}

export async function observeRegion(page: Page, region: ContentRegion): Promise<RegionObservation> {
  return page.evaluate((reg) => {
    const el = document.querySelector(reg.selector);
    if (!el) {
      return { region: reg.selector, regionFound: false, regionVisible: false, textLength: 0, childElementCount: 0, emptyIndicatorVisible: false };
    }
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    let indicatorVisible = false;
    if (reg.emptyIndicator) {
      const ind = document.querySelector(reg.emptyIndicator);
      if (ind) {
        const ics = getComputedStyle(ind);
        const ir = ind.getBoundingClientRect();
        indicatorVisible = ics.display !== "none" && ics.visibility !== "hidden" && ir.width > 0 && ir.height > 0;
      }
    }
    return {
      region: reg.selector,
      regionFound: true,
      // NOTE: height is deliberately not required — an empty list renders
      // with zero height, and that emptiness is exactly what we are detecting.
      regionVisible: cs.display !== "none" && cs.visibility !== "hidden" && r.width > 0,
      textLength: (el.textContent ?? "").trim().length,
      childElementCount: el.children.length,
      emptyIndicator: reg.emptyIndicator,
      emptyIndicatorVisible: indicatorVisible,
    };
  }, region as unknown as { selector: string; emptyIndicator?: string });
}

export function judgeRegion(o: RegionObservation): { summary: string; method: string } | null {
  if (!o.regionFound || !o.regionVisible) return null;
  const blank = o.textLength === 0 && o.childElementCount === 0;
  if (!blank) return null;
  if (o.emptyIndicator && o.emptyIndicatorVisible) return null; // empty state shown: fine
  const method = "DOM: region textContent length and childElementCount after journey completed";
  return {
    summary: o.emptyIndicator
      ? `content region ${o.region} loaded empty and its empty-state indicator ${o.emptyIndicator} is not visible`
      : `content region ${o.region} loaded empty (no text, no children); no emptyIndicator selector was declared to tell intended behavior apart`,
    method,
  };
}
