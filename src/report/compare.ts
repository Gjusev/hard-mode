// Before/after comparison. Comparison is only offered when both runs share
// the same identity (journey + scenario + params + viewport + timeouts +
// expectations). Different configurations are never presented as equivalent.
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Finding, RunResult } from "../config/types.js";
import { escapeHtml } from "./html.js";

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
  const aShot = escapeHtml(path.posix.join(path.basename(a.runDir), "evidence", "final.png"));
  const bShot = escapeHtml(path.posix.join(path.basename(b.runDir), "evidence", "final.png"));
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>hard-mode compare — ${escapeHtml(a.runId)} vs ${escapeHtml(b.runId)}</title>
<style>
${COMPARE_CSS}
</style>
</head>
<body>
<header class="run-header">
  <p class="kicker">hard-mode · before / after</p>
  <h1>${escapeHtml(a.scenarioId)}</h1>
  <p>Same identity <code>${escapeHtml(a.identityHash.slice(0, 16))}…</code> — journey, scenario, params,
     viewport, timeouts and expectations all match. Only the app differs:</p>
  <dl class="meta">
    <div><dt>Before</dt><dd>${escapeHtml(a.runId)} · revision ${escapeHtml(a.config.appRevision ?? "unlabeled")}</dd></div>
    <div><dt>After</dt><dd>${escapeHtml(b.runId)} · revision ${escapeHtml(b.config.appRevision ?? "unlabeled")}</dd></div>
  </dl>
</header>
<main>
  <section aria-labelledby="shots-title">
    <h2 id="shots-title">Same scenario, same inputs</h2>
    <div class="shots">
      <figure>
        <figcaption>Before — ${escapeHtml(a.config.appRevision ?? "unlabeled")}</figcaption>
        <img src="${aShot}" alt="Before: screenshot of ${escapeHtml(a.runId)}">
      </figure>
      <figure>
        <figcaption>After — ${escapeHtml(b.config.appRevision ?? "unlabeled")}</figcaption>
        <img src="${bShot}" alt="After: screenshot of ${escapeHtml(b.runId)}">
      </figure>
    </div>
    <p class="meta-note">Aligned side by side, same declared viewport and inputs. A pixel difference alone
       proves nothing — read the findings below, which state what was measured.</p>
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
  const verdictLabel = r.verdict === "resolved" ? "✓ resolved" : r.verdict === "new" ? "＋ new" : "≠ still present";
  const before = r.before ? `${escapeHtml(r.before.type)} — ${escapeHtml(r.before.summary)}` : "(absent)";
  const after = r.after ? `${escapeHtml(r.after.type)} — ${escapeHtml(r.after.summary)}` : "(absent)";
  return `      <li class="row verdict-${escapeHtml(r.verdict)}">
        <p class="verdict">${verdictLabel} <code>${escapeHtml(r.id)}</code></p>
        <div class="cols">
          <p><strong>Before:</strong> ${before}</p>
          <p><strong>After:</strong> ${after}</p>
        </div>
      </li>`;
}

const COMPARE_CSS = `
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; line-height: 1.5; color: #1c2430; background: #f5f7fa; }
.run-header { background: #10233b; color: #fff; padding: 20px clamp(16px, 4vw, 40px); }
.run-header h1 { margin: 4px 0 8px; }
.kicker { margin: 0; text-transform: uppercase; letter-spacing: 0.08em; font-size: 12px; color: #b9c9dd; }
.meta { display: grid; gap: 8px; margin: 12px 0 0; }
.meta div { display: flex; gap: 8px; }
.meta dt { color: #b9c9dd; }
.meta dd { margin: 0; overflow-wrap: anywhere; }
main { padding: 20px clamp(16px, 4vw, 40px); max-width: 1200px; }
h2 { font-size: 20px; margin: 28px 0 12px; }
.shots { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; }
.shots figure { margin: 0; background: #fff; border: 1px solid #d7dee8; border-radius: 8px; padding: 12px; }
.shots figcaption { font-weight: 700; margin-bottom: 8px; }
.shots img { width: 100%; height: auto; border: 1px solid #e6ecf3; border-radius: 4px; }
.tally { display: flex; flex-wrap: wrap; gap: 8px; }
.pill { border: 1px solid #52627a; border-radius: 999px; padding: 2px 12px; font-size: 14px; }
.rows { list-style: none; padding: 0; display: grid; gap: 12px; }
.row { background: #fff; border: 1px solid #d7dee8; border-radius: 8px; padding: 12px 16px; }
.verdict { font-weight: 700; margin: 0 0 4px; }
.verdict code { font-weight: 400; overflow-wrap: anywhere; }
.cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 8px 24px; margin: 0; }
.cols p { margin: 4px 0; overflow-wrap: anywhere; }
.meta-note { color: #52627a; font-size: 13px; }
code { background: #eef2f7; border-radius: 4px; padding: 1px 5px; }
`;
