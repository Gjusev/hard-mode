// Tiny local server for the synthetic Task Board demo app.
// The variant (broken | fixed) is chosen server-side so both variants are
// served from the same URLs. This models "you fixed your app and rerun the
// exact same scenario configuration".
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, "public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

export function startServer({ port = 0, variant = "broken", host = "127.0.0.1" } = {}) {
  let currentVariant = variant;
  const setVariant = (v) => {
    if (v !== "broken" && v !== "fixed") {
      throw new Error(`variant must be "broken" or "fixed", got: ${v}`);
    }
    currentVariant = v;
  };
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const send = (status, body, type) => {
        res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
        res.end(body);
      };

      if (url.pathname === "/api/tasks") {
        // Deterministic synthetic data. Shape: { tasks: Task[] }.
        return send(200, JSON.stringify({
          tasks: [
            { id: 1, title: "Review launch checklist", due: "2026-10-11" },
            { id: 2, title: "Send status update", due: "2026-10-12" },
            { id: 3, title: "Fix onboarding typo", due: "2026-10-14" },
          ],
        }), MIME[".json"]);
      }
      if (url.pathname === "/api/stats") {
        return send(200, JSON.stringify({ done: 2, total: 3 }), MIME[".json"]);
      }
      // Variant assets: same URL, different implementation.
      if (url.pathname === "/variant.css" || url.pathname === "/variant.js") {
        const file = path.join(publicDir, currentVariant + path.extname(url.pathname));
        return send(200, await readFile(file, "utf8"), MIME[path.extname(file)] ?? "text/plain");
      }
      let filePath = path.join(publicDir, url.pathname === "/" ? "index.html" : url.pathname);
      filePath = path.normalize(filePath);
      if (!filePath.startsWith(publicDir)) return send(403, "forbidden", "text/plain");
      const body = await readFile(filePath);
      return send(200, body, MIME[path.extname(filePath)] ?? "application/octet-stream");
    } catch (err) {
      if (typeof err === "object" && err && "code" in err && err.code === "ENOENT") {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("not found");
      } else {
        res.writeHead(500, { "content-type": "text/plain" });
        res.end("server error");
      }
    }
  });
  return new Promise((resolve) => {
    server.listen(port, host, () => {
      const address = server.address();
      resolve({
        port: typeof address === "object" && address ? address.port : port,
        get variant() { return currentVariant; },
        setVariant,
        close: () => new Promise((r) => server.close(() => r())),
        url: `http://${host}:${typeof address === "object" && address ? address.port : port}`,
      });
    });
  });
}

// Run directly: node server.mjs [--port 3123] [--variant broken|fixed]
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const flag = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
  };
  const handle = await startServer({
    port: Number(flag("--port", "3123")),
    variant: flag("--variant", "broken"),
  });
  console.log(`demo-app (${handle.variant}) listening on ${handle.url}`);
}
