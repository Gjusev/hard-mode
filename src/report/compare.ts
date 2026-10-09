// Before/after comparison. Comparison is only offered when both runs share
// the same identity (journey + scenario + params + viewport + timeouts +
// expectations). Different configurations are never presented as equivalent.
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Finding, RunResult } from "../config/types.js";
import { BASE_CSS, escapeHtml } from "./html.js";

export interface ComparisonFinding {
  id: string;
  before?: Finding;
  after?: Finding;
  verdict: "resolved" | "unresolved" | "new";
}

export function loadRun(runDir: string): RunResult {
  const raw = JSON.parse(readFileSync(path.join(runDir, "run.json"), "utf8")) as RunResult;
  return raw;
}

export function compareIdentity(a: RunResult, b: RunResult): { ok: true } | { ok: false; reason: string } {
  if (a.identityHash !== b.identityHash) {
    return {
      ok: false,
      reason:
        `runs have different identities (${a.identityHash.slice(0, 12)}… vs ${b.identityHash.slice(0, 12)}…). ` +
        "Journey, scenario, params, viewport, timeouts or expectations differ; a comparison would be misleading",
    };
  }
  if (a.scenarioId !== b.scenarioId) {
    return { ok: false, reason: `scenario mismatch: ${a.scenarioId} vs ${b.scenarioId}` };
  }
  return { ok: true };
}

export function compareFindings(a: RunResult, b: RunResult): ComparisonFinding[] {
  const before = new Map(a.findings.map((f) => [f.id, f] as const));
  const after = new Map(b.findings.map((f) => [f.id, f] as const));
  const ids = [...new Set([...before.keys(), ...after.keys()])].sort();
  return ids.map((id) => {
    const b = before.get(id);
    const f = after.get(id);
    const verdict: ComparisonFinding["verdict"] = b && !f ? "resolved" : !b && f ? "new" : "unresolved";
    return { id, before: b, after: f, verdict };
  });
}

export function renderCompareHtml(a: RunResult, b: RunResult): string {
  const rows = compareFindings(a, b);
  const resolved = rows.filter((r) => r.verdict === "resolved").length;
  const unresolved = rows.filter((r) => r.verdict === "unresolved").length;
  const created = rows.filter((r) => r.verdict === "new").length;
  const revA = escapeHtml(a.config.appRevision ?? "unlabeled");
  const revB = escapeHtml(b.config.appRevision ?? "unlabeled");
  const aShot = escapeHtml(path.posix.join(path.basename(a.runDir), "evidence", "final.png"));
  const bShot = escapeHtml(path.posix.join(path.basename(b.runDir), "evidence", "final.png"));
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>hard-mode compare: ${escapeHtml(a.runId)} vs ${escapeHtml(b.runId)}</title>
<style>
${BASE_CSS}
${COMPARE_CSS}
</style>
</head>
<body>
<header class="run-header">
  <p class="kicker">hard-mode · before / after</p>
  <h1>Scenario ${escapeHtml(a.scenarioId)}, same inputs</h1>
  <p class="meta-note">Both runs share identity <code>${escapeHtml(a.identityHash.slice(0, 16))}…</code>:
    journey, scenario, params, viewport, timeouts and expectations all match. Only the app differs.</p>
  <dl class="meta">
    <div><dt>Before</dt><dd>${escapeHtml(a.runId)} · revision <code>${revA}</code></dd></div>
    <div><dt>After</dt><dd>${escapeHtml(b.runId)} · revision <code>${revB}</code></dd></div>
  </dl>
</header>
<main>
  <section aria-labelledby="shots-title">
    <h2 id="shots-title">Same scenario, same inputs</h2>
    <div class="shots">
      <figure>
        <figcaption>Before · revision ${revA}</figcaption>
        <img src="${aShot}" alt="Before (${revA}): screenshot of run ${escapeHtml(a.runId)}" loading="lazy">
      </figure>
      <figure>
        <figcaption>After · revision ${revB}</figcaption>
        <img src="${bShot}" alt="After (${revB}): screenshot of run ${escapeHtml(b.runId)}" loading="lazy">
      </figure>
    </div>
    <p class="meta-note-light">Aligned side by side at the same declared viewport and inputs. A pixel
       difference alone proves nothing; read the verdicts below, which state what was measured.</p>
  </section>
  <section aria-labelledby="verdicts-title">
    <h2 id="verdicts-title">Findings</h2>
    <p class="tally">
      <span class="pill">${resolved} resolved</span>
      <span class="pill">${unresolved} unchanged</span>
      <span class="pill">${created} new</span>
    </p>
    <ol class="rows">
${rows.map((r) => compareRow(r)).join("\n")}
    </ol>
  </section>
</main>
</body>
</html>`;
}

function compareRow(r: ComparisonFinding): string {
  const meta = r.verdict === "resolved"
    ? { icon: "✓", label: "resolved" }
    : r.verdict === "new"
      ? { icon: "＋", label: "new in after-run" }
      : { icon: "≠", label: "still present" };
  const before = r.before ? `${escapeHtml(r.before.type)}: ${escapeHtml(r.before.summary)}` : "(absent in the before-run)";
  const after = r.after ? `${escapeHtml(r.after.type)}: ${escapeHtml(r.after.summary)}` : "(gone in the after-run)";
  return `      <li class="row verdict-${escapeHtml(r.verdict)}">
        <p class="verdict"><span class="badge">${meta.icon} ${meta.label}</span> <code>${escapeHtml(r.id)}</code></p>
        <div class="cols">
          <p><strong>Before:</strong> ${before}</p>
          <p><strong>After:</strong> ${after}</p>
        </div>
      </li>`;
}

const COMPARE_CSS = `
.meta-note code { background: rgba(233, 240, 248, 0.14); color: #d7e3f0; }
.meta-note-light { color: var(--ink-2); font-size: 13px; max-width: 72ch; }
.shots { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; }
.shots figure { margin: 0; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 12px; box-shadow: var(--shadow); }
.shots figcaption { font-weight: 600; font-size: 14px; margin-bottom: 8px; }
.shots img { width: 100%; height: auto; border: 1px solid var(--line-soft); border-radius: 6px; }
.rows { list-style: none; padding: 0; display: grid; gap: 12px; }
.row { background: var(--surface); border: 1px solid var(--line); border-left-width: 3px; border-radius: 10px; padding: 13px 16px; box-shadow: var(--shadow); }
.verdict-resolved { border-left-color: #2c6e49; }
.verdict-unresolved { border-left-color: var(--c-confirm); }
.verdict-new { border-left-color: var(--c-review); }
.verdict { font-weight: 600; margin: 0 0 6px; display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
.verdict .badge { border-color: currentColor; }
.verdict-resolved .badge { color: #2c6e49; background: #e9f3ed; }
.verdict-unresolved .badge { color: var(--c-confirm); background: #fbeae9; }
.verdict-new .badge { color: var(--c-review); background: #fdf1d7; }
.verdict code { font-weight: 400; font-size: 12.5px; color: var(--ink-2); }
.cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 6px 24px; margin: 0; }
.cols p { margin: 4px 0; overflow-wrap: anywhere; font-size: 14px; }
`;
