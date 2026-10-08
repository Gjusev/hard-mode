// Scenario contract. A scenario perturbs one aspect of the page in a bounded,
// logged way and collects observable signals. It never edits app code and
// never leaves routes/handlers behind: the runner runs each scenario in a
// fresh browser context that is closed afterwards.
import type { BrowserContext, Page } from "playwright";
import type { RunConfig, ScenarioParams } from "../config/types.js";
import type { SignalCollector } from "../core/signals.js";

export interface ScenarioContext {
  page: Page;
  context: BrowserContext;
  params: ScenarioParams;
  config: RunConfig;
  signals: SignalCollector;
  /** per-run scratch space shared between beforeJourney and afterJourney */
  store: Record<string, unknown>;
  log: (message: string) => void;
}

export interface ScenarioDef {
  id: string;
  title: string;
  /** exact description of the perturbation, echoed in the report */
  summary: string;
  /** parameter documentation for `hard-mode scenarios` and the skill */
  paramsDoc: Record<string, string>;
  /** validation errors for this scenario's params (empty = ok) */
  validate(params: ScenarioParams): string[];
  /** viewport override applied when creating the clean context */
  contextOptions(params: ScenarioParams, config: RunConfig): { viewport?: { width: number; height: number } };
  /** runs before the journey (route interception, …) */
  beforeJourney?(ctx: ScenarioContext): Promise<void>;
  /** runs after the journey: perturbation + observation */
  afterJourney(ctx: ScenarioContext): Promise<void>;
}

export class NotApplicable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotApplicable";
  }
}
