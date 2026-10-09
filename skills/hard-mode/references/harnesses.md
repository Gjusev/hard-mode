# Using hard-mode from different harnesses

The CLI is the stable interface, so every agent harness that can run shell
commands can drive hard-mode. What varies per harness is only how the agent
learns the workflow: as an installed skill, a rule file, or a pasted prompt.

What is verified, honestly:

- **Claude Code**: skill auto-discovery from `.claude/skills/`, plus a clean
  session writing configs and running the CLI by itself. Verified end to end.
- **Any terminal, human or CI**: `npx hard-mode ...` / the repo CLI. Verified.
- **Cursor, Codex CLI, Gemini CLI, opencode**: the snippets below follow each
  harness's documented convention for standing instructions, but were not
  executed inside those harnesses. Treat them as starting points.

## The common core (no agent needed)

```bash
npx hard-mode scenarios                        # list scenarios and params
npx hard-mode validate my-config.json          # check a config
npx hard-mode run my-config.json               # runs/<id>/report.html
npx hard-mode run my-config.json --revision "after-fix"
npx hard-mode compare runs/<before> runs/<after>
npx hard-mode runs                             # list runs with counts
```

One-time setup per machine: `npx playwright install chromium` (hard-mode
drives a real Chromium). Everything stays local.

## Claude Code (verified)

Copy the skill into the project (or the user folder) and Claude Code picks
it up on the next session:

```bash
mkdir -p .claude/skills
cp -r <hard-mode>/skills/hard-mode .claude/skills/
```

Then a plain request is enough, because the skill carries the workflow:

> Test my local app at http://localhost:3000 for long text and keyboard-only
> use. Give me evidence, do not change any code.

If the skill was copied without the repo, set where the runner lives:

```bash
export HARD_MODE_REPO=/path/to/hard-mode   # or say the path in the request
```

## Cursor (untested convention)

Cursor reads rule files. Create `.cursor/rules/hard-mode.mdc`:

```
---
description: UI stress-testing with hard-mode
alwaysApply: false
---
When the user asks to stress-test, harden, or probe the local web app's UI
(long text, narrow screens, empty data, slow/failing requests, keyboard-only):
1. Read @<hard-mode>/skills/hard-mode/SKILL.md and follow it.
2. The CLI is `node <hard-mode>/dist/cli.js` (or `npx hard-mode`).
3. Report findings with their exact types; never edit app code during a
   diagnostic; rerun the identical config after any fix and compare.
Do not launch browsers for theoretical questions; this is for a running app.
```

## Codex CLI (untested convention)

Codex reads `AGENTS.md`. Add:

```markdown
## UI stress testing
For "test my app under hard conditions" requests, follow the hard-mode skill
at <hard-mode>/skills/hard-mode/SKILL.md. Interface: `npx hard-mode run
<config>`; findings are confirmed / needs_review / not_applicable /
infrastructure_error — quote the type. Reproduce before fixing; rerun the
same config after fixes and `npx hard-mode compare` the two runs.
```

## Gemini CLI (untested convention)

Gemini reads `GEMINI.md`. Same idea:

```markdown
## hard-mode
Use the hard-mode runner (skill: <hard-mode>/skills/hard-mode/SKILL.md) when
asked to test a local web app under difficult UI conditions. It is evidence
driven: every claim must come from a finding in runs/<id>/findings.json.
```

## opencode (untested convention)

opencode loads AGENTS.md/WIKI rules; reuse the Codex snippet in
`AGENTS.md` or its rules directory.

## Any other agent: paste this contract

No skill support needed. The prompt below is the whole product contract:

```text
You have access to the hard-mode CLI (npx hard-mode, or
node <repo>/dist/cli.js). To test a local web app:

1. Write a JSON config: target.baseURL, journeyId, steps
   (navigate/click/fill/press/expect), one scenario from:
   long-text, narrow-viewport, empty-data, slow-network, keyboard.
   Validate with: hard-mode validate <file>.
2. Run: hard-mode run <file>. Read runs/<id>/findings.json.
3. Finding types: confirmed (measured violation), needs_review (signal,
   intent unclear), not_applicable (scenario never applied),
   infrastructure_error (harness problem, NOT an app bug). Quote types
   exactly; invent no scores.
4. Before proposing a fix, reproduce: hard-mode run runs/<id>/reproduce.json.
5. After a fix (only if asked), rerun the SAME config with
   --revision "after-fix" and compare both runs with
   hard-mode compare <before> <after>. It refuses mismatched identities.
6. Never edit the app under test during a diagnostic.
```
