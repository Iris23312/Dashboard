import assert from "node:assert/strict";
import { spawn } from "node:child_process";
const dev = process.argv.includes("--dev");
const child = spawn(
  process.execPath,
  ["server/index.mjs", ...(dev ? ["--dev"] : [])],
  {
    env: { ...process.env, HOST: "127.0.0.1", PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
try {
  const url = await new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(
      () => reject(Error("Server startup timeout")),
      15000,
    );
    child.stdout.on("data", (b) => {
      output += b;
      const m = output.match(/http:\/\/127\.0\.0\.1:\d+\//);
      if (m) {
        clearTimeout(timer);
        resolve(m[0]);
      }
    });
    child.once("exit", () => {
      clearTimeout(timer);
      reject(Error("Server exited"));
    });
  });
  const json = async (path) => {
    const r = await fetch(url + path);
    assert.equal(r.status, 200);
    return r.json();
  };
  const catalog = await json("api/runs");
  assert.equal(catalog.length, 10);
  for (const c of catalog) {
    const run = await json("api/runs/" + c.id);
    assert.equal(run.title, c.title);
    assert.equal(run.layout.length, 7406);
    assert(run.incumbents.length > 0);
  }
  assert.equal((await json("api/runs/balanced")).best.time_s, 1183.321701);
  assert.equal((await fetch(url + "api/final-results")).status, 404);
  assert.equal((await fetch(url + "api/final-layouts")).status, 404);
  assert.equal((await json("api/grids/scip-reference")).length, 7406);
  const treeResponse = await fetch(url + "data/balanced/records.bin.gz", {
    method: "HEAD",
  });
  assert.equal(treeResponse.status, 200);
  assert.equal((await fetch(url + "data/not-a-file")).status, 404);
  assert.equal((await fetch(url + "api/runs/summary-1")).status, 404);
  assert.equal((await fetch(url + "api/runs/unknown")).status, 404);
  const page = await fetch(url);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert(html.includes('id="root"'));
  if (!dev) {
    const src = html.match(/src="([^"]+\.js)"/);
    assert(src);
    assert.equal((await fetch(new URL(src[1], url))).status, 200);
  }
  console.log(
    JSON.stringify({
      mode: dev ? "development" : "production",
      status: "passed",
      runs: 10,
      layoutCells: 7406,
    }),
  );
} finally {
  child.kill("SIGTERM");
}
