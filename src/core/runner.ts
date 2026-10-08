// Run orchestrator: one RunConfig = one scenario execution in a clean browser
// context, closed in a finally block even on error or timeout.
import { writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { identityHash, sha256 } from "../config/validate.js";
import type { Expectation, Finding, RunConfig, RunResult, Signal } from "../config/types.js";
import { getScenario } from "../scenarios/registry.js";
import type { ScenarioContext } from "../scenarios/types.js";
import { launchBrowser, newCleanContext, withTimeout, TimeoutError } from "./browser.js";
import { createRunDir, slug } from "./ids.js";
import { runJourney, JourneyError, type JourneyLogEntry } from "./journey.js";
import { SignalCollector } from "./signals.js";
import { resolveLocator } from "./selectors.js";
import { renderReportHtml } from "../report/html.js";

const nodeRequire = createRequire(import.meta.url);
const playwrightVersion: string = (nodeRequire("playwright/package.json") as { version: string }).version;

export interface RunOptions {
  /** override output root from config.output.root */
  outputRoot?: string;
  /** internal: skip report generation (tests of the runner itself) */
  skipReport?: boolean;
}

export async function runScenario(config: RunConfig, options: RunOptions = {}): Promise<RunResult> {
  const scenario = getScenario(config.scenario);
  if (!scenario) {
    throw new Error(`unknown scenario: ${config.scenario}`);
  }
  const outputRoot = options.outputRoot ?? config.output?.root ?? "runs";
  const runDir = createRunDir(outputRoot, scenario.id, config.runId);
  const evidenceDir = path.join(runDir, "evidence");
  const identity = computeIdentity(config);
  const startedAt = new Date().toISOString();
  const signals = new SignalCollector();
  const journeyLog: JourneyLogEntry[] = [];
  const findings: Finding[] = [];
  let status: RunResult["status"] = "completed";
  const scenarioMs = config.timeouts?.scenarioMs ?? 60000;
  const log = (message: string) => {
    journeyLog.push({ index: -1, action: "log", target: "", ok: true, detail: message, ms: 0 });
  };

  const browser = await launchBrowser();
  let screenshot: string | undefined;
  let traceFile: string | undefined;
  try {
    const contextOpts = scenario.contextOptions(config.params ?? {}, config);
    const viewport = contextOpts.viewport
      ?? config.viewport
      ?? { width: 1280, height: 800 };
    const handle = await newCleanContext(browser, { viewport });
    try {
      if (config.capture?.trace) {
        await handle.context.tracing.start({ screenshots: true, snapshots: true });
      }
      const page = await handle.context.newPage();
      page.on("console", (msg) => {
        if (msg.type() === "error") signals.consoleError(msg.text());
      });
      page.on("pageerror", (err) => signals.pageError(err.message));

      const ctx: ScenarioContext = {
        page,
        context: handle.context,
        params: config.params ?? {},
        config,
        signals,
        store: {},
        log,
      };

      let journeyFailed: Finding | undefined;
      try {
        // Whole scenario under one hard budget; context.close() in the outer
        // finally cancels any pending operation when the budget is exceeded.
        await withTimeout(
          (async () => {
            if (scenario.beforeJourney) await scenario.beforeJourney(ctx);
            await runJourney(page, config, (entry) => journeyLog.push(entry));
            await scenario.afterJourney(ctx);
          })(),
          scenarioMs,
          "scenario budget",
        );
      } catch (err) {
        if (err instanceof TimeoutError) {
          status = "infrastructure_error";
          findings.push(infraFinding(config, runDir, scenario.id,
            `scenario exceeded its ${scenarioMs}ms budget and was aborted; nothing can be concluded about the app`,
            "runner-side wall-clock budget around beforeJourney + journey + afterJourney"));
        } else if (err instanceof JourneyError && err.kind === "navigation") {
          status = "infrastructure_error";
          findings.push(infraFinding(config, runDir, scenario.id,
            `could not reach the target app: ${err.message}. This is an infrastructure problem (server down, wrong baseURL), not an app defect`,
            "Playwright navigation error classification (net::ERR_* / timeout)"));
        } else {
          // Journey expectation/action failure or scenario error: the app (or
          // the config) did not get us to the observable state. Review needed.
          const message = err instanceof Error ? err.message : String(err);
          const kind = err instanceof JourneyError ? err.kind : "scenario";
          findings.push({
            id: `${scenario.id}:journey-failed`,
            runId: path.basename(runDir),
            scenarioId: scenario.id,
            target: "journey",
            params: {},
            type: "needs_review",
            summary: `${kind === "scenario" ? "scenario" : "journey"} could not complete: ${firstLine(message)}`,
            method: "runner error capture",
            evidence: {},
            reproduce: reproduceRef(runDir),
            identity,
            limitations: ["the perturbation may not have been applied; findings below may be incomplete"],
          });
          journeyFailed = findings[findings.length - 1];
        }
      }

      // Evidence capture (best effort — the page may be in any state).
      if (config.capture?.screenshot !== false) {
        try {
          const file = path.join(evidenceDir, "final.png");
          await page.screenshot({ path: file, fullPage: true });
          screenshot = path.relative(runDir, file).split(path.sep).join("/");
          log(`screenshot saved: ${screenshot}`);
        } catch (err) {
          log(`screenshot failed: ${firstLine(err instanceof Error ? err.message : String(err))}`);
        }
      }
      if (config.capture?.trace) {
        try {
          const file = path.join(evidenceDir, "trace.zip");
          await handle.context.tracing.stop({ path: file });
          traceFile = path.relative(runDir, file).split(path.sep).join("/");
        } catch {
          /* tracing may fail on a broken context; not fatal */
        }
      }

      // Declared expectations → confirmed findings. Skipped when the journey
      // failed: a half-loaded page would only produce noise.
      if (!journeyFailed && status === "completed") {
        for (const expectation of config.expectations ?? []) {
          const violation = await evaluateExpectation(page, expectation);
          if (violation) {
            findings.push({
              id: `${scenario.id}:expect:${expectation.id}`,
              runId: path.basename(runDir),
              scenarioId: scenario.id,
              target: expectation.selector,
              params: {},
              type: "confirmed",
              summary: `declared expectation violated: ${expectation.intent ?? expectation.id}`,
              expected: violation.expected,
              observed: violation.observed,
              method: `declared expectation "${expectation.condition}" polled for ${expectation.withinMs ?? 3000}ms after the perturbation`,
              evidence: { screenshot, details: violation.details },
              reproduce: reproduceRef(runDir),
              identity,
            });
          }
        }
      }

      // Detector signals → findings.
      for (const signal of signals.signals) {
        findings.push(signalToFinding(signal, config, scenario.id, runDir, screenshot, identity));
      }
      // Console/page errors are context, not verdicts: needs_review.
      for (const message of signals.pageErrors.slice(0, 5)) {
        findings.push({
          id: `${scenario.id}:page-error:${sha256(message).slice(0, 8)}`,
          runId: path.basename(runDir),
          scenarioId: scenario.id,
          target: "window",
          params: {},
          type: "needs_review",
          summary: `unhandled page error observed during the scenario: ${firstLine(message)}`,
          method: "Playwright pageerror event",
          evidence: { screenshot, details: { message } },
          reproduce: reproduceRef(runDir),
          identity,
        });
      }
    } finally {
      // Clean context per scenario: storage, cookies and routes die here.
      await newCleanContextClose(handle);
    }
  } finally {
    await browser.close().catch(() => {});
  }

  const finishedAt = new Date().toISOString();
  const result: RunResult = {
    runDir,
    runId: path.basename(runDir),
    scenarioId: scenario.id,
    identityHash: identity.identityHash,
    startedAt,
    finishedAt,
    status,
    playwrightVersion,
    config,
    findings,
    reportPath: path.join(runDir, "report.html"),
    reproduceConfigPath: path.join(runDir, "reproduce.json"),
  };

  // Artifacts: findings.json, run.json, reproduce.json, report.html.
  writeFileSync(path.join(runDir, "findings.json"), JSON.stringify(findings, null, 2));
  writeFileSync(path.join(runDir, "run.json"), JSON.stringify({
    ...result,
    reportPath: undefined,
    reproduceConfigPath: undefined,
    journeyLog,
    notes: signals.notes,
    scenarioSummary: scenario.summary,
  }, null, 2));
  writeFileSync(path.join(runDir, "reproduce.json"), JSON.stringify(config, null, 2));
  if (!options.skipReport) {
    writeFileSync(result.reportPath, renderReportHtml(result, journeyLog, signals.notes, screenshot, traceFile));
  }
  return result;
}

async function newCleanContextClose(handle: { close: () => Promise<void> }): Promise<void> {
  await handle.close();
}

function computeIdentity(config: RunConfig): Finding["identity"] {
  return {
    journeyId: config.journeyId,
    scenario: config.scenario,
    identityHash: identityHash(config),
    appRevision: config.appRevision,
  };
}

function infraFinding(
  config: RunConfig, runDir: string, scenarioId: string, summary: string, method: string,
): Finding {
  return {
    id: `${scenarioId}:infrastructure`,
    runId: path.basename(runDir),
    scenarioId,
    target: "runner",
    params: {},
    type: "infrastructure_error",
    summary,
    method,
    evidence: {},
    reproduce: reproduceRef(runDir),
    identity: computeIdentity(config),
  };
}

function signalToFinding(
  signal: Signal, config: RunConfig, scenarioId: string, runDir: string,
  screenshot: string | undefined, identity: Finding["identity"],
): Finding {
  return {
    id: `${scenarioId}:${signal.detector}:${slug(signal.target)}`,
    runId: path.basename(runDir),
    scenarioId,
    target: signal.target,
    params: (config.params ?? {}) as Record<string, unknown>,
    type: signal.type,
    summary: signal.summary,
    expected: signal.expected,
    observed: signal.observed,
    method: signal.method,
    evidence: { screenshot, details: signal.details },
    reproduce: reproduceRef(runDir),
    identity,
  };
}

function reproduceRef(runDir: string): Finding["reproduce"] {
  return {
    configPath: path.join(path.basename(runDir), "reproduce.json"),
    command: `hard-mode run ${path.join(path.basename(runDir), "reproduce.json")}`,
  };
}

async function evaluateExpectation(
  page: import("playwright").Page,
  expectation: Expectation,
): Promise<{ expected: string; observed: string; details: Record<string, unknown> } | null> {
  const withinMs = expectation.withinMs ?? 3000;
  const deadline = Date.now() + withinMs;
  const locator = resolveLocator(page, expectation.selector).first();
  let lastObserved = "unknown";
  while (Date.now() <= deadline) {
    const count = await locator.count();
    if (count > 0) {
      const visible = await locator.isVisible().catch(() => false);
      if (expectation.condition === "visible" && visible) return null;
      if (expectation.condition === "hidden" && !visible) return null;
      if (expectation.condition === "text" && visible) {
        const text = (await locator.textContent().catch(() => "")) ?? "";
        if (text.includes(expectation.contains ?? "")) return null;
        lastObserved = `visible with text "${text.slice(0, 120)}"`;
      } else {
        lastObserved = visible ? "visible" : "not visible";
      }
    } else {
      lastObserved = "no matching element";
    }
    await page.waitForTimeout(150);
  }
  const expected =
    expectation.condition === "text"
      ? `${expectation.selector} visible containing "${expectation.contains}"`
      : `${expectation.selector} ${expectation.condition === "visible" ? "visible" : "hidden"}`;
  return { expected, observed: lastObserved, details: { withinMs } };
}

function firstLine(message: string): string {
  return message.split("\n")[0] ?? message;
}
