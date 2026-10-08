// Browser lifecycle. One browser per run; one CLEAN context per scenario.
// Everything closes in finally blocks — including on errors and timeouts.
import { chromium, type Browser, type BrowserContext } from "playwright";

export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({ headless: true });
}

export interface ContextHandle {
  browser: Browser;
  context: BrowserContext;
  close: () => Promise<void>;
}

export async function newCleanContext(
  browser: Browser,
  options: { viewport?: { width: number; height: number } },
): Promise<ContextHandle> {
  const context = await browser.newContext({
    viewport: options.viewport ?? { width: 1280, height: 800 },
    // No deviceScaleFactor games: keep 1:1 and document any scaling we do.
    deviceScaleFactor: 1,
  });
  const close = async () => {
    await context.close().catch(() => {});
  };
  return { browser, context, close };
}

/** Run a promise with a hard timeout; rejects with a labeled error. */
export async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new TimeoutError(`${label} exceeded ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}
