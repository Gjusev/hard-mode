// Report rendering. All app-derived text goes through escapeHtml — injected
// long text, selectors, console messages — so the report can never execute
// or break on the very content it is displaying.
//
// Design: a zero-dependency, self-contained HTML artifact (it must open from
// any run directory with no network). Single accent color, semantic status
// colors that never rely on color alone (icon + text), tabular numbers,
// visible focus, reduced-motion support, print stylesheet.
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

const STATUS_META: Record<Finding["type"], { icon: string; label: string; token: string }> = {
  confirmed: { icon: "✕", label: "confirmed", token: "confirm" },
  needs_review: { icon: "?", label: "needs review", token: "review" },
  not_applicable: { icon: "—", label: "not applicable", token: "na" },
  infrastructure_error: { icon: "⚠", label: "infrastructure error", token: "infra" },
};

/** Shared design tokens and base styles for report and compare pages. */
export const BASE_CSS = `
:root {
  --bg: #f2f5f9;
  --surface: #ffffff;
  --ink: #1b2532;
  --ink-2: #52627a;
  --ink-3: #64748b;
  --line: #d9e1ea;
  --line-soft: #e8eef5;
  --header-ink: #f4f7fb;
  --header-ink-2: #a9bcd4;
  --accent: #b34a00;
  --accent-deep: #8a3900;
  --c-confirm: #8c1d18;
  --c-review: #6b4700;
  --c-na: #47546a;
  --c-infra: #2f3e6b;
  --mono: ui-monospace, "Cascadia Code", Consolas, Menlo, monospace;
  --shadow: 0 16px 36px -18px rgba(22, 36, 58, 0.18);
}
* { box-sizing: border-box; }
html { color-scheme: light; }
body {
  margin: 0;
  font-family: system-ui, "Segoe UI", sans-serif;
  line-height: 1.55;
  color: var(--ink);
  background: var(--bg);
  -webkit-text-size-adjust: 100%;
}
h1, h2, h3 { letter-spacing: -0.02em; text-wrap: balance; }
h2 { font-size: 19px; margin: 32px 0 12px; }
code {
  font-family: var(--mono);
  font-size: 0.92em;
  background: var(--line-soft);
  border-radius: 4px;
  padding: 1px 5px;
  overflow-wrap: anywhere;
  unicode-bidi: isolate;
}
pre {
  font-family: var(--mono);
  font-size: 13px;
  background: #16243a;
  color: #e7eef7;
  padding: 12px 14px;
  border-radius: 8px;
  overflow: auto;
}
pre code { background: transparent; color: inherit; }
a { color: var(--accent-deep); text-underline-offset: 2px; }
a:hover { color: var(--accent); }
a:focus-visible, summary:focus-visible, button:focus-visible {
  outline: 3px solid var(--accent);
  outline-offset: 2px;
  border-radius: 4px;
}
.skip {
  position: absolute;
  left: -9999px;
  z-index: 10;
}
.skip:focus {
  left: 12px;
  top: 12px;
  padding: 8px 14px;
  background: var(--surface);
  color: var(--ink);
  border: 2px solid var(--ink);
  border-radius: 6px;
  text-decoration: none;
  font-weight: 600;
}
.run-header {
  background: #16243a;
  color: var(--header-ink);
  padding: 26px clamp(16px, 4vw, 44px) 30px;
}
.kicker {
  margin: 0 0 6px;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 11px;
  font-weight: 600;
  color: #ddab8b;
}
.run-header h1 {
  margin: 0 0 20px;
  font-size: clamp(19px, 3.4vw, 26px);
  font-weight: 650;
  overflow-wrap: anywhere;
}
.meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 6px 28px; margin: 0; }
.meta > div { display: flex; gap: 10px; min-width: 0; }
.meta dt { color: var(--header-ink-2); flex: 0 0 96px; font-size: 13px; padding-top: 1px; }
.meta dd { margin: 0; font-size: 14px; overflow-wrap: anywhere; min-width: 0; font-variant-numeric: tabular-nums; }
.meta dd code { background: rgba(233, 240, 248, 0.14); color: #d7e3f0; }
.meta-note { color: var(--header-ink-2); font-size: 13px; margin: 16px 0 0; max-width: 72ch; }
main { padding: 6px clamp(16px, 4vw, 44px) 56px; max-width: 1080px; }
.tally { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 18px; }
.pill {
  border: 1px solid var(--line);
  background: var(--surface);
  border-radius: 999px;
  padding: 3px 13px;
  font-size: 13.5px;
  font-variant-numeric: tabular-nums;
}
.quiet { color: var(--ink-2); font-style: italic; }
.notes { color: var(--ink-2); font-size: 14px; padding-left: 18px; }
.shot {
  display: block;
  max-width: 100%;
  height: auto;
  border: 1px solid var(--line);
  border-radius: 8px;
  margin: 10px 0;
}
details > summary { list-style: none; cursor: pointer; }
details > summary::-webkit-details-marker { display: none; }
details > summary::before { content: "▸ "; color: var(--ink-3); transition: transform 0.18s cubic-bezier(0.16, 1, 0.3, 1); display: inline-block; }
details[open] > summary::before { content: "▾ "; }
.raw-details summary { padding: 8px 0; font-size: 13.5px; color: var(--ink-2); }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition: none !important; animation: none !important; }
}
@media print {
  .skip { display: none; }
  body { background: #fff; }
  .run-header { background: #fff; color: #000; border-bottom: 2px solid #000; }
  .kicker { color: #555; }
  .meta dt, .meta-note { color: #444; }
  .meta dd code { background: #eee; color: #000; }
  pre { background: #f4f4f4; color: #000; }
  .finding, .row { break-inside: avoid; box-shadow: none; }
}
`;

const REPORT_CSS = `
.findings { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
.findings:target { scroll-margin-top: 16px; }
.empty-findings {
  background: var(--surface);
  border: 1px dashed var(--line);
  border-radius: 10px;
  padding: 28px 22px;
  text-align: center;
  color: var(--ink-2);
}
.empty-findings strong { display: block; color: var(--ink); margin-bottom: 4px; font-size: 15px; }
.empty-findings span { font-size: 13.5px; }
.finding details {
  background: var(--surface);
  border: 1px solid var(--line);
  border-left-width: 3px;
  border-radius: 10px;
  box-shadow: var(--shadow);
  overflow: hidden;
}
.finding-confirmed details { border-left-color: var(--c-confirm); }
.finding-needs_review details { border-left-color: var(--c-review); }
.finding-not_applicable details { border-left-color: var(--c-na); }
.finding-infrastructure_error details { border-left-color: var(--c-infra); }
.finding summary {
  display: flex;
  gap: 12px;
  align-items: baseline;
  padding: 13px 16px;
  flex-wrap: wrap;
  transition: background-color 0.16s cubic-bezier(0.16, 1, 0.3, 1);
  touch-action: manipulation;
}
.finding summary:hover { background: #f7fafc; }
.badge {
  font-weight: 650;
  font-size: 12.5px;
  letter-spacing: 0.01em;
  border: 1px solid currentColor;
  border-radius: 5px;
  padding: 1px 7px;
  white-space: nowrap;
}
.badge-confirmed { color: var(--c-confirm); background: #fbeae9; }
.badge-needs_review { color: var(--c-review); background: #fdf1d7; }
.badge-not_applicable { color: var(--c-na); background: #e8edf3; }
.badge-infrastructure_error { color: var(--c-infra); background: #e9ecf8; }
.finding-summary { flex: 1; min-width: 230px; overflow-wrap: anywhere; unicode-bidi: isolate; }
.finding-body { padding: 2px 18px 16px; border-top: 1px solid var(--line-soft); }
.finding-body p { margin: 9px 0; overflow-wrap: anywhere; font-size: 14.5px; }
.finding-body p strong { font-weight: 600; }
.repro { font-size: 13.5px; color: var(--ink-2); }
.journey { list-style: none; padding: 0; display: grid; gap: 3px; font-size: 14px; margin: 0; }
.journey li {
  background: var(--surface);
  border: 1px solid var(--line-soft);
  border-radius: 6px;
  padding: 6px 11px;
  overflow-wrap: anywhere;
  display: flex;
  gap: 8px;
  align-items: baseline;
  flex-wrap: wrap;
}
.journey code { background: transparent; padding: 0; color: var(--ink-2); }
.journey .ok-tick { color: #2c6e49; font-weight: 700; }
.journey .fail-tick { color: var(--c-confirm); font-weight: 700; }
.journey .ms { color: var(--ink-3); font-size: 12.5px; font-variant-numeric: tabular-nums; margin-left: auto; }
.journey .detail { color: var(--c-confirm); flex-basis: 100%; font-size: 13px; }
.log-line { color: var(--ink-2); font-style: italic; border-style: dashed; }
`;

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
  const screenshotBlock = screenshot
    ? `<a href="${escapeHtml(screenshot)}"><img class="shot" src="${escapeHtml(screenshot)}" alt="Full-page screenshot at the end of run ${escapeHtml(result.runId)}" loading="lazy"></a>`
    : `<p class="quiet">No screenshot captured.</p>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${counts.confirmed} confirmed · hard-mode ${escapeHtml(result.scenarioId)} · ${escapeHtml(result.runId)}</title>
<style>
${BASE_CSS}
${REPORT_CSS}
</style>
</head>
<body>
<a class="skip" href="#findings">Skip to findings</a>
<header class="run-header">
  <p class="kicker">hard-mode · scenario ${escapeHtml(result.scenarioId)}</p>
  <h1>Run ${escapeHtml(result.runId)}</h1>
  <dl class="meta">
    <div><dt>Status</dt><dd>${escapeHtml(result.status)}</dd></div>
    <div><dt>Target</dt><dd>${escapeHtml(result.config.target.baseURL)}</dd></div>
    <div><dt>Journey</dt><dd>${escapeHtml(result.config.journeyId)}</dd></div>
    <div><dt>App revision</dt><dd>${escapeHtml(result.config.appRevision ?? "unlabeled")}</dd></div>
    <div><dt>Identity</dt><dd><code>${escapeHtml(result.identityHash.slice(0, 16))}…</code></dd></div>
    <div><dt>Playwright</dt><dd>${escapeHtml(result.playwrightVersion)}</dd></div>
    <div><dt>Started</dt><dd>${escapeHtml(result.startedAt)}</dd></div>
  </dl>
  <p class="meta-note">Identity covers journey, scenario, params, viewport, timeouts and expectations.
    Compare before/after only runs with the same identity; the app revision is expected to differ.</p>
</header>
<main>
  <section aria-labelledby="findings-title">
    <h2 id="findings-title">Findings</h2>
    <p class="tally">
      <span class="pill">${STATUS_META.confirmed.icon} ${counts.confirmed} confirmed</span>
      <span class="pill">${STATUS_META.needs_review.icon} ${counts.needs_review} needs review</span>
      <span class="pill">${STATUS_META.not_applicable.icon} ${counts.not_applicable} not applicable</span>
      <span class="pill">${STATUS_META.infrastructure_error.icon} ${counts.infrastructure_error} infrastructure</span>
    </p>
    <ol id="findings" class="findings">
${cards || `      <li class="empty-findings"><strong>No findings were recorded.</strong><span>A clean run is a data point, not a certificate. Try the other scenarios or a different journey.</span></li>`}
    </ol>
  </section>
  <section aria-labelledby="evidence-title">
    <h2 id="evidence-title">Evidence</h2>
    ${screenshotBlock}
    ${traceFile ? `<p>Trace: <a href="${escapeHtml(traceFile)}">${escapeHtml(traceFile)}</a> (open with <code>npx playwright show-trace</code>)</p>` : ""}
  </section>
  <section aria-labelledby="journey-title">
    <h2 id="journey-title">Journey log</h2>
    <ol class="journey">
${journeyLog.map((e) => e.action === "log"
  ? `      <li class="log-line">${escapeHtml(e.detail)}</li>`
  : `      <li><span class="${e.ok ? "ok-tick" : "fail-tick"}">${e.ok ? "✓" : "✕"}</span><code>${escapeHtml(e.action)}</code> ${escapeHtml(e.target)}<span class="ms">${e.ms}&nbsp;ms</span>${e.detail ? `<span class="detail">${escapeHtml(e.detail)}</span>` : ""}</li>`).join("\n")}
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
            <p><strong>Target:</strong> <code>${escapeHtml(finding.target)}</code> · <strong>ID</strong> <code>${escapeHtml(finding.id)}</code></p>
            ${finding.evidence.screenshot ? `<a href="${escapeHtml(finding.evidence.screenshot)}"><img class="shot" src="${escapeHtml(finding.evidence.screenshot)}" alt="Screenshot for finding ${escapeHtml(finding.id)}" loading="lazy"></a>` : ""}
            ${finding.evidence.details ? `<details class="raw-details"><summary>Raw details</summary><pre>${escapeHtml(JSON.stringify(finding.evidence.details, null, 2))}</pre></details>` : ""}
            ${finding.limitations?.length ? `<ul class="notes">${finding.limitations.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>` : ""}
            <p class="repro">Reproduce: <code>hard-mode run ${escapeHtml(finding.reproduce.configPath)}</code></p>
          </div>
        </details>
      </li>`;
}
