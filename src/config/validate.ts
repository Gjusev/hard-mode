// Validation and canonical hashing for RunConfig.
// Everything the CLI accepts passes through validateRunConfig first; the
// scenario registry re-validates its own params.
import { createHash } from "node:crypto";
import {
  SCHEMA_VERSION,
  type Expectation,
  type JourneyStep,
  type RouteFixture,
  type RunConfig,
  type ScenarioParams,
} from "./types.js";

const ACTIONS = new Set(["navigate", "click", "fill", "press", "expect"]);
const CONDITIONS = new Set(["visible", "hidden", "text", "url"]);
const KEYS = new Set([
  "Tab", "Enter", "Escape", "ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight",
  "Home", "End", "PageUp", "PageDown", "Backspace", "Delete", "Space",
]);

export function validateRunConfig(raw: unknown): { config: RunConfig | null; errors: string[] } {
  const errors: string[] = [];
  if (typeof raw !== "object" || raw === null) {
    return { config: null, errors: ["config must be a JSON object"] };
  }
  const c = raw as Record<string, unknown>;

  if (c.schemaVersion !== SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${SCHEMA_VERSION}`);
  }
  const target = c.target as Record<string, unknown> | undefined;
  if (typeof target !== "object" || target === null || typeof target.baseURL !== "string") {
    errors.push("target.baseURL is required and must be a string");
  } else {
    try {
      const u = new URL(target.baseURL);
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        errors.push("target.baseURL must be http(s)");
      }
    } catch {
      errors.push("target.baseURL must be a valid URL");
    }
  }

  if (typeof c.journeyId !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(c.journeyId)) {
    errors.push("journeyId is required (lowercase letters, digits, dashes)");
  }

  if (!Array.isArray(c.steps) || c.steps.length === 0) {
    errors.push("steps must be a non-empty array");
  } else {
    c.steps.forEach((s: unknown, i: number) => validateStep(s, i, errors));
  }

  if (typeof c.scenario !== "string" || c.scenario.length === 0) {
    errors.push("scenario is required");
  }

  if (c.params !== undefined) validateParams(c.params, errors);
  if (c.viewport !== undefined) {
    const v = c.viewport as Record<string, unknown>;
    if (typeof v.width !== "number" || typeof v.height !== "number"
      || v.width < 200 || v.width > 4000 || v.height < 200 || v.height > 4000) {
      errors.push("viewport.width/height must be numbers between 200 and 4000");
    }
  }
  if (c.timeouts !== undefined) {
    const t = c.timeouts as Record<string, unknown>;
    for (const k of ["stepMs", "scenarioMs"] as const) {
      if (t[k] !== undefined && (typeof t[k] !== "number" || t[k] < 100 || t[k] > 300000)) {
        errors.push(`timeouts.${k} must be a number between 100 and 300000`);
      }
    }
  }
  if (c.expectations !== undefined) {
    if (!Array.isArray(c.expectations)) errors.push("expectations must be an array");
    else c.expectations.forEach((e: unknown, i: number) => validateExpectation(e, i, errors));
  }

  if (errors.length > 0) return { config: null, errors };
  return { config: c as unknown as RunConfig, errors: [] };
}

function validateStep(raw: unknown, i: number, errors: string[]): void {
  const where = `steps[${i}]`;
  if (typeof raw !== "object" || raw === null) {
    errors.push(`${where}: must be an object`);
    return;
  }
  const s = raw as Record<string, unknown>;
  if (typeof s.action !== "string" || !ACTIONS.has(s.action)) {
    errors.push(`${where}.action must be one of ${[...ACTIONS].join(", ")}`);
    return;
  }
  switch (s.action) {
    case "navigate":
      if (typeof s.url !== "string" || s.url.length === 0) {
        errors.push(`${where}.url is required for navigate`);
      } else {
        try {
          // Relative to baseURL or absolute http(s)
          if (!/^https?:\/\//.test(s.url) && !s.url.startsWith("/")) {
            errors.push(`${where}.url must be absolute http(s) or start with /`);
          }
        } catch {
          errors.push(`${where}.url is invalid`);
        }
      }
      break;
    case "click":
    case "fill":
    case "press":
      if (typeof s.selector !== "string" || s.selector.length === 0) {
        errors.push(`${where}.selector is required for ${s.action}`);
      }
      if (s.action === "fill" && typeof s.text !== "string") {
        errors.push(`${where}.text is required for fill`);
      }
      if (s.action === "press" && (typeof s.key !== "string" || !KEYS.has(s.key))) {
        errors.push(`${where}.key must be one of ${[...KEYS].join(", ")}`);
      }
      break;
    case "expect": {
      const cond = s.condition;
      if (typeof cond !== "string" || !CONDITIONS.has(cond)) {
        errors.push(`${where}.condition must be one of ${[...CONDITIONS].join(", ")}`);
      } else if (cond === "url") {
        if (typeof s.urlContains !== "string") {
          errors.push(`${where}.urlContains is required for condition "url"`);
        }
      } else {
        if (typeof s.selector !== "string" || s.selector.length === 0) {
          errors.push(`${where}.selector is required for condition "${cond}"`);
        }
        if (cond === "text" && typeof s.contains !== "string") {
          errors.push(`${where}.contains is required for condition "text"`);
        }
      }
      if (s.timeoutMs !== undefined && (typeof s.timeoutMs !== "number" || s.timeoutMs < 100 || s.timeoutMs > 60000)) {
        errors.push(`${where}.timeoutMs must be between 100 and 60000`);
      }
      break;
    }
  }
}

function validateExpectation(raw: unknown, i: number, errors: string[]): void {
  const where = `expectations[${i}]`;
  if (typeof raw !== "object" || raw === null) {
    errors.push(`${where}: must be an object`);
    return;
  }
  const e = raw as Record<string, unknown>;
  if (typeof e.id !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(e.id)) {
    errors.push(`${where}.id must be a short lowercase slug`);
  }
  if (typeof e.condition !== "string" || !["visible", "hidden", "text"].includes(e.condition)) {
    errors.push(`${where}.condition must be visible, hidden or text`);
  }
  if (typeof e.selector !== "string" || e.selector.length === 0) {
    errors.push(`${where}.selector is required`);
  }
  if (e.condition === "text" && typeof e.contains !== "string") {
    errors.push(`${where}.contains is required for condition "text"`);
  }
  if (e.withinMs !== undefined && (typeof e.withinMs !== "number" || e.withinMs < 100 || e.withinMs > 60000)) {
    errors.push(`${where}.withinMs must be between 100 and 60000`);
  }
}

function validateParams(raw: unknown, errors: string[]): void {
  const p = raw as Record<string, unknown>;
  for (const key of Object.keys(p)) {
    if (![
      "injections", "contentRegions", "viewportWidth", "viewportHeight", "textScale", "routes",
      "settleMs", "focusTarget", "maxTabs", "seed", "overflowTolerancePx",
    ].includes(key)) {
      errors.push(`params.${key} is not a known parameter`);
    }
  }
  if (p.contentRegions !== undefined) {
    if (!Array.isArray(p.contentRegions) || p.contentRegions.length === 0) {
      errors.push("params.contentRegions must be a non-empty array");
    } else {
      (p.contentRegions as Record<string, unknown>[]).forEach((r, i) => {
        if (typeof r.selector !== "string" || r.selector.length === 0) {
          errors.push(`params.contentRegions[${i}].selector is required`);
        }
      });
    }
  }
  if (p.injections !== undefined) {
    if (!Array.isArray(p.injections) || p.injections.length === 0) {
      errors.push("params.injections must be a non-empty array");
    } else {
      (p.injections as Record<string, unknown>[]).forEach((inj, i) => {
        if (typeof inj.selector !== "string" || inj.selector.length === 0) {
          errors.push(`params.injections[${i}].selector is required`);
        }
        if (inj.nth !== undefined && (typeof inj.nth !== "number" || inj.nth < 0)) {
          errors.push(`params.injections[${i}].nth must be a non-negative number`);
        }
      });
    }
  }
  if (p.viewportWidth !== undefined && (typeof p.viewportWidth !== "number" || p.viewportWidth < 200 || p.viewportWidth > 4000)) {
    errors.push("params.viewportWidth must be between 200 and 4000");
  }
  if (p.viewportHeight !== undefined && (typeof p.viewportHeight !== "number" || p.viewportHeight < 200 || p.viewportHeight > 4000)) {
    errors.push("params.viewportHeight must be between 200 and 4000");
  }
  if (p.textScale !== undefined && (typeof p.textScale !== "number" || p.textScale < 1 || p.textScale > 3)) {
    errors.push("params.textScale must be between 1 and 3");
  }
  if (p.routes !== undefined) {
    if (!Array.isArray(p.routes) || p.routes.length === 0) {
      errors.push("params.routes must be a non-empty array");
    } else {
      (p.routes as Record<string, unknown>[]).forEach((r, i) => validateRoute(r, i, errors));
    }
  }
  if (p.settleMs !== undefined && (typeof p.settleMs !== "number" || p.settleMs < 0 || p.settleMs > 30000)) {
    errors.push("params.settleMs must be between 0 and 30000");
  }
  if (p.focusTarget !== undefined && (typeof p.focusTarget !== "string" || p.focusTarget.length === 0)) {
    errors.push("params.focusTarget must be a non-empty string");
  }
  if (p.maxTabs !== undefined && (typeof p.maxTabs !== "number" || p.maxTabs < 1 || p.maxTabs > 100)) {
    errors.push("params.maxTabs must be between 1 and 100");
  }
  if (p.seed !== undefined && (typeof p.seed !== "number" || !Number.isInteger(p.seed))) {
    errors.push("params.seed must be an integer");
  }
  if (p.overflowTolerancePx !== undefined && (typeof p.overflowTolerancePx !== "number" || p.overflowTolerancePx < 0 || p.overflowTolerancePx > 50)) {
    errors.push("params.overflowTolerancePx must be between 0 and 50");
  }
}

function validateRoute(r: Record<string, unknown>, i: number, errors: string[]): void {
  const where = `params.routes[${i}]`;
  if (typeof r.urlPattern !== "string" || r.urlPattern.length === 0) {
    errors.push(`${where}.urlPattern is required`);
  }
  if (r.mode !== "fulfill" && r.mode !== "delay" && r.mode !== "fail") {
    errors.push(`${where}.mode must be fulfill, delay or fail`);
  } else if (r.mode === "fulfill" && r.body === undefined) {
    errors.push(`${where}.body is required for mode "fulfill"`);
  }
  if (r.delayMs !== undefined && (typeof r.delayMs !== "number" || r.delayMs < 0 || r.delayMs > 30000)) {
    errors.push(`${where}.delayMs must be between 0 and 30000`);
  }
  if (r.status !== undefined && (typeof r.status !== "number" || r.status < 400 || r.status > 599)) {
    errors.push(`${where}.status must be an HTTP error status (400-599)`);
  }
}

/**
 * Canonical JSON: sorted object keys, no whitespace — the basis for stable
 * hashing of journeys and configs.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Comparison identity: everything that defines what is being tested and how.
 * Deliberately EXCLUDES runId, appRevision, output and capture options —
 * those describe the run, not the test. Before/after comparison requires
 * identical identity; the app itself is expected to change.
 */
export function identityHash(config: RunConfig): string {
  const identity = {
    schemaVersion: config.schemaVersion,
    target: { baseURL: config.target.baseURL },
    journeyId: config.journeyId,
    steps: config.steps,
    scenario: config.scenario,
    params: (config.params ?? {}) as ScenarioParams,
    viewport: config.viewport ?? null,
    timeouts: normalizedTimeouts(config),
    expectations: config.expectations ?? [],
  };
  return sha256(canonicalJson(identity));
}

export function journeyHash(config: RunConfig): string {
  return sha256(canonicalJson({ journeyId: config.journeyId, steps: config.steps }));
}

function normalizedTimeouts(config: RunConfig) {
  const t = config.timeouts ?? {};
  return { stepMs: t.stepMs ?? 5000, scenarioMs: t.scenarioMs ?? 60000 };
}

/** Deep-freeze helper used by tests to guard against accidental mutation. */
export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  Object.freeze(value);
  for (const key of Object.getOwnPropertyNames(value as object)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

export type { JourneyStep, Expectation, RouteFixture, RunConfig, ScenarioParams };
