// Negative cases that represent real errors: unreachable server, invalid
// configs, unknown scenarios. An infrastructure problem must be labeled as
// such — never "the app is broken".
import { expect, test } from "@playwright/test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadJson, newestRunDir, repoRoot, runCli } from "./helpers.js";

const outRoot = path.join(repoRoot, "tmp", "e2e-infra");

test.beforeAll(() => {
  rmSync(outRoot, { recursive: true, force: true });
  mkdirSync(outRoot, { recursive: true });
});

test("unreachable server is an infrastructure error, not an app defect", async () => {
  const config = path.join(outRoot, "dead-server.json");
  writeFileSync(config, JSON.stringify({
    schemaVersion: 1,
    target: { baseURL: "http://127.0.0.1:9" }, // closed port, no server
    journeyId: "dead",
    steps: [{ action: "navigate", url: "/" }],
    scenario: "keyboard",
    params: { focusTarget: ".tool" },
  }));
  const res = await runCli(["run", config, "--out", outRoot]);
  expect(res.code).toBe(2);
  const runDir = newestRunDir(outRoot);
  const findings = loadJson(path.join(runDir, "findings.json"));
  expect(findings).toHaveLength(1);
  expect(findings[0].type).toBe("infrastructure_error");
  expect(findings[0].summary).toContain("infrastructure problem");
  // Artifacts still exist so the operator can inspect what happened.
  expect(loadJson(path.join(runDir, "run.json")).status).toBe("infrastructure_error");
});

test("invalid configs are rejected without launching a run", async () => {
  const config = path.join(outRoot, "invalid.json");
  writeFileSync(config, JSON.stringify({ schemaVersion: 1, target: { baseURL: "http://127.0.0.1:9" } }));
  const res = await runCli(["run", config, "--out", outRoot]);
  expect(res.code).toBe(1);
  expect(res.stderr).toContain("invalid config");

  const unknownScenario = path.join(outRoot, "unknown-scenario.json");
  writeFileSync(unknownScenario, JSON.stringify({
    schemaVersion: 1,
    target: { baseURL: "http://127.0.0.1:9" },
    journeyId: "j",
    steps: [{ action: "navigate", url: "/" }],
    scenario: "chaos-monkey",
  }));
  const res2 = await runCli(["run", unknownScenario, "--out", outRoot]);
  expect(res2.code).toBe(1);
  expect(res2.stderr).toContain("unknown scenario");
});

test("scenario budgets abort cleanly and are labeled infrastructure", async () => {
  const { startApp } = await import("./helpers.js");
  const server = await startApp("demo-app", "broken");
  const config = path.join(outRoot, "budget.json");
  writeFileSync(config, JSON.stringify({
    schemaVersion: 1,
    target: { baseURL: server.url },
    journeyId: "j",
    steps: [
      { action: "navigate", url: "/" },
      { action: "expect", condition: "visible", selector: ".tool", timeoutMs: 2000 },
    ],
    scenario: "slow-network",
    params: { routes: [{ urlPattern: "**/api/x", mode: "delay", delayMs: 5000 }], settleMs: 8000 },
    timeouts: { scenarioMs: 1500 },
  }));
  const res = await runCli(["run", config, "--out", outRoot]);
  await server.close();
  expect(res.code).toBe(2);
  const runDir = newestRunDir(outRoot);
  const findings = loadJson(path.join(runDir, "findings.json"));
  expect(findings[0].type).toBe("infrastructure_error");
  expect(findings[0].summary).toContain("budget");
});
