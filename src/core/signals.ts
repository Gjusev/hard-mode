// Signal collection. Scenarios and detectors push observable signals; the
// runner assembles findings. A signal is "confirmed" only when an objectively
// checkable condition was violated (geometry, reachability, declared intent).
import type { Signal } from "../config/types.js";

export class SignalCollector {
  readonly signals: Signal[] = [];
  readonly consoleErrors: string[] = [];
  readonly pageErrors: string[] = [];
  readonly notes: string[] = [];

  push(signal: Signal): void {
    this.signals.push(signal);
  }

  consoleError(text: string): void {
    if (this.consoleErrors.length < 10) this.consoleErrors.push(text.slice(0, 500));
  }

  pageError(text: string): void {
    if (this.pageErrors.length < 10) this.pageError0(text);
  }

  private pageError0(text: string): void {
    this.pageErrors.push(text.slice(0, 500));
  }

  note(text: string): void {
    this.notes.push(text);
  }
}
