import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { Run, Role, Cell, ancestors, snapshot } from "@/lib/dashboard/model";
import { treeCoordinates } from "@/lib/dashboard/tree-view";
import { COLORS } from "@/lib/dashboard/appearance";
import {
  paintCell,
  memberColours,
  paintPathEdge,
} from "@/lib/dashboard/mixed-colours";

export function ViewSwitcher({
  run,
  roles,
  cells,
  destination,
  onClick,
  color = COLORS.one,
}: {
  run: Run;
  roles: Role[];
  cells: Cell[] | null;
  destination: "tree" | "results";
  onClick: () => void;
  color?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const c = el.getContext("2d")!,
      w = 116,
      h = 67,
      dpr = Math.min(window.devicePixelRatio || 1, 2);
    el.width = w * dpr;
    el.height = h * dpr;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = "#f7f7fb";
    c.fillRect(0, 0, w, h);
    if (destination === "results") {
      if (!cells) return;
      const grid = cells,
        points = grid.filter(
          (p) => Number.isFinite(p.longitude) && Number.isFinite(p.latitude),
        ),
        palette = Object.fromEntries(roles.map((r) => [r.key, r.color]));
      if (!points.length) return;
      const project = d3.geoMercator().fitExtent(
        [
          [7, 4],
          [w - 7, h - 4],
        ],
        {
          type: "MultiPoint",
          coordinates: points.map((p) => [p.longitude!, p.latitude!]),
        },
      );
      for (const cell of points) {
        const [x, y] = project([cell.longitude!, cell.latitude!])!;
        paintCell(c, x, y, 1.3, 1.3, memberColours(cell, color, palette));
      }
    } else {
      const members = new Map<number, number[]>();
      roles.forEach((role, j) =>
        ancestors(run.nodes, snapshot(run, role.selection).nodeId).forEach(
          (n) =>
            members.set(n.node_id - 1, [
              ...(members.get(n.node_id - 1) ?? []),
              j,
            ]),
        ),
      );
      const indices = [...members.keys()];
      if (!indices.length) return;
      const p = treeCoordinates(run, indices, true, true, w - 20, h - 14),
        x = d3
          .scaleLinear()
          .domain(d3.extent(indices, p.x) as [number, number])
          .range([10, w - 10]),
        y = d3
          .scaleLinear()
          .domain(d3.extent(indices, p.y) as [number, number])
          .range([7, h - 7]);
      for (const [i, list] of members) {
        const parent = run.nodes.raw(i, "parent_id");
        if (Number.isNaN(parent)) continue;
        paintPathEdge(
          c,
          [x(p.x(parent - 1)), y(p.y(parent - 1))],
          [x(p.x(i)), y(p.y(i))],
          list.map((j) => roles[j].color),
          1.8,
        );
      }
    }
  }, [run, roles, cells, destination, color]);
  return (
    <button
      className="view-thumbnail"
      onClick={onClick}
      aria-label={
        destination === "results"
          ? "Switch to result comparison"
          : "Switch to whole search tree"
      }
      title={
        destination === "results"
          ? "View result comparison"
          : "View whole search tree"
      }
    >
      <canvas ref={canvas} aria-hidden="true" />
      <strong>
        {destination === "results" ? "Results" : "Search tree"}{" "}
        <span aria-hidden="true">↗</span>
      </strong>
    </button>
  );
}
