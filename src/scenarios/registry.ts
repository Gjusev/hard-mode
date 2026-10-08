// Scenario registry: the single source of truth for available scenarios.
import type { ScenarioDef } from "./types.js";
import { longTextScenario } from "./long-text.js";
import { narrowViewportScenario } from "./narrow-viewport.js";
import { emptyDataScenario } from "./empty-data.js";
import { slowNetworkScenario } from "./slow-network.js";
import { keyboardScenario } from "./keyboard.js";

export const SCENARIOS: ScenarioDef[] = [
  longTextScenario,
  narrowViewportScenario,
  emptyDataScenario,
  slowNetworkScenario,
  keyboardScenario,
];

export function getScenario(id: string): ScenarioDef | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

export function scenarioIds(): string[] {
  return SCENARIOS.map((s) => s.id);
}
