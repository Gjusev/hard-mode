// RunConfig, Journey, Finding and Signal contracts for hard-mode.

export const SCHEMA_VERSION = 1;

/** Journey steps: a deliberately small action vocabulary. No arbitrary JS. */
export type JourneyStep =
  | { action: "navigate"; url: string }
  | { action: "click"; selector: string }
  | { action: "fill"; selector: string; text: string }
  | { action: "press"; key: string; /** optional target that must be focused first */ selector?: string }
  | {
      action: "expect";
      condition: "visible" | "hidden" | "text" | "url";
      selector?: string;
      contains?: string;
      /** substring the URL must contain, for condition "url" */
      urlContains?: string;
      timeoutMs?: number;
    };

/** Declared post-perturbation expectation. A violation is a confirmed finding. */
export interface Expectation {
  id: string;
  condition: "visible" | "hidden" | "text";
  selector: string;
  contains?: string;
  withinMs?: number;
  /** human sentence of the intended behavior, shown in the report */
  intent?: string;
}

export interface RouteFixture {
  /** Playwright URL glob, e.g. a pattern matching the path /api/tasks */
  urlPattern: string;
  /**
   * "fulfill": respond with `body` (valid empty shape for the API contract).
   * "delay": hold the response for delayMs, then pass through.
   * "fail": abort with an HTTP error status after optional delayMs.
   */
  mode: "fulfill" | "delay" | "fail";
  /** JSON body for mode "fulfill" */
  body?: unknown;
  contentType?: string;
  /** ms for mode "delay"/"fail" */
  delayMs?: number;
  /** HTTP status for mode "fail" */
  status?: number;
  /** short label recorded in findings (what was agreed with the app contract) */
  label?: string;
}

export interface InjectionPoint {
  /** CSS selector of the element whose text will be replaced */
  selector: string;
  /** occurrence index when the selector matches several elements */
  nth?: number;
  /** explicit text; when omitted, deterministic long text is generated from the seed */
  text?: string;
}

export interface ContentRegion {
  /** region whose emptiness after loading is worth reporting */
  selector: string;
  /** selector that should become visible when the region has no content */
  emptyIndicator?: string;
}

export interface ScenarioParams {
  /** long-text */
  injections?: InjectionPoint[];
  /** empty-data */
  contentRegions?: ContentRegion[];
  /** narrow-viewport */
  viewportWidth?: number;
  viewportHeight?: number;
  /** typographic scale applied to the root element, e.g. 1.5 = +50% font size */
  textScale?: number;
  /** empty-data / slow-network */
  routes?: RouteFixture[];
  /** wait for perturbed requests to settle before observing, ms */
  settleMs?: number;
  /** keyboard */
  focusTarget?: string;
  maxTabs?: number;
  /** deterministic generator seed (long-text default strings) */
  seed?: number;
  /** overflow detection tolerance in px (default 1) */
  overflowTolerancePx?: number;
}

export interface RunConfig {
  schemaVersion: number;
  /** free label recorded in run metadata; excluded from comparison identity */
  runId?: string;
  /** free label describing the app revision under test, e.g. "broken" / "fixed after PR 12" */
  appRevision?: string;
  target: { baseURL: string };
  journeyId: string;
  steps: JourneyStep[];
  scenario: string;
  params?: ScenarioParams;
  /** viewport for the run. deviceScaleFactor is intentionally NOT configurable:
   *  we keep it at 1 and describe every scaling perturbation explicitly. */
  viewport?: { width: number; height: number };
  timeouts?: { stepMs?: number; scenarioMs?: number };
  expectations?: Expectation[];
  /** where run directories are created (default "runs") */
  output?: { root?: string };
  capture?: { screenshot?: boolean; trace?: boolean };
}

export type FindingType = "confirmed" | "needs_review" | "not_applicable" | "infrastructure_error";

export interface Finding {
  id: string;
  runId: string;
  scenarioId: string;
  /** what was perturbed: selector / route / viewport … */
  target: string;
  params: Record<string, unknown>;
  type: FindingType;
  /** one-line observation, expected/observed when an expectation was declared */
  summary: string;
  expected?: string;
  observed?: string;
  /** how the observation was measured (geometry, DOM check, network capture…) */
  method?: string;
  evidence: { screenshot?: string; trace?: string; details?: Record<string, unknown> };
  /** exact reproduction: config path + command */
  reproduce: { configPath: string; command: string };
  limitations?: string[];
  /** identity fields echoed for traceability */
  identity: { journeyId: string; scenario: string; identityHash: string; appRevision?: string };
}

export interface RunResult {
  runDir: string;
  runId: string;
  scenarioId: string;
  identityHash: string;
  startedAt: string;
  finishedAt: string;
  status: "completed" | "infrastructure_error";
  playwrightVersion: string;
  config: RunConfig;
  findings: Finding[];
  reportPath: string;
  reproduceConfigPath: string;
}

/** Observable signal collected by a detector; the runner turns signals into findings. */
export interface Signal {
  /** detector id, e.g. "overflow" */
  detector: string;
  target: string;
  /** "confirmed" only when an objectively checkable condition was violated */
  type: FindingType;
  summary: string;
  expected?: string;
  observed?: string;
  method?: string;
  details?: Record<string, unknown>;
}
