// Overflow detector: objective geometry only. For each declared target we
// measure scrollWidth/clientWidth and the element's bounding rect against the
// viewport. A finding requires a checkable condition (clipped text or content
// extending past the viewport edge) — never a vague "looks broken".
import type { Page } from "playwright";

export interface OverflowMeasurement {
  selector: string;
  found: boolean;
  visible: boolean;
  rect: { left: number; top: number; width: number; height: number; right: number; bottom: number } | null;
  scrollWidth: number;
  clientWidth: number;
  scrollHeight: number;
  clientHeight: number;
  overflowX: string;
  overflowY: string;
  viewportWidth: number;
  viewportHeight: number;
  documentScrollWidth: number;
  documentClientWidth: number;
}

export async function measureOverflow(page: Page, selector: string): Promise<OverflowMeasurement> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const doc = document.documentElement;
    const empty = {
      selector: sel, found: false, visible: false, rect: null,
      scrollWidth: 0, clientWidth: 0, scrollHeight: 0, clientHeight: 0,
      overflowX: "", overflowY: "",
      viewportWidth: window.innerWidth, viewportHeight: window.innerHeight,
      documentScrollWidth: doc.scrollWidth, documentClientWidth: doc.clientWidth,
    };
    if (!el) return empty;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      selector: sel,
      found: true,
      visible: cs.display !== "none" && cs.visibility !== "hidden" && r.width > 0 && r.height > 0,
      rect: { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom },
      scrollWidth: el.scrollWidth, clientWidth: el.clientWidth,
      scrollHeight: el.scrollHeight, clientHeight: el.clientHeight,
      overflowX: cs.overflowX, overflowY: cs.overflowY,
      viewportWidth: window.innerWidth, viewportHeight: window.innerHeight,
      documentScrollWidth: doc.scrollWidth, documentClientWidth: doc.clientWidth,
    };
  }, selector);
}

export interface OverflowVerdict {
  /** clipped or escaped content that can be stated as fact */
  confirmed: boolean;
  summary: string;
  method: string;
  details: Record<string, unknown>;
}

/**
 * Rules (documented in the finding):
 * 1. Horizontal clip: scrollWidth > clientWidth + tol AND overflow-x is not
 *    "visible" → text/content is being cut off at this element.
 * 2. Escape: the element's content box extends beyond the viewport's right
 *    edge (rect.right > innerWidth + tol) → unreachable/overflowing content.
 * 3. Document-level horizontal scroll alone is reported for review only:
 *    it may predate the perturbation.
 */
export function judgeOverflow(m: OverflowMeasurement, tolerancePx: number): OverflowVerdict | null {
  if (!m.found || !m.visible) return null;
  const method = `geometry: scrollWidth/clientWidth and getBoundingClientRect vs viewport (tolerance ${tolerancePx}px)`;
  const base = {
    rect: m.rect,
    scrollWidth: m.scrollWidth,
    clientWidth: m.clientWidth,
    overflowX: m.overflowX,
    viewportWidth: m.viewportWidth,
    documentScrollWidth: m.documentScrollWidth,
  };
  const clipped = m.scrollWidth > m.clientWidth + tolerancePx && m.overflowX !== "visible";
  const escapes = m.rect !== null && m.rect.right > m.viewportWidth + tolerancePx;
  if (clipped || escapes) {
    return {
      confirmed: true,
      summary: clipped
        ? `content of ${m.selector} is clipped: scrollWidth ${m.scrollWidth}px > clientWidth ${m.clientWidth}px with overflow-x ${m.overflowX}`
        : `${m.selector} extends ${Math.round(m.rect!.right - m.viewportWidth)}px past the right viewport edge`,
      method,
      details: base,
    };
  }
  const docOverflow = m.documentScrollWidth > m.documentClientWidth + tolerancePx;
  if (docOverflow) {
    return {
      confirmed: false,
      summary: `document has horizontal overflow (scrollWidth ${m.documentScrollWidth}px > viewport ${m.documentClientWidth}px) but ${m.selector} shows no provable clip or escape; may predate the perturbation`,
      method,
      details: base,
    };
  }
  return null;
}
