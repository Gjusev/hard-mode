---
name: hard-mode
description: >-
  Test a local web app under difficult UI conditions (long text, narrow
  viewport with enlarged text, empty-but-valid API data, slow or failing
  requests, keyboard-only traversal) and produce a reproducible evidence
  report with screenshots, plus a before/after comparison after a fix.
  Use when the user asks to stress, harden, or probe their local app or demo
  with realistic adverse conditions, or to reproduce/verify a specific UI
  failure. Not for theoretical CSS/accessibility questions, code reviews, or
  apps you cannot run locally.
---

# Hard Mode

Your beautiful demo meets real life. This skill drives a local Playwright
runner that perturbs one aspect of a running web app at a time, in a clean
browser context, and turns what it observes into findings with evidence,
never a made-up score.

## What you need before starting

1. A web app the user can run **locally** (dev server on localhost). Never
   point this at production, payment flows, or real user data.
2. The hard-mode repository. If you are reading this inside the repo (at
   `skills/hard-mode/`), the repo root is two levels up. If this skill was
   **copied** into your environment, you additionally need the path to a
   hard-mode checkout: check the `HARD_MODE_REPO` environment variable, or
   ask the user. From that root, once:
   ```
   npm install && npm run build && npx playwright install chromium
   ```
3. The CLI is the stable interface (`<repo>` is the checkout path):
   ```
   node <repo>/dist/cli.js run <config.json>
   node <repo>/dist/cli.js compare <runDirA> <runDirB>
   node <repo>/dist/cli.js scenarios      # list scenarios + parameters
   ```

## Flow

### 1. Identify target and verifiable goal
Ask for (or find) the app's local URL and one concrete journey: the page to
open and the observable state that means "loaded" (a selector that becomes
visible). A scenario without a target and an observable condition produces
noise, not evidence.

### 2. Write a RunConfig
Read [references/runconfig.md](references/runconfig.md) for the full schema
and [references/scenarios.md](references/scenarios.md) for scenario params.
Minimum shape:

```json
{
  "schemaVersion": 1,
  "target": { "baseURL": "http://localhost:3000" },
  "journeyId": "short-slug",
  "steps": [
    { "action": "navigate", "url": "/" },
    { "action": "expect", "condition": "visible", "selector": ".loaded-thing", "timeoutMs": 3000 }
  ],
  "scenario": "long-text",
  "params": { "injections": [{ "selector": ".card-title" }] }
}
```

Validate it before running: `node <repo>/dist/cli.js validate <config.json>`.

### 3. Run, then read findings: signals are not verdicts
`hard-mode run` writes a run directory with `findings.json`, `report.html`
(gallery with screenshots, keyboard operable) and `reproduce.json` (the exact
config, for re-running). Findings have four types; quote them exactly:

- **confirmed**: an objectively checkable condition was violated (geometry,
  focus reachability, or a declared expectation). Say what was measured.
- **needs_review**: an observable signal (empty region, stuck loading text,
  console error) whose meaning depends on the app's intent. Present it as a
  question, not a bug.
- **not_applicable**: the scenario's prerequisite never happened (selector
  missing, route never matched). Do not count it as a failure.
- **infrastructure_error**: the harness could not run (server down, budget
  exceeded). Fix the environment; never report it as "the app is broken".

A pixel difference alone proves nothing. Open `report.html` (or read
`findings.json` + `evidence/`) and describe what is actually shown.

### 4. Reproduce before proposing a fix
Re-run the saved config before touching code:
`node <repo>/dist/cli.js run <runDir>/reproduce.json`. If the signal does not
reproduce with the same inputs, say so; do not propose a fix for a ghost.

### 5. Fix (only if asked), then rerun the SAME config
A repair affects only the selected finding's cause; do not change the test to
make it pass. After the user applies a fix, rerun the identical config with a
new revision label:
```
node <repo>/dist/cli.js run <config.json> --revision "after-fix"
node <repo>/dist/cli.js compare <beforeRunDir> <afterRunDir>
```
Comparison is refused unless journey, scenario, params, viewport, timeouts and
expectations all match. That is the point: only the app may change.

## Limits, stated when reporting

- Narrow-viewport + textScale changes the viewport and the root font size. It
  is NOT a phone emulator, not browser zoom, not a devicePixelRatio simulation.
- The keyboard scenario records focus order and reachability; it does not
  certify WCAG or full accessibility.
- The suite is diagnostic: a clean run is not a certificate of correctness.
- Evidence (screenshots, traces) stays local; runs are written under `runs/` by
  default and are not meant to be shared if they contain real data.

## Choosing scenarios

See [references/scenarios.md](references/scenarios.md). Pick by what the user
asked for: long-text for data/labels, narrow-viewport for responsive layout,
empty-data and slow-network for API resilience, keyboard for reachability.
If the user only asked for a report, stop after the report; do not start
fixing the whole project.
