import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const dataRoot = path.join(root, "public", "data");
const development = process.argv.includes("--dev");
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT ?? 5173);
if (!Number.isInteger(port) || port < 0 || port > 65535)
  throw Error("PORT must be an integer between 0 and 65535");
const catalog = JSON.parse(
  await readFile(path.join(dataRoot, "catalog.json"), "utf8"),
);
const allowedRuns = new Map(catalog.map((run) => [run.id, run.file]));
const cache = new Map();
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};
const vite = development
  ? await (
      await import("vite")
    ).createServer({ root, server: { middlewareMode: true }, appType: "spa" })
  : null;

function reply(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-cache",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(body);
}
async function jsonFile(res, filename) {
  // Only filenames obtained from our catalog or fixed endpoints reach this function.
  if (!cache.has(filename) || development) {
    let bytes = await readFile(path.join(dataRoot, filename));
    // Keep the existing data key compatible while displaying the requested run name.
    if (
      filename === "catalog.json" ||
      filename === allowedRuns.get("balanced")
    ) {
      const data = JSON.parse(bytes.toString("utf8"));
      if (Array.isArray(data)) {
        for (const run of data)
          if (run.id === "balanced") run.title = "0.33_0.33_0.33";
      } else data.title = "0.33_0.33_0.33";
      bytes = Buffer.from(JSON.stringify(data));
    }
    cache.set(filename, bytes);
  }
  reply(res, 200, cache.get(filename));
}
async function serveStatic(req, res, pathname) {
  const base = path.resolve(root, "dist");
  const requested = path.resolve(base, "." + pathname);
  if (requested !== base && !requested.startsWith(base + path.sep)) {
    reply(res, 403, JSON.stringify({ error: "Forbidden path" }));
    return;
  }
  let filename = pathname === "/" ? path.join(base, "index.html") : requested;
  try {
    if (!(await stat(filename)).isFile()) throw Error("Not a file");
  } catch {
    reply(
      res,
      404,
      JSON.stringify({
        error: "File not found. Run npm run build before npm start.",
      }),
    );
    return;
  }
  const bytes = await readFile(filename);
  reply(
    res,
    200,
    req.method === "HEAD" ? "" : bytes,
    mime[path.extname(filename)] || "application/octet-stream",
  );
}
const server = createServer(async (req, res) => {
  try {
    if (!["GET", "HEAD"].includes(req.method ?? "")) {
      reply(res, 405, JSON.stringify({ error: "Method not allowed" }));
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
    } catch {
      reply(res, 400, JSON.stringify({ error: "Invalid URL" }));
      return;
    }
    if (pathname === "/api/health") {
      reply(res, 200, JSON.stringify({ status: "ok", runs: catalog.length }));
      return;
    }
    if (pathname === "/api/runs") {
      await jsonFile(res, "catalog.json");
      return;
    }
    if (pathname === "/api/grids/scip-reference") {
      await jsonFile(res, "scip-grid.json");
      return;
    }
    if (pathname.startsWith("/api/runs/")) {
      const id = pathname.slice("/api/runs/".length),
        filename = allowedRuns.get(id);
      if (!filename) {
        reply(res, 404, JSON.stringify({ error: "Unknown run" }));
        return;
      }
      await jsonFile(res, filename);
      return;
    }
    if (pathname.startsWith("/api/")) {
      reply(res, 404, JSON.stringify({ error: "Unknown endpoint" }));
      return;
    }
    if (pathname.startsWith("/data/")) {
      const file = path.resolve(dataRoot, pathname.slice("/data/".length));
      if (!file.startsWith(dataRoot + path.sep)) {
        reply(res, 403, "Forbidden");
        return;
      }
      try {
        if (!(await stat(file)).isFile()) throw Error("Missing");
      } catch {
        reply(res, 404, JSON.stringify({ error: "Data file not found" }));
        return;
      }
      res.writeHead(200, {
        "Content-Type": file.endsWith(".gz")
          ? "application/gzip"
          : "application/json",
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
      });
      if (req.method === "HEAD") res.end();
      else
        createReadStream(file)
          .on("error", () => res.destroy())
          .pipe(res);
      return;
    }
    if (vite) {
      vite.middlewares(req, res, () =>
        reply(res, 404, JSON.stringify({ error: "Not found" })),
      );
      return;
    }
    await serveStatic(req, res, pathname);
  } catch (error) {
    console.error(error.message);
    if (!res.headersSent)
      reply(res, 500, JSON.stringify({ error: "Could not read local data" }));
    else res.end();
  }
});
server.on("error", (error) => {
  console.error(
    error.code === "EADDRINUSE"
      ? `Port ${port} is already in use. Stop the other server or set PORT.`
      : error.message,
  );
  process.exitCode = 1;
  void vite?.close();
});
server.listen(port, host, () => {
  const address = server.address();
  console.log(`Dashboard ready at http://${host}:${address.port}/`);
});
async function shutdown() {
  server.close();
  server.closeAllConnections();
  await vite?.close();
}
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
