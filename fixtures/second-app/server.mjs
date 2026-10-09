// Tiny local server for the synthetic "Field notes" second app.
// Different structure from the demo app on purpose: table layout, different
// selectors, different API shape. hard-mode must work on both without
// touching app code.
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
      if (url.pathname === "/api/notes") {
        return send(200, JSON.stringify({
          notes: [
            { id: 1, body: "Check the ferry schedule", tag: "travel" },
            { id: 2, body: "Water the lemon tree", tag: "home" },
          ],
        }), MIME[".json"]);
      }
      if (url.pathname === "/variant.css" || url.pathname === "/variant.js") {
        const file = path.join(publicDir, currentVariant + path.extname(url.pathname));
        return send(200, await readFile(file, "utf8"), MIME[path.extname(file)] ?? "text/plain");
      }
      let filePath = path.join(publicDir, url.pathname === "/" ? "index.html" : url.pathname);
      filePath = path.normalize(filePath);
      if (!filePath.startsWith(publicDir)) return send(403, "forbidden", "text/plain");
      return send(200, await readFile(filePath), MIME[path.extname(filePath)] ?? "application/octet-stream");
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const flag = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
  };
  const handle = await startServer({
    port: Number(flag("--port", "3124")),
    variant: flag("--variant", "broken"),
  });
  console.log(`second-app (${handle.variant}) listening on ${handle.url}`);
}
