// CLI edge cases: unknown config keys, UTF-8 BOM, broken compare inputs and
// the runs listing.
import { expect, test } from "@playwright/test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { newestRunDir, repoRoot, runCli, startApp } from "./helpers.js";

const outRoot = path.join(repoRoot, "tmp", "e2e-cli");

test.beforeAll(() => {
  rmSync(outRoot, { recursive: true, force: true });
  mkdirSync(outRoot, { recursive: true });
});

const valid = {
  schemaVersion: 1,
  target: { baseURL: "http://127.0.0.1:9" },
  journeyId: "edge",
  steps: [{ action: "navigate", url: "/" }],
  scenario: "keyboard",
  params: { focusTarget: ".x" },
};

test("unknown top-level keys are rejected", async () => {
  const file = path.join(outRoot, "unknown-key.json");
  writeFileSync(file, JSON.stringify({ ...valid, unexpected: true }));
  const res = await runCli(["validate", file]);
  expect(res.code).toBe(1);
  expect(res.stderr).toContain("unknown top-level key");
});

test("a UTF-8 BOM does not break config parsing", async () => {
  const file = path.join(outRoot, "bom.json");
  writeFileSync(file, "﻿" + JSON.stringify(valid));
  const res = await runCli(["validate", file]);
  expect(res.code, res.stderr).toBe(0);
  expect(res.stdout).toContain("config is valid");
});

test("non-object configs are rejected with a clear message", async () => {
  const file = path.join(outRoot, "array.json");
  writeFileSync(file, "[1, 2, 3]");
  const res = await runCli(["validate", file]);
  expect(res.code).toBe(1);
  expect(res.stderr).toContain("must be a JSON object");
});

test("compare refuses directories without run.json", async () => {
  const a = path.join(outRoot, "not-a-run");
  mkdirSync(a, { recursive: true });
  const res = await runCli(["compare", a, a]);
  expect(res.code).toBe(1);
  expect(res.stderr).toContain("could not read");
});

test("runs lists run directories with counts and tolerates junk", async () => {
  const server = await startApp("demo-app", "broken");
  const config = path.join(outRoot, "one.json");
  writeFileSync(config, JSON.stringify({
    ...valid,
    target: { baseURL: server.url },
    steps: [
      { action: "navigate", url: "/" },
      { action: "expect", condition: "visible", selector: ".tool", timeoutMs: 3000 },
    ],
  }));
  const res = await runCli(["run", config, "--out", outRoot, "--revision", "edge-run"]);
  await server.close();
  expect(res.code).toBe(0);
  mkdirSync(path.join(outRoot, "junk-directory"), { recursive: true });
  const list = await runCli(["runs", outRoot]);
  expect(list.code).toBe(0);
  expect(list.stdout).toContain("keyboard");
  expect(list.stdout).toContain("rev=edge-run");
  expect(list.stdout).toContain("no run.json");
  // Empty directory gives a clean answer, not a stack trace.
  const empty = path.join(outRoot, "empty-root");
  mkdirSync(empty, { recursive: true });
  const listEmpty = await runCli(["runs", empty]);
  expect(listEmpty.code).toBe(0);
  expect(listEmpty.stdout).toContain("no runs under");
  // newestRunDir must ignore the junk directory we just planted.
  expect(newestRunDir(outRoot)).not.toContain("junk");
});
