import { useMemo, useState } from "react";
import {
  Run,
  Selection,
  ancestors,
  snapshot,
  pathRelations,
  fmt,
  signed,
  Role,
} from "@/lib/dashboard/model";
import { comparisonRoles } from "@/lib/dashboard/appearance";

export function ComparisonPanel({
  run,
  one,
  two,
  includeBase,
  onEdit,
  scope = "tree",
  onFocusRole,
  focusedRole,
}: {
  run: Run;
  one: Selection | null;
  two: Selection | null;
  includeBase: boolean;
  onEdit: (role: "one" | "two") => void;
  scope?: "tree" | "results";
  onFocusRole?: (key: Role["key"]) => void;
  focusedRole?: Role["key"] | null;
}) {
  const [view, setView] = useState<"values" | "delta">("values");
  const columns = useMemo(
    () => comparisonRoles(run, one, two, includeBase),
    [run, one, two, includeBase],
  );
  const snapshots = columns.map((c) => snapshot(run, c.selection));
  const rows =
    scope === "results"
      ? [
          {
            key: "Selected time / s",
            values: columns.map((c) => c.selection.t),
            digits: 6,
          },
          {
            key: "Result time / s",
            values: snapshots.map((s) => s.incumbent?.time_s ?? null),
            digits: 6,
          },
          {
            key: "Objective value",
            values: snapshots.map((s) => s.incumbent?.objective ?? null),
            digits: 9,
          },
          {
            key: view === "values" ? "Gap / %" : "Gap / pp",
            values: snapshots.map((s) => s.obs?.gap ?? null),
            digits: 6,
            bound: true,
          },
          {
            key: "Selected grids",
            values: snapshots.map((s) => s.incumbent?.n_cells ?? null),
            digits: 0,
          },
          {
            key: "F1 / 10⁹",
            values: snapshots.map((s) =>
              s.incumbent ? s.incumbent.F1 / 1e9 : null,
            ),
            digits: 6,
          },
          {
            key: "F2",
            values: snapshots.map((s) => s.incumbent?.F2 ?? null),
            digits: 6,
          },
          {
            key: "F3 / 10⁶",
            values: snapshots.map((s) =>
              s.incumbent ? s.incumbent.F3 / 1e6 : null,
            ),
            digits: 6,
          },
        ]
      : [
          {
            key: "Time / s",
            values: columns.map((c) => c.selection.t),
            digits: 6,
          },
          {
            key: view === "values" ? "Gap / %" : "Gap / pp",
            values: snapshots.map((s) => s.obs?.gap ?? null),
            digits: 6,
            bound: true,
          },
          {
            key: "Lower bound",
            values: snapshots.map((s) => s.node?.lower_bound ?? null),
            digits: 9,
          },
          {
            key: "Dual bound",
            values: snapshots.map((s) => s.obs?.dual ?? null),
            digits: 9,
            bound: true,
          },
          {
            key: "Incumbent",
            values: snapshots.map((s) => s.incumbent?.objective ?? null),
            digits: 9,
          },
          {
            key: "F1 / 10⁹",
            values: snapshots.map((s) =>
              s.incumbent ? s.incumbent.F1 / 1e9 : null,
            ),
            digits: 6,
          },
          {
            key: "F2",
            values: snapshots.map((s) => s.incumbent?.F2 ?? null),
            digits: 6,
          },
          {
            key: "F3 / 10⁶",
            values: snapshots.map((s) =>
              s.incumbent ? s.incumbent.F3 / 1e6 : null,
            ),
            digits: 6,
          },
        ];
  const base = columns.findIndex((c) => c.label === "Base");
  const pairs: number[][] = [];
  if (base >= 0)
    columns.forEach((_, i) => {
      if (i !== base) pairs.push([i, base]);
    });
  for (let j = 1; j < columns.length; j++)
    for (let i = 0; i < j; i++)
      if (i !== base && j !== base) pairs.push([j, i]);
  const paths = snapshots.map((s) => ancestors(run.nodes, s.nodeId)),
    relations = pathRelations(paths);
  const complete = paths.length > 1 && paths.every((p) => p.length > 0);
  return (
    <div className="comparison-panel">
      <div className="comparison-slot-controls">
        {columns.map((c) =>
          c.key === "best" ? (
            <div
              key={c.key}
              className="comparison-slot best-slot"
              style={{ color: c.color }}
            >
              <span>Base · best recorded</span>
              <strong>{fmt(c.selection.t, 6)} s</strong>
            </div>
          ) : (
            <button
              key={c.key}
              className="comparison-slot"
              style={{ color: c.color }}
              onClick={() => onEdit(c.key as "one" | "two")}
              title={`Change ${c.label} on gap-time chart`}
            >
              <span>{c.label} ↗</span>
              <strong>{fmt(c.selection.t, 6)} s</strong>
            </button>
          ),
        )}
      </div>
      {!two && (
        <button className="add-selection" onClick={() => onEdit("two")}>
          + Select second time
        </button>
      )}
      <header>
        <h3>{scope === "results" ? "Result comparison" : "Time & gap"}</h3>
        <div className="segmented">
          <button
            className={view === "values" ? "active" : ""}
            onClick={() => setView("values")}
          >
            Values
          </button>
          <button
            disabled={pairs.length === 0}
            className={view === "delta" ? "active" : ""}
            onClick={() => setView("delta")}
          >
            Differences
          </button>
        </div>
      </header>
      <div className="comparison-table-scroll">
        <table className="comparison-values">
          <thead>
            <tr>
              <th scope="col">
                {view === "delta" ? "First − second" : "Metric"}
              </th>
              {view === "values"
                ? columns.map((c) => (
                    <th
                      scope="col"
                      key={c.key}
                      className={focusedRole === c.key ? "focused-column" : ""}
                      style={{ color: c.color }}
                    >
                      {onFocusRole ? (
                        <button
                          className="column-focus"
                          aria-label={"View " + c.label + " result"}
                          onClick={() => onFocusRole(c.key)}
                        >
                          {c.label}
                        </button>
                      ) : (
                        c.label
                      )}
                    </th>
                  ))
                : pairs.map(([a, b]) => (
                    <th scope="col" key={`${a}-${b}`}>
                      <span style={{ color: columns[a].color }}>
                        {columns[a].label}
                      </span>
                      <br />−{" "}
                      <span style={{ color: columns[b].color }}>
                        {columns[b].label}
                      </span>
                    </th>
                  ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <th scope="row">{r.key}</th>
                {view === "values"
                  ? r.values.map((v, i) => (
                      <td
                        key={i}
                        className={
                          focusedRole === columns[i].key ? "focused-column" : ""
                        }
                        title={v == null ? "Not recorded" : String(v)}
                      >
                        {fmt(v, r.digits)}
                        {r.bound && snapshots[i].obs && (
                          <small title="Latest paired bound record">
                            at {fmt(snapshots[i].obs!.t, 6)} s
                          </small>
                        )}
                      </td>
                    ))
                  : pairs.map(([a, b]) => (
                      <td key={`${a}-${b}`}>
                        {signed(
                          r.values[a] == null || r.values[b] == null
                            ? null
                            : r.values[a]! - r.values[b]!,
                          r.digits,
                        )}
                      </td>
                    ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {scope === "tree" && (
        <>
          <div className="path-stat-heading">
            <h3>Path relationships</h3>
            {columns.length > 1 && (
              <span>
                {columns.length === 3 ? "All three" : "Both"} shared prefix{" "}
                <strong>{complete ? relations.sharedAll : "—"}</strong>
              </span>
            )}
          </div>
          <table className="path-exclusive">
            <thead>
              <tr>
                <th scope="col">Nodes</th>
                {columns.map((c) => (
                  <th
                    scope="col"
                    key={c.key}
                    className={focusedRole === c.key ? "focused-column" : ""}
                    style={{ color: c.color }}
                  >
                    {onFocusRole ? (
                      <button
                        className="column-focus"
                        aria-label={"View " + c.label + " result"}
                        onClick={() => onFocusRole(c.key)}
                      >
                        {c.label}
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Restart</th>
                {snapshots.map((s, i) => (
                  <td key={i}>{s.node?.run ?? "—"}</td>
                ))}
              </tr>
              <tr>
                <th scope="row">Path length</th>
                {paths.map((p, i) => (
                  <td key={i}>{p.length || "—"}</td>
                ))}
              </tr>
              <tr>
                <th
                  scope="row"
                  title="Nodes absent from every other displayed path"
                >
                  Unique nodes
                </th>
                {relations.exclusive.map((n, i) => (
                  <td key={i}>{complete ? n : "—"}</td>
                ))}
              </tr>
            </tbody>
          </table>
          {columns.length > 1 && (
            <table className="pairwise-paths">
              <thead>
                <tr>
                  <th>Pair · first / second</th>
                  <th>Shared prefix</th>
                  <th>Only first</th>
                  <th>Only second</th>
                </tr>
              </thead>
              <tbody>
                {relations.pairwise.map((p) => (
                  <tr key={`${p.i}-${p.j}`}>
                    <th>
                      <span style={{ color: columns[p.i].color }}>
                        {columns[p.i].label}
                      </span>{" "}
                      /{" "}
                      <span style={{ color: columns[p.j].color }}>
                        {columns[p.j].label}
                      </span>
                    </th>
                    <td>
                      {paths[p.i].length && paths[p.j].length ? p.common : "—"}
                    </td>
                    <td>
                      {paths[p.i].length && paths[p.j].length
                        ? p.baseOnly
                        : "—"}
                    </td>
                    <td>
                      {paths[p.i].length && paths[p.j].length
                        ? p.optionOnly
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
