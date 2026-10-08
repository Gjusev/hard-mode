#!/usr/bin/env node
// hard-mode CLI — the stable interface of the product.
//   hard-mode run <config.json>        run one scenario, write evidence + report
//   hard-mode compare <runA> <runB>    before/after report (same identity only)
//   hard-mode scenarios                list scenarios and their parameters
//   hard-mode validate <config.json>   check a config without running it
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateRunConfig } from "./config/validate.js";
import type { RunConfig } from "./config/types.js";
import { SCENARIOS, getScenario } from "./scenarios/registry.js";
import { runScenario } from "./core/runner.js";
import { compareIdentity, renderCompareHtml } from "./report/compare.js";

const EXIT = {
  ok: 0,
  usage: 1,
  infrastructure: 2,
  compareMismatch: 3,
} as const;

function readConfig(file: string): RunConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    fail(`could not read config ${file}: ${err instanceof Error ? err.message : String(err)}`);
  }
  const { config, errors } = validateRunConfig(raw);
  if (!config) {
    fail(`invalid config ${file}:\n  - ${errors.join("\n  - ")}`);
  }
  const scenario = getScenario(config.scenario);
  if (!scenario) {
    fail(`unknown scenario "${config.scenario}". Available: ${SCENARIOS.map((s) => s.id).join(", ")}`);
  }
  const scenarioErrors = scenario.validate(config.params ?? {});
  if (scenarioErrors.length > 0) {
    fail(`invalid params for scenario ${config.scenario}:\n  - ${scenarioErrors.join("\n  - ")}`);
  }
  return config;
}

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(EXIT.usage);
}

function usage(): never {
  const self = path.basename(process.argv[1] ?? "hard-mode");
  console.error(`hard-mode — exercise a local web app under difficult UI scenarios

Usage:
  ${self} run <config.json> [--out <runs-dir>]
  ${self} compare <runDirA> <runDirB>
  ${self} scenarios
  ${self} validate <config.json>

Exit codes: 0 completed · 1 invalid usage/config · 2 infrastructure error · 3 compare identity mismatch`);
  process.exit(EXIT.usage);
}

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2);
  if (!command) usage();
  switch (command) {
    case "run": {
      const [configFile, ...flags] = rest;
      const known = new Set(["--out", "--revision"]);
      if (!configFile || flags.some((x, i) => (i % 2 === 0 ? !known.has(x) : false))) usage();
      const flagValue = (name: string) => {
        const i = flags.indexOf(name);
        return i >= 0 ? (flags[i + 1] ?? usage()) : undefined;
      };
      const outputRoot = flagValue("--out");
      const revision = flagValue("--revision");
      const config = readConfig(path.resolve(configFile));
      if (revision !== undefined) config.appRevision = revision;
      const result = await runScenario(config, outputRoot ? { outputRoot } : {});
      console.log(`run ${result.runId}`);
      console.log(`  dir:     ${result.runDir}`);
      console.log(`  report:  ${result.reportPath}`);
      for (const finding of result.findings) {
        console.log(`  [${finding.type}] ${finding.summary}`);
      }
      if (result.findings.length === 0) console.log("  no findings recorded");
      return result.status === "infrastructure_error" ? EXIT.infrastructure : EXIT.ok;
    }
    case "compare": {
      const [a, b] = rest;
      if (!a || !b || rest.length > 2) usage();
      const runA = loadRunDir(a);
      const runB = loadRunDir(b);
      const identity = compareIdentity(runA, runB);
      if (!identity.ok) {
        console.error(`error: ${identity.reason}`);
        return EXIT.compareMismatch;
      }
      const outDir = path.dirname(path.resolve(a));
      const file = path.join(outDir, `${runA.runId}__vs__${runB.runId}.html`);
      writeFileSync(file, renderCompareHtml(runA, runB));
      console.log(`compare report: ${file}`);
      return EXIT.ok;
    }
    case "scenarios": {
      for (const s of SCENARIOS) {
        console.log(`\n${s.id} — ${s.title}`);
        console.log(`  ${s.summary}`);
        for (const [param, doc] of Object.entries(s.paramsDoc)) {
          console.log(`    ${param}: ${doc}`);
        }
      }
      return EXIT.ok;
    }
    case "validate": {
      const [configFile] = rest;
      if (!configFile) usage();
      readConfig(path.resolve(configFile));
      console.log("config is valid");
      return EXIT.ok;
    }
    default:
      usage();
  }
}

function loadRunDir(dir: string) {
  const file = path.join(dir, "run.json");
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    fail(`could not read ${file}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Report paths in run.json are recorded relative for portability; when the CLI
// prints them it prefixes the directory it was given.
process.on("unhandledRejection", (err) => {
  console.error(`error: unexpected failure: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  process.exit(EXIT.infrastructure);
});

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`error: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
    process.exit(EXIT.infrastructure);
  },
);

// Keep import.meta.url referenced for bundled builds that strip side effects.
void fileURLToPath;
