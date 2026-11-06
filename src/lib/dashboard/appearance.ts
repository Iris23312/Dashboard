import {
  optimalSelection,
  type Cell,
  type Role,
  type Run,
  type Selection,
} from "./model";

// Role identity is categorical. The same fill is used by maps, matrices and paths.
export const COLORS = {
  ink: "#29364b",
  line: "#ccd5df",
  gap: "#7851b8",
  current: "#7851b8",
  one: "#7851b8",
  two: "#b95412",
  optimal: "#147d64",
  drop: "#236c98",
  dropSecond: "#5a7596",
  empty: "#e9edf1",
  capacity: "#7851b8",
};
export const OPTIMAL_REFERENCE_LABEL = "Optimal";

// Green identifies the completed run endpoint, independently of solution discovery.
export function viewingRoles(
  run: Run,
  current: Selection,
  preview: Selection | null = null,
): Role[] {
  return [
    {
      key: "one",
      selection: current,
      label: "Selected time",
      color: isOptimalTime(run, current) ? COLORS.optimal : COLORS.current,
    },
    ...(preview
      ? [
          {
            key: "two" as const,
            selection: preview,
            label: "Preview time",
            color: isOptimalTime(run, preview) ? COLORS.optimal : COLORS.two,
          },
        ]
      : []),
  ];
}
export function isOptimalTime(run: Run, selection: Selection) {
  return Math.abs(selection.t - run.optimal.time_s) < 1e-9;
}
export function roleFor(
  run: Run,
  key: Role["key"],
  selection: Selection,
): Role {
  const base = isOptimalTime(run, selection);
  return {
    key,
    selection: base ? optimalSelection(run) : selection,
    label: base ? OPTIMAL_REFERENCE_LABEL : key === "two" ? "Selected 2" : "Selected 1",
    color: base ? COLORS.optimal : key === "two" ? COLORS.two : COLORS.one,
  };
}
export function comparisonRoles(
  run: Run,
  one: Selection | null,
  two: Selection | null,
  includeBase: boolean,
): Role[] {
  const roles: Role[] = [];
  if (one) roles.push(roleFor(run, "one", one));
  if (two && !(one && isOptimalTime(run, one) && isOptimalTime(run, two)))
    roles.push(roleFor(run, "two", two));
  if (includeBase && !roles.some((r) => isOptimalTime(run, r.selection)))
    roles.push(roleFor(run, "optimal", optimalSelection(run)));
  return roles;
}
export function cellMembershipText(cell: Cell, roles: Role[]) {
  return cell.members?.length
    ? cell.members
        .map((k) => roles.find((r) => r.key === k)?.label ?? k)
        .join(" + ")
    : "Not selected";
}
