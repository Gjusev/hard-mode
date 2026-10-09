// Journey executor: a deliberately small, auditable action vocabulary.
// Steps never evaluate arbitrary JavaScript.
import type { Page } from "playwright";
import type { JourneyStep, RunConfig } from "../config/types.js";
import { resolveLocator } from "./selectors.js";

export interface JourneyLogEntry {
  index: number;
  action: string;
  target: string;
  ok: boolean;
  detail: string;
  ms: number;
}

export class JourneyError extends Error {
  constructor(message: string, readonly kind: "navigation" | "expectation" | "action") {
    super(message);
    this.name = "JourneyError";
  }
}

export function joinUrl(baseURL: string, url: string): string {
  if (/^https?:\/\//.test(url)) return url;
  return new URL(url, baseURL).toString();
}

export async function runJourney(
  page: Page,
  config: RunConfig,
  onEntry: (entry: JourneyLogEntry) => void,
): Promise<JourneyLogEntry[]> {
  const stepMs = config.timeouts?.stepMs ?? 5000;
  for (const [index, step] of config.steps.entries()) {
    const started = Date.now();
    const target = describeStepTarget(step);
    try {
      await runStep(page, step, stepMs, config);
      const entry: JourneyLogEntry = { index, action: step.action, target, ok: true, detail: "", ms: Date.now() - started };
      onEntry(entry);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const entry: JourneyLogEntry = { index, action: step.action, target, ok: false, detail: message.slice(0, 300), ms: Date.now() - started };
      onEntry(entry);
      throw err;
    }
  }
  return [];
}

async function runStep(page: Page, step: JourneyStep, stepMs: number, config: RunConfig): Promise<void> {
  switch (step.action) {
    case "navigate": {
      const url = joinUrl(config.target.baseURL, step.url);
      try {
        await page.goto(url, { timeout: stepMs, waitUntil: "domcontentloaded" });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // net::ERR_CONNECTION_REFUSED etc. is infrastructure, not "app broken".
        if (/ERR_CONNECTION|ERR_NAME|ERR_ADDRESS|ERR_ACCESS|ERR_TIMED_OUT|net::|Timeout \d+ms exceeded/i.test(message)) {
          throw new JourneyError(`navigation to ${url} failed: ${firstLine(message)}`, "navigation");
        }
        throw err;
      }
      return;
    }
    case "click": {
      const locator = resolveLocator(page, step.selector).first();
      await locator.click({ timeout: stepMs });
      return;
    }
    case "fill": {
      const locator = resolveLocator(page, step.selector).first();
      await locator.fill(step.text, { timeout: stepMs });
      return;
    }
    case "press": {
      const locator = resolveLocator(page, step.selector ?? "body").first();
      await locator.press(step.key, { timeout: stepMs });
      return;
    }
    case "expect": {
      const timeout = step.timeoutMs ?? stepMs;
      if (step.condition === "url") {
        const deadline = Date.now() + timeout;
        for (;;) {
          if (page.url().includes(step.urlContains ?? "")) return;
          if (Date.now() > deadline) {
            throw new JourneyError(`expected url to contain "${step.urlContains}", got "${page.url()}"`, "expectation");
          }
          await page.waitForTimeout(100);
        }
      }
      const locator = resolveLocator(page, step.selector ?? "body").first();
      try {
        if (step.condition === "visible") {
          await locator.waitFor({ state: "visible", timeout });
        } else if (step.condition === "hidden") {
          await locator.waitFor({ state: "hidden", timeout });
        } else if (step.condition === "text") {
          await locator.waitFor({ state: "visible", timeout });
          const deadline = Date.now() + timeout;
          for (;;) {
            const text = (await locator.textContent()) ?? "";
            if (text.includes(step.contains ?? "")) return;
            if (Date.now() > deadline) {
              throw new JourneyError(
                `expected text "${step.contains}" in ${step.selector}, got "${text.slice(0, 120)}"`,
                "expectation",
              );
            }
            await page.waitForTimeout(100);
          }
        }
      } catch (err) {
        if (err instanceof JourneyError) throw err;
        const message = err instanceof Error ? err.message : String(err);
        throw new JourneyError(`expect ${step.condition} on ${step.selector} failed: ${firstLine(message)}`, "expectation");
      }
      return;
    }
  }
}

function describeStepTarget(step: JourneyStep): string {
  switch (step.action) {
    case "navigate": return step.url;
    case "fill": return `${step.selector} ← "${step.text.slice(0, 30)}"`;
    case "press": return `${step.selector ?? "page"} key=${step.key}`;
    case "expect": return `${step.condition} ${step.selector ?? step.urlContains ?? ""}`;
    default: return step.selector ?? "";
  }
}

function firstLine(message: string): string {
  return message.split("\n")[0] ?? message;
}
