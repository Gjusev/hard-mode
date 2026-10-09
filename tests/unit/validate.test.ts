import { expect, test } from "@playwright/test";
import { validateRunConfig, identityHash, canonicalJson } from "../../src/config/validate.js";
import type { RunConfig } from "../../src/config/types.js";

const validBase = {
  schemaVersion: 1,
  target: { baseURL: "http://127.0.0.1:3123" },
  journeyId: "demo-loaded",
  steps: [
    { action: "navigate", url: "/" },
    { action: "expect", condition: "visible", selector: ".tool", timeoutMs: 1000 },
  ],
  scenario: "keyboard",
  params: { focusTarget: ".tool" },
};

test("accepts a valid config", () => {
  const { config, errors } = validateRunConfig(validBase);
  expect(errors).toEqual([]);
  expect(config).not.toBeNull();
});

test("rejects a config object with structural problems", () => {
  const cases: Array<[unknown, string]> = [
    [null, "config must be a JSON object"],
    [{}, "schemaVersion"],
    [{ ...validBase, schemaVersion: 2 }, "schemaVersion"],
    [{ ...validBase, target: { baseURL: "ftp://x" } }, "baseURL"],
    [{ ...validBase, target: {} }, "baseURL"],
    [{ ...validBase, journeyId: "Not A Slug" }, "journeyId"],
    [{ ...validBase, steps: [] }, "steps"],
    [{ ...validBase, scenario: "" }, "scenario"],
  ];
  for (const [raw, fragment] of cases) {
    const { errors } = validateRunConfig(raw);
    expect(errors.length, `expected errors for case ${JSON.stringify(raw).slice(0, 60)}`).toBeGreaterThan(0);
    expect(errors.join("\n")).toContain(fragment);
  }
});

test("rejects invalid steps", () => {
  const cases: Array<[unknown, string]> = [
    [{ action: "evalJS", code: "steal()" }, "action"],
    [{ action: "navigate", url: "not-a-path" }, "url"],
    [{ action: "click" }, "selector"],
    [{ action: "fill", selector: "#x" }, "text"],
    [{ action: "press", selector: "#x", key: "Ctrl+Alt+Del" }, "key"],
    [{ action: "expect", condition: "visible" }, "selector"],
    [{ action: "expect", condition: "text", selector: "#x" }, "contains"],
    [{ action: "expect", condition: "url", selector: "#x" }, "urlContains"],
    [{ action: "expect", condition: "visible", selector: "#x", timeoutMs: 5 }, "timeoutMs"],
  ];
  for (const [step, fragment] of cases) {
    const { errors } = validateRunConfig({ ...validBase, steps: [step] });
    expect(errors.join("\n"), `step ${JSON.stringify(step)}`).toContain(fragment);
  }
});

test("rejects unknown params and bad param values", () => {
  const cases: Array<[Record<string, unknown>, string]> = [
    [{ nope: 1 }, "not a known parameter"],
    [{ injections: [] }, "injections"],
    [{ injections: [{ }] }, "selector"],
    [{ viewportWidth: 10 }, "viewportWidth"],
    [{ textScale: 9 }, "textScale"],
    [{ routes: [] }, "routes"],
    [{ routes: [{ urlPattern: "**/api/x", mode: "weird" }] }, "mode"],
    [{ routes: [{ urlPattern: "**/api/x", mode: "fulfill" }] }, "body"],
    [{ routes: [{ urlPattern: "**/api/x", mode: "fail", status: 200 }] }, "status"],
    [{ focusTarget: "" }, "focusTarget"],
    [{ maxTabs: 0 }, "maxTabs"],
    [{ seed: 1.5 }, "seed"],
    [{ contentRegions: [] }, "contentRegions"],
  ];
  for (const [params, fragment] of cases) {
    const { errors } = validateRunConfig({ ...validBase, params });
    expect(errors.join("\n"), `params ${JSON.stringify(params)}`).toContain(fragment);
  }
});

test("canonicalJson is key-order independent and drops undefined", () => {
  expect(canonicalJson({ b: 1, a: undefined, c: 2 })).toBe(canonicalJson({ c: 2, b: 1 }));
  expect(canonicalJson({ a: [1, { z: 1, y: 2 }] })).toBe('{"a":[1,{"y":2,"z":1}]}');
});

test("identityHash ignores run metadata, changes with test inputs", () => {
  const base = validBase as unknown as RunConfig;
  expect(identityHash({ ...base, runId: "a", appRevision: "broken", output: { root: "x" }, capture: { trace: true } }))
    .toBe(identityHash({ ...base, runId: "b", appRevision: "fixed" }));
  expect(identityHash({ ...base, params: { focusTarget: ".other" } })).not.toBe(identityHash(base));
  expect(identityHash({ ...base, steps: [...base.steps, { action: "press", key: "Tab" }] })).not.toBe(identityHash(base));
  expect(identityHash({ ...base, scenario: "long-text" })).not.toBe(identityHash(base));
  expect(
    identityHash({ ...base, expectations: [{ id: "e1", condition: "visible", selector: ".x" }] }),
  ).not.toBe(identityHash(base));
});
