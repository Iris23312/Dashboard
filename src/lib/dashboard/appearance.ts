import {
  bestSelection,
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
  best: "#147d64",
  final: "#be3348",
  drop: "#236c98",
  dropSecond: "#5a7596",
  empty: "#e9edf1",
  capacity: "#7851b8",
};
// Overview keeps neutral labels: purple normally, green at the Optimal discovery time.
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
      color: isBaseTime(run, current) ? COLORS.best : COLORS.current,
    },
    ...(preview
      ? [
          {
            key: "two" as const,
            selection: preview,
            label: "Preview time",
            color: isBaseTime(run, preview) ? COLORS.best : COLORS.two,
          },
        ]
      : []),
  ];
}
export function isBaseTime(run: Run, selection: Selection) {
  return Math.abs(selection.t - run.best.time_s) < 1e-9;
}
export function roleFor(
  run: Run,
  key: Role["key"],
  selection: Selection,
): Role {
  const base = isBaseTime(run, selection);
  return {
    key,
    selection: base ? bestSelection(run) : selection,
    label: base ? "Optimal" : key === "two" ? "Selected 2" : "Selected 1",
    color: base ? COLORS.best : key === "two" ? COLORS.two : COLORS.one,
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
  if (two && !(one && isBaseTime(run, one) && isBaseTime(run, two)))
    roles.push(roleFor(run, "two", two));
  if (includeBase && !roles.some((r) => r.label === "Optimal"))
    roles.push(roleFor(run, "best", bestSelection(run)));
  return roles;
}
export function cellMembershipText(cell: Cell, roles: Role[]) {
  return cell.members?.length
    ? cell.members
        .map((k) => roles.find((r) => r.key === k)?.label ?? k)
        .join(" + ")
    : "Not selected";
}
