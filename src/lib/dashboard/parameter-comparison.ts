import { snapshot, type Role, type Run } from "./model";

export type RelativeDifference = {
  percent: number | null;
  absolute: number | null;
  reason: "missing" | "zero-base" | null;
};
export function relativeDifference(
  value: number | null | undefined,
  optimal: number | null | undefined,
): RelativeDifference {
  if (
    value == null ||
    optimal == null ||
    !Number.isFinite(value) ||
    !Number.isFinite(optimal)
  )
    return { percent: null, absolute: null, reason: "missing" };
  const difference = value - optimal;
  const tolerance =
    Number.EPSILON *
    Math.max(Math.abs(value), Math.abs(optimal), Number.MIN_VALUE) *
    8;
  const absolute = Math.abs(difference) <= tolerance ? 0 : difference;
  if (optimal === 0)
    return absolute === 0
      ? { percent: 0, absolute: 0, reason: null }
      : { percent: null, absolute, reason: "zero-base" };
  const percent = (absolute / Math.abs(optimal)) * 100;
  return {
    percent: Number.isFinite(percent) ? percent : null,
    absolute,
    reason: Number.isFinite(percent) ? null : "zero-base",
  };
}
export type ParameterRow = {
  key: string;
  label: string;
  unit?: string;
  digits: number;
  values: Record<string, number | null>;
  recordedAt?: Record<string, number | null>;
  solutionAt?: Record<string, number | null>;
};
export function parameterRows(
  run: Run,
  roles: Role[],
  scope: "tree" | "results",
): ParameterRow[] {
  const states = roles.map((role) => snapshot(run, role.selection));
  type State = ReturnType<typeof snapshot>;
  const row = (
    key: string,
    label: string,
    digits: number,
    read: (s: State) => number | null | undefined,
    unit?: string,
    bound = false,
  ): ParameterRow => ({
    key,
    label,
    digits,
    unit,
    values: Object.fromEntries(
      roles.map((role, i) => [role.key, read(states[i]) ?? null]),
    ),
    ...(bound
      ? {
          recordedAt: Object.fromEntries(
            roles.map((role, i) => [role.key, states[i].obs?.t ?? null]),
          ),
        }
      : {}),
  });
  const gap = row("gap", "Gap", 6, (s) => s.obs?.gap, "%", true);
  const objective: ParameterRow = {
    ...row("objective", "Objective value", 9, (s) => s.incumbent?.objective),
    solutionAt: Object.fromEntries(
      roles.map((role, i) => [role.key, states[i].incumbent?.time_s ?? null]),
    ),
  };
  const objectives = [
    row(
      "f1",
      "F1",
      6,
      (s) => (s.incumbent ? s.incumbent.F1 / 1e9 : null),
      "10⁹",
    ),
    row("f2", "F2", 6, (s) => s.incumbent?.F2),
    row(
      "f3",
      "F3",
      6,
      (s) => (s.incumbent ? s.incumbent.F3 / 1e6 : null),
      "10⁶",
    ),
  ];
  return scope === "tree"
    ? [
        gap,
        row("lower", "Node lower bound", 9, (s) => s.node?.lower_bound),
        row(
          "dual",
          "Global dual bound",
          9,
          (s) => s.obs?.dual,
          undefined,
          true,
        ),
        objective,
        ...objectives,
      ]
    : [
        objective,
        gap,
        row("cells", "Selected grids", 0, (s) => s.incumbent?.n_cells),
        ...objectives,
      ];
}
