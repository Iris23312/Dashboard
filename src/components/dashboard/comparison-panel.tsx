import { useMemo, useState } from "react";
import { Run, Selection, fmt, Role } from "@/lib/dashboard/model";
import { comparisonRoles } from "@/lib/dashboard/appearance";
import { parameterRows } from "@/lib/dashboard/parameter-comparison";
import { Grid2X2, Columns } from "../icons";
import { ParameterBars } from "./parameter-bars";
import { ResultValueTable } from "./result-value-table";

export type ResultDisplay = "compare" | "all" | Role["key"];
export function ComparisonPanel({
  run,
  one,
  two,
  includeBase,
  onEdit,
  scope = "tree",
  onFocusRole,
  focusedRole,
  display = "compare",
  onDisplayChange,
}: {
  run: Run;
  one: Selection | null;
  two: Selection | null;
  includeBase: boolean;
  onEdit: (role: "one" | "two") => void;
  scope?: "tree" | "results";
  onFocusRole?: (key: Role["key"]) => void;
  focusedRole?: Role["key"] | null;
  display?: ResultDisplay;
  onDisplayChange?: (value: ResultDisplay) => void;
}) {
  const [tableView, setTableView] = useState<"values" | "differences">(
    "values",
  );
  const columns = useMemo(
    () => comparisonRoles(run, one, two, includeBase),
    [run, one, two, includeBase],
  );
  const optimal = columns.find((c) => c.label === "Optimal")!;
  const left = columns.find((c) => c.key === "one" && c !== optimal),
    right = columns.find((c) => c.key === "two" && c !== optimal);
  const rows = useMemo(
    () => parameterRows(run, columns, scope),
    [run, columns, scope],
  );
  const ordered = [left, optimal, right].filter((r): r is Role => !!r);
  return (
    <div className="comparison-panel visual-comparison-panel">
      <header className="comparison-panel-heading">
        <h3>{scope === "results" ? "Result comparison" : "Time & gap"}</h3>
        {scope === "results" && (
          <div className="segmented" aria-label="Result table values">
            <button
              type="button"
              className={tableView === "values" ? "active" : ""}
              aria-pressed={tableView === "values"}
              onClick={() => setTableView("values")}
            >
              Values
            </button>
            <button
              type="button"
              className={tableView === "differences" ? "active" : ""}
              aria-pressed={tableView === "differences"}
              onClick={() => setTableView("differences")}
            >
              Differences
            </button>
          </div>
        )}
      </header>
      {onDisplayChange && (
        <div className="table-display-controls" aria-label="Result arrangement">
          <button
            aria-pressed={display === "compare"}
            onClick={() => onDisplayChange("compare")}
            title="Show shared and unique grids"
          >
            <Grid2X2 size={16} />
            Shared grids
          </button>
          <button
            aria-pressed={display === "all"}
            onClick={() => onDisplayChange("all")}
            title="Show all layouts side by side"
          >
            <Columns size={16} />
            All layouts
          </button>
        </div>
      )}
      {scope === "tree" && (
        <div
          className={
            "comparison-identity-row parameter-columns" +
            (!left ? " no-left" : "") +
            (!right ? " no-right" : "")
          }
        >
          {ordered.map((role) => (
            <div
              className={
                "comparison-identity" +
                (role === optimal ? " optimal-identity" : "") +
                (focusedRole === role.key ? " is-focused" : "")
              }
              key={role.key}
              style={{ color: role.color, borderTopColor: role.color }}
            >
              {onFocusRole ? (
                <button
                  className="identity-name"
                  aria-label={"View " + role.label + " result"}
                  aria-pressed={focusedRole === role.key}
                  title="Click to show this layout; click again for shared grids"
                  onClick={() => onFocusRole(role.key)}
                >
                  {role.label}
                </button>
              ) : (
                <strong className="identity-name">{role.label}</strong>
              )}
              {role.key === "one" || role.key === "two" ? (
                <button
                  className="identity-time"
                  aria-label={
                    "Change Selected " +
                    (role.key === "one" ? "1" : "2") +
                    " time"
                  }
                  title={`Exact time: ${fmt(role.selection.t, 6)} s. Click to change on Overview.`}
                  onClick={() => onEdit(role.key as "one" | "two")}
                >
                  {role.selection.t.toLocaleString("en-AU", {
                    maximumFractionDigits: 3,
                  })}{" "}
                  s
                </button>
              ) : (
                <span
                  className="identity-time"
                  title={`Best recorded result at ${fmt(role.selection.t, 6)} s; solver status: ${run.meta.status}`}
                >
                  {role.selection.t.toLocaleString("en-AU", {
                    maximumFractionDigits: 3,
                  })}{" "}
                  s
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      {scope === "results" ? (
        <ResultValueTable
          rows={rows}
          roles={ordered}
          optimal={optimal}
          view={tableView}
          focusedRole={focusedRole}
          onFocusRole={onFocusRole}
          onEdit={onEdit}
          solverStatus={run.meta.status}
        />
      ) : (
        <ParameterBars
          rows={rows}
          optimal={optimal}
          left={left}
          right={right}
        />
      )}
      {!two && (
        <button className="add-selection" onClick={() => onEdit("two")}>
          + Add Selected 2
        </button>
      )}
    </div>
  );
}
