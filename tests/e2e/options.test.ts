// Coverage for options that lacked a dedicated test: slow-network mode
// "delay" (real response passes through after the delay) and capture.trace.
import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadJson, newestRunDir, repoRoot, runCli, startApp } from "./helpers.js";

const outRoot = path.join(repoRoot, "tmp", "e2e-options");

test.beforeAll(() => {
  rmSync(outRoot, { recursive: true, force: true });
  mkdirSync(outRoot, { recursive: true });
});

test("slow-network delay mode passes the real response through", async () => {
  const server = await startApp("demo-app", "broken");
  const config = path.join(outRoot, "delay.json");
  writeFileSync(config, JSON.stringify({
    schemaVersion: 1,
    target: { baseURL: server.url },
    journeyId: "j",
    steps: [
      { action: "navigate", url: "/" },
      { action: "expect", condition: "visible", selector: ".task-list li", timeoutMs: 3000 },
    ],
    scenario: "slow-network",
    params: {
      routes: [{ urlPattern: "**/api/stats", mode: "delay", delayMs: 1500, label: "slow stats" }],
      settleMs: 2500,
    },
    expectations: [
      {
        id: "stats-eventually-render",
        condition: "text",
        selector: ".stats-body",
        contains: "done",
        intent: "A delayed response still renders once it arrives",
        withinMs: 4000,
      },
    ],
  }));
  const res = await runCli(["run", config, "--out", outRoot, "--revision", "broken"]);
  await server.close();
  expect(res.code, res.stdout + res.stderr).toBe(0);
  const findings = loadJson(path.join(newestRunDir(outRoot), "findings.json"));
  // The pass-through response is the real one, so the app ends up in its
  // normal state: expectation met, no loading-like signal left.
  expect(findings.filter((f: any) => f.type === "confirmed"), JSON.stringify(findings)).toEqual([]);
  expect(findings.filter((f: any) => f.type === "needs_review")).toEqual([]);
  // And the route really was held (the run must have observed the delay window).
  const run = loadJson(path.join(newestRunDir(outRoot), "run.json"));
  expect(run.notes.join(" ")).toContain("mode=delay");
});

test("capture.trace writes a valid trace archive next to the evidence", async () => {
  const server = await startApp("demo-app", "broken");
  const config = path.join(outRoot, "trace.json");
  writeFileSync(config, JSON.stringify({
    schemaVersion: 1,
    target: { baseURL: server.url },
    journeyId: "j",
    steps: [
      { action: "navigate", url: "/" },
      { action: "expect", condition: "visible", selector: ".tool", timeoutMs: 3000 },
    ],
    scenario: "keyboard",
    params: { focusTarget: ".tool", maxTabs: 4 },
    capture: { trace: true },
  }));
  const res = await runCli(["run", config, "--out", outRoot]);
  await server.close();
  expect(res.code, res.stdout + res.stderr).toBe(0);
  const runDir = newestRunDir(outRoot);
  const trace = path.join(runDir, "evidence", "trace.zip");
  expect(statSync(trace).size).toBeGreaterThan(1000);
  // A zip starts with the PK header.
  expect(readFileSync(trace).subarray(0, 2).toString("latin1")).toBe("PK");
  const report = readFileSync(path.join(runDir, "report.html"), "utf8");
  expect(report).toContain("trace.zip");
});
