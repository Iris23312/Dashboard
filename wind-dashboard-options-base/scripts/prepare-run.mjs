import { createReadStream } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createInterface } from "node:readline";
import { createGunzip, gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
import { csvParse, csvParseRows, tsvParse, hierarchy, tree } from "d3";
const root = fileURLToPath(new URL("../", import.meta.url)),
  source = process.argv[2],
  out = path.join(root, "public/data");
const meta = JSON.parse(
  await readFile(path.join(source, "summary.json"), "utf8"),
);
assert.equal(meta.presolve, "off");
const id = meta.lambdas.every((w) => Math.abs(w - 1 / 3) < 1e-8)
  ? "balanced"
  : path.basename(source).replace("ws_lambda_", "weight-");
const title =
    id === "balanced"
      ? "0.33_0.33_0.33"
      : meta.lambdas.map((w) => w.toFixed(2)).join(" · "),
  dir = path.join(out, id);
await mkdir(path.join(dir, "lp"), { recursive: true });
const started = performance.now();
console.log(
  id + ": reading " + meta.n_nodes_recorded.toLocaleString() + " nodes",
);
const fields = [
  "node_id",
  "parent_id",
  "run",
  "depth",
  "branch_cell_id",
  "branch_bound",
  "time_s",
  "lower_bound_at_creation",
  "lower_bound",
  "global_dual_bound",
  "incumbent",
  "first_seen_s",
  "layout_time_s",
  "layout_n_fractional",
  "layout_satisfies_model",
  "layout_F1",
  "layout_F2",
  "layout_F3",
  "processed_order",
  "layout_n_cells",
  "layout_wind_weighted_mw",
  "branch_sense",
  "branch_var",
  "status",
  "x",
  "y",
];
const C = Object.fromEntries(fields.map((f, i) => [f, i])),
  stride = fields.length,
  data = new Float64Array(meta.n_nodes_recorded * stride);
data.fill(NaN);
const value = (i, k) => data[i * stride + C[k]],
  set = (i, k, v) => {
    data[i * stride + C[k]] = v;
  };
const dict = { branch_sense: ["", "<=", ">="], branch_var: [""], status: [] },
  dictMaps = Object.fromEntries(
    Object.entries(dict).map(([k, v]) => [k, new Map(v.map((s, i) => [s, i]))]),
  );
function encode(k, v) {
  if (!dictMaps[k].has(v)) {
    dictMaps[k].set(v, dict[k].length);
    dict[k].push(v);
  }
  return dictMaps[k].get(v);
}
async function* rows(filename) {
  let stream = createReadStream(path.join(source, filename));
  if (filename.endsWith(".gz")) stream = stream.pipe(createGunzip());
  let header;
  for await (const line of createInterface({
    input: stream,
    crlfDelay: Infinity,
  })) {
    if (!line.trim()) continue;
    const r = line.includes('"') ? csvParseRows(line)[0] : line.split(",");
    if (!header) {
      header = r;
      continue;
    }
    yield [header, r];
  }
}
const numeric = (r) =>
  Object.fromEntries(
    Object.entries(r).map(([k, v]) => [
      k,
      k === "stage"
        ? v
        : v === ""
          ? null
          : v === "True"
            ? true
            : v === "False"
              ? false
              : +v,
    ]),
  );
const incumbents = csvParse(
    await readFile(path.join(source, "incumbents.csv"), "utf8"),
    numeric,
  ).sort((a, b) => a.time_s - b.time_s),
  incumbentTimes = new Map();
for (const i of incumbents)
  if (i.node_id != null)
    incumbentTimes.set(
      i.node_id,
      Math.min(incumbentTimes.get(i.node_id) ?? Infinity, i.time_s),
    );
const progress = [],
  processing = [],
  seen = [];
let nodeCount = 0,
  roots = 0,
  edges = 0,
  missingBounds = 0,
  missingTime = 0,
  missingInc = 0,
  missingBranch = 0,
  maxDepth = 0,
  lpExpected = 0;
function gap(p, d) {
  if (p == null || d == null || !Number.isFinite(p) || !Number.isFinite(d))
    return null;
  if (p === d) return 0;
  const den = Math.min(Math.abs(p), Math.abs(d));
  return den > 0 && p * d >= 0 ? (100 * Math.abs(p - d)) / den : null;
}
let fieldMap;
for await (const [header, r] of rows("tree_nodes.csv")) {
  fieldMap ??= header.map((k) => C[k]);
  const i = nodeCount++;
  for (let j = 0; j < header.length; j++) {
    const k = header[j],
      v = r[j];
    if (fieldMap[j] !== undefined)
      data[i * stride + fieldMap[j]] = dict[k]
        ? encode(k, v)
        : v === ""
          ? NaN
          : v === "True"
            ? 1
            : v === "False"
              ? 0
              : +v;
  }
  assert.equal(
    value(i, "node_id"),
    i + 1,
    "CSV IDs must be sequential; do not silently reindex",
  );
  const parent = value(i, "parent_id"),
    depth = value(i, "depth");
  if (Number.isNaN(parent)) {
    roots++;
    assert.equal(depth, 0);
  } else {
    assert(parent >= 1 && parent < i + 1);
    assert.equal(depth, value(parent - 1, "depth") + 1);
    edges++;
    if (!dict.branch_sense[value(i, "branch_sense")]) missingBranch++;
  }
  maxDepth = Math.max(maxDepth, depth);
  const t = value(i, "time_s"),
    lt = value(i, "layout_time_s"),
    p = value(i, "incumbent"),
    d = value(i, "global_dual_bound"),
    first = Math.min(
      Number.isFinite(t) ? t : Infinity,
      Number.isFinite(lt) ? lt : Infinity,
      incumbentTimes.get(i + 1) ?? Infinity,
    );
  if (Number.isFinite(first)) {
    set(i, "first_seen_s", first);
    seen.push(first);
  }
  if (Number.isNaN(t)) missingTime++;
  else processing.push([t, i + 1, 0]);
  if (Number.isFinite(lt)) {
    processing.push([lt, i + 1, 1]);
    lpExpected++;
  }
  if (Number.isNaN(value(i, "lower_bound"))) missingBounds++;
  if (Number.isNaN(p)) missingInc++;
  if (Number.isFinite(t) && Number.isFinite(p) && Number.isFinite(d))
    progress.push([t, i + 1, p, d, gap(p, d) ?? NaN, NaN]);
}
assert.equal(nodeCount, meta.n_nodes_recorded);
assert.equal(maxDepth, meta.max_depth);
for (const i of incumbents) {
  assert(i.node_id == null || (i.node_id >= 1 && i.node_id <= nodeCount));
  if (i.node_id != null) processing.push([i.time_s, i.node_id, 2]);
}
progress.push([
  meta.solve_time_s,
  NaN,
  meta.primal_bound,
  meta.dual_bound,
  gap(meta.primal_bound, meta.dual_bound) ?? NaN,
  meta.mip_gap * 100,
]);
progress.sort((a, b) => a[0] - b[0]);
processing.sort((a, b) => a[0] - b[0]);
seen.sort((a, b) => a - b);
// Remove only consecutive unchanged chart segments; retain all exact observations in the binary timeline.
const gapSeries = [];
let previous = null;
for (const p of progress) {
  const changed =
    !previous ||
    p[2] !== previous[2] ||
    p[3] !== previous[3] ||
    !Object.is(p[4], previous[4]);
  if (changed) {
    if (previous && gapSeries.at(-1) !== previous) gapSeries.push(previous);
    gapSeries.push(p);
  }
  previous = p;
}
if (previous && gapSeries.at(-1) !== previous) gapSeries.push(previous);
console.log(
  id +
    ": D3 layout, " +
    edges.toLocaleString() +
    " verified parent–child edges",
);
const firstChild = new Int32Array(nodeCount).fill(-1),
  nextSibling = new Int32Array(nodeCount).fill(-1),
  rootIds = [];
for (let i = nodeCount - 1; i >= 0; i--) {
  const p = value(i, "parent_id");
  if (Number.isNaN(p)) rootIds.unshift(i);
  else {
    nextSibling[i] = firstChild[p - 1];
    firstChild[p - 1] = i;
  }
}
const hierarchyRoot = hierarchy(-1, (i) => {
  if (i === -1) return rootIds;
  const children = [];
  for (let c = firstChild[i]; c !== -1; c = nextSibling[c]) children.push(c);
  return children;
});
const height = Math.max(260, (maxDepth + 1) * 75);
tree().size([Math.max(600, Math.sqrt(nodeCount) * 58), height])(hierarchyRoot);
let xmin = Infinity,
  xmax = -Infinity,
  ymin = Infinity,
  ymax = -Infinity;
hierarchyRoot.each((n) => {
  if (n.data < 0) return;
  const x = n.x,
    y = n.y - height / (maxDepth + 1);
  set(n.data, "x", x);
  set(n.data, "y", y);
  xmin = Math.min(xmin, x);
  xmax = Math.max(xmax, x);
  ymin = Math.min(ymin, y);
  ymax = Math.max(ymax, y);
});
console.log(id + ": streaming LP layouts into 512-node shards");
let chunk = -1,
  chunkLayouts = {},
  lpGroups = 0,
  lpRows = 0,
  lastNode = -1,
  capacityMax = 0;
async function flush() {
  if (chunk < 0) return;
  await writeFile(
    path.join(dir, "lp", chunk + ".json.gz"),
    gzipSync(JSON.stringify(chunkLayouts), { level: 6 }),
  );
  chunkLayouts = {};
}
for await (const [h, r] of rows("node_layouts.csv.gz")) {
  const node = +r[0],
    cell = +r[1],
    b = +r[2],
    t = +r[3];
  assert(node >= 1 && node <= nodeCount);
  assert(node >= lastNode, "LP rows must be grouped in node order");
  const key = Math.floor((node - 1) / 512);
  if (key !== chunk) {
    await flush();
    chunk = key;
  }
  if (node !== lastNode) {
    lpGroups++;
    lastNode = node;
  }
  (chunkLayouts[node] ??= []).push({ cell_id: cell, b_w: b, t_w: t });
  lpRows++;
  capacityMax = Math.max(capacityMax, t);
}
await flush();
assert.equal(lpGroups, meta.n_node_layouts);
assert.equal(lpGroups, lpExpected);
const incumbentMap = new Map();
for await (const [h, r] of rows("incumbent_layouts.csv.gz")) {
  const sol = +r[0],
    cells = incumbentMap.get(sol) ?? [];
  cells.push({ cell_id: +r[1], b_w: +r[2], t_w: +r[3] });
  capacityMax = Math.max(capacityMax, +r[3]);
  incumbentMap.set(sol, cells);
}
const incumbentLayouts = [...incumbentMap].map(([id, cells]) => ({
  id,
  cells,
}));
assert.equal(incumbents.length, meta.n_incumbents);
assert.equal(incumbentLayouts.length, incumbents.length);
for (const i of incumbents) {
  assert(incumbentMap.has(i.sol_index));
  assert.equal(incumbentMap.get(i.sol_index).length, i.n_cells);
}
const layout = csvParse(
  await readFile(path.join(source, "solution_layout.csv"), "utf8"),
  (r) => ({ cell_id: +r.cell_id, b_w: +r.b_w, t_w: +r.t_w }),
);
const best = incumbents.reduce((a, b) => (b.objective < a.objective ? b : a)),
  bestMap = new Map(
    incumbentMap.get(best.sol_index).map((c) => [c.cell_id, c]),
  );
let maxLayoutDiff = 0;
for (const c of layout) {
  capacityMax = Math.max(capacityMax, c.t_w);
  const b = bestMap.get(c.cell_id);
  maxLayoutDiff = Math.max(
    maxLayoutDiff,
    Math.abs(c.b_w - (b?.b_w ?? 0)),
    Math.abs(c.t_w - (b?.t_w ?? 0)),
  );
}
assert(
  maxLayoutDiff < 1e-6,
  "Final layout differs from best recorded incumbent",
);
const positions = tsvParse(
    await readFile(
      path.join(root, "data/source/scip-coordinate-reference.tsv"),
      "utf8",
    ),
  ),
  positionIds = new Set(positions.map((c) => +c.cell_id));
assert.equal(layout.filter((c) => !positionIds.has(c.cell_id)).length, 0);
let vbcNodes = 0,
  vbcEdges = 0;
for await (const line of createInterface({
  input: createReadStream(path.join(source, "tree.vbc")),
  crlfDelay: Infinity,
})) {
  const m = line.match(/^\S+ N (\d+) (\d+) /);
  if (m) {
    vbcNodes++;
    if (+m[1] !== 0) vbcEdges++;
  }
}
const sections = {};
let offset = 0;
const parts = [];
for (const [name, arr, width] of [
  ["nodes", data, stride],
  ["progress", new Float64Array(progress.flat()), 6],
  ["processing", new Float64Array(processing.flat()), 3],
  ["seen", new Float64Array(seen), 1],
]) {
  sections[name] = { offset, count: arr.length / width, stride: width };
  const buffer = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
  parts.push(buffer);
  offset += buffer.byteLength;
}
await writeFile(
  path.join(dir, "records.bin.gz"),
  gzipSync(Buffer.concat(parts), { level: 6 }),
);
Object.assign(meta, {
  solver: "SCIP",
  catalog_group: "scip-weighted",
  grid_file: "scip-reference",
  dataset: "presolve_off · 9 October 2026",
  layout_source: path.basename(source) + "/solution_layout.csv",
  coordinate_source:
    "scip-coordinate-reference.tsv (previously supplied reference)",
  mapped_cells: layout.length,
  unmapped_selected_cells: 0,
  n_cells_built: layout.filter((c) => c.b_w > 0.5).length,
  summary_derived_gap_pct: gap(meta.primal_bound, meta.dual_bound),
  root_count: roots,
  best_discovery_time: best.time_s,
  best_node_id: best.node_id,
  best_sol_index: best.sol_index,
  capacity_unit: "source units",
  capacity_scale_max: capacityMax,
  missing_branch_count: missingBranch,
});
const notes = [
  "Complete CSV topology is displayed, including unprocessed open nodes. No paths or subtrees are pruned.",
  "The endpoint at an arbitrary selected time is the latest timestamped node/LP/incumbent event, not a continuous active-node log.",
  "Open nodes may have no recorded time, incumbent or solved lower bound. Creation lower bound is not substituted for solved lower bound.",
  "Node layouts are last LP relaxations, loaded on demand and shown only at/after their recorded time. Integer layouts use recorded incumbent times.",
  "Sparse rows omitted under b_w <= 1e-6 are reconstructed as zero within that supplied layout.",
  "Reported gap and gap derived from exported bounds are retained separately; differences require provider confirmation.",
  "Coordinates use the previously supplied cell_id reference; this archive contains no latitude/longitude table.",
];
const cellSets = new Set(
  incumbentLayouts.map((l) =>
    l.cells
      .filter((c) => c.b_w > 1e-6)
      .map((c) => c.cell_id)
      .sort((a, b) => a - b)
      .join(","),
  ),
);
const audit = {
  id,
  nodes: nodeCount,
  edges,
  roots,
  max_depth: maxDepth,
  incumbents: incumbents.length,
  historicalLayouts: incumbentLayouts.length,
  distinct_selected_cell_sets: cellSets.size,
  node_lp_layouts: lpGroups,
  node_lp_rows: lpRows,
  lower_bound_records: nodeCount - missingBounds,
  missing_node_time: missingTime,
  missing_incumbent: missingInc,
  missing_branch: missingBranch,
  bound_records: progress.length,
  chart_change_points: gapSeries.length,
  cells: layout.length,
  mapped: layout.length,
  best_time: best.time_s,
  stop_time: meta.solve_time_s,
  best_node: best.node_id,
  final_layout_max_diff: maxLayoutDiff,
  reported_gap_pct: meta.mip_gap * 100,
  derived_gap_pct: meta.summary_derived_gap_pct,
  vbc_nodes: vbcNodes,
  vbc_edges: vbcEdges,
  vbc_joined: false,
  parent_integrity: true,
  depth_integrity: true,
};
const run = {
  id,
  title,
  detail: true,
  meta,
  nodeCount,
  fields,
  dictionaries: dict,
  sections,
  dataFile: `/data/${id}/records.bin.gz`,
  lpShardSize: 512,
  bounds: { xmin, xmax, ymin, ymax },
  gapSeries: gapSeries.map((p) => ({
    t: p[0],
    node_id: Number.isNaN(p[1]) ? null : p[1],
    primal: p[2],
    dual: p[3],
    gap: Number.isNaN(p[4]) ? null : p[4],
    source: Number.isNaN(p[1]) ? "summary.json" : "tree_nodes.csv",
    reportedGap: Number.isNaN(p[5]) ? undefined : p[5],
  })),
  incumbents,
  incumbentLayouts,
  nodeLayouts: [],
  best,
  layout,
  layoutTime: best.time_s,
  finalResultTime: meta.solve_time_s,
  notes,
  audit,
};
await writeFile(path.join(out, id + ".json"), JSON.stringify(run));
console.log(
  JSON.stringify({
    ...audit,
    conversion_s: (performance.now() - started) / 1000,
  }),
);
