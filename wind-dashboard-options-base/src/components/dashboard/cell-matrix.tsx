import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { Run, Cell, Role, fmt, num } from "@/lib/dashboard/model";
import { cellMembershipText, COLORS } from "@/lib/dashboard/appearance";
import { useSize, type GridViewports } from "./chart-shared";
import { paintCell, memberColours } from "@/lib/dashboard/mixed-colours";

export function CellMatrix({
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
  const [hover, setHover] = useState<Cell | null>(null),
    [zoomLabel, setZoomLabel] = useState("100%");
  const controls = useRef({ zoom: (_v: number) => {}, fit: () => {} });
  useEffect(() => {
    const el = canvas.current;
    setHover(null);
    if (!el || !size.ready || !available || !run.layout.length) return;
    const w = size.w,
      h = compact ? 330 : 620,
      cols = 96,
      rows = Math.ceil(run.layout.length / cols),
      cell = Math.min((w - 24) / cols, (h - 24) / rows),
      dx = (w - cols * cell) / 2,
      dy = (h - rows * cell) / 2;
    const dpr = Math.min(window.devicePixelRatio || 1, 2),
      ctx = el.getContext("2d")!,
      palette = Object.fromEntries(roles.map((r) => [r.key, r.color]));
    el.width = w * dpr;
    el.height = h * dpr;
    el.style.width = w + "px";
    el.style.height = h + "px";
    const viewportKey = run.id + ":" + w + ":" + h,
      stored = memory.current.matrix;
    let transform =
      stored?.key === viewportKey
        ? d3.zoomIdentity.translate(stored.x, stored.y).scale(stored.k)
        : d3.zoomIdentity;
    const cells = [...run.layout].sort((a, b) => a.cell_id - b.cell_id);
    function draw() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#fafbfd";
      ctx.fillRect(0, 0, w, h);
      ctx.save();
      ctx.translate(transform.x, transform.y);
      ctx.scale(transform.k, transform.k);
      cells.forEach((c, i) => {
        const x = dx + (i % cols) * cell,
          y = dy + Math.floor(i / cols) * cell;
        paintCell(
          ctx,
          x,
          y,
          Math.max(0.4, cell - 0.3),
          Math.max(0.4, cell - 0.3),
          memberColours(c, color, palette),
        );
        if (cell * transform.k > 35) {
          ctx.fillStyle = c.b_w > 0.5 ? "#fff" : COLORS.ink;
          ctx.font = `${10 / transform.k}px Arial`;
          ctx.fillText(
            String(c.cell_id),
            x + 2 / transform.k,
            y + 12 / transform.k,
          );
        }
      });
      const pinned = cells.findIndex((c) => c.cell_id === pinnedCellId);
      if (pinned >= 0) {
        const x = dx + (pinned % cols) * cell,
          y = dy + Math.floor(pinned / cols) * cell,
          pad = 2 / transform.k;
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 4 / transform.k;
        ctx.strokeRect(x - pad, y - pad, cell + pad * 2, cell + pad * 2);
        ctx.strokeStyle = COLORS.ink;
        ctx.lineWidth = 1.6 / transform.k;
        ctx.strokeRect(x - pad, y - pad, cell + pad * 2, cell + pad * 2);
      }
      ctx.restore();
    }
    const zoom = d3
      .zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([1, 40])
      .extent([
        [0, 0],
        [w, h],
      ])
      .translateExtent([
        [0, 0],
        [w, h],
      ])
      .on("zoom", (e) => {
        transform = e.transform;
        memory.current.matrix = {
          key: viewportKey,
          x: transform.x,
          y: transform.y,
          k: transform.k,
        };
        setZoomLabel(Math.round(transform.k * 100) + "%");
        draw();
      });
    const sel = d3.select(el).call(zoom).on("dblclick.zoom", null);
    controls.current = {
      zoom: (f) => {
        sel.call(zoom.scaleBy, f);
      },
      fit: () => {
        sel.call(zoom.transform, d3.zoomIdentity);
      },
    };
    function pick(e: MouseEvent) {
      const [x, y] = transform.invert(d3.pointer(e, el)),
        col = Math.floor((x - dx) / cell),
        row = Math.floor((y - dy) / cell);
      return col >= 0 && col < cols && row >= 0 && row < rows
        ? cells[row * cols + col]
        : undefined;
    }
    sel
      .on("mousemove.inspect", (e) => setHover(pick(e) ?? null))
      .on("mouseleave.inspect", () => setHover(null))
      .on("click.inspect", (e) => {
        const c = pick(e);
        if (c && !e.defaultPrevented) onCell(c);
      });
    sel.call(zoom.transform, transform);
    return () => {
      sel.on(".zoom", null).on(".inspect", null);
    };
  }, [
    run,
    available,
    size.w,
    size.ready,
    onCell,
    color,
    roles,
    compact,
    memory,
    pinnedCellId,
  ]);
  return (
    <div className="cell-matrix">
      <div ref={host} className="matrix-wrap">
        {available ? (
          <canvas
            ref={canvas}
            role="img"
            aria-label={`${run.layout.length} cells in ID order. The same selection colours as the map.`}
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
          </div>
        )}
      </div>
      {available && (
        <div className="geo-footer">
          <span className="meta">
            {num(run.layout.length)} cells · ID order
          </span>
          <div className="zoom-controls" aria-label="Matrix zoom">
            <button
              aria-label="Zoom matrix out"
              onClick={() => controls.current.zoom(1 / 1.5)}
            >
              −
            </button>
            <output>{zoomLabel}</output>
            <button
              aria-label="Zoom matrix in"
              onClick={() => controls.current.zoom(1.5)}
            >
              +
            </button>
            <button onClick={() => controls.current.fit()}>Fit matrix</button>
          </div>
        </div>
      )}
    </div>
  );
}
