/** Exact D3 geometry preview; emits SVG, with no browser or plotting dependency. */
import fs from "node:fs";
import { gunzipSync } from "node:zlib";
import { hydrateRun } from "../src/lib/dashboard/packed-data.ts";
import {
  ancestors,
  pathRelations,
  snapshot,
  fmt,
  bestSelection,
} from "../src/lib/dashboard/model.ts";
const meta = JSON.parse(fs.readFileSync("public/data/balanced.json", "utf8")),
  raw = gunzipSync(fs.readFileSync("public" + meta.dataFile)),
  run = hydrateRun(
    meta,
    raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
  );
const W = 2400,
  H = 1260,
  left = 210,
  right = 1890,
  top = 250,
  bottom = 1040,
  k = Math.min(
    (right - left) / (run.bounds.xmax - run.bounds.xmin),
    (bottom - top) / (run.bounds.ymax - run.bounds.ymin),
  ),
  ox = left - run.bounds.xmin * k,
  oy = (top + bottom) / 2 - ((run.bounds.ymin + run.bounds.ymax) * k) / 2;
const X = (i) => run.nodes.raw(i, "x") * k + ox,
  Y = (i) => run.nodes.raw(i, "y") * k + oy,
  N = (v) => v.toFixed(2),
  esc = (s) =>
    String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
const selections = [
    { t: run.incumbents[3].time_s, nodeId: run.incumbents[3].node_id },
    { t: run.incumbents[12].time_s, nodeId: run.incumbents[12].node_id },
    bestSelection(run),
  ],
  colors = ["#0078b5", "#b95708", "#117b66"],
  labels = ["Option 1", "Option 2", "Base · best recorded"],
  dashes = ["", "9 5", "3 5"];
const paths = selections.map((s) => ancestors(run.nodes, s.nodeId)),
  relations = pathRelations(paths),
  parts = [];
parts.push(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#eef3fa"/><g font-family="Arial, sans-serif" fill="#263957"><text x="72" y="87" font-size="37" font-weight="700">Whole search tree</text><text x="72" y="127" font-size="22" fill="#5a7189">Balanced solution · Presolve off</text><text x="${W - 72}" y="90" text-anchor="end" font-size="25">222,225 nodes · 222,224 edges</text><text x="${W - 72}" y="128" text-anchor="end" font-size="21" fill="#5a7189">Maximum depth 82</text><rect x="48" y="172" width="2304" height="1026" rx="22" fill="#ffffff" stroke="#d4deeb"/>`,
);
let edges = "";
for (let i = 0; i < run.nodes.length; i++) {
  const p = run.nodes.raw(i, "parent_id");
  if (Number.isNaN(p)) continue;
  edges += `M${N(X(p - 1))},${N(Y(p - 1))}L${N(X(i))},${N(Y(i))}`;
}
parts.push(
  `<path d="${edges}" fill="none" stroke="#b9c9d9" stroke-width="0.52" opacity="0.55"/>`,
);
for (let group = 0; group < 4; group++) {
  let glyph = "";
  for (let i = 0; i < run.nodes.length; i++) {
    const miss = Number.isNaN(run.nodes.raw(i, "incumbent")),
      fill = run.nodes.raw(i, "branch_sense") === 2;
    if ((miss ? 2 : 0) + (fill ? 1 : 0) !== group) continue;
    const x = X(i),
      y = Y(i),
      r = 0.72;
    glyph += miss
      ? `M${N(x)},${N(y - 1.2)}l1.05,1.8h-2.1z`
      : `M${N(x + r)},${N(y)}a${r},${r} 0 1,0 -1.44,0a${r},${r} 0 1,0 1.44,0`;
  }
  parts.push(
    `<path d="${glyph}" fill="${group % 2 ? "#9cafbd" : "#fff"}" stroke="#9cafbd" stroke-width="0.35"/>`,
  );
}
const membership = new Map();
paths.forEach((p, j) =>
  p.forEach((n) =>
    membership.set(n.node_id, [...(membership.get(n.node_id) ?? []), j]),
  ),
);
for (const [id, roles] of membership) {
  const idx = id - 1,
    p = run.nodes.raw(idx, "parent_id");
  if (Number.isNaN(p)) continue;
  const ax = X(p - 1),
    ay = Y(p - 1),
    bx = X(idx),
    by = Y(idx),
    len = Math.hypot(bx - ax, by - ay) || 1;
  roles.forEach((role, j) => {
    const d = (j - (roles.length - 1) / 2) * 4,
      dx = (-(by - ay) / len) * d,
      dy = ((bx - ax) / len) * d;
    parts.push(
      `<path d="M${N(ax + dx)},${N(ay + dy)}L${N(bx + dx)},${N(by + dy)}" fill="none" stroke="${colors[role]}" stroke-width="2.6" stroke-dasharray="${dashes[role]}"/>`,
    );
  });
}
for (const [id, roles] of membership) {
  const i = id - 1;
  parts.push(
    `<circle cx="${N(X(i))}" cy="${N(Y(i))}" r="3.4" fill="#fff" stroke="${roles.length === 1 ? colors[roles[0]] : "#43536c"}" stroke-width="1.4"/>`,
  );
}
parts.push(
  `<circle cx="${N(X(0))}" cy="${N(Y(0))}" r="11" fill="#fff" stroke="#263957" stroke-width="2"/><text x="${N(X(0))}" y="${N(Y(0) - 21)}" font-size="17" font-weight="700" text-anchor="middle">Root</text>`,
);
paths.forEach((p, i) => {
  const idx = p.at(-1).node_id - 1,
    ly = 360 + i * 205;
  parts.push(
    `<path d="M188,${ly}H210L${N(X(idx))},${N(Y(idx))}" fill="none" stroke="${colors[i]}" stroke-width="1.8" stroke-dasharray="7 5"/><rect x="70" y="${ly - 38}" width="139" height="76" rx="7" fill="#fff"/><text x="82" y="${ly - 9}" font-size="16" font-weight="700" fill="${colors[i]}">${esc(i === 2 ? "Base · best" : labels[i])}</text><text x="82" y="${ly + 17}" font-size="16" fill="${colors[i]}">${fmt(selections[i].t, 6)} s</text><circle cx="${N(X(idx))}" cy="${N(Y(idx))}" r="10" fill="none" stroke="${colors[i]}" stroke-width="3"/>`,
  );
});
parts.push(
  '<rect x="1930" y="208" width="386" height="863" rx="16" fill="#f4f8fc"/><text x="1954" y="254" font-size="25" font-weight="700">Selected paths</text>',
);
selections.forEach((s, i) => {
  const y = 304 + i * 197,
    q = snapshot(run, s);
  parts.push(
    `<text x="1954" y="${y}" font-size="20" font-weight="700" fill="${colors[i]}">${esc(labels[i])}</text><text x="1954" y="${y + 34}" font-size="21">${fmt(s.t, 6)} s</text><text x="1954" y="${y + 69}" font-size="17">Objective  ${fmt(q.incumbent?.objective, 9)}</text><text x="1954" y="${y + 102}" font-size="17">Path nodes  ${paths[i].length}</text><text x="1954" y="${y + 135}" font-size="17">Unique nodes  ${relations.exclusive[i]}</text>`,
  );
});
parts.push(
  `<line x1="1954" x2="2292" y1="877" y2="877" stroke="#cfdbeb"/><text x="1954" y="921" font-size="19">Shared prefix · all three</text><text x="1954" y="967" font-size="34" font-weight="700">${relations.sharedAll}</text>`,
);
parts.push('<line x1="72" x2="2328" y1="1100" y2="1100" stroke="#d4deeb"/>');
labels.forEach((label, i) =>
  parts.push(
    `<line x1="${85 + i * 460}" x2="${135 + i * 460}" y1="1148" y2="1148" stroke="${colors[i]}" stroke-width="4" stroke-dasharray="${dashes[i]}"/><text x="${149 + i * 460}" y="1155" font-size="20" fill="${colors[i]}">${esc(label)}</text>`,
  ),
);
parts.push(
  '<text x="2294" y="1155" font-size="19" text-anchor="end" fill="#5a7189">Complete tree · example selections</text></g></svg>',
);
const dest = process.argv[2] || "data/whole-tree-preview.svg";
fs.writeFileSync(dest, parts.join(""));
console.log(dest);
