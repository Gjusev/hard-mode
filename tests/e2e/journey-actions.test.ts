// Exercises the full journey vocabulary end to end: fill, press, expect
// hidden/text/url, role: and text: selectors, nth injections, multiple
// routes, screenshot-less runs, and the automatic scenario budget.
import { expect, test } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadJson, newestRunDir, repoRoot, runCli, startApp } from "./helpers.js";

const outRoot = path.join(repoRoot, "tmp", "e2e-journey");

test.beforeAll(() => {
  rmSync(outRoot, { recursive: true, force: true });
  mkdirSync(outRoot, { recursive: true });
});

function configPath(name: string): string {
  return path.join(outRoot, `${name}.json`);
}

test("journey vocabulary: fill, press, expect hidden, text and url", async () => {
  const server = await startApp("demo-app", "broken");
  writeFileSync(configPath("vocab"), JSON.stringify({
    schemaVersion: 1,
    target: { baseURL: server.url },
    journeyId: "vocab",
    steps: [
      { action: "navigate", url: "/" },
      { action: "expect", condition: "url", urlContains: "/" },
      { action: "expect", condition: "visible", selector: ".task-list li", timeoutMs: 3000 },
      { action: "fill", selector: "#filter", text: "Send" },
      { action: "expect", condition: "text", selector: ".task-list", contains: "Send status update", timeoutMs: 1000 },
      { action: "press", selector: "#filter", key: "Escape" },
      { action: "fill", selector: "#filter", text: "zzz-no-match" },
      { action: "expect", condition: "hidden", selector: ".task-list li", timeoutMs: 1500 },
      { action: "expect", condition: "visible", selector: "text:Project: Demo", timeoutMs: 1000 },
    ],
    scenario: "long-text",
    params: { injections: [{ selector: ".project-name", text: "short" }] },
  }));
  const res = await runCli(["run", configPath("vocab"), "--out", outRoot]);
  await server.close();
  expect(res.code, res.stdout + res.stderr).toBe(0);
  const runDir = newestRunDir(outRoot);
  const run = loadJson(path.join(runDir, "run.json"));
  const journey = run.journeyLog.filter((e: any) => e.action !== "log");
  expect(journey).toHaveLength(9);
  expect(journey.every((e: any) => e.ok)).toBe(true);
  expect(findings(runDir).length).toBe(0);
});

test("role: selector drives a real accessible control", async () => {
  const server = await startApp("demo-app", "fixed");
  writeFileSync(configPath("role"), JSON.stringify({
    schemaVersion: 1,
    target: { baseURL: server.url },
    journeyId: "role-click",
    steps: [
      { action: "navigate", url: "/" },
      { action: "click", selector: 'role:button[name="Export board"]' },
      { action: "expect", condition: "text", selector: ".tool", contains: "(clicked)", timeoutMs: 1500 },
    ],
    scenario: "keyboard",
    params: { focusTarget: ".tool", maxTabs: 4 },
  }));
  const res = await runCli(["run", configPath("role"), "--out", outRoot]);
  await server.close();
  expect(res.code, res.stdout + res.stderr).toBe(0);
  expect(findings(newestRunDir(outRoot)).length).toBe(0);
});

test("nth injection touches only the declared occurrence", async () => {
  const server = await startApp("demo-app", "broken");
  writeFileSync(configPath("nth"), JSON.stringify({
    schemaVersion: 1,
    target: { baseURL: server.url },
    journeyId: "nth",
    steps: [
      { action: "navigate", url: "/" },
      { action: "expect", condition: "visible", selector: ".task-list li", timeoutMs: 3000 },
    ],
    scenario: "long-text",
    params: { injections: [{ selector: ".task-title", nth: 2 }], seed: 3 },
  }));
  const res = await runCli(["run", configPath("nth"), "--out", outRoot, "--revision", "broken"]);
  await server.close();
  expect(res.code).toBe(0);
  const runDir = newestRunDir(outRoot);
  const run = loadJson(path.join(runDir, "run.json"));
  expect(run.notes.join(" ")).toContain("nth 2");
  expect(findings(runDir).some((f: any) => f.type === "confirmed")).toBe(true);
});

test("multiple routes can be intercepted in one run", async () => {
  const server = await startApp("demo-app", "fixed");
  writeFileSync(configPath("multiroute"), JSON.stringify({
    schemaVersion: 1,
    target: { baseURL: server.url },
    journeyId: "multiroute",
    steps: [
      { action: "navigate", url: "/" },
      { action: "expect", condition: "visible", selector: ".tool", timeoutMs: 3000 },
    ],
    scenario: "empty-data",
    params: {
      routes: [
        { urlPattern: "**/api/tasks", mode: "fulfill", body: { tasks: [] }, label: "empty tasks" },
        { urlPattern: "**/api/stats", mode: "fulfill", body: { done: 0, total: 0 }, label: "zero stats" },
      ],
      contentRegions: [{ selector: ".task-list", emptyIndicator: ".empty-state" }],
      settleMs: 400,
    },
    expectations: [
      { id: "empty-state", condition: "visible", selector: ".empty-state", intent: "Empty list shows the empty state", withinMs: 2000 },
      { id: "stats-zero", condition: "text", selector: ".stats-body", contains: "0 / 0 done", intent: "Zero stats render as text", withinMs: 2000 },
    ],
  }));
  const res = await runCli(["run", configPath("multiroute"), "--out", outRoot]);
  await server.close();
  expect(res.code, res.stdout + res.stderr).toBe(0);
  const runDir = newestRunDir(outRoot);
  const run = loadJson(path.join(runDir, "run.json"));
  const notes = run.notes.join(" ");
  expect(notes).toContain("**/api/tasks matched 1 request(s)");
  expect(notes).toContain("**/api/stats matched 1 request(s)");
  expect(findings(runDir)).toEqual([]);
});

test("capture.screenshot false skips the png but keeps the report", async () => {
  const server = await startApp("demo-app", "broken");
  writeFileSync(configPath("noshot"), JSON.stringify({
    schemaVersion: 1,
    target: { baseURL: server.url },
    journeyId: "noshot",
    steps: [
      { action: "navigate", url: "/" },
      { action: "expect", condition: "visible", selector: ".tool", timeoutMs: 3000 },
    ],
    scenario: "keyboard",
    params: { focusTarget: ".tool", maxTabs: 4 },
    capture: { screenshot: false },
  }));
  const res = await runCli(["run", configPath("noshot"), "--out", outRoot]);
  await server.close();
  expect(res.code).toBe(0);
  const runDir = newestRunDir(outRoot);
  expect(existsSync(path.join(runDir, "evidence", "final.png"))).toBe(false);
  const report = readFileSync(path.join(runDir, "report.html"), "utf8");
  expect(report).toContain("No screenshot captured");
  // The finding still exists, with no screenshot reference.
  expect(findings(runDir).length).toBe(1);
});

test("a configured delay never trips the scenario budget", async () => {
  const server = await startApp("demo-app", "fixed");
  writeFileSync(configPath("slowbudget"), JSON.stringify({
    schemaVersion: 1,
    target: { baseURL: server.url },
    journeyId: "slowbudget",
    steps: [
      { action: "navigate", url: "/" },
      { action: "expect", condition: "visible", selector: ".task-list li", timeoutMs: 3000 },
    ],
    scenario: "slow-network",
    params: {
      routes: [{ urlPattern: "**/api/stats", mode: "delay", delayMs: 12000 }],
      settleMs: 13000,
    },
    timeouts: { scenarioMs: 8000 },
    expectations: [
      { id: "stats-arrive", condition: "text", selector: ".stats-body", contains: "done", intent: "The delayed response renders", withinMs: 15000 },
    ],
  }));
  const res = await runCli(["run", configPath("slowbudget"), "--out", outRoot]);
  await server.close();
  expect(res.code, res.stdout + res.stderr).toBe(0);
  const runDir = newestRunDir(outRoot);
  const run = loadJson(path.join(runDir, "run.json"));
  expect(run.journeyLog.some((e: any) => e.action === "log" && e.detail.includes("budget raised")))
    .toBe(true);
  expect(findings(runDir).filter((f: any) => f.type === "infrastructure_error")).toEqual([]);
});

test("compare shows new findings when the after-run regressed", async () => {
  const server = await startApp("demo-app", "fixed");
  writeFileSync(configPath("regress"), JSON.stringify({
    schemaVersion: 1,
    target: { baseURL: server.url },
    journeyId: "regress",
    steps: [
      { action: "navigate", url: "/" },
      { action: "expect", condition: "visible", selector: ".tool", timeoutMs: 3000 },
    ],
    scenario: "keyboard",
    params: { focusTarget: ".tool", maxTabs: 4 },
  }));
  const before = await runCli(["run", configPath("regress"), "--out", outRoot, "--revision", "fixed"]);
  expect(before.code).toBe(0);
  const beforeDir = newestRunDir(outRoot);
  server.setVariant("broken");
  const after = await runCli(["run", configPath("regress"), "--out", outRoot, "--revision", "broken"]);
  expect(after.code).toBe(0);
  const afterDir = newestRunDir(outRoot);
  await server.close();

  const cmp = await runCli(["compare", beforeDir, afterDir]);
  expect(cmp.code).toBe(0);
  const html = readFileSync(/compare report: (.*)/.exec(cmp.stdout)![1].trim(), "utf8");
  expect(html).toContain("1 new");
  expect(html).toContain("new in after-run");
});

function findings(runDir: string): any[] {
  return loadJson(path.join(runDir, "findings.json"));
}
