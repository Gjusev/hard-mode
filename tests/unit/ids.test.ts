import { expect, test } from "@playwright/test";
import { existsSync, rmSync } from "node:fs";
import { createRunDir, slug } from "../../src/core/ids.js";

test("slug maps arbitrary identifiers to safe dir fragments", () => {
  expect(slug("Project: **/api/tasks!")).toBe("project-api-tasks");
  expect(slug("Ünïcödé —stuff")).toBe("n-c-d-stuff");
});

test("createRunDir never returns an existing directory", () => {
  const root = "tmp/test-ids";
  rmSync(root, { recursive: true, force: true });
  const a = createRunDir(root, "long-text");
  const b = createRunDir(root, "long-text");
  expect(a).not.toBe(b);
  expect(existsSync(a)).toBe(true);
  expect(existsSync(`${a}/evidence`)).toBe(true);
  expect(existsSync(b)).toBe(true);
  // Force a collision by recreating a dir identical in name to one we then request:
  const forced = createRunDir(root, "long-text", "collide");
  const twin = createRunDir(root, "long-text", "collide");
  expect(forced).not.toBe(twin);
  rmSync(root, { recursive: true, force: true });
});
