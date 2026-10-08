// Selector resolution: plain CSS by default, plus two accessible forms.
//   role:button[name="Add task"]   -> getByRole
//   text:Sign in                   -> getByText
import type { Locator, Page } from "playwright";

export function resolveLocator(page: Page, selector: string): Locator {
  if (selector.startsWith("role:")) {
    const rest = selector.slice(5);
    const m = /^([a-z]+)(?:\[name="(.+)"\])?$/.exec(rest);
    if (!m) {
      throw new Error(`invalid role selector: ${selector} (expected role:role[name="Accessible name"])`);
    }
    const role = m[1] as Parameters<Page["getByRole"]>[0];
    return m[2] !== undefined ? page.getByRole(role, { name: m[2] }) : page.getByRole(role);
  }
  if (selector.startsWith("text:")) {
    return page.getByText(selector.slice(5));
  }
  return page.locator(selector);
}

/** Short, human-readable description of the focused element for focus traces. */
export async function describeActiveElement(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return "body";
    if (el === document.documentElement) return "html";
    const parts = [el.tagName.toLowerCase()];
    if (el.id) parts.push(`#${el.id}`);
    for (const c of Array.from(el.classList)) parts.push(`.${c}`);
    const text = (el.textContent ?? "").trim().slice(0, 40);
    const desc = parts.join("");
    return text ? `${desc} "${text}"` : desc;
  });
}
