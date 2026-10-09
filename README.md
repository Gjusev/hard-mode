# Hard Mode

Your beautiful demo meets real life.

**hard-mode** is an open-source local tool: a Playwright runner plus an agent
skill that exercise a web app under repeatable, uncomfortable UI scenarios and
turn what they observe into evidence — screenshots, measurements, focus
traces — you can reproduce and compare before/after a fix.

It does not score your app, upload anything, or claim to certify anything.

## The five scenarios

| scenario | what it does |
| -------- | ------------ |
| `long-text` | replaces text at declared selectors with deterministic long text, then measures clipping/overflow geometry |
| `narrow-viewport` | narrow viewport + root font-size scaling (a layout probe — not a device emulator) |
| `empty-data` | fulfills a selected API route with a configured, valid-but-empty response |
| `slow-network` | delays or fails a selected request, within a bounded settle window |
| `keyboard` | walks the tab order and checks a declared control is reachable by keyboard |

Each run uses a clean browser context, closes it even on error or timeout,
never edits your app, and writes its findings as one of: `confirmed`,
`needs_review`, `not_applicable`, `infrastructure_error`. A signal is not a
verdict — the report tells you exactly what was measured and how.

## Quick start

Requirements: Node.js ≥ 20.

```bash
git clone <this repo> && cd hard-mode
npm install
npm run build
npx playwright install chromium
```

Run the built-in demo (synthetic app, deliberately broken variant, then the
fixed variant, then a before/after comparison):

```bash
npm run demo          # or: npm run demo keyboard  (any scenario id)
```

This starts the demo app, runs the scenario against the broken build, applies
the fix, reruns the identical configuration, and prints the paths of the
report and the before/after comparison. Open them in a browser.

## Using it on your own app

1. Start your app locally.
2. Write a run config (see `skills/hard-mode/references/runconfig.md`):
   a base URL, a short journey, one scenario and its params.
3. Run it:

```bash
node dist/cli.js run my-config.json                # writes runs/<id>/report.html
node dist/cli.js validate my-config.json           # check the config first
node dist/cli.js scenarios                         # list scenarios + params
```

4. After fixing your app, rerun the same config with a new revision label and
   compare — comparison only works when both runs used identical journey,
   scenario, params, viewport, timeouts and expectations:

```bash
node dist/cli.js run my-config.json --revision "after-fix"
node dist/cli.js compare runs/<before> runs/<after>   # refuses mismatches (exit 3)
```

Exit codes: `0` run completed · `1` invalid usage/config · `2` infrastructure
error (e.g. server unreachable — reported as such, never as "app broken") ·
`3` compare refused.

## The agent skill

`skills/hard-mode/` contains an installable skill that teaches an agent this
workflow: pick a target and a verifiable goal, write and validate the config,
run the CLI, read findings as signals (not verdicts), reproduce before
proposing fixes, and rerun the same config after a fix. Point your agent at
the skill folder, or copy it wherever your agent looks for skills. The CLI is
the stable interface; the skill needs no other plugins.

## Development

```bash
npm run typecheck   # TypeScript for src and tests
npm test            # build + full suite (unit + browser e2e)
npm run demo        # end-to-end demo on the synthetic app
```

The test suite covers, among other things: every scenario against a
deliberately broken control and a fixed control (no invented findings), config
validation, reproduction from a saved config, before/after comparison with
identity checks, infrastructure-error classification, HTML escaping of hostile
app text, keyboard operability and narrow-screen behavior of the report UI,
and a second sample app with a completely different structure.

Fixtures are two small synthetic apps (`fixtures/demo-app`,
`fixtures/second-app`) with `broken`/`fixed` variants served from the same
URLs — no real user data anywhere.

## Scope and limits

- Local execution, local output. No telemetry, accounts, or billing.
- Not a device emulator, not browser zoom simulation; every perturbation is
  described exactly in the findings.
- Not an accessibility certification; the keyboard scenario records focus
  order and reachability, nothing more.
- Don't point it at production, payment flows, or data you don't own.

## License

MIT. See [LICENSE](LICENSE).
