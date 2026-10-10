/** Stream the supplied SCIP CSVs; prepare every run in a fresh Node process. */
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsvParse } from "d3";
const root = fileURLToPath(new URL("../", import.meta.url)),
  source = path.resolve(
    process.argv[2] || path.join(root, "data/source/presolve_off"),
  ),
  out = path.join(root, "public/data");
await mkdir(out, { recursive: true });
const positions = tsvParse(
  await readFile(
    path.join(root, "data/source/scip-coordinate-reference.tsv"),
    "utf8",
  ),
  (r) => ({
    cell_id: +r.cell_id,
    latitude: +r.latitude,
    longitude: +r.longitude,
  }),
);
await writeFile(path.join(out, "scip-grid.json"), JSON.stringify(positions));
const folders = (await readdir(source))
  .filter((f) => f.startsWith("ws_lambda_"))
  .sort();
if (folders.length !== 10)
  throw Error(
    "Pass the extracted presolve_off directory containing ten weighting folders.",
  );
for (const folder of folders)
  await new Promise((resolve, reject) => {
    const p = spawn(
      process.execPath,
      [
        "--max-old-space-size=3072",
        path.join(root, "scripts/prepare-run.mjs"),
        path.join(source, folder),
      ],
      { stdio: "inherit" },
    );
    p.on("error", reject);
    p.on("exit", (code) =>
      code === 0 ? resolve() : reject(Error(folder + " conversion failed")),
    );
  });
const runs = [];
for (const folder of folders) {
  const id =
    folder === "ws_lambda_0.33_0.33_0.33"
      ? "balanced"
      : folder.replace("ws_lambda_", "weight-");
  runs.push(JSON.parse(await readFile(path.join(out, id + ".json"), "utf8")));
}
const catalog = runs.map((r) => ({
  id: r.id,
  title: r.title,
  detail: true,
  group: "scip-weighted",
  lambdas: r.meta.lambdas,
  status: r.meta.status,
  duration: r.finalResultTime,
  file: r.id + ".json",
  nodes: r.nodeCount,
}));
catalog.sort((a, b) =>
  a.id === "balanced"
    ? -1
    : b.id === "balanced"
      ? 1
      : a.title.localeCompare(b.title),
);
await writeFile(path.join(out, "catalog.json"), JSON.stringify(catalog));
await writeFile(
  path.join(out, "final-results.json"),
  JSON.stringify(
    runs.map((r) => ({
      run_id: r.id,
      title: r.title,
      lambda1: r.meta.lambdas[0],
      lambda2: r.meta.lambdas[1],
      lambda3: r.meta.lambdas[2],
      F1: r.meta.F1,
      F2: r.meta.F2,
      F3: r.meta.F3,
      total_t_w: r.layout.reduce((s, c) => s + c.t_w, 0),
      n_cells_built: r.meta.n_cells_built,
      unmapped_selected_cells: 0,
      runtime_s: r.finalResultTime,
      best_time_s: r.best.time_s,
      mip_gap: r.meta.mip_gap,
      status: r.meta.status,
      layout_source: r.meta.layout_source,
    })),
  ),
);
await writeFile(
  path.join(out, "final-layouts.json"),
  JSON.stringify(
    runs.map((r) => ({
      run_id: r.id,
      title: r.title,
      lambdas: r.meta.lambdas,
      unmapped_selected_cells: 0,
      cells: r.layout,
    })),
  ),
);
await writeFile(
  path.join(root, "data/audit.json"),
  JSON.stringify(
    runs.map((r) => r.audit),
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    runs: runs.length,
    nodes: runs.reduce((s, r) => s + r.nodeCount, 0),
    incumbents: runs.reduce((s, r) => s + r.incumbents.length, 0),
    source: "presolve_off · 9 October 2026",
  }),
);
