import type { NodeStore, Series } from "./packed-data";
export type Page =
  "time" | "search" | "results" | "compare" | "compare-results";
export type Cell = {
  cell_id: number;
  t_w: number;
  b_w: number;
  latitude?: number;
  longitude?: number;
  membership?: "one" | "two" | "optimal" | "selected" | "shared" | "neither";
  members?: string[];
};
export type NodeRecord = {
  node_id: number;
  parent_id: number | null;
  run: number;
  depth: number;
  branch_var: string;
  branch_sense: string;
  branch_bound: number | null;
  branch_cell_id: number | null;
  status: string;
  time_s: number | null;
  lower_bound: number | null;
  lower_bound_at_creation: number | null;
  global_dual_bound: number | null;
  incumbent: number | null;
  first_seen_s: number | null;
  layout_time_s: number | null;
  layout_n_fractional: number | null;
  layout_satisfies_model: boolean | null;
  layout_F1: number | null;
  layout_F2: number | null;
  layout_F3: number | null;
  [key: string]: unknown;
};
export type Incumbent = {
  sol_index: number;
  time_s: number;
  node_id: number | null;
  objective: number;
  n_cells: number;
  n_fractional: number;
  satisfies_model: boolean;
  F1: number;
  F2: number;
  F3: number;
  wind_weighted_mw: number;
};
export type Observation = {
  t: number;
  primal: number | null;
  dual: number | null;
  gap: number | null;
  source: string;
  node_id: number | null;
  reportedGap?: number;
};
// Final state comes directly from the final layout and summary exports.
// No incumbent index or discovery event defines this reference.
export type OptimalReference = {
  time_s: number;
  node_id: number | null;
  node_event_time_s: number | null;
  bound_record_time_s: number | null;
  primal_bound: number | null;
  dual_bound: number | null;
  gap_percent: number | null;
  F1: number | null;
  F2: number | null;
  F3: number | null;
  n_cells: number;
  source: {
    verified_raw: boolean;
    summary_file: string;
    layout_file: string;
    [key: string]: unknown;
  };
};
export type DisplayedResult = {
  kind: "final" | "incumbent";
  time_s: number;
  objective: number | null;
  F1: number | null;
  F2: number | null;
  F3: number | null;
  n_cells: number;
  sol_index: number | null;
};
export type Run = {
  id: string;
  title: string;
  detail: boolean;
  meta: Record<string, any>;
  nodes: NodeStore;
  progress: Series<Observation>;
  gapSeries: Observation[];
  seenTimes: Float64Array;
  lpShardSize: number;
  bounds: { xmin: number; xmax: number; ymin: number; ymax: number };
  audit: Record<string, number>;
  processing: Series<{
    t: number;
    node_id: number;
    source: string;
  }>;
  incumbents: Incumbent[];
  incumbentLayouts: {
    id: number;
    cells: Cell[];
  }[];
  nodeLayouts: {
    id: number;
    cells: Cell[];
  }[];
  optimal: OptimalReference;
  layout: Cell[];
  notes: string[];
};
export type CatalogEntry = {
  id: string;
  title: string;
  lambdas: number[];
  duration: number;
  status: string;
  file: string;
  group: string;
};
export type Selection = {
  t: number;
  nodeId?: number | null;
};
export type Role = {
  key: "one" | "two" | "optimal" | "selected" | "drop-one" | "drop-two";
  label: string;
  color: string;
  selection: Selection;
};
export const isComparisonPage = (p: Page) =>
  p === "compare" || p === "compare-results";
export function fmt(n: number | null | undefined, d = 3) {
  return n == null || !Number.isFinite(n)
    ? "—"
    : n.toLocaleString("en-AU", {
        minimumFractionDigits: d,
        maximumFractionDigits: d,
      });
}
export function num(n: number | null | undefined) {
  return n == null
    ? "—"
    : n.toLocaleString("en-AU", { maximumFractionDigits: 6 });
}
export function signed(n: number | null | undefined, d = 3) {
  if (n == null) return "—";
  const v = Math.abs(n) < 0.5 * 10 ** -d ? 0 : n;
  return (v > 0 ? "+" : "") + fmt(v, d);
}
export function atOrBefore<T>(
  items: Series<T> | T[],
  t: number,
  time: (item: T) => number,
): T | null {
  let l = 0,
    r = items.length;
  while (l < r) {
    const m = (l + r) >>> 1;
    if (time(items.at(m)!) <= t + 1e-9) l = m + 1;
    else r = m;
  }
  return l ? items.at(l - 1)! : null;
}
export function snapshot(run: Run, selection: Selection | number) {
  const s = typeof selection === "number" ? { t: selection } : selection;
  const obs = atOrBefore(run.progress, s.t, (x) => x.t),
    incumbent = atOrBefore(run.incumbents, s.t, (x) => x.time_s),
    event = atOrBefore(run.processing, s.t, (x) => x.t);
  const nodeId = s.nodeId !== undefined ? s.nodeId : (event?.node_id ?? null);
  const isFinal = s.t >= run.optimal.time_s - 1e-9;
  const result: DisplayedResult | null = isFinal
    ? finalResult(run)
    : incumbent ? { ...incumbent, kind: "incumbent" } : null;
  return {
    t: s.t,
    obs,
    incumbent, // Historical context only; displayed results use result below.
    result,
    event,
    nodeId,
    node: run.nodes.get(nodeId) ?? null,
    isFinal,
    hasLayout: isFinal
      ? run.layout.length > 0
      : incumbent != null && run.incumbentLayouts.some(l => l.id === incumbent.sol_index),
  };
}
export function ancestors(
  map: { get: (id: number) => NodeRecord | undefined },
  id: number | null,
) {
  const out: NodeRecord[] = [],
    seen = new Set<number>();
  let n = id == null ? undefined : map.get(id);
  while (n && !seen.has(n.node_id)) {
    out.push(n);
    seen.add(n.node_id);
    n = n.parent_id == null ? undefined : map.get(n.parent_id);
  }
  return out.reverse();
}
export function comparePaths(a: NodeRecord[], b: NodeRecord[]) {
  let common = 0;
  while (
    common < Math.min(a.length, b.length) &&
    a[common].node_id === b[common].node_id
  )
    common++;
  const A = new Set(a.map((n) => n.node_id)),
    B = new Set(b.map((n) => n.node_id));
  return {
    common,
    baseOnly: a.filter((n) => !B.has(n.node_id)).length,
    optionOnly: b.filter((n) => !A.has(n.node_id)).length,
    lca: common ? a[common - 1].node_id : null,
  };
}
export function pathRelations(paths: NodeRecord[][]) {
  if (!paths.length) return { sharedAll: 0, exclusive: [], pairwise: [] };
  let sharedAll = 0;
  while (
    paths.every(
      (p) =>
        p[sharedAll] && p[sharedAll].node_id === paths[0][sharedAll]?.node_id,
    )
  )
    sharedAll++;
  const sets = paths.map((p) => new Set(p.map((n) => n.node_id)));
  const exclusive = sets.map(
    (s, i) =>
      [...s].filter((id) => sets.every((other, j) => i === j || !other.has(id)))
        .length,
  );
  const pairwise = [];
  for (let i = 0; i < paths.length; i++)
    for (let j = i + 1; j < paths.length; j++)
      pairwise.push({ i, j, ...comparePaths(paths[i], paths[j]) });
  return { sharedAll, exclusive, pairwise };
}
// Optimal is the final recorded state, whose node belongs to its own event.
export function optimalSelection(run: Run): Selection {
  return { t: run.optimal.time_s, nodeId: run.optimal.node_id };
}
export function finalResult(run: Run): DisplayedResult {
  const o = run.optimal;
  return {
    kind: "final", time_s: o.time_s, objective: o.primal_bound,
    F1: o.F1, F2: o.F2, F3: o.F3, n_cells: o.n_cells,
    sol_index: null,
  };
}
export function nodeViewTime(node: NodeRecord) {
  return node.time_s ?? node.layout_time_s ?? node.first_seen_s;
}
export function nodeEncoding(node: NodeRecord) {
  return {
    shape:
      node.parent_id != null && !["<=", ">="].includes(node.branch_sense)
        ? "diamond"
        : "circle",
    filled: node.parent_id != null && node.branch_sense === ">=",
    missingIncumbent: node.incumbent == null,
    root: node.parent_id == null,
  } as const;
}
export function nodeInfoFields(n: NodeRecord) {
  const v = (x: number | null, d = 9) =>
    x == null ? "Not recorded" : fmt(x, d);
  return [
    [
      "Recorded time",
      n.time_s == null ? "Not recorded" : fmt(n.time_s, 6) + " s",
    ],
    ["Lower bound", v(n.lower_bound)],
    ["Dual bound", v(n.global_dual_bound)],
    ["Incumbent", v(n.incumbent)],
    [
      "Branch decision",
      n.parent_id == null
        ? "Root · no branch"
        : n.branch_var && n.branch_sense
          ? `${n.branch_var} ${n.branch_sense} ${n.branch_bound}`
          : "Not recorded",
    ],
    ["Parent", n.parent_id == null ? "None · root" : String(n.parent_id)],
    ["Depth", String(n.depth)],
  ];
}
// Keep the same grid reference while playback remains within a recorded solution.
const denseLayouts = new WeakMap<Run, WeakMap<Cell[], Cell[]>>();
export function denseLayout(
  run: Run,
  t: number,
  kind: "incumbent" | "lp" = "incumbent",
  nodeId?: number | null,
) {
  let source: Cell[] | undefined;
  if (kind === "incumbent") {
    // Final output is independent of historical incumbent availability or identity.
    if (t >= run.optimal.time_s - 1e-9) return run.layout;
    const i = atOrBefore(run.incumbents, t, (x) => x.time_s);
    source = i
      ? run.incumbentLayouts.find((l) => l.id === i.sol_index)?.cells
      : undefined;
  } else {
    const n = run.nodes.get(nodeId);
    if (n && n.layout_time_s != null && n.layout_time_s <= t + 1e-9)
      source = run.nodeLayouts.find((l) => l.id === n.node_id)?.cells;
  }
  if (!source) return null;
  let cache = denseLayouts.get(run);
  if (!cache) {
    cache = new WeakMap();
    denseLayouts.set(run, cache);
  }
  const cached = cache.get(source);
  if (cached) return cached;
  const map = new Map(source.map((c) => [c.cell_id, c]));
  const cells = run.layout.map((c) => ({
    ...c,
    ...(map.get(c.cell_id) ?? { b_w: 0, t_w: 0 }),
  }));
  cache.set(source, cells);
  return cells;
}
export function membershipLabel(value: Cell["membership"]) {
  return value === "one"
    ? "Selected 1 only"
    : value === "two"
      ? "Selected 2 only"
      : value === "optimal"
        ? "Optimal only"
        : value === "shared"
          ? "Shared by two or more results"
          : "Not selected";
}
export function combinedLayout(run: Run, roles: Role[]): Cell[] | null {
  if (!roles.length) return null;
  const layouts = roles.map((r) => denseLayout(run, r.selection.t));
  if (layouts.some((l) => !l)) return null;
  const maps = layouts.map((l) => new Map(l!.map((c) => [c.cell_id, c])));
  return run.layout.map((cell) => {
    const values = maps.map((m) => m.get(cell.cell_id)!);
    const members = roles
      .filter((_, i) => values[i].b_w > 0.5)
      .map((r) => r.key);
    return {
      ...cell,
      b_w: members.length ? 1 : 0,
      t_w: 0,
      members,
      membership: (members.length > 1
        ? "shared"
        : (members[0] ?? "neither")) as Cell["membership"],
    };
  });
}
export function membershipLayout(run: Run, a: number, b: number) {
  const one = denseLayout(run, a),
    two = denseLayout(run, b);
  if (!one || !two) return null;
  const map = new Map(two.map((c) => [c.cell_id, c]));
  return one.map((c) => {
    const other = map.get(c.cell_id)!;
    const A = c.b_w > 0.5,
      B = other.b_w > 0.5;
    return {
      ...c,
      b_w: A || B ? 1 : 0,
      t_w: Math.max(c.t_w, other.t_w),
      membership: (A && B
        ? "shared"
        : A
          ? "one"
          : B
            ? "two"
            : "neither") as Cell["membership"],
    };
  });
}
export type AppState = {
  page: Page;
  current: Selection;
  previous: Selection | null;
  one: Selection | null;
  two: Selection | null;
  pending: "one" | "two" | null;
  preview: Selection | null;
  pendingReturn: "compare" | "compare-results";
};
export const initialState: AppState = {
  page: "time",
  current: { t: 0 },
  previous: null,
  one: null,
  two: null,
  pending: null,
  preview: null,
  pendingReturn: "compare",
};
export type Action =
  | {
      type: "load";
      time: number;
    }
  | {
      type: "select";
      selection: Selection;
    }
  | {
      type: "page";
      page: Page;
    }
  | {
      type: "view";
      selection: Selection;
      destination: "overview" | "compare";
    }
  | {
      type: "compare";
    }
  | {
      type: "compare-current";
    }
  | {
      type: "advance";
      t: number;
    }
  | {
      type: "scrub";
      t: number;
    }
  | {
      type: "edit";
      role: "one" | "two";
      returnTo?: "compare" | "compare-results";
    }
  | {
      type: "close";
      selection?: Selection;
    }
  | {
      type: "start-compare";
      one: Selection;
      two: Selection | null;
      pick?: boolean;
    }
  | {
      type: "swap";
    }
  | {
      type: "clear-preview";
    };
export function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case "load":
      return { ...initialState, current: { t: a.time } };
    case "page":
      return {
        ...s,
        page: a.page,
        pending: null,
        current: a.page === "time" && s.one ? s.one : s.current,
        preview: a.page === "time" && s.one ? null : s.preview,
      };
    case "select":
      if (s.pending)
        return {
          ...s,
          [s.pending]: a.selection,
          current: a.selection,
          pending: null,
          page: s.pendingReturn,
          preview: null,
        };
      return {
        ...s,
        previous: s.current,
        current: a.selection,
        one: s.one ? a.selection : null,
        preview: null,
      };
    case "view":
      if (a.destination === "overview")
        return { ...s, preview: a.selection, page: "time" };
      if (s.pending)
        return reducer(s, { type: "select", selection: a.selection });
      return {
        ...s,
        one: s.current,
        two: a.selection,
        current: a.selection,
        preview: null,
        page: "compare",
        pending: null,
      };
    case "compare":
      if (s.preview) return reducer(s, { type: "compare-current" });
      return {
        ...s,
        current: s.two ?? s.current,
        one: s.one ?? s.previous ?? s.current,
        two: s.two ?? (s.previous ? s.current : null),
        page: "compare",
        pending: null,
      };
    case "compare-current":
      if (s.preview && s.pending)
        return reducer(s, { type: "select", selection: s.preview });
      return {
        ...s,
        one: s.preview ? s.current : (s.previous ?? s.current),
        two: s.preview ?? (s.previous ? s.current : null),
        current: s.preview ?? s.current,
        preview: null,
        page: "compare",
        pending: null,
      };
    case "scrub":
      return { ...s, current: { t: a.t }, preview: null };
    case "advance":
      return {
        ...s,
        current: { t: a.t },
        one: s.one ? { t: a.t } : null,
        preview: null,
      };
    case "edit":
      return {
        ...s,
        pending: a.role,
        current: s[a.role] ?? s.one ?? s.current,
        pendingReturn: a.returnTo ?? "compare",
        page: "time",
        preview: null,
      };
    case "close":
      return { ...initialState, current: a.selection ?? s.current };
    case "start-compare":
      return {
        ...s,
        one: a.one,
        two: a.two,
        current: a.two ?? a.one,
        pending: a.pick ? "two" : null,
        pendingReturn: "compare",
        preview: null,
        page: a.pick ? "time" : "compare",
      };
    case "swap":
      return s.one && s.two
        ? {
            ...s,
            one: s.two,
            two: s.one,
            current: s.page === "time" ? s.two : s.current,
          }
        : s;
    case "clear-preview":
      return { ...s, preview: null };
  }
}
