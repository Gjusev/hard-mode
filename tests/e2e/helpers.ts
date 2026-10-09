// Shared helpers for e2e tests: fixture servers, CLI execution, config rewriting.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const cliPath = path.join(repoRoot, "dist", "cli.js");

export type DemoHandle = {
  port: number;
  url: string;
  setVariant: (v: "broken" | "fixed") => void;
  close: () => Promise<void>;
};

export async function startApp(app: "demo-app" | "second-app", variant: "broken" | "fixed"): Promise<DemoHandle> {
  const mod = await import(pathToFileURL(path.join(repoRoot, "fixtures", app, "server.mjs")).href);
  const handle = await mod.startServer({ port: 0, variant });
  return handle as DemoHandle;
}

export interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Async on purpose: the fixture servers run in this process, and a sync
 *  spawn would block the event loop and starve them. */
export function runCli(args: string[], cwd = repoRoot): Promise<CliResult> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliPath, ...args], { cwd });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    child.on("error", (err) => resolve({ code: -1, stdout, stderr: `${stderr}${err}` }));
    child.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

/** Rewrite a fixture config's baseURL to the live port and write it to a temp file. */
export function materializeConfig(configFile: string, baseURL: string, outDir: string): string {
  const raw = JSON.parse(readFileSync(path.join(repoRoot, configFile), "utf8"));
  raw.target = { baseURL };
  rmSync(outDir, { recursive: true, force: true });
  writeFileSync(outDir, JSON.stringify(raw, null, 2));
  return outDir;
}

export function loadJson(file: string): any {
  return JSON.parse(readFileSync(file, "utf8"));
}

export function newestRunDir(root: string): string {
  const entries = readdirSync(root).map((name) => ({ name, full: path.join(root, name) }))
    .filter((e) => statSync(e.full).isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));
  const last = entries[entries.length - 1];
  if (!last) throw new Error(`no run directories under ${root}`);
  return last.full;
}

/** Recursive content hash of a directory — used to prove the diagnostic
 *  never modifies the app under test. */
export function hashDir(dir: string): string {
  const hash = createHash("sha256");
  const walk = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      const full = path.join(d, name);
      const stat = statSync(full);
      if (stat.isDirectory()) walk(full);
      else hash.update(name).update(readFileSync(full));
    }
  };
  walk(dir);
  return hash.digest("hex");
}
