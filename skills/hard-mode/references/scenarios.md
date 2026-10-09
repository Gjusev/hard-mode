# Scenario reference

Five scenarios ship with hard-mode. Each runs in a fresh browser context
(cookies, storage and route handlers are discarded afterwards), is bounded by
`timeouts.scenarioMs` (default 60000), and records exactly what it perturbed
in the run's notes.

## long-text

Replaces the text of **declared selectors only** with deterministic long text
(after the journey completes). Nothing else in the DOM is touched. Then
measures geometry on those elements.

```json
"scenario": "long-text",
"params": {
  "injections": [{ "selector": ".card-title" }, { "selector": ".row .name", "nth": 0 }],
  "seed": 7,
  "overflowTolerancePx": 1
}
```

- `injections[].text`: explicit text instead of the generated one.
- Detection: an element is **confirmed** when its content is clipped
  (scrollWidth > clientWidth with non-visible overflow) or extends past the
  viewport edge. Document-wide horizontal scroll without a provable culprit is
  reported as needs_review (it may predate the injection).

## narrow-viewport

Creates the context at a narrow viewport and, after the journey, multiplies
the root font-size via inline style. `deviceScaleFactor` stays at 1.

```json
"scenario": "narrow-viewport",
"params": { "viewportWidth": 360, "viewportHeight": 800, "textScale": 1.5 }
```

- Detection: document needs more horizontal space than the viewport offers →
  confirmed, with the measured pixel widths in the finding.
- This is a layout probe, not a device simulation. Say exactly that.

## empty-data

Intercepts **only** the declared route patterns and fulfills them with the
configured body. The body must be a valid empty shape for that API's contract;
you decide it from the app's code or API docs. Never guess a shape.

```json
"scenario": "empty-data",
"params": {
  "routes": [{ "urlPattern": "**/api/tasks", "mode": "fulfill", "body": { "tasks": [] } }],
  "contentRegions": [{ "selector": ".task-list", "emptyIndicator": ".empty-state" }],
  "settleMs": 400
}
```

- If the pattern matches no request, the finding is not_applicable (the
  fixture never applied).
- Declare an expectation for the intended behavior to get a confirmed finding:
  ```json
  "expectations": [{
    "id": "empty-state-shown",
    "condition": "visible",
    "selector": ".empty-state",
    "intent": "An empty list shows the empty state",
    "withinMs": 2000
  }]
  ```
- A region that loads empty with no visible empty-indicator is needs_review.

## slow-network

Intercepts the declared routes with a delay and/or an HTTP error. Other
requests pass through.

```json
"scenario": "slow-network",
"params": {
  "routes": [{ "urlPattern": "**/api/stats", "mode": "fail", "delayMs": 1500, "status": 500 }],
  "settleMs": 3000
}
```

- `mode: "delay"` holds the real response for `delayMs` and then passes it
  through; `mode: "fail"` answers with `status` after `delayMs`.
- The runner raises the scenario budget automatically when the configured
  delay window needs more than `timeouts.scenarioMs`: a legitimate delay is
  never reported as an infrastructure failure.
- Loading-like text still on screen after the settle window → needs_review.
  The confirmed verdict comes from declared expectations (e.g. fallback
  message visible, retry button present).

## keyboard

After the journey, presses Tab up to `maxTabs` times, recording the focused
element after each press. The declared target must receive focus.

```json
"scenario": "keyboard",
"params": { "focusTarget": ".primary-action", "maxTabs": 8 }
```

- Target never focused → confirmed (the full focus trace is in the finding).
- Target focused but no visible focus indicator detected (outline, box-shadow
  or border > 0, heuristic) → needs_review.
- Focus staying inside a modal is not treated as a bug.

## Exit codes of the CLI

| code | meaning |
| ---- | ------- |
| 0 | run completed (findings may exist; they are results, not crashes) |
| 1 | invalid usage or config |
| 2 | infrastructure error (server unreachable, budget exceeded) |
| 3 | compare refused: run identities differ |
