// Captures the public README screenshots from the synthetic demo (no real
// user data; the demo apps are fixtures). Run `npm run demo` first.
import { chromium } from "playwright";
import { readdirSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const demoRoot = path.join(repo, "tmp", "demo-run");
const outDir = path.join(repo, "assets");
mkdirSync(outDir, { recursive: true });

const runs = readdirSync(demoRoot).filter((n) => /^\d{8}-/.test(n)).sort();
if (runs.length < 2) throw new Error("run npm run demo first (need a run + a fixed run)");
const beforeDir = runs[0];
const afterDir = runs[1];
const compareFile = readdirSync(demoRoot).find((n) => n.includes("__vs__"));
if (!compareFile) throw new Error("compare report not found; run npm run demo");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1010 }, deviceScaleFactor: 2 });

// Report gallery: header + first finding expanded + evidence.
await page.goto(pathToFileURL(path.join(demoRoot, beforeDir, "report.html")).href);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: path.join(outDir, "report-gallery.png"), clip: { x: 0, y: 0, width: 1280, height: 1010 } });
console.log("report-gallery.png");

// Compare: header + side-by-side figures + verdicts.
await page.setViewportSize({ width: 1280, height: 1200 });
await page.goto(pathToFileURL(path.join(demoRoot, compareFile)).href);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: path.join(outDir, "compare.png"), clip: { x: 0, y: 0, width: 1280, height: 1200 } });
console.log("compare.png");

await browser.close();
