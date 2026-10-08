// Report rendering. All app-derived text goes through escapeHtml — injected
// long text, selectors, console messages — so the report can never execute
// or break on the very content it is displaying.
import type { Finding, RunResult } from "../config/types.js";
import type { JourneyLogEntry } from "../core/journey.js";

export function escapeHtml(input: unknown): string {
  return String(input ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const STATUS_META: Record<Finding["type"], { icon: string; label: string }> = {
  confirmed: { icon: "✕", label: "confirmed" },
  needs_review: { icon: "?", label: "needs review" },
  not_applicable: { icon: "—", label: "not applicable" },
  infrastructure_error: { icon: "⚠", label: "infrastructure error" },
};

export function renderReportHtml(
  result: RunResult,
  journeyLog: JourneyLogEntry[],
  notes: string[],
  screenshot?: string,
  traceFile?: string,
): string {
  const f = result.findings;
  const counts = {
    confirmed: f.filter((x) => x.type === "confirmed").length,
    needs_review: f.filter((x) => x.type === "needs_review").length,
    not_applicable: f.filter((x) => x.type === "not_applicable").length,
    infrastructure_error: f.filter((x) => x.type === "infrastructure_error").length,
  };
  const cards = f.map((finding, i) => findingCard(finding, i)).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>hard-mode report — ${escapeHtml(result.runId)}</title>
<style>
${CSS}
</style>
</head>
<body>
<a class="skip" href="#findings">Skip to findings</a>
<header class="run-header">
  <p class="kicker">hard-mode · ${escapeHtml(result.scenarioId)}</p>
  <h1>Run ${escapeHtml(result.runId)}</h1>
  <dl class="meta">
    <div><dt>Status</dt><dd>${escapeHtml(result.status)}</dd></div>
    <div><dt>Scenario</dt><dd>${escapeHtml(result.scenarioId)}</dd></div>
    <div><dt>Journey</dt><dd>${escapeHtml(result.config.journeyId)}</dd></div>
    <div><dt>Target</dt><dd>${escapeHtml(result.config.target.baseURL)}</dd></div>
    <div><dt>App revision</dt><dd>${escapeHtml(result.config.appRevision ?? "unlabeled")}</dd></div>
    <div><dt>Identity</dt><dd><code>${escapeHtml(result.identityHash.slice(0, 16))}…</code></dd></div>
    <div><dt>Playwright</dt><dd>${escapeHtml(result.playwrightVersion)}</dd></div>
    <div><dt>Started</dt><dd>${escapeHtml(result.startedAt)}</dd></div>
  </dl>
  <p class="meta-note">Identity = journey + scenario + params + viewport + timeouts + expectations.
    Compare before/after only runs with the same identity; the app revision is expected to differ.</p>
</header>
<main>
  <section aria-labelledby="findings-title">
    <h2 id="findings-title">Findings</h2>
    <p class="tally">
      <span class="pill pill-confirmed">${STATUS_META.confirmed.icon} ${counts.confirmed} confirmed</span>
      <span class="pill pill-review">${STATUS_META.needs_review.icon} ${counts.needs_review} needs review</span>
      <span class="pill pill-na">${STATUS_META.not_applicable.icon} ${counts.not_applicable} not applicable</span>
      <span class="pill pill-infra">${STATUS_META.infrastructure_error.icon} ${counts.infrastructure_error} infrastructure</span>
    </p>
    <ol id="findings" class="findings">
${cards || "      <li class=\"quiet\">No findings were recorded. A signal-free run is not a certificate of correctness.</li>"}
    </ol>
  </section>
  <section aria-labelledby="evidence-title">
    <h2 id="evidence-title">Evidence</h2>
    ${screenshot
      ? `<p><a href="${escapeHtml(screenshot)}"><img class="shot" src="${escapeHtml(screenshot)}" alt="Full-page screenshot at the end of the run ${escapeHtml(result.runId)}"></a></p>`
      : "<p class=\"quiet\">No screenshot captured.</p>"}
    ${traceFile ? `<p>Trace: <a href="${escapeHtml(traceFile)}">${escapeHtml(traceFile)}</a> (open with Playwright trace viewer)</p>` : ""}
  </section>
  <section aria-labelledby="journey-title">
    <h2 id="journey-title">Journey log</h2>
    <ol class="journey">
${journeyLog.map((e) => e.action === "log"
  ? `      <li class="log-line">${escapeHtml(e.detail)}</li>`
  : `      <li class="${e.ok ? "ok" : "fail"}"><code>${escapeHtml(e.action)}</code> ${escapeHtml(e.target)}${e.detail ? ` — <span class="detail">${escapeHtml(e.detail)}</span>` : ""} <span class="ms">(${e.ms}ms)</span></li>`).join("\n")}
    </ol>
    ${notes.length ? `<h3>Perturbation notes</h3><ul class="notes">${notes.map((n) => `<li>${escapeHtml(n)}</li>`).join("")}</ul>` : ""}
  </section>
  <section aria-labelledby="repro-title">
    <h2 id="repro-title">Reproduce</h2>
    <p>From the directory containing this run:</p>
    <pre><code>hard-mode run ${escapeHtml(result.reproduceConfigPath.split("/").pop())}</code></pre>
    <p>or with an explicit path to this repository's CLI:</p>
    <pre><code>node &lt;repo&gt;/dist/cli.js run &lt;this-run&gt;/${escapeHtml(result.reproduceConfigPath.split("/").pop())}</code></pre>
  </section>
</main>
</body>
</html>`;
}

function findingCard(finding: Finding, index: number): string {
  const meta = STATUS_META[finding.type];
  return `      <li class="finding finding-${escapeHtml(finding.type)}">
        <details${index === 0 ? " open" : ""}>
          <summary>
            <span class="badge badge-${escapeHtml(finding.type)}" title="${escapeHtml(finding.type)}">${meta.icon} ${escapeHtml(meta.label)}</span>
            <span class="finding-summary">${escapeHtml(finding.summary)}</span>
          </summary>
          <div class="finding-body">
            ${finding.expected !== undefined ? `<p><strong>Expected:</strong> ${escapeHtml(finding.expected)}</p>` : ""}
            ${finding.observed !== undefined ? `<p><strong>Observed:</strong> ${escapeHtml(finding.observed)}</p>` : ""}
            ${finding.method ? `<p><strong>Method:</strong> ${escapeHtml(finding.method)}</p>` : ""}
            <p><strong>Target:</strong> <code>${escapeHtml(finding.target)}</code> · <strong>ID:</strong> <code>${escapeHtml(finding.id)}</code></p>
            ${finding.evidence.screenshot ? `<a href="${escapeHtml(finding.evidence.screenshot)}"><img class="shot" src="${escapeHtml(finding.evidence.screenshot)}" alt="Screenshot for finding ${escapeHtml(finding.id)}"></a>` : ""}
            ${finding.evidence.details ? `<details><summary>Raw details</summary><pre>${escapeHtml(JSON.stringify(finding.evidence.details, null, 2))}</pre></details>` : ""}
            ${finding.limitations?.length ? `<ul class="notes">${finding.limitations.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>` : ""}
            <p class="repro">Reproduce: <code>hard-mode run ${escapeHtml(finding.reproduce.configPath)}</code></p>
          </div>
        </details>
      </li>`;
}

const CSS = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; line-height: 1.5; color: #1c2430; background: #f5f7fa; }
.skip { position: absolute; left: -9999px; }
.skip:focus { left: 8px; top: 8px; background: #fff; padding: 8px 12px; border: 2px solid #1c2430; z-index: 10; }
.run-header { background: #10233b; color: #fff; padding: 20px clamp(16px, 4vw, 40px); }
.run-header h1 { margin: 4px 0 12px; font-size: clamp(20px, 4vw, 28px); }
.kicker { margin: 0; text-transform: uppercase; letter-spacing: 0.08em; font-size: 12px; color: #b9c9dd; }
.meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 8px 24px; margin: 0; }
.meta div { display: flex; gap: 8px; }
.meta dt { color: #b9c9dd; min-width: 100px; }
.meta dd { margin: 0; overflow-wrap: anywhere; }
.meta-note { color: #b9c9dd; font-size: 13px; margin: 12px 0 0; }
main { padding: 20px clamp(16px, 4vw, 40px); max-width: 1100px; }
h2 { font-size: 20px; margin: 28px 0 12px; }
.tally { display: flex; flex-wrap: wrap; gap: 8px; }
.pill { border: 1px solid #52627a; border-radius: 999px; padding: 2px 12px; font-size: 14px; }
.findings { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
.finding details { background: #fff; border: 1px solid #d7dee8; border-radius: 8px; }
.finding summary { display: flex; gap: 12px; align-items: baseline; padding: 12px 16px; cursor: pointer; flex-wrap: wrap; }
.finding summary:focus-visible { outline: 3px solid #b34a00; outline-offset: 2px; }
.badge { font-weight: 700; border: 1px solid currentColor; border-radius: 4px; padding: 0 6px; font-size: 13px; white-space: nowrap; }
.badge-confirmed { color: #8c1d18; background: #fbeae9; }
.badge-needs_review { color: #6b4700; background: #fdf1d7; }
.badge-not_applicable { color: #38424f; background: #e8edf3; }
.badge-infrastructure_error { color: #43337f; background: #eae6fb; }
.finding-summary { flex: 1; min-width: 240px; overflow-wrap: anywhere; }
.finding-body { padding: 4px 16px 16px; border-top: 1px solid #e6ecf3; }
.finding-body p { margin: 8px 0; overflow-wrap: anywhere; }
.shot { max-width: 100%; height: auto; border: 1px solid #d7dee8; border-radius: 6px; margin: 8px 0; }
code { background: #eef2f7; border-radius: 4px; padding: 1px 5px; overflow-wrap: anywhere; }
pre { background: #10233b; color: #e7eef7; padding: 12px; border-radius: 6px; overflow: auto; }
pre code { background: transparent; color: inherit; }
.journey { list-style: none; padding: 0; display: grid; gap: 4px; font-size: 14px; }
.journey li { background: #fff; border: 1px solid #e6ecf3; border-radius: 4px; padding: 6px 10px; overflow-wrap: anywhere; }
.journey .fail { border-color: #8c1d18; }
.journey .ms { color: #52627a; }
.journey .detail { color: #8c1d18; }
.log-line { color: #52627a; font-style: italic; }
.notes { color: #38424f; font-size: 14px; }
.quiet { color: #52627a; font-style: italic; }
.repro { font-size: 14px; }
details > summary { list-style: none; }
details > summary::-webkit-details-marker { display: none; }
details > summary::before { content: "▸ "; }
details[open] > summary::before { content: "▾ "; }
a { color: #0b5cab; }
a:focus-visible { outline: 3px solid #b34a00; outline-offset: 2px; }
`;
