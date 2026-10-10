import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import {
  Run,
  Selection,
  Role,
  fmt,
  snapshot,
  bestSelection,
} from "@/lib/dashboard/model";
import { useSize, COLORS } from "./chart-shared";
import { viewingRoles } from "@/lib/dashboard/appearance";

export function GapChart({
  run,
  current,
  viewed = null,
  color = COLORS.gap,
  onSelect,
  onCompare,
  pickingOption = false,
  small = false,
  roles,
}: {
  run: Run;
  current: Selection;
  viewed?: Selection | null;
  color?: string;
  onSelect: (s: Selection) => void;
  onCompare: (selection?: Selection) => void;
  roles?: Role[];
  pickingOption?: boolean;
  small?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null),
    svg = useRef<SVGSVGElement>(null),
    size = useSize(host);
  const [hover, setHover] = useState<{
    t: number;
    gap: number | null;
    record: number | null;
  } | null>(null);
  useEffect(() => {
    if (!svg.current) return;
    const w = Math.max(280, size.w),
      h = small ? 240 : 355;
    const m = { left: 63, right: 24, top: viewed ? 57 : 37, bottom: 63 };
    const x = d3
      .scaleLinear()
      .domain([0, run.finalResultTime])
      .range([m.left, w - m.right]);
    const valid = run.gapSeries.filter((p) => p.gap != null),
      highest = d3.max(valid, (p) => p.gap!) ?? 0.01;
    const y = d3
      .scaleLinear()
      .domain([0, Math.max(0.001, highest * 1.18)])
      .range([h - m.bottom, m.top])
      .nice();
    const root = d3.select(svg.current);
    root.selectAll("*").remove();
    root.attr("viewBox", `0 0 ${w} ${h}`);
    root
      .append("g")
      .attr("class", "chart-grid")
      .attr("transform", `translate(${m.left},0)`)
      .call(
        d3
          .axisLeft(y)
          .ticks(4)
          .tickSize(-(w - m.left - m.right))
          .tickFormat(() => ""),
      );
    root
      .append("g")
      .attr("class", "chart-axis")
      .attr("transform", `translate(${m.left},0)`)
      .call(
        d3
          .axisLeft(y)
          .ticks(4)
          .tickFormat((v) => d3.format(".3~g")(+v)),
      );
    root
      .append("g")
      .attr("class", "chart-axis")
      .attr("transform", `translate(0,${h - m.bottom})`)
      .call(d3.axisBottom(x).ticks(Math.max(3, Math.floor(w / 130))));
    root
      .append("text")
      .attr("x", m.left)
      .attr("y", 13)
      .attr("class", "axis-label")
      .text("Recorded bound gap / %");
    root
      .append("text")
      .attr("x", w - m.right)
      .attr("y", h - 4)
      .attr("text-anchor", "end")
      .attr("class", "axis-label")
      .text("Elapsed time / s");
    const restartByNode = { get: (id: number) => run.nodes.get(id)?.run };
    for (const observations of d3
      .group(valid, (p) =>
        p.node_id == null ? run.meta.n_runs : restartByNode.get(p.node_id),
      )
      .values()) {
      if (observations.length > 1)
        root
          .append("path")
          .datum(observations)
          .attr(
            "d",
            d3
              .line<(typeof valid)[number]>()
              .x((p) => x(p.t))
              .y((p) => y(p.gap!))
              .curve(d3.curveStepAfter),
          )
          .attr("fill", "none")
          .attr("stroke", COLORS.gap)
          .attr("stroke-width", 2);
    }
    root
      .selectAll("circle.observation")
      .data(valid.length <= 200 ? valid : [])
      .join("circle")
      .attr("class", "observation")
      .attr("cx", (p) => x(p.t))
      .attr("cy", (p) => y(p.gap!))
      .attr("r", 3)
      .attr("fill", COLORS.gap);
    const first = valid[0]?.t ?? run.finalResultTime;
    if (x(first) - m.left > 130)
      root
        .append("text")
        .attr("x", (m.left + x(first)) / 2)
        .attr("y", m.top + 45)
        .attr("text-anchor", "middle")
        .attr("fill", "#64788c")
        .attr("font-size", 12)
        .text("Gap not recorded");
    // Keep the plot hit surface below the markers. A current-marker click does
    // not replace the selection, so both clicks reach the same DOM element.
    root
      .append("rect")
      .attr("x", m.left)
      .attr("y", m.top)
      .attr("width", w - m.left - m.right)
      .attr("height", h - m.top - 25)
      .attr("fill", "transparent")
      .style("cursor", "crosshair")
      .on("mousemove", (e) => {
        const t = Math.max(
            0,
            Math.min(
              run.finalResultTime,
              x.invert(d3.pointer(e, svg.current)[0]),
            ),
          ),
          s = snapshot(run, t);
        setHover({ t, gap: s.obs?.gap ?? null, record: s.obs?.t ?? null });
      })
      .on("mouseleave", () => setHover(null))
      .on("click", (e) => {
        if (e.detail > 1) return;
        const t = Math.max(
          0,
          Math.min(
            run.finalResultTime,
            x.invert(d3.pointer(e, svg.current)[0]),
          ),
        );
        onSelect({ t });
      });
    const baseX = x(run.best.time_s),
      base = bestSelection(run);
    const baseMark = root
      .append("g")
      .attr("class", "best-result-marker")
      .attr("role", "button")
      .attr("tabindex", 0)
      .attr("aria-label", `Best recorded result at ${fmt(base.t, 6)} seconds`)
      .style("cursor", "pointer")
      .on("click", (e) => {
        e.stopPropagation();
        onSelect(base);
      })
      .on("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(base);
        }
      });
    baseMark
      .append("line")
      .attr("x1", baseX)
      .attr("x2", baseX)
      .attr("y1", m.top)
      .attr("y2", h - m.bottom)
      .attr("stroke", COLORS.best)
      .attr("stroke-width", 1.2)
      .attr("stroke-dasharray", "2 5")
      .attr("opacity", 0.55);
    baseMark
      .append("path")
      .attr("d", d3.symbol().type(d3.symbolDiamond).size(55)())
      .attr("transform", `translate(${baseX},${h - 30})`)
      .attr("fill", COLORS.best);
    baseMark
      .append("rect")
      .attr("x", Math.max(m.left, Math.min(w - 165, baseX - 9)))
      .attr("y", h - 45)
      .attr("width", 162)
      .attr("height", 28)
      .attr("fill", "transparent");
    baseMark
      .append("text")
      .attr("x", baseX > w - 200 ? baseX - 12 : baseX + 12)
      .attr("y", h - 26)
      .attr("text-anchor", baseX > w - 200 ? "end" : "start")
      .attr("fill", COLORS.best)
      .attr("font-size", 11)
      .attr("font-weight", 650)
      .text(`Best result · ${fmt(base.t, 3)} s`);
    const markers = (roles ?? viewingRoles(run, current, viewed)).map(
      (r, i) => ({ ...r, key: i ? "viewed" : "current", radius: i ? 8 : 6 }),
    );
    const closeLabels =
      viewed != null && Math.abs(x(current.t) - x(viewed.t)) < 175;
    markers.forEach((marker, i) => {
      const obs = snapshot(run, marker.selection).obs;
      const xx = x(marker.selection.t),
        yy = obs?.gap == null ? m.top + 25 : y(obs.gap);
      const g = root.append("g").attr("class", `time-marker ${marker.key}`);
      g.append("line")
        .attr("x1", xx)
        .attr("x2", xx)
        .attr("y1", m.top)
        .attr("y2", h - m.bottom)
        .attr("stroke", marker.color)
        .attr("stroke-width", 1.6)
        .attr("stroke-dasharray", i ? "3 4" : "7 4")
        .style("pointer-events", "none");
      g.append("circle")
        .attr("cx", xx)
        .attr("cy", yy)
        .attr("r", marker.radius)
        .attr("fill", i || obs?.gap == null ? "none" : marker.color)
        .attr("stroke", marker.color)
        .attr("stroke-width", 2.5)
        .style("pointer-events", "none");
      g.append("text")
        .attr("x", xx)
        .attr("y", closeLabels && i ? m.top - 5 : m.top - (viewed ? 24 : 8))
        .attr(
          "text-anchor",
          xx > w - 155 ? "end" : xx < 145 ? "start" : "middle",
        )
        .attr("font-size", 12)
        .attr("fill", marker.color)
        .attr("font-weight", 600)
        .style("pointer-events", "none")
        .text(
          `${viewed ? marker.label + " · " : ""}${fmt(marker.selection.t, 6)} s`,
        );
      const hit = g
        .append("circle")
        .attr("class", "time-marker-hit")
        .attr("cx", xx)
        .attr("cy", yy)
        .attr("r", 13)
        .attr("fill", "transparent")
        .attr("tabindex", 0)
        .attr("role", "button")
        .attr(
          "aria-label",
          `${marker.label}, ${fmt(marker.selection.t, 6)} seconds. Double click or press Enter to compare.`,
        )
        .style("cursor", "pointer")
        .on("click", (e) => {
          e.stopPropagation();
          if (pickingOption) onSelect(marker.selection);
        })
        .on("dblclick", (e) => {
          e.stopPropagation();
          e.preventDefault();
          setHover(null);
          onCompare(marker.selection);
        })
        .on("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setHover(null);
            onCompare(marker.selection);
          }
        })
        .on("mouseenter", () =>
          setHover({
            t: marker.selection.t,
            gap: obs?.gap ?? null,
            record: obs?.t ?? null,
          }),
        )
        .on("mouseleave", () => setHover(null));
      hit.append("title").text("Double click to compare");
    });
  }, [
    run,
    current,
    viewed,
    color,
    onSelect,
    onCompare,
    pickingOption,
    size.w,
    small,
    roles,
  ]);
  return (
    <div className="gap-chart" ref={host}>
      <svg
        ref={svg}
        role="group"
        aria-label={`Gap-time chart. Selected ${fmt(current.t, 6)} seconds.`}
      />
      {hover && (
        <div className="chart-tooltip">
          {fmt(hover.t, 6)} s · Gap{" "}
          {hover.gap == null ? "not recorded" : fmt(hover.gap, 6) + "%"}
          {hover.record != null && (
            <div>Bound record {fmt(hover.record, 6)} s</div>
          )}
        </div>
      )}
    </div>
  );
}
