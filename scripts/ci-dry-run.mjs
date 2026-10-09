// CI dry run: reproduces .github/workflows/ci.yml against a pristine
// checkout of the committed tree (git archive), the same thing the Actions
// runner would get. Run from the repository root.
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const repo = process.cwd();
const work = mkdtempSync(path.join(tmpdir(), "hard-mode-ci-"));
const steps = [];

function run(label, args, opts = {}) {
  const started = Date.now();
  console.log(`\n== ${label}`);
  const out = execSync(args, { cwd: opts.cwd ?? work, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
  const tail = out.trim().split("\n").slice(-3).join("\n");
  if (tail) console.log(tail);
  steps.push({ label, ms: Date.now() - started });
}

try {
  // Pristine checkout of the committed tree: no dist/, no node_modules/,
  // no untracked files — exactly what a fresh clone gives the CI runner.
  // NOTE: tar on Windows treats "C:\..." as a remote host, so run it from
  // the work directory with a relative path.
  execSync(`git -C "${repo}" archive HEAD -o "${path.join(work, "tree.tar").replaceAll("\\", "/")}"`);
  mkdirSync(path.join(work, "repo"));
  run("git archive (clean checkout)", "tar -xf tree.tar -C repo", { cwd: work });
  const repoDir = path.join(work, "repo");

  // Same steps as .github/workflows/ci.yml, same order.
  run("npm ci", "npm ci", { cwd: repoDir });
  run("npx playwright install --with-deps chromium", "npx playwright install --with-deps chromium", { cwd: repoDir });
  run("npm run typecheck", "npm run typecheck", { cwd: repoDir });
  run("npm test", "npm test", { cwd: repoDir });
  console.log("\nCI dry run: all steps passed on a pristine checkout.");
  for (const s of steps) console.log(`  ${s.label}: ${(s.ms / 1000).toFixed(1)}s`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
