// One-command demo: run one scenario against the broken variant, apply the
// "fix" (switch the server variant), rerun the SAME config, and compare.
// This is the product working end to end on the synthetic app.
import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outRoot = path.join(repo, "tmp", "demo-run");
const scenario = process.argv[2] ?? "long-text";

const { startServer } = await import(pathToFileURL(path.join(repo, "fixtures", "demo-app", "server.mjs")).href);
const server = await startServer({ port: 3123, variant: "broken" });
console.log(`demo-app (broken) at ${server.url}`);

rmSync(outRoot, { recursive: true, force: true });
mkdirSync(outRoot, { recursive: true });

const configPath = path.join(repo, "fixtures", "demo-app", "configs", `${scenario}.json`);
// Point the fixture config at the live server (it defaults to 127.0.0.1:3123,
// rewritten here so the demo also works if 3123 was taken).
const config = JSON.parse(await import("node:fs/promises").then((fs) => fs.readFile(configPath, "utf8")));
config.target = { baseURL: server.url };
const liveConfig = path.join(outRoot, "config.json");
await import("node:fs/promises").then((fs) => fs.writeFile(liveConfig, JSON.stringify(config, null, 2)));

function runCli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(repo, "dist", "cli.js"), ...args], { cwd: repo });
    let stdout = "";
    child.stdout.on("data", (d) => { stdout += d; process.stdout.write(d); });
    child.stderr.on("data", (d) => process.stderr.write(d));
    child.on("close", (code) =>
      code === 0 || code === 2 ? resolve(stdout) : reject(new Error(`cli exited ${code}`)));
  });
}

const dirFrom = (stdout) => {
  const m = /dir:\s+(.+)/.exec(stdout);
  if (!m) throw new Error("could not read run dir from CLI output");
  return m[1].trim();
};

console.log(`\n— BEFORE (broken): ${scenario} —`);
const beforeDir = dirFrom(await runCli(["run", liveConfig, "--out", outRoot, "--revision", "broken"]));

console.log("\n— applying the fix (variant: fixed), same config, same inputs —");
server.setVariant("fixed");

console.log(`\n— AFTER (fixed): ${scenario} —`);
const afterDir = dirFrom(await runCli(["run", liveConfig, "--out", outRoot, "--revision", "fixed"]));

console.log("\n— COMPARE —");
await runCli(["compare", beforeDir, afterDir]);

await server.close();
console.log("\nDemo complete. Open the compare report above in a browser.");
