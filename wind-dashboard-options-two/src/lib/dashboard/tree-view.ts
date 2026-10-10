import * as d3 from "d3";
import type { Run } from "./model";

// Position is topological, not a measured quantity. A monotone focus transform
// allocates space to selected paths without dropping or reparenting any node.
export function treeCoordinates(
  run: Run,
  indices: number[],
  focus: boolean,
  vertical: boolean,
  width: number,
  height: number,
) {
  const xs = [...new Set(indices.map((i) => run.nodes.raw(i, "x")))].sort(
    (a, b) => a - b,
  );
  const ys = indices.map((i) => run.nodes.raw(i, "y"));
  const breadth = Math.max(160, vertical ? width : height),
    depth = Math.max(160, vertical ? height : width);
  const warpX =
    focus && xs.length > 1
      ? d3
          .scaleLinear()
          .domain(xs)
          .range(xs.map((_, i) => (i / (xs.length - 1)) * breadth))
      : null;
  const ymin = d3.min(ys) ?? 0,
    ymax = d3.max(ys) ?? 1;
  const warpY =
    focus && ymax > ymin
      ? d3.scaleLinear().domain([ymin, ymax]).range([0, depth])
      : null;
  const mx = (v: number) => (warpX ? warpX(v) : focus ? v - (xs[0] ?? 0) : v);
  const my = (v: number) => (warpY ? warpY(v) : v);
  return {
    x: (i: number) =>
      vertical ? mx(run.nodes.raw(i, "x")) : my(run.nodes.raw(i, "y")),
    y: (i: number) =>
      vertical ? my(run.nodes.raw(i, "y")) : mx(run.nodes.raw(i, "x")),
    inverse: (x: number, y: number): [number, number] => {
      const a = vertical ? x : y,
        b = vertical ? y : x;
      return [
        warpX ? warpX.invert(a) : focus ? a + (xs[0] ?? 0) : a,
        warpY ? warpY.invert(b) : b,
      ];
    },
  };
}
export function pathNodeRadius(points: [number, number][]) {
  let separation = Infinity;
  for (let i = 0; i < points.length; i++)
    for (let j = 0; j < i; j++)
      separation = Math.min(
        separation,
        Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1]),
      );
  return Math.max(0.75, Math.min(4.5, separation * 0.32));
}
