import assert from "node:assert/strict";
import fs from "node:fs";
import { gunzipSync } from "node:zlib";
import { hydrateRun, recordedCount } from "../src/lib/dashboard/packed-data.ts";
import {
  snapshot,
  ancestors,
  pathRelations,
  denseLayout,
  membershipLayout,
  reducer,
  initialState,
  bestSelection,
  nodeEncoding,
  nodeInfoFields,
} from "../src/lib/dashboard/model.ts";
const catalog = JSON.parse(fs.readFileSync("public/data/catalog.json", "utf8")),
  checks = [],
  benchmarks = [];
let totalNodes = 0,
  totalIncumbents = 0,
  largeTrees = 0,
  balanced;
for (const entry of catalog) {
  const meta = JSON.parse(fs.readFileSync("public/data/" + entry.file, "utf8")),
    z = fs.readFileSync("public" + meta.dataFile),
    raw = gunzipSync(z),
    buffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
    start = performance.now(),
    run = hydrateRun(meta, buffer);
  const indexMs = performance.now() - start;
  assert.equal(run.nodes.length, meta.meta.n_nodes_recorded);
  assert.equal(run.meta.presolve, "off");
  assert.equal(run.layout.length, 7406);
  assert.equal(run.meta.unmapped_selected_cells, 0);
  assert.equal(run.incumbentLayouts.length, run.incumbents.length);
  assert.equal(run.meta.n_incumbents, run.incumbents.length);
  let edges = 0,
    roots = 0,
    maxDepth = 0;
  for (let i = 0; i < run.nodes.length; i++) {
    assert.equal(run.nodes.raw(i, "node_id"), i + 1);
    assert(Number.isFinite(run.nodes.raw(i, "x")));
    assert(Number.isFinite(run.nodes.raw(i, "y")));
    const parent = run.nodes.raw(i, "parent_id");
    maxDepth = Math.max(maxDepth, run.nodes.raw(i, "depth"));
    if (Number.isNaN(parent)) roots++;
    else {
      edges++;
      assert(parent < i + 1);
      assert.equal(
        run.nodes.raw(i, "depth"),
        run.nodes.raw(parent - 1, "depth") + 1,
      );
    }
  }
  assert.equal(edges, run.audit.edges);
  assert.equal(roots, run.meta.root_count);
  assert.equal(maxDepth, run.meta.max_depth);
  for (const event of run.incumbents) {
    const layout = denseLayout(run, event.time_s);
    assert(layout);
    assert.equal(layout.length, 7406);
    assert.equal(
      snapshot(run, event.time_s).incumbent.sol_index,
      event.sol_index,
    );
    if (event.node_id) {
      const p = ancestors(run.nodes, event.node_id);
      assert.equal(p.length, run.nodes.get(event.node_id).depth + 1);
      assert.equal(p[0].parent_id, null);
    }
  }
  assert.equal(denseLayout(run, 0), null);
  assert.equal(
    snapshot(run, run.finalResultTime).incumbent.sol_index,
    run.best.sol_index,
  );
  assert.equal(bestSelection(run).t, run.best.time_s);
  assert.equal(recordedCount(run, -1), 0);
  assert(recordedCount(run, run.finalResultTime) <= run.nodes.length);
  const bestLayout = denseLayout(run, run.best.time_s);
  for (let i = 0; i < run.layout.length; i++) {
    assert(Math.abs(bestLayout[i].b_w - run.layout[i].b_w) < 1e-6);
    assert(Math.abs(bestLayout[i].t_w - run.layout[i].t_w) < 1e-6);
  }
  const sample = [1, run.best.node_id, run.nodes.length].filter(Boolean);
  for (const id of sample) {
    const x = run.nodes.raw(id - 1, "x"),
      y = run.nodes.raw(id - 1, "y"),
      idx = run.nodes.nearest(x, y, 1e-8);
    assert(idx !== null);
    assert(Math.abs(run.nodes.raw(idx, "x") - x) < 1e-8);
    assert(Math.abs(run.nodes.raw(idx, "y") - y) < 1e-8);
  }
  const searchStart = performance.now();
  for (let i = 0; i < 500; i++) snapshot(run, (run.finalResultTime * i) / 499);
  const lookupMs = performance.now() - searchStart;
  totalNodes += run.nodes.length;
  totalIncumbents += run.incumbents.length;
  if (edges > 10000) largeTrees++;
  if (run.id === "balanced") balanced = run;
  checks.push({
    run: run.id,
    nodes: run.nodes.length,
    edges,
    historicalResults: run.incumbents.length,
    status: "passed",
  });
  benchmarks.push({
    run: run.id,
    binaryMiB: +(buffer.byteLength / 1048576).toFixed(2),
    indexMs: +indexMs.toFixed(2),
    fiveHundredTimeLookupsMs: +lookupMs.toFixed(2),
  });
}
assert.equal(totalNodes, 1938884);
assert.equal(totalIncumbents, 57);
assert.equal(largeTrees, 6);
assert.equal(balanced.nodes.length, 222225);
assert.equal(balanced.best.time_s, 1183.321701);
assert.equal(balanced.best.node_id, 64816);
const a = {
    t: balanced.incumbents[3].time_s,
    nodeId: balanced.incumbents[3].node_id,
  },
  b = {
    t: balanced.incumbents[12].time_s,
    nodeId: balanced.incumbents[12].node_id,
  };
const relations = pathRelations([
  ancestors(balanced.nodes, a.nodeId),
  ancestors(balanced.nodes, b.nodeId),
  ancestors(balanced.nodes, balanced.best.node_id),
]);
assert(relations.sharedAll >= 1);
assert(relations.pairwise.some((p) => p.baseOnly > 0 || p.optionOnly > 0));
const membership = membershipLayout(
  balanced,
  balanced.incumbents[0].time_s,
  balanced.best.time_s,
);
assert(membership.some((c) => c.membership === "one"));
assert(membership.some((c) => c.membership === "two"));
let s = reducer(initialState, { type: "load", time: a.t });
s = reducer(s, { type: "view", selection: b, destination: "overview" });
assert.equal(s.current.t, a.t);
assert.equal(s.preview.t, b.t);
s = reducer(s, { type: "compare-current" });
assert.equal(s.one.t, a.t);
assert.equal(s.two.t, b.t);
s = reducer(s, { type: "swap" });
assert.equal(s.one.t, b.t);
s = reducer(s, { type: "edit", role: "two" });
s = reducer(s, { type: "select", selection: { t: 500 } });
assert.equal(s.one.t, b.t);
s = reducer(s, { type: "close" });
assert.equal(s.current.t, 500);
assert.equal(s.one, null);
assert.equal(s.two, null);
assert.equal(s.preview, null);
assert.equal(s.page, "time");
assert.equal(nodeInfoFields(balanced.nodes.get(1)).length, 7);
const n = balanced.nodes.get(2);
assert.equal(nodeEncoding({ ...n, incumbent: null }).missingIncumbent, true);
assert.equal(nodeEncoding({ ...n, branch_sense: ">=" }).filled, true);
assert.equal(nodeEncoding({ ...n, branch_sense: "" }).shape, "diamond");
const report = {
  source: "presolve_off-20261009T064501Z-1-001.zip",
  checks,
  totalNodes,
  totalIncumbents,
  largeTrees,
  relationshipExample: relations,
  benchmarks,
  note: "Real supplied records; Node data/state/geometry checks. These times are not browser FPS.",
};
fs.writeFileSync("data/validation.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
