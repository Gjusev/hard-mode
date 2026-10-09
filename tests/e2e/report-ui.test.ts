// Browser test of the report UI itself: keyboard operability, visible focus,
// responsive layout on a narrow screen, and escaped app content.
import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { newestRunDir, repoRoot, runCli, startApp } from "./helpers.js";

const outRoot = path.join(repoRoot, "tmp", "e2e-report");

test.beforeAll(() => {
  rmSync(outRoot, { recursive: true, force: true });
  mkdirSync(outRoot, { recursive: true });
});

function writeConfig(file: string, config: unknown): string {
  writeFileSync(file, JSON.stringify(config, null, 2));
  return file;
}

test("report is operable by keyboard, has visible focus and works narrow", async ({ browser }) => {
  const server = await startApp("demo-app", "broken");
  const base = JSON.parse(readFileSync(path.join(repoRoot, "fixtures/demo-app/configs/long-text.json"), "utf8"));
  const config = writeConfig(path.join(outRoot, "long-text.json"), { ...base, target: { baseURL: server.url } });
  const res = await runCli(["run", config, "--out", outRoot, "--revision", "broken"]);
  expect(res.code).toBe(0);
  const runDir = newestRunDir(outRoot);
  await server.close();

  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await page.goto(pathToFileURL(path.join(runDir, "report.html")).href);

  // Findings exist and are reachable by keyboard.
  await expect(page.locator(".finding")).toHaveCount(2);
  const firstSummary = page.locator(".finding summary").first();
  await firstSummary.focus();
  const outline = await firstSummary.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { width: cs.outlineWidth, style: cs.outlineStyle };
  });
  expect(parseFloat(outline.width)).toBeGreaterThan(0);
  expect(outline.style).not.toBe("none");

  // Details toggle with the keyboard alone (second finding starts closed).
  const secondSummary = page.locator(".finding summary").nth(1);
  await secondSummary.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".finding details").nth(1)).toHaveAttribute("open", "");
  await page.keyboard.press("Enter");
  await expect(page.locator(".finding details").nth(1)).not.toHaveAttribute("open", "");

  // Skip link is reachable and becomes visible when focused.
  await page.locator(".skip").focus();
  await expect(page.locator(".skip")).toBeVisible();

  // Status is never color-only: each badge carries text.
  const badges = await page.locator(".badge").allTextContents();
  expect(badges.join(" ")).toMatch(/confirmed/);

  // Narrow screen: no horizontal scrolling of the report itself.
  const narrow = await browser.newContext({ viewport: { width: 360, height: 800 } });
  const narrowPage = await narrow.newPage();
  await narrowPage.goto(pathToFileURL(path.join(runDir, "report.html")).href);
  const overflow = await narrowPage.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await narrow.close();
});

test("hostile config text never executes or breaks the report", async ({ browser }) => {
  const server = await startApp("demo-app", "broken");
  const hostile = `<img src=x onerror="window.__pwned=1"><script>window.__pwned=1</script>`;
  // appRevision is free-form config text rendered in the report header: a
  // real path app-provided content can take into the report.
  const config = writeConfig(path.join(outRoot, "hostile.json"), {
    schemaVersion: 1,
    target: { baseURL: server.url },
    journeyId: "j",
    steps: [
      { action: "navigate", url: "/" },
      { action: "expect", condition: "visible", selector: ".tool", timeoutMs: 3000 },
    ],
    scenario: "long-text",
    params: {
      injections: [{ selector: ".project-name", text: hostile }],
    },
    appRevision: hostile,
  });
  const res = await runCli(["run", config, "--out", outRoot]);
  expect(res.code).toBe(0);
  const runDir = newestRunDir(outRoot);
  await server.close();

  const page = await (await browser.newContext()).newPage();
  await page.goto(pathToFileURL(path.join(runDir, "report.html")).href);
  expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).__pwned)).toBeUndefined();
  // The hostile revision is rendered as text, visible to the reader:
  await expect(page.locator("body")).toContainText("<img src=x onerror=");
  // No img element with a hostile src exists:
  expect(await page.locator("img[src='x']").count()).toBe(0);
});
