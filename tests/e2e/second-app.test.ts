// The runner works on a second app with a completely different structure:
// table layout, different selectors, different API shape.
import { expect, test } from "@playwright/test";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { loadJson, materializeConfig, newestRunDir, repoRoot, runCli, startApp } from "./helpers.js";

const outRoot = path.join(repoRoot, "tmp", "e2e-second");

test.beforeAll(() => {
  rmSync(outRoot, { recursive: true, force: true });
  mkdirSync(outRoot, { recursive: true });
});

test("second app: defects found on broken, none invented on fixed", async () => {
  const server = await startApp("second-app", "broken");
  const scenarios = ["long-text", "keyboard", "empty-data"] as const;

  for (const scenario of scenarios) {
    const config = materializeConfig(
      `fixtures/second-app/configs/${scenario}.json`, server.url,
      path.join(outRoot, `${scenario}-config.json`),
    );
    const res = await runCli(["run", config, "--out", outRoot, "--revision", "broken"]);
    expect(res.code, `${scenario}: ${res.stdout}${res.stderr}`).toBe(0);
    const findings = loadJson(path.join(newestRunDir(outRoot), "findings.json"));
    expect(findings.filter((f: any) => f.type === "confirmed").length, `${scenario} on broken`).toBeGreaterThan(0);
  }

  server.setVariant("fixed");
  for (const scenario of scenarios) {
    const config = materializeConfig(
      `fixtures/second-app/configs/${scenario}.json`, server.url,
      path.join(outRoot, `${scenario}-config.json`),
    );
    const res = await runCli(["run", config, "--out", outRoot, "--revision", "fixed"]);
    expect(res.code, `${scenario}: ${res.stdout}${res.stderr}`).toBe(0);
    const findings = loadJson(path.join(newestRunDir(outRoot), "findings.json"));
    expect(findings.filter((f: any) => f.type === "confirmed"), `${scenario} on fixed`).toEqual([]);
  }

  await server.close();
});
