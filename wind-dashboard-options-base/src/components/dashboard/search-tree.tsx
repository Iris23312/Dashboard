import { ComparisonTableOverlay } from "./comparison-table-overlay";
import { useId, useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import {
  Run,
  NodeRecord,
  Role,
  Selection,
  ancestors,
  snapshot,
  nodeEncoding,
  nodeInfoFields,
  nodeViewTime,
  fmt,
  num,
} from "@/lib/dashboard/model";
import { treeCoordinates, pathNodeRadius } from "@/lib/dashboard/tree-view";
import { COLORS, useSize } from "./chart-shared";
import { Maximize, Minimize } from "../icons";
import {
  mixedSwatch,
  paintPathEdge,
  paintNodeSectors,
} from "@/lib/dashboard/mixed-colours";
type Point = { node: NodeRecord; x: number; y: number };
export function NodeKey({
  missing = false,
  filled = false,
  unknown = false,
  root = false,
}: {
  missing?: boolean;
  filled?: boolean;
  unknown?: boolean;
  root?: boolean;
}) {
  const path = d3
    .symbol()
    .type(unknown ? d3.symbolDiamond : d3.symbolCircle)
    .size(65)();
  return (
    <svg className="node-glyph-key" viewBox="0 0 24 24" aria-hidden="true">
      <g transform="translate(12,12)">
        <path
          d={path ?? ""}
          fill={filled ? "currentColor" : "#fff"}
          stroke="currentColor"
          strokeWidth="1.6"
        />
        {missing && (
          <path d="M -7 7 L 7 -7" stroke="currentColor" strokeWidth="2" />
        )}
        {root && (
          <circle r="9" fill="none" stroke="currentColor" strokeWidth="1.3" />
        )}
      </g>
    </svg>
  );
}
export function NodeDetailCard({
  node,
  onViewTime,
  onClose,
  left = 8,
  top = 8,
  compact = false,
}: {
  node: NodeRecord;
  onViewTime: (s: Selection) => void;
  onClose: () => void;
  left?: number;
  top?: number;
  compact?: boolean;
}) {
  const time = nodeViewTime(node);
  return (
    <div
      className={"node-detail " + (compact ? "node-detail-compact" : "")}
      style={{ left, top }}
    >
      <header>
        <strong>
          {node.parent_id == null ? "Root" : "Node"} · {node.node_id}
        </strong>
        <button aria-label="Close node details" onClick={onClose}>
          ×
        </button>
      </header>
      <dl>
        {nodeInfoFields(node)
          .slice(0, compact ? 4 : 7)
          .map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
      </dl>
      <div className="node-detail-action">
        <button
          className="primary"
          disabled={time == null}
          onClick={() => {
            if (time != null) onViewTime({ t: time, nodeId: node.node_id });
          }}
        >
          View time
        </button>
        {time == null ? (
          <span>No time recorded</span>
        ) : (
          node.time_s == null && <span>Linked event · {fmt(time, 6)} s</span>
        )}
      </div>
    </div>
  );
}
export function SearchTree({
  run,
  roles,
  onViewTime,
  preview = false,
  children,
}: {
  run: Run;
  roles: Role[];
  onViewTime: (selection: Selection) => void;
  preview?: boolean;
  children?: React.ReactNode;
}) {
  const plot = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    overlay = useRef<SVGSVGElement>(null),
    size = useSize(plot);
  const tableId = useId();
  const [orientation, setOrientation] = useState("vertical"),
    [expanded, setExpanded] = useState(false),
    [tableOpen, setTableOpen] = useState(true);
  const [mode, setMode] = useState<"focus" | "whole">("whole"),
    [hover, setHover] = useState<Point | null>(null),
    [picked, setPicked] = useState<Point | null>(null),
    [zoom, setZoom] = useState("100%");
  const [progress, setProgress] = useState<number | null>(0);
  const controls = useRef({
      fit: () => {},
      focus: () => {},
      root: () => {},
      zoom: (_v: number) => {},
    }),
    store = run.nodes;
  const paths = useMemo(
    () =>
      roles.map((role) => ({
        role,
        path: ancestors(store, snapshot(run, role.selection).nodeId),
      })),
    [roles, run, store],
  );
  const roots = useMemo(() => {
    const list: number[] = [];
    for (let i = 0; i < store.length; i++)
      if (Number.isNaN(store.raw(i, "parent_id"))) list.push(i);
    return list;
  }, [store]);
  useEffect(() => {
    setPicked(null);
    setHover(null);
    setMode("whole");
  }, [roles, run]);
  useEffect(() => {
    if (!expanded) return;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = old;
    };
  }, [expanded]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (picked) {
          setPicked(null);
          setHover(null);
        } else setExpanded(false);
      }
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [picked]);
  useEffect(() => {
    const el = canvas.current,
      svg = overlay.current;
    if (!el || !svg || !store.length) return;
    const w = size.w,
      h = size.h,
      dpr = Math.min(window.devicePixelRatio || 1, 2),
      rail = preview ? 112 : 152,
      vertical = orientation === "vertical";
    el.width = w * dpr;
    el.height = h * dpr;
    el.style.width = w + "px";
    el.style.height = h + "px";
    const ctx = el.getContext("2d")!;
    const members = new Map<number, number[]>();
    paths.forEach((p, j) =>
      p.path.forEach((n) => {
        const i = n.node_id - 1;
        members.set(i, [...(members.get(i) ?? []), j]);
      }),
    );
    const indices = [...members.keys()],
      ends = paths.map((p) => (p.path.at(-1)?.node_id ?? 0) - 1),
      focused = mode === "focus" && indices.length > 0;
    const coordinates = treeCoordinates(
        run,
        indices,
        focused,
        vertical,
        w - rail - 55,
        h - 95,
      ),
      X = coordinates.x,
      Y = coordinates.y;
    let alive = true,
      generation = 0,
      transform = d3.zoomIdentity,
      moving = false,
      frame = 0;
    let background: {
      image: HTMLCanvasElement;
      transform: d3.ZoomTransform;
    } | null = null;
    const screen = (i: number): [number, number] =>
      transform.apply([X(i), Y(i)]);
    const annotation = d3.select(svg).attr("viewBox", `0 0 ${w} ${h}`);
    annotation.selectAll("*").remove();
    function fit(ids: number[] | null) {
      let xx: [number, number], yy: [number, number];
      if (ids?.length) {
        xx = d3.extent(ids, X) as [number, number];
        yy = d3.extent(ids, Y) as [number, number];
      } else {
        xx = vertical
          ? [run.bounds.xmin, run.bounds.xmax]
          : [run.bounds.ymin, run.bounds.ymax];
        yy = vertical
          ? [run.bounds.ymin, run.bounds.ymax]
          : [run.bounds.xmin, run.bounds.xmax];
      }
      const width = Math.max(80, w - rail - 40),
        height = Math.max(100, h - 85),
        k = Math.min(
          width / Math.max(focused ? 30 : 120, xx[1] - xx[0]),
          height / Math.max(focused ? 30 : 120, yy[1] - yy[0]),
          focused ? 1.25 : 2,
        );
      return d3.zoomIdentity
        .translate(
          rail + width / 2 - ((xx[0] + xx[1]) / 2) * k,
          h / 2 - ((yy[0] + yy[1]) / 2) * k,
        )
        .scale(k);
    }
    const initial = fit(focused ? indices : null),
      initialScale = initial.k;
    function paint() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, el!.width, el!.height);
      if (background) {
        const ratio = transform.k / background.transform.k;
        ctx.save();
        ctx.beginPath();
        ctx.rect((rail - 12) * dpr, 0, (w - rail + 12) * dpr, h * dpr);
        ctx.clip();
        ctx.setTransform(
          ratio,
          0,
          0,
          ratio,
          (transform.x - background.transform.x * ratio) * dpr,
          (transform.y - background.transform.y * ratio) * dpr,
        );
        ctx.drawImage(background.image, 0, 0);
        ctx.restore();
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.save();
      ctx.beginPath();
      ctx.rect(rail - 12, 0, w - rail + 12, h);
      ctx.clip();
      // One geometric stroke per edge; common segments alternate their owners’ colours.
      for (const [idx, list] of members) {
        const parent = store.raw(idx, "parent_id");
        if (Number.isNaN(parent)) continue;
        paintPathEdge(
          ctx,
          screen(parent - 1),
          screen(idx),
          list.map((j) => roles[j].color),
          list.length > 1 ? 3.4 : 2.3,
          [rail - 12, 0, w, h],
        );
      }
      const radius = pathNodeRadius(indices.map(screen));
      for (const idx of new Set([...roots, ...indices])) {
        const [x, y] = screen(idx);
        if (x < rail - 20 || x > w + 20 || y < -20 || y > h + 20) continue;
        const node = store.get(idx + 1)!,
          list = members.get(idx) ?? [],
          e = nodeEncoding(node),
          color = list.length ? roles[list[0]].color : COLORS.ink,
          r = list.length ? radius : 3;
        ctx.save();
        ctx.translate(x, y);
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.fillStyle = e.filled ? color : "#fff";
        ctx.lineWidth = Math.min(1.6, r * 0.6);
        d3
          .symbol()
          .type(e.shape === "diamond" ? d3.symbolDiamond : d3.symbolCircle)
          .size(Math.PI * r * r)
          .context(ctx)();
        ctx.fill();
        ctx.stroke();
        if (list.length > 1) {
          ctx.save();
          ctx.clip();
          paintNodeSectors(
            ctx,
            r,
            list.map((j) => roles[j].color),
            e.filled,
          );
          ctx.restore();
          ctx.beginPath();
          d3
            .symbol()
            .type(e.shape === "diamond" ? d3.symbolDiamond : d3.symbolCircle)
            .size(Math.PI * r * r)
            .context(ctx)();
          ctx.strokeStyle = "rgba(41,54,75,.32)";
          ctx.lineWidth = 0.65;
          ctx.stroke();
        }
        if (e.missingIncumbent) {
          ctx.beginPath();
          ctx.moveTo(-r * 1.3, r * 1.3);
          ctx.lineTo(r * 1.3, -r * 1.3);
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 2.5;
          ctx.stroke();
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
        if (e.root) {
          ctx.beginPath();
          ctx.arc(0, 0, r + 3, 0, Math.PI * 2);
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.2;
          ctx.stroke();
          ctx.font = "600 11px Arial";
          ctx.fillStyle = COLORS.ink;
          ctx.fillText("Root", -ctx.measureText("Root").width / 2, -13);
        }
        if (ends.includes(idx)) {
          const endpointRoles = ends.flatMap((v, i) => (v === idx ? [i] : []));
          ctx.beginPath();
          ctx.arc(0, 0, r * 1.4, 0, Math.PI * 2);
          if (endpointRoles.length === 1) {
            ctx.strokeStyle = roles[endpointRoles[0]].color;
            ctx.lineWidth = 2;
            ctx.stroke();
          } else {
            endpointRoles.forEach((j, k) => {
              ctx.beginPath();
              ctx.arc(
                0,
                0,
                r * 1.4,
                (k / endpointRoles.length) * Math.PI * 2,
                ((k + 1) / endpointRoles.length) * Math.PI * 2,
              );
              ctx.strokeStyle = roles[j].color;
              ctx.lineWidth = 2;
              ctx.stroke();
            });
          }
        }
        ctx.restore();
      }
      ctx.restore();
      const labels = paths
        .map((p, i) => {
          const point = ends[i] >= 0 ? screen(ends[i]) : null;
          return {
            i,
            role: p.role,
            point,
            ly: point ? Math.max(35, Math.min(h - 35, point[1])) : 35 + i * 57,
          };
        })
        .sort((a, b) => a.ly - b.ly || a.i - b.i);
      for (let i = 1; i < labels.length; i++)
        labels[i].ly = Math.max(labels[i].ly, labels[i - 1].ly + 57);
      const over = (labels.at(-1)?.ly ?? 0) - (h - 30);
      if (over > 0) labels.forEach((l) => (l.ly -= over));
      annotation
        .selectAll<SVGGElement, (typeof labels)[number]>("g.time-callout")
        .data(labels, (l) => l.role.key)
        .join("g")
        .attr("class", "time-callout")
        .each(function (l) {
          const g = d3.select(this);
          g.selectAll("*").remove();
          if (l.point) {
            const [tx, ty] = l.point;
            g.append("path")
              .attr(
                "d",
                `M ${rail - 15} ${l.ly} H ${rail - 3} L ${Math.min(w - 8, Math.max(rail, tx))} ${Math.min(h - 8, Math.max(8, ty))}`,
              )
              .attr("stroke", l.role.color)
              .attr("stroke-width", 1.3)
              .attr("stroke-dasharray", "5 4")
              .attr("fill", "none");
          }
          g.append("rect")
            .attr("x", 3)
            .attr("y", l.ly - 23)
            .attr("width", rail - 22)
            .attr("height", 47)
            .attr("fill", "#fff")
            .attr("opacity", 0.98);
          g.append("text")
            .attr("x", 12)
            .attr("y", l.ly - 6)
            .attr("fill", l.role.color)
            .attr("font-size", 12)
            .attr("font-weight", 700)
            .text(l.role.label);
          g.append("text")
            .attr("x", 12)
            .attr("y", l.ly + 12)
            .attr("fill", l.role.color)
            .attr("font-size", preview ? 10 : 11)
            .text(fmt(l.role.selection.t, 6) + " s");
          if (!l.point)
            g.append("title").text("No node event recorded at this time");
        });
    }
    async function renderBackground() {
      const token = ++generation,
        tr = transform;
      setProgress(0);
      // Give the loading state a browser paint before the first large batch.
      await new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r())),
      );
      if (!alive || token !== generation) return;
      const image = document.createElement("canvas");
      image.width = el!.width;
      image.height = el!.height;
      const c = image.getContext("2d")!,
        k = tr.k;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.beginPath();
      c.rect(rail - 12, 0, w - rail + 12, h);
      c.clip();
      c.translate(tr.x, tr.y);
      c.scale(k, k);
      const minX = (rail - 25 - tr.x) / k,
        maxX = (w + 25 - tr.x) / k,
        minY = (-25 - tr.y) / k,
        maxY = (h + 25 - tr.y) / k;
      let stamp = performance.now();
      for (let start = 0; start < store.length; start += 6000) {
        c.beginPath();
        const end = Math.min(store.length, start + 6000);
        for (let i = start; i < end; i++) {
          const parent = store.raw(i, "parent_id");
          if (Number.isNaN(parent)) continue;
          const p = parent - 1,
            x = X(i),
            y = Y(i),
            px = X(p),
            py = Y(p);
          if (
            Math.max(x, px) < minX ||
            Math.min(x, px) > maxX ||
            Math.max(y, py) < minY ||
            Math.min(y, py) > maxY
          )
            continue;
          c.moveTo(px, py);
          c.lineTo(x, y);
        }
        c.strokeStyle = focused ? "#c3ccd7" : "#aebcca";
        c.globalAlpha = focused ? 0.28 : 0.55;
        c.lineWidth = 0.55 / k;
        c.stroke();
        if (performance.now() - stamp > 12) {
          setProgress(Math.round((end / store.length) * 65));
          await new Promise<void>((r) => requestAnimationFrame(() => r()));
          if (!alive || token !== generation) return;
          stamp = performance.now();
        }
      }
      c.globalAlpha = focused ? 0.44 : 0.75;
      const r =
        (store.length < 100
          ? 4
          : focused
            ? Math.min(2, pathNodeRadius(indices.map(screen)))
            : Math.min(3.2, Math.max(0.55, k * 3))) / k;
      for (let start = 0; start < store.length; start += 6000) {
        const shapes = [new Path2D(), new Path2D(), new Path2D()],
          slash = new Path2D();
        const end = Math.min(store.length, start + 6000);
        for (let i = start; i < end; i++) {
          const x = X(i),
            y = Y(i);
          if (x < minX || x > maxX || y < minY || y > maxY) continue;
          const sense = store.raw(i, "branch_sense"),
            unknown =
              !Number.isNaN(store.raw(i, "parent_id")) &&
              sense !== 1 &&
              sense !== 2,
            group = unknown ? 2 : sense === 2 ? 1 : 0,
            p = shapes[group];
          if (unknown) {
            p.moveTo(x, y - r * 1.4);
            p.lineTo(x + r, y);
            p.lineTo(x, y + r * 1.4);
            p.lineTo(x - r, y);
            p.closePath();
          } else {
            p.moveTo(x + r, y);
            p.arc(x, y, r, 0, Math.PI * 2);
          }
          if (r * k >= 2 && Number.isNaN(store.raw(i, "incumbent"))) {
            slash.moveTo(x - r * 1.2, y + r * 1.2);
            slash.lineTo(x + r * 1.2, y - r * 1.2);
          }
        }
        shapes.forEach((p, j) => {
          c.fillStyle = j === 1 ? "#9daebf" : "#fff";
          c.strokeStyle = "#9daebf";
          c.lineWidth = 0.65 / k;
          c.fill(p);
          c.stroke(p);
        });
        c.strokeStyle = "#738296";
        c.lineWidth = 0.8 / k;
        c.stroke(slash);
        if (performance.now() - stamp > 12) {
          setProgress(65 + Math.round((end / store.length) * 35));
          await new Promise<void>((r) => requestAnimationFrame(() => r()));
          if (!alive || token !== generation) return;
          stamp = performance.now();
        }
      }
      if (!alive || token !== generation) return;
      background = { image, transform: tr };
      setProgress(null);
      paint();
    }
    const behavior = d3
      .zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.00000001, 100])
      .on("start", () => {
        moving = true;
        generation++;
        setProgress(null);
      })
      .on("zoom", (e) => {
        transform = e.transform;
        setPicked(null);
        setHover(null);
        setZoom(Math.round((transform.k / initialScale) * 100) + "%");
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(paint);
      })
      .on("end", () => {
        moving = false;
        void renderBackground();
      });
    const sel = d3.select(el).call(behavior).on("dblclick.zoom", null);
    controls.current = {
      fit: () => {
        if (mode === "whole") sel.call(behavior.transform, initial);
        else setMode("whole");
      },
      focus: () => {
        if (mode === "focus") sel.call(behavior.transform, initial);
        else setMode("focus");
      },
      root: () => {
        sel.call(behavior.transform, fit(roots));
      },
      zoom: (v) => {
        sel.call(behavior.scaleBy, v);
      },
    };
    const pick = (e: MouseEvent): Point | null => {
      const [sx, sy] = d3.pointer(e, el);
      if (sx < rail - 12) return null;
      let best: number | null = null,
        dist = 100;
      for (const i of indices) {
        const [x, y] = screen(i),
          d = (x - sx) ** 2 + (y - sy) ** 2;
        if (d < dist) {
          best = i;
          dist = d;
        }
      }
      if (best != null) return { node: store.get(best + 1)!, x: sx, y: sy };
      const [x, y] = transform.invert([sx, sy]),
        [rawX] = coordinates.inverse(x, y),
        { order, offsets } = store.depthIndex,
        bisect = d3.bisector((i: number) => store.raw(i, "x")).left;
      // Search adjacent X positions on every depth; compare in SCREEN space,
      // so pointer selection stays correct under the monotone focus transform.
      for (let d = 0; d < offsets.length - 1; d++) {
        const start = offsets[d],
          end = offsets[d + 1];
        if (start === end) continue;
        const hit = bisect(order, rawX, start, end);
        for (const p of [hit - 1, hit])
          if (p >= start && p < end) {
            const i = order[p],
              [px, py] = screen(i),
              q = (px - sx) ** 2 + (py - sy) ** 2;
            if (q < dist) {
              dist = q;
              best = i;
            }
          }
      }
      return best == null ? null : { node: store.get(best + 1)!, x: sx, y: sy };
    };
    sel
      .on("mousemove.inspect", (e) => {
        if (!moving) {
          const p = pick(e);
          setHover(p);
          el.style.cursor = p ? "pointer" : "grab";
        }
      })
      .on("mouseleave.inspect", () => setHover(null))
      .on("click.inspect", (e) => {
        if (!e.defaultPrevented) {
          setPicked(pick(e));
          setHover(null);
        }
      });
    sel.call(behavior.transform, initial);
    return () => {
      alive = false;
      generation++;
      cancelAnimationFrame(frame);
      sel.on(".zoom", null).on(".inspect", null);
    };
  }, [
    run,
    store,
    roots,
    paths,
    roles,
    size.w,
    size.h,
    orientation,
    mode,
    preview,
  ]);
  return (
    <div
      className={
        "tree-component " +
        (expanded ? "tree-expanded " : "") +
        (preview ? "tree-preview" : "")
      }
    >
      <div className="tree-workspace floating-table-workspace">
        <div ref={plot} className="tree-plot">
          <canvas
            ref={canvas}
            role="img"
            aria-label={`Complete exported tree, ${run.nodes.length} nodes. Hollow: upper branch; solid: lower branch; slash: null incumbent; diamond: missing branch; double ring: root. No node ID labels.`}
          />
          <svg ref={overlay} className="tree-annotations" aria-hidden="true" />
          {progress != null && (
            <div className="tree-loading" role="status" aria-live="polite">
              <span className="spinner" />
              <strong>Drawing whole tree</strong>
              <span>{progress}%</span>
            </div>
          )}
          {hover && !picked && (
            <div
              className="node-hover"
              style={{
                left: Math.max(8, Math.min(size.w - 318, hover.x + 14)),
                top: Math.max(8, Math.min(size.h - 185, hover.y + 14)),
              }}
            >
              <strong>
                {hover.node.parent_id == null ? "Root" : "Node record"}
              </strong>
              <dl className="node-info-core">
                {nodeInfoFields(hover.node)
                  .slice(0, 4)
                  .map(([k, v]) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
              </dl>
            </div>
          )}
          {picked && (
            <NodeDetailCard
              node={picked.node}
              compact={preview}
              left={Math.max(8, Math.min(size.w - 332, picked.x + 16))}
              top={Math.max(
                8,
                Math.min(size.h - (preview ? 260 : 360), picked.y + 14),
              )}
              onViewTime={onViewTime}
              onClose={() => setPicked(null)}
            />
          )}
          {children && (
            <ComparisonTableOverlay
              id={tableId}
              open={tableOpen}
              title="Comparison data"
              onOpenChange={setTableOpen}
            >
              {children}
            </ComparisonTableOverlay>
          )}
        </div>
        <footer className="tree-bottom">
          <div className="tree-keys">
            <div className="path-keys">
              {roles.map((r) => (
                <span key={r.key} style={{ color: r.color }}>
                  <i className="line-key" />
                  {r.label}
                </span>
              ))}
              {roles.length > 1 && (
                <span>
                  <i
                    className="mixed-line-key"
                    style={{
                      background: mixedSwatch(roles.map((r) => r.color)),
                    }}
                  />
                  Shared · mixed colours
                </span>
              )}
            </div>
            <div className="node-keys">
              {run.audit.edges > 0 && (
                <>
                  <span>
                    <NodeKey />≤ branch
                  </span>
                  <span>
                    <NodeKey filled />≥ branch
                  </span>
                </>
              )}
              <span>
                <NodeKey missing />
                Null incumbent
              </span>
              {run.audit.missing_branch > 0 && (
                <span>
                  <NodeKey unknown />
                  Unknown branch
                </span>
              )}
              <button
                className="root-key"
                onClick={() => controls.current.root()}
              >
                <NodeKey root />
                Root
              </button>
            </div>
          </div>
          <div className="tree-bottom-tools">
            <span className="tree-count">{num(run.nodes.length)} nodes</span>
            {!preview && (
              <select
                aria-label="Tree orientation"
                value={orientation}
                onChange={(e) => setOrientation(e.target.value)}
              >
                <option value="vertical">Vertical</option>
                <option value="horizontal">Horizontal</option>
              </select>
            )}
            <button
              className={mode === "focus" ? "active" : ""}
              onClick={() => controls.current.focus()}
            >
              Focus paths
            </button>
            <div className="zoom-controls" aria-label="Tree zoom">
              <button
                aria-label="Zoom tree out"
                onClick={() => controls.current.zoom(1 / 1.5)}
              >
                −
              </button>
              <output title="Zoom relative to the fitted layout">{zoom}</output>
              <button
                aria-label="Zoom tree in"
                onClick={() => controls.current.zoom(1.5)}
              >
                +
              </button>
              <button
                className={mode === "whole" ? "active" : ""}
                onClick={() => controls.current.fit()}
              >
                Fit tree
              </button>
            </div>
            {!preview && (
              <button
                className="icon-button"
                aria-label={expanded ? "Exit full screen" : "Expand tree"}
                title={expanded ? "Exit full screen" : "Expand tree"}
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? <Minimize /> : <Maximize />}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
