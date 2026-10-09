# RunConfig reference

One JSON file = one scenario execution. Keep the config minimal and stable:
the comparison identity is the hash of everything below except `runId`,
`appRevision`, `output` and `capture`.

```json
{
  "schemaVersion": 1,
  "runId": "short-label",
  "appRevision": "git-sha-or-label",
  "target": { "baseURL": "http://localhost:3000" },
  "journeyId": "short-slug",
  "steps": [],
  "scenario": "long-text",
  "params": {},
  "viewport": { "width": 1280, "height": 800 },
  "timeouts": { "stepMs": 5000, "scenarioMs": 60000 },
  "expectations": [],
  "output": { "root": "runs" },
  "capture": { "screenshot": true, "trace": false }
}
```

- `appRevision`: free label for what the app was when the run happened.
  Compare runs show it for before/after; changing it does not change identity.
- `viewport`: the run's viewport. `deviceScaleFactor` is not configurable on
  purpose; every scaling perturbation is described by the scenario itself.
- `capture.trace`: Playwright trace (view with `npx playwright show-trace`).

## Journey steps

A small vocabulary. No arbitrary JavaScript is ever evaluated.

| action | fields | notes |
| ------ | ------ | ----- |
| `navigate` | `url` | absolute http(s) or a path relative to `baseURL` |
| `click` | `selector` | |
| `fill` | `selector`, `text` | |
| `press` | `selector`, `key` | key ∈ Tab, Enter, Escape, arrows, Home, End, … |
| `expect` | `condition`, `selector`/`urlContains`, `timeoutMs` | waits for an observable condition |

### Selectors

- Plain CSS: `".task-list li"`
- Accessible role with name: `"role:button[name=\"Add task\"]"`
- Text: `"text:Sign in"`

Prefer roles/text that survive markup changes; use CSS for structural regions.
`nth` (0-based) picks an occurrence when several match.

### expect conditions

- `visible` / `hidden` + `selector`
- `text` + `selector` + `contains`
- `url` + `urlContains`

## Expectations (post-perturbation intent)

```json
{
  "id": "empty-state-shown",
  "condition": "visible | hidden | text",
  "selector": ".empty-state",
  "contains": "optional, for condition text",
  "withinMs": 2000,
  "intent": "human sentence shown in the report when violated"
}
```

A violated expectation is the strongest finding type (`confirmed`): you
declared the intended behavior, the run measured it and it did not happen.

## Validation rules that matter

- `journeyId`: lowercase slug (`[a-z0-9-]`), stable across runs of the same
  journey (it feeds the comparison identity).
- Unknown keys inside `params` are rejected; copy params from the scenario
  reference, do not invent them.
- Route fixtures for empty-data require an explicit `body` (the agreed empty
  shape); `fail` routes require a 4xx/5xx `status`.

## Run artifacts

```
runs/<timestamp>-<runId?>-<scenario>-<rand>/
  run.json          metadata: identity hash, journey log, notes, playwright version
  findings.json     the findings array (source of truth for scripts)
  evidence/         final.png screenshot, optional trace.zip
  report.html       human gallery (keyboard operable, escaped app text)
  reproduce.json    the exact config that produced this run
```

Never edit a run directory. To reproduce: `node <repo>/dist/cli.js run <runDir>/reproduce.json`.
