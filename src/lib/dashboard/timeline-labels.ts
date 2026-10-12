export type TimelineLabel = { key: string; anchor: number; width: number };
export type PlacedTimelineLabel = TimelineLabel & {
  left: number;
  centre: number;
  lane: number;
};
// Only labels move. Their anchor remains the exact time-scale coordinate.
export function placeTimelineLabels(
  items: TimelineLabel[],
  left: number,
  right: number,
): PlacedTimelineLabel[] {
  const ends: number[] = [];
  return [...items]
    .sort((a, b) => a.anchor - b.anchor || a.key.localeCompare(b.key))
    .map((item) => {
      const width = Math.min(item.width, right - left),
        start = Math.max(
          left,
          Math.min(right - width, item.anchor - width / 2),
        );
      let lane = ends.findIndex((end) => end + 10 <= start);
      if (lane < 0) lane = ends.length;
      ends[lane] = start + width;
      return { ...item, width, left: start, centre: start + width / 2, lane };
    });
}
