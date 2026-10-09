// Automated accessibility audit of the product's own UI (report and compare
// pages) with axe. This catches contrast and semantics regressions; it is a
// signal, not a WCAG certification, same standard we apply to the apps we test.
import { expect, test } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import type { AxeResults, Result, NodeResult } from "axe-core";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { newestRunDir, repoRoot, runCli, startApp } from "./helpers.js";

const outRoot = path.join(repoRoot, "tmp", "e2e-a11y");

test.beforeAll(() => {
  rmSync(outRoot, { recursive: true, force: true });
  mkdirSync(outRoot, { recursive: true });
});

test("report and compare pages have no serious axe violations", async ({ browser }) => {
  const server = await startApp("demo-app", "broken");
  const { writeFileSync } = await import("node:fs");
  const config = path.join(outRoot, "lt.json");
  const base = JSON.parse(await import("node:fs").then((fs) => fs.readFileSync(
    path.join(repoRoot, "fixtures/demo-app/configs/long-text.json"), "utf8")));
  writeFileSync(config, JSON.stringify({ ...base, target: { baseURL: server.url } }));
  await runCli(["run", config, "--out", outRoot, "--revision", "a11y"]);
  const beforeDir = newestRunDir(outRoot);
  server.setVariant("fixed");
  await runCli(["run", config, "--out", outRoot, "--revision", "a11y-fixed"]);
  const afterDir = newestRunDir(outRoot);
  await server.close();
  const cmp = await runCli(["compare", beforeDir, afterDir]);
  expect(cmp.code).toBe(0);
  const compareFile = /compare report: (.*)/.exec(cmp.stdout)![1].trim();

  const page = await (await browser.newContext()).newPage();
  for (const target of [path.join(beforeDir, "report.html"), compareFile]) {
    await page.goto(pathToFileURL(target).href);
    const results: AxeResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    const serious = results.violations.filter((v: Result) => v.impact === "serious" || v.impact === "critical");
    const described = serious.map((v: Result) => `${v.id}: ${v.nodes.map((n: NodeResult) => n.target.join(" ")).slice(0, 3).join(", ")}`);
    expect(described, `${path.basename(target)}: ${JSON.stringify(described, null, 2)}`).toEqual([]);
  }
});
