import type { CSSProperties } from "react";
import { fmt, signed, type Role } from "@/lib/dashboard/model";
import {
  relativeDifference,
  type ParameterRow,
} from "@/lib/dashboard/parameter-comparison";
import { Pencil } from "../icons";

type Props = {
  rows: ParameterRow[];
  roles: Role[];
  optimal: Role;
  view: "values" | "differences";
  focusedRole?: Role["key"] | null;
  onFocusRole?: (key: Role["key"]) => void;
  onEdit?: (key: "one" | "two") => void;
  solverStatus?: string;
};

export function ResultValueTable({
  rows,
  roles,
  optimal,
  view,
  focusedRole,
  onFocusRole,
  onEdit,
  solverStatus,
}: Props) {
  const objective = rows.find((r) => r.key === "objective");
  const displayRows = [...rows];
  if (objective?.solutionAt)
    displayRows.splice(3, 0, {
      key: "found",
      label: "Result found",
      unit: "s",
      digits: 6,
      values: objective.solutionAt,
    });
  const selected = roles.filter((r) => r.key !== optimal.key);
  const pairs = selected.map((role) => ({ first: role, second: optimal }));
  if (selected.length === 2)
    pairs.push({ first: selected[1], second: selected[0] });
  const columnProps = (role: Role) => ({
    "data-result-role": role.key,
    className:
      "result-choice-column" +
      (focusedRole === role.key ? " is-selected" : "") +
      (onFocusRole ? " is-interactive" : ""),
    style: { "--result-column-color": role.color } as CSSProperties,
    onClick: onFocusRole ? () => onFocusRole(role.key) : undefined,
  });
  const identity = (role: Role, withTime: boolean) => (
    <>
      {onFocusRole ? (
        <button
          type="button"
          className="result-column-choice"
          style={{ color: role.color }}
          aria-label={"View " + role.label + " result"}
          aria-pressed={focusedRole === role.key}
          aria-controls="result-view-panel"
          title="Show this result; click again for shared grids"
          onClick={(event) => {
            event.stopPropagation();
            onFocusRole(role.key);
          }}
        >
          <span>{role.label}</span>
          <span className="result-column-check" aria-hidden="true">
            {focusedRole === role.key ? "✓" : ""}
          </span>
        </button>
      ) : (
        <span style={{ color: role.color }}>{role.label}</span>
      )}
      {withTime && (
        <div className="result-column-time">
          <span
            title={
              role === optimal
                ? `Best recorded result at ${fmt(role.selection.t, 6)} s; solver status: ${solverStatus ?? "Not recorded"}`
                : `Exact time: ${fmt(role.selection.t, 6)} s`
            }
          >
            {role.selection.t.toLocaleString("en-AU", {
              maximumFractionDigits: 3,
            })}{" "}
            s
          </span>
          {onEdit && (role.key === "one" || role.key === "two") && (
            <button
              type="button"
              className="result-time-edit"
              aria-label={
                "Change Selected " + (role.key === "one" ? "1" : "2") + " time"
              }
              title="Change time on Overview"
              onClick={(event) => {
                event.stopPropagation();
                onEdit(role.key as "one" | "two");
              }}
            >
              <Pencil size={12} />
            </button>
          )}
        </div>
      )}
    </>
  );
  return (
    <div className="result-values-scroll">
      <table className="result-numeric-table">
        <caption className="sr-only">
          {view === "values"
            ? "Recorded result values. Select a column to view its layout; select it again for shared grids."
            : "Absolute differences: first result minus second result. Gap differences are percentage points. Select a named result in a column heading to view its layout."}
        </caption>
        <thead>
          <tr>
            <th scope="col">Parameter</th>
            {view === "values"
              ? roles.map((role) => (
                  <th key={role.key} scope="col" {...columnProps(role)}>
                    {identity(role, true)}
                  </th>
                ))
              : pairs.map((pair) => (
                  <th
                    key={pair.first.key + "-" + pair.second.key}
                    scope="col"
                    className="result-difference-heading"
                  >
                    {identity(pair.first, true)}
                    <span className="difference-pair-second">
                      <span aria-hidden="true">− </span>
                      {identity(pair.second, false)}
                    </span>
                  </th>
                ))}
          </tr>
        </thead>
        <tbody>
          {displayRows.map((row) => (
            <tr key={row.key}>
              <th scope="row">
                {row.label}
                {row.unit && (
                  <small>
                    {view === "differences" && row.unit === "%"
                      ? "pp"
                      : row.unit}
                  </small>
                )}
              </th>
              {view === "values"
                ? roles.map((role) => (
                    <td
                      key={role.key}
                      {...columnProps(role)}
                      title={
                        row.values[role.key] == null
                          ? "Not recorded"
                          : String(row.values[role.key])
                      }
                    >
                      {fmt(row.values[role.key], row.digits)}
                      {row.recordedAt?.[role.key] != null && (
                        <small>at {fmt(row.recordedAt[role.key], 3)} s</small>
                      )}
                    </td>
                  ))
                : pairs.map((pair) => {
                    const difference = relativeDifference(
                      row.values[pair.first.key],
                      row.values[pair.second.key],
                    ).absolute;
                    return (
                      <td
                        key={pair.first.key + "-" + pair.second.key}
                        title={
                          difference == null
                            ? "Not recorded"
                            : String(difference)
                        }
                      >
                        {signed(difference, row.digits)}
                      </td>
                    );
                  })}
            </tr>
          ))}
        </tbody>
      </table>
      {view === "differences" && pairs.length === 0 && (
        <p className="single-reference-note">
          Select another time to show differences.
        </p>
      )}
    </div>
  );
}
