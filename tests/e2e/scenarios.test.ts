// Core e2e matrix: every scenario against a defective control and a valid
// control. Also proves: reproduce-from-saved-config, before/after compare,
// identity-mismatch rejection, and that the app files are never modified.
import { expect, test } from "@playwright/test";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import {
  hashDir, loadJson, materializeConfig, newestRunDir, repoRoot, runCli, startApp,
} from "./helpers.js";

const outRoot = path.join(repoRoot, "tmp", "e2e-runs");
const demoFixtureDir = path.join(repoRoot, "fixtures", "demo-app");

interface Expectation {
  scenario: string;
  config: string;
  /** substring of at least one confirmed finding summary in the broken run */
  brokenContains: string;
}

const matrix: Expectation[] = [
  { scenario: "long-text", config: "fixtures/demo-app/configs/long-text.json", brokenContains: ".project-name" },
  { scenario: "narrow-viewport", config: "fixtures/demo-app/configs/narrow-viewport.json", brokenContains: "horizontal" },
  { scenario: "empty-data", config: "fixtures/demo-app/configs/empty-data.json", brokenContains: "empty state" },
  { scenario: "slow-network", config: "fixtures/demo-app/configs/slow-network.json", brokenContains: "stats request fails" },
  { scenario: "keyboard", config: "fixtures/demo-app/configs/keyboard.json", brokenContains: "keyboard focus" },
];

test.beforeAll(() => {
  rmSync(outRoot, { recursive: true, force: true });
  mkdirSync(outRoot, { recursive: true });
});

test.describe.configure({ mode: "serial" });

let server: Awaited<ReturnType<typeof startApp>>;

test.beforeAll(async () => {
  server = await startApp("demo-app", "broken");
});

test.afterAll(async () => {
  await server?.close();
});

test("runner detects each known defect on the broken variant", async () => {
  const fixtureHashBefore = hashDir(demoFixtureDir);
  for (const { scenario, config, brokenContains } of matrix) {
    const configFile = materializeConfig(config, server.url, path.join(outRoot, `${scenario}-config.json`));
    const res = await runCli(["run", configFile, "--out", outRoot, "--revision", "broken"]);
    expect(res.code, `${scenario} stdout:\n${res.stdout}\nstderr:\n${res.stderr}`).toBe(0);
    const runDir = newestRunDir(outRoot);
    const findings = loadJson(path.join(runDir, "findings.json"));
    const confirmed = findings.filter((f: any) => f.type === "confirmed");
    expect(confirmed.length, `${scenario} findings: ${JSON.stringify(findings.map((f: any) => f.type + " " + f.summary))}`).toBeGreaterThan(0);
    expect(confirmed.some((f: any) => f.summary.includes(brokenContains)), `${scenario} confirmed summaries`).toBe(true);
  }
  // The diagnostic never modifies the app under test.
  expect(hashDir(demoFixtureDir)).toBe(fixtureHashBefore);
});

test("runner invents no findings on the fixed variant (negative control)", async () => {
  server.setVariant("fixed");
  for (const { scenario, config } of matrix) {
    const configFile = materializeConfig(config, server.url, path.join(outRoot, `${scenario}-config.json`));
    const res = await runCli(["run", configFile, "--out", outRoot, "--revision", "fixed"]);
    expect(res.code, `${scenario} stdout:\n${res.stdout}`).toBe(0);
    const runDir = newestRunDir(outRoot);
    const findings = loadJson(path.join(runDir, "findings.json"));
    expect(
      findings.filter((f: any) => f.type === "confirmed"),
      `${scenario} should have no confirmed findings on the fixed variant: ${JSON.stringify(findings)}`,
    ).toEqual([]);
  }
  server.setVariant("broken");
});

test("same config and seed reproduce the same signal on the same fixture", async () => {
  const configFile = materializeConfig("fixtures/demo-app/configs/long-text.json", server.url, path.join(outRoot, "repro-config.json"));
  const first = await runCli(["run", configFile, "--out", outRoot, "--revision", "broken"]);
  expect(first.code).toBe(0);
  const firstDir = newestRunDir(outRoot);
  const firstFindings = loadJson(path.join(firstDir, "findings.json")).map((f: any) => f.id).sort();

  // Reproduce from the config the run itself saved (not the original file).
  const repro = await runCli(["run", path.join(firstDir, "reproduce.json"), "--out", outRoot, "--revision", "broken"]);
  expect(repro.code).toBe(0);
  const secondDir = newestRunDir(outRoot);
  expect(secondDir).not.toBe(firstDir); // never overwrites another run
  const secondFindings = loadJson(path.join(secondDir, "findings.json")).map((f: any) => f.id).sort();
  expect(secondFindings).toEqual(firstFindings);
});

test("compare shows resolved findings only for the same identity", async () => {
  // Before: broken run (already have one from the repro test), after: fixed run.
  const beforeDir = newestRunDir(outRoot);
  server.setVariant("fixed");
  const configFile = materializeConfig("fixtures/demo-app/configs/long-text.json", server.url, path.join(outRoot, "repro-config.json"));
  const after = await runCli(["run", configFile, "--out", outRoot, "--revision", "fixed"]);
  expect(after.code).toBe(0);
  const afterDir = newestRunDir(outRoot);

  const cmp = await runCli(["compare", beforeDir, afterDir]);
  expect(cmp.code).toBe(0);
  const html = loadHtml(cmp.stdout);
  expect(html).toContain("2 resolved");
  expect(html).toContain("0 unchanged");

  // A different scenario is never presented as an equivalent comparison.
  const otherConfig = materializeConfig("fixtures/demo-app/configs/keyboard.json", server.url, path.join(outRoot, "repro-config.json"));
  await runCli(["run", otherConfig, "--out", outRoot, "--revision", "fixed"]);
  const otherDir = newestRunDir(outRoot);
  const mismatch = await runCli(["compare", beforeDir, otherDir]);
  expect(mismatch.code).toBe(3);
  expect(mismatch.stderr).toContain("different identities");
  server.setVariant("broken");
});

function loadHtml(stdout: string): string {
  const match = /compare report: (.*)/.exec(stdout);
  if (!match) throw new Error(`no compare report path in stdout: ${stdout}`);
  return readFileSync(match[1].trim(), "utf8");
}

import { readFileSync } from "node:fs";
