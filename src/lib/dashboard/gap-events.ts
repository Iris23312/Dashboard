import {
  bestSelection,
  type Observation,
  type Role,
  type Run,
  type Selection,
} from "./model";
import { COLORS, viewingRoles } from "./appearance";

export const MIN_NOTICEABLE_DROP_PERCENT = 0.5;
export type GapDrop = {
  t: number;
  previousTime: number;
  before: number;
  after: number;
  delta: number;
  relativePercent: number;
  selection: Selection;
};
const cache = new WeakMap<Run, GapDrop[]>();

// A noticeable event reduces the PREVIOUS gap by at least 0.5% (relative),
// not 0.5 percentage points. Keep the two most recent qualifying events,
// never the historical largest. No synthetic events across missing data/restarts.
export function nearbyGapDrops(run: Run, until: number): GapDrop[] {
  let index = cache.get(run);
  if (!index) {
    index = [];
    let previous: Observation | null = null,
      previousRestart: number | null = null;
    const rows = run.gapSeries;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i + 1]?.t === rows[i].t) continue;
      const row = rows[i];
      if (
        !Number.isFinite(row.t) ||
        row.gap == null ||
        !Number.isFinite(row.gap)
      ) {
        previous = null;
        previousRestart = null;
        continue;
      }
      const restart: number =
        row.node_id == null
          ? Number(run.meta.n_runs ?? previousRestart ?? 1)
          : run.nodes.raw(row.node_id - 1, "run");
      if (
        previous &&
        previousRestart === restart &&
        row.t > previous.t &&
        previous.gap! > 0
      ) {
        const delta = previous.gap! - row.gap,
          relativePercent = (delta / previous.gap!) * 100;
        if (delta > 0 && relativePercent >= MIN_NOTICEABLE_DROP_PERCENT) {
          index.push({
            t: row.t,
            previousTime: previous.t,
            before: previous.gap!,
            after: row.gap,
            delta,
            relativePercent,
            selection: {
              t: row.t,
              ...(row.node_id == null ? {} : { nodeId: row.node_id }),
            },
          });
        }
      }
      previous = row;
      previousRestart = restart;
    }
    cache.set(run, index);
  }
  let left = 0,
    right = index.length;
  while (left < right) {
    const mid = (left + right) >>> 1;
    if (index[mid].t <= until + 1e-9) left = mid + 1;
    else right = mid;
  }
  return index.slice(Math.max(0, left - 2), left).reverse(); // D1 = nearest
}

export function timelinePathRoles(
  run: Run,
  current: Selection,
  preview: Selection | null = null,
): Role[] {
  return [
    ...viewingRoles(run, current, preview),
    {
      key: "best",
      label: "Optimal",
      color: COLORS.best,
      selection: bestSelection(run),
    },
    {
      key: "final",
      label: "Final",
      color: COLORS.final,
      selection: { t: run.finalResultTime },
    },
    ...nearbyGapDrops(run, current.t).map((drop, i): Role => ({
      key: i === 0 ? "drop-one" : "drop-two",
      label: `D${i + 1}`,
      color: i === 0 ? COLORS.drop : COLORS.dropSecond,
      selection: drop.selection,
    })),
  ];
}
