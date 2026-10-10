import { useMemo, useRef, useState } from "react";
import {
  Run,
  Cell,
  Role,
  Selection,
  snapshot,
  fmt,
  num,
} from "@/lib/dashboard/model";
import { COLORS, cellMembershipText } from "@/lib/dashboard/appearance";
import { mixedSwatch } from "@/lib/dashboard/mixed-colours";
import { CellMatrix } from "./cell-matrix";
import { GeographicGrid } from "./spatial-charts";
import type { GridViewports } from "./chart-shared";
const NO_ROLES: Role[] = [];
export function Card({
  title,
  actions,
  children,
  className = "",
  color,
}: {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  color?: string;
}) {
  return (
    <section
      className={"panel " + className}
      style={color ? { borderTop: "3px solid " + color } : undefined}
    >
      <header className="card-header">
        <h2 className="card-title" style={color ? { color } : undefined}>
          {title}
        </h2>
        {actions && <div className="card-actions">{actions}</div>}
      </header>
      {children}
    </section>
  );
}
export function Fields({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="value-list">
      {items.map(([k, v]) => (
        <div className="detail-pair" key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
export function GridRecord({
  cell,
  layouts,
  roles,
}: {
  cell: Cell;
  layouts: (Cell[] | null)[];
  roles: Role[];
}) {
  const fields: [keyof Cell, string][] = [
    ["cell_id", "Cell ID"],
    ["t_w", "t_w"],
    ["b_w", "b_w"],
    ["latitude", "Latitude / degrees"],
    ["longitude", "Longitude / degrees"],
  ];
  const value = (record: Cell | undefined, key: keyof Cell) =>
    record?.[key] == null ? "Not supplied" : String(record[key]);
  if (!cell.membership)
    return (
      <Fields items={fields.map(([key, label]) => [label, value(cell, key)])} />
    );
  const records = layouts.map((layout) =>
    layout?.find((c) => c.cell_id === cell.cell_id),
  );
  return (
    <>
      <p className="cell-membership-summary">
        {cellMembershipText(cell, roles)}
      </p>
      <div className="comparison-table-scroll">
        <table className="cell-record-comparison">
          <thead>
            <tr>
              <th>Field</th>
              {roles.map((r) => (
                <th key={r.key} style={{ color: r.color }}>
                  {r.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fields.map(([key, label]) => (
              <tr key={key}>
                <th scope="row">{label}</th>
                {records.map((record, i) => (
                  <td key={i}>{value(record, key)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
function GridLegend({
  color,
  label,
  roles,
  membership,
  cells,
}: {
  color: string;
  label: string;
  roles: Role[];
  membership: boolean;
  cells: Cell[] | null;
}) {
  const groups = new Map<string, { keys: string[]; count: number }>();
  if (membership)
    for (const c of cells ?? []) {
      if (!c.members?.length) continue;
      const keys = roles
          .filter((r) => c.members!.includes(r.key))
          .map((r) => r.key),
        id = keys.join("|"),
        old = groups.get(id);
      if (old) old.count++;
      else groups.set(id, { keys, count: 1 });
    }
  const items = [...groups.values()].sort(
    (a, b) =>
      a.keys.length - b.keys.length ||
      a.keys.join().localeCompare(b.keys.join()),
  );
  return (
    <div className="grid-legend">
      {membership ? (
        items.map((g) => {
          const owners = roles.filter((r) => g.keys.includes(r.key));
          return (
            <span key={g.keys.join("|")}>
              <i
                style={{ background: mixedSwatch(owners.map((r) => r.color)) }}
              />
              {owners.map((r) => r.label).join(" + ")}
              {owners.length === 1 ? " only" : ""}
              <b>{num(g.count)}</b>
            </span>
          );
        })
      ) : (
        <span>
          <i style={{ background: color }} />
          {label}
        </span>
      )}
      <span>
        <i style={{ background: COLORS.empty }} />
        Not selected
      </span>
    </div>
  );
}
export function ResultGraphic({
  run,
  cells,
  onCell,
  compact = false,
  color = COLORS.current,
  label = "Selected grids",
  roles = NO_ROLES,
  kind = "selection",
  view: controlledView,
  viewports: externalViewports,
  pinnedCellId,
}: {
  run: Run;
  cells: Cell[] | null;
  onCell: (c: Cell) => void;
  compact?: boolean;
  color?: string;
  label?: string;
  roles?: Role[];
  kind?: "selection" | "membership";
  view?: "map" | "matrix";
  viewports?: React.RefObject<GridViewports>;
  pinnedCellId?: number | null;
}) {
  const localViewports = useRef<GridViewports>({}),
    viewports = externalViewports ?? localViewports;
  const [localView, setView] = useState<"map" | "matrix">("map"),
    view = controlledView ?? localView;
  const display = useMemo(
    () => ({ ...run, layout: cells ?? run.layout }),
    [run, cells],
  );
  return (
    <div className="result-graphic">
      {!controlledView && (
        <div className="segmented">
          <button
            className={view === "map" ? "active" : ""}
            onClick={() => setView("map")}
          >
            Map
          </button>
          <button
            className={view === "matrix" ? "active" : ""}
            onClick={() => setView("matrix")}
          >
            Cell ID matrix
          </button>
        </div>
      )}
      <GridLegend
        color={color}
        label={label}
        roles={roles}
        membership={kind === "membership"}
        cells={cells}
      />
      {view === "map" ? (
        <GeographicGrid
          run={display}
          available={cells != null}
          onCell={onCell}
          compact={compact}
          kind={kind}
          color={color}
          roles={roles}
          viewports={viewports}
          pinnedCellId={pinnedCellId}
        />
      ) : (
        <CellMatrix
          run={display}
          available={cells != null}
          onCell={onCell}
          compact={compact}
          kind={kind}
          color={color}
          roles={roles}
          viewports={viewports}
          pinnedCellId={pinnedCellId}
        />
      )}
    </div>
  );
}
export function ResultValues({
  run,
  selection,
}: {
  run: Run;
  selection: Selection;
}) {
  const i = snapshot(run, selection).incumbent;
  return (
    <Fields
      items={[
        ["Selected time", fmt(selection.t, 6) + " s"],
        ["Result recorded", i ? fmt(i.time_s, 6) + " s" : "Not recorded"],
        ["Objective", fmt(i?.objective, 9)],
        ["F1", fmt(i?.F1, 3)],
        ["F2", fmt(i?.F2, 6)],
        ["F3", fmt(i?.F3, 3)],
        ["Selected cells", num(i?.n_cells)],
      ]}
    />
  );
}
