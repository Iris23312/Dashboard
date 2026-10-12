import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { Cell, Run, Role, fmt, num } from "@/lib/dashboard/model";
import { cellMembershipText, COLORS } from "@/lib/dashboard/appearance";
import { useSize, type GridViewports } from "./chart-shared";
import { paintCell, memberColours } from "@/lib/dashboard/mixed-colours";

export function GeographicGrid({
  run,
  available,
  onCell,
  color = COLORS.one,
  roles = [],
  kind = "selection",
  compact = false,
  viewports,
  pinnedCellId,
}: {
  run: Run;
  available: boolean;
  onCell: (cell: Cell) => void;
  color?: string;
  roles?: Role[];
  kind?: "selection" | "membership";
  compact?: boolean;
  viewports?: React.RefObject<GridViewports>;
  pinnedCellId?: number | null;
}) {
  const host = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    size = useSize(host);
  const localViewports = useRef<GridViewports>({}),
    memory = viewports ?? localViewports;
  const width = size.w,
    height = compact ? 330 : 620;
  const [hover, setHover] = useState<Cell | null>(null),
    [zoomLabel, setZoomLabel] = useState("100%");
  const controls = useRef({ zoom: (_factor: number) => {}, fit: () => {} });
  const mapped = run.layout.filter(
    (c) => Number.isFinite(c.longitude) && Number.isFinite(c.latitude),
  ).length;
  useEffect(() => {
    const el = canvas.current;
    setHover(null);
    if (!el || !size.ready || !available) return;
    const cells = run.layout.filter(
      (c) => Number.isFinite(c.longitude) && Number.isFinite(c.latitude),
    );
    if (!cells.length) return;
    const projection = d3.geoMercator().fitExtent(
      [
        [20, 20],
        [width - 20, height - 20],
      ],
      {
        type: "MultiPoint",
        coordinates: cells.map((c) => [c.longitude!, c.latitude!]),
      },
    );
    const points = cells.map((cell) => ({
      cell,
      point: projection([cell.longitude!, cell.latitude!])!,
    }));
    const tree = d3
      .quadtree<(typeof points)[number]>()
      .x((p) => p.point[0])
      .y((p) => p.point[1])
      .addAll(points);
    const palette = Object.fromEntries(roles.map((r) => [r.key, r.color]));
    const sample = points
      .slice(0, 50)
      .map((p) =>
        d3.min(points, (q) =>
          q === p
            ? Infinity
            : Math.hypot(q.point[0] - p.point[0], q.point[1] - p.point[1]),
        )!,
      );
    const glyph = Math.max(0.8, (d3.median(sample) ?? 3) * 0.88),
      dpr = Math.min(window.devicePixelRatio || 1, 2);
    el.width = width * dpr;
    el.height = height * dpr;
    el.style.width = width + "px";
    el.style.height = height + "px";
    const ctx = el.getContext("2d")!;
    const viewportKey = run.id + ":" + width + ":" + height,
      stored = memory.current.map;
    let transform =
      stored?.key === viewportKey
        ? d3.zoomIdentity.translate(stored.x, stored.y).scale(stored.k)
        : d3.zoomIdentity;
    function draw() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#fafbfd";
      ctx.fillRect(0, 0, width, height);
      ctx.save();
      ctx.translate(transform.x, transform.y);
      ctx.scale(transform.k, transform.k);
      for (const {
        cell,
        point: [x, y],
      } of points) {
        paintCell(
          ctx,
          x - glyph / 2,
          y - glyph / 2,
          glyph,
          glyph,
          memberColours(cell, color, palette),
        );
      }
      const pinned = points.find((p) => p.cell.cell_id === pinnedCellId);
      if (pinned) {
        const [x, y] = pinned.point,
          r = Math.max(glyph / 2 + 1 / transform.k, 5 / transform.k);
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 4 / transform.k;
        ctx.strokeRect(x - r, y - r, r * 2, r * 2);
        ctx.strokeStyle = COLORS.ink;
        ctx.lineWidth = 1.6 / transform.k;
        ctx.strokeRect(x - r, y - r, r * 2, r * 2);
      }
      ctx.restore();
    }
    const zoom = d3
      .zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([1, 40])
      .extent([
        [0, 0],
        [width, height],
      ])
      .translateExtent([
        [0, 0],
        [width, height],
      ])
      .on("zoom", (e) => {
        transform = e.transform;
        memory.current.map = {
          key: viewportKey,
          x: transform.x,
          y: transform.y,
          k: transform.k,
        };
        setZoomLabel(Math.round(transform.k * 100) + "%");
        draw();
      });
    const selection = d3.select(el).call(zoom).on("dblclick.zoom", null);
    controls.current = {
      zoom: (factor) => {
        selection.call(zoom.scaleBy, factor);
      },
      fit: () => {
        selection.call(zoom.transform, d3.zoomIdentity);
      },
    };
    const pick = (e: MouseEvent) => {
      const [x, y] = transform.invert(d3.pointer(e, el));
      return tree.find(x, y, Math.max(glyph * 0.8, 7 / transform.k))?.cell;
    };
    selection
      .on("mousemove.inspect", (e) => setHover(pick(e) ?? null))
      .on("mouseleave.inspect", () => setHover(null))
      .on("click.inspect", (e) => {
        const cell = pick(e);
        if (cell && !e.defaultPrevented) onCell(cell);
      });
    selection.call(zoom.transform, transform);
    return () => {
      selection.on(".zoom", null).on(".inspect", null);
    };
  }, [
    run,
    available,
    width,
    height,
    size.ready,
    onCell,
    color,
    roles,
    memory,
    pinnedCellId,
  ]);
  return (
    <div className="geographic-grid">
      <div ref={host} className="geo-canvas-wrap">
        {available ? (
          <canvas
            ref={canvas}
            role="img"
            aria-label={`${num(mapped)} geographic cell centres. Click a cell for its source values.`}
          />
        ) : (
          <div className="empty-chart">
            No integer result recorded at this time.
          </div>
        )}
        {hover && available && (
          <div className="chart-tooltip">
            Cell {hover.cell_id}
            <br />
            {kind === "membership"
              ? cellMembershipText(hover, roles)
              : `t_w ${fmt(hover.t_w, 6)} · b_w ${hover.b_w}`}
            <br />
            {fmt(hover.latitude, 6)}, {fmt(hover.longitude, 6)}
          </div>
        )}
      </div>
      {available && (
        <div className="geo-footer">
          <span className="meta">
            {num(mapped)} cell centres
            {mapped < run.layout.length
              ? ` · ${run.layout.length - mapped} without coordinates`
              : ""}
          </span>
          <div className="zoom-controls" aria-label="Map zoom">
            <button
              aria-label="Zoom map out"
              onClick={() => controls.current.zoom(1 / 1.5)}
            >
              −
            </button>
            <output>{zoomLabel}</output>
            <button
              aria-label="Zoom map in"
              onClick={() => controls.current.zoom(1.5)}
            >
              +
            </button>
            <button onClick={() => controls.current.fit()}>Fit map</button>
          </div>
        </div>
      )}
    </div>
  );
}
