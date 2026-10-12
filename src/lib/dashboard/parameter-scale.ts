import { max, scaleLinear } from "d3";
export function percentageScaleMaximum(values: (number | null)[]) {
  const magnitude =
    max(
      values.filter((v): v is number => v != null && Number.isFinite(v)),
      (v) => Math.abs(v),
    ) ?? 0;
  return magnitude > 0
    ? scaleLinear().domain([0, magnitude]).nice(3).domain()[1]
    : 1;
}
