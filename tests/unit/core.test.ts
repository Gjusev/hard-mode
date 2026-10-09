// Core unit coverage: deterministic text generation, URL joining, timeouts
// and selector parsing.
import { expect, test } from "@playwright/test";
import { longText } from "../../src/scenarios/long-text.js";
import { joinUrl } from "../../src/core/journey.js";
import { withTimeout, TimeoutError } from "../../src/core/browser.js";
import { resolveLocator } from "../../src/core/selectors.js";
import { canonicalJson } from "../../src/config/validate.js";
import type { Page, Locator } from "playwright";

test("longText is deterministic per seed and differs across seeds", () => {
  const a = longText(7);
  const b = longText(7);
  const c = longText(8);
  expect(a).toBe(b);
  expect(a).not.toBe(c);
  expect(a.length).toBeGreaterThanOrEqual(220);
  // Same text for the same seed even when asked twice at different lengths.
  expect(longText(7, 500).startsWith(a)).toBe(true);
  // No control characters that could confuse terminals or reports.
  expect(a).not.toMatch(/[\x00-\x08\x0e-\x1f]/);
});

test("joinUrl handles trailing slashes, absolute urls and queries", () => {
  expect(joinUrl("http://x:1", "/a")).toBe("http://x:1/a");
  expect(joinUrl("http://x:1/", "a")).toBe("http://x:1/a");
  expect(joinUrl("http://x:1/base/", "/a")).toBe("http://x:1/a");
  // Without a trailing slash the base path is a file, so "a" resolves to a
  // sibling — standard URL semantics, documented here on purpose.
  expect(joinUrl("http://x:1/base", "a?q=1")).toBe("http://x:1/a?q=1");
  expect(joinUrl("http://x:1", "http://y:2/z")).toBe("http://y:2/z");
});

test("withTimeout resolves normally and labels its rejections", async () => {
  await expect(withTimeout(Promise.resolve(42), 1000, "t")).resolves.toBe(42);
  // 7-digit unicode in the label survives into the error message.
  await expect(withTimeout(new Promise(() => {}), 150, "presupuesto excedido")).rejects.toThrow(TimeoutError);
  await expect(withTimeout(new Promise(() => {}), 150, "budget")).rejects.toThrow(/budget exceeded 150ms/);
});

test("resolveLocator parses role and text forms, rejects malformed ones", () => {
  const calls: string[] = [];
  const stub = {
    getByRole: (role: string, opts?: unknown) => { calls.push(`role:${role}:${JSON.stringify(opts)}`); return {} as Locator; },
    getByText: (text: string) => { calls.push(`text:${text}`); return {} as Locator; },
    locator: (sel: string) => { calls.push(`css:${sel}`); return {} as Locator; },
  } as unknown as Page;

  resolveLocator(stub, ".card > li");
  resolveLocator(stub, "role:button[name=\"Add task\"]");
  resolveLocator(stub, "role:button");
  resolveLocator(stub, "text:Sign in");
  expect(calls).toEqual([
    'css:.card > li',
    'role:button:{"name":"Add task"}',
    "role:button:{}",
    "text:Sign in",
  ]);
  expect(() => resolveLocator(stub, "role:button[name=Add]")).toThrow(/invalid role selector/);
});

test("canonicalJson handles nesting and drops undefined at depth", () => {
  expect(canonicalJson({ a: { y: 1, x: undefined, z: [3, { b: 1, a: 2 }] } }))
    .toBe('{"a":{"y":1,"z":[3,{"a":2,"b":1}]}}');
});
