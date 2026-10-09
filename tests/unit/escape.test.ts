import { expect, test } from "@playwright/test";
import { escapeHtml, renderReportHtml } from "../../src/report/html.js";
import type { Finding, RunResult } from "../../src/config/types.js";

test("escapeHtml neutralizes markup and quotes", () => {
  expect(escapeHtml(`<img src=x onerror="alert(1)">`)).toBe("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  expect(escapeHtml("a&b<c>'d'")).toBe("a&amp;b&lt;c&gt;&#39;d&#39;");
  expect(escapeHtml(undefined)).toBe("");
});

test("report escapes app-derived text everywhere it is interpolated", () => {
  const hostile = `<img src=x onerror="window.__pwned=1"><script>window.__pwned=1</script>`;
  const finding: Finding = {
    id: `long-text:overflow:${hostile.slice(0, 10)}`,
    runId: "run-x",
    scenarioId: "long-text",
    target: hostile,
    params: { injected: hostile },
    type: "confirmed",
    summary: `content of ${hostile} is clipped`,
    observed: hostile,
    method: "geometry",
    evidence: { details: { text: hostile } },
    reproduce: { configPath: "reproduce.json", command: "hard-mode run reproduce.json" },
    identity: { journeyId: hostile, scenario: "long-text", identityHash: "a".repeat(64) },
  };
  const result: RunResult = {
    runDir: "runs/run-x",
    runId: "run-x",
    scenarioId: "long-text",
    identityHash: "a".repeat(64),
    startedAt: "2026-10-09T00:00:00.000Z",
    finishedAt: "2026-10-09T00:00:01.000Z",
    status: "completed",
    playwrightVersion: "test",
    config: {
      schemaVersion: 1,
      target: { baseURL: `http://${hostile}` },
      journeyId: "j",
      steps: [{ action: "navigate", url: "/" }],
      scenario: "long-text",
      appRevision: hostile,
    },
    findings: [finding],
    reportPath: "report.html",
    reproduceConfigPath: "reproduce.json",
  };
  const html = renderReportHtml(result, [], [], undefined);
  expect(html).not.toContain("<script>window.__pwned=1</script>");
  expect(html).not.toContain(`<img src=x onerror`);
  // The hostile text is present, but as escaped text:
  expect(html).toContain("&lt;img src=x onerror=");
  // Every <img> in the report is an evidence image with a controlled src:
  const imgs = [...html.matchAll(/<img [^>]*src="([^"]*)"/g)].map((m) => m[1]);
  for (const src of imgs) {
    expect(src).toMatch(/^(evidence\/[a-z0-9._-]+|data:)/);
  }
});
