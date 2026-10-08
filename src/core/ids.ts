// Run directory naming. Collision-safe: never overwrites an existing run.
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

export function timestampId(): string {
  const d = new Date();
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function slug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "x";
}

/** Create a unique run directory under root: <ts>-<scenario>-<rand4>[-2, -3, …] */
export function createRunDir(root: string, scenarioId: string, label?: string): string {
  const base = `${timestampId()}${label ? `-${slug(label)}` : ""}-${slug(scenarioId)}-${randomBytes(2).toString("hex")}`;
  let dir = path.join(root, base);
  for (let i = 2; existsSync(dir); i++) {
    dir = path.join(root, `${base}-${i}`);
  }
  mkdirSync(dir, { recursive: true });
  mkdirSync(path.join(dir, "evidence"));
  return dir;
}
