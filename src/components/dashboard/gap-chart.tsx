import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import {
  Run,
  Selection,
  Role,
  fmt,
  snapshot,
  optimalSelection,
} from "@/lib/dashboard/model";
import { useSize, COLORS } from "./chart-shared";
import { OPTIMAL_REFERENCE_LABEL, isOptimalTime, viewingRoles } from "@/lib/dashboard/appearance";
import {
  nearbyGapDrops,
  MIN_NOTICEABLE_DROP_PERCENT,
} from "@/lib/dashboard/gap-events";
import { placeTimelineLabels } from "@/lib/dashboard/timeline-labels";

export function GapChart({
  run,
  current,
  viewed = null,
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
  const drops = useMemo(() => nearbyGapDrops(run, current.t), [run, current.t]);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (clickTimer.current) clearTimeout(clickTimer.current);
    },
    [],
  );
  useEffect(() => {
    if (!svg.current) return;
    const w = Math.max(320, size.w),
      left = 63,
      right = w - 28;
    const x = d3
      .scaleLinear()
      .domain([0, run.optimal.time_s > 0 ? run.optimal.time_s : 1])
      .range([left, right]);
    const selections = (roles ?? viewingRoles(run, current, viewed)).filter(
      (r) => !isOptimalTime(run, r.selection),
    );
    const optimal = optimalSelection(run);
    const events = [
      {
        key: "optimal",
        selection: optimal,
        label: OPTIMAL_REFERENCE_LABEL,
        color: COLORS.optimal,
        symbol: d3.symbolDiamond,
        detail: `Optimal reference (final recorded time): ${fmt(optimal.t, 6)} s. Solver status: ${run.meta.status}. "Optimal" names the final reference; proof of optimality depends on solver status.`,
      },
      ...drops.filter((drop) => !isOptimalTime(run, drop.selection)).map((d, i) => ({
        key: `drop-${i}`,
        selection: d.selection,
        label: `D${i + 1}`,
        color: i === 0 ? COLORS.drop : COLORS.dropSecond,
        symbol: d3.symbolCircle,
        detail: `Nearest noticeable drop ${i + 1}: ${fmt(d.t, 6)} s; ${fmt(d.before, 6)}% → ${fmt(d.after, 6)}%; ${fmt(d.relativePercent, 3)}% relative decrease. Threshold ${MIN_NOTICEABLE_DROP_PERCENT}%.`,
      })),
    ];
    const shortTime = (t: number) =>
      `${t.toLocaleString("en-AU", { maximumFractionDigits: 3 })} s`;
    const eventText = (e: (typeof events)[number]) =>
      `${e.label} · ${shortTime(e.selection.t)}`;
    const selectedText = (r: Role) =>
      `${selections.length > 1 ? r.label + " · " : ""}${shortTime(r.selection.t)}`;
    const eventLabels = placeTimelineLabels(
      events.map((e) => ({
        key: e.key,
        anchor: x(e.selection.t),
        width: eventText(e).length * 6.3 + 18,
      })),
      left,
      right,
    );
    const selectedLabels = placeTimelineLabels(
      selections.map((r) => ({
        key: r.key,
        anchor: x(r.selection.t),
        width: selectedText(r).length * 6.3 + 16,
      })),
      left,
      right,
    );
    const top = 35 + Math.max(1, ...selectedLabels.map((l) => l.lane + 1)) * 22;
    const plotBottom = top + (small ? 160 : 240),
      lanes = Math.max(1, ...eventLabels.map((l) => l.lane + 1));
    const h = plotBottom + 40 + lanes * 26 + 25;
    const valid = run.gapSeries.filter(
      (p) => p.gap != null && Number.isFinite(p.gap),
    );
    const highest = d3.max(valid, (p) => p.gap!) ?? 0.01;
    const y = d3
      .scaleLinear()
      .domain([0, Math.max(0.001, highest * 1.15)])
      .range([plotBottom, top])
      .nice();
    const root = d3.select(svg.current);
    root.selectAll("*").remove();
    root.attr("viewBox", `0 0 ${w} ${h}`);
    function interactive(
      g: d3.Selection<SVGGElement, unknown, null, undefined>,
      selection: Selection,
      label: string,
    ) {
      g.attr("tabindex", 0)
        .attr("role", "button")
        .attr(
          "aria-label",
          `${label}, ${fmt(selection.t, 6)} seconds. Enter to view; double click or Control Enter to compare.`,
        )
        .style("cursor", "pointer")
        .on("click", (e) => {
          e.stopPropagation();
          if (clickTimer.current) clearTimeout(clickTimer.current);
          if (
            !pickingOption &&
            Math.abs(current.t - selection.t) < 1e-9 &&
            (selection.nodeId == null || current.nodeId === selection.nodeId)
          )
            return;
          if (e.detail < 2)
            clickTimer.current = setTimeout(() => {
              setHover(null);
              onSelect(selection);
            }, 240);
        })
        .on("dblclick", (e) => {
          e.stopPropagation();
          e.preventDefault();
          if (clickTimer.current) clearTimeout(clickTimer.current);
          setHover(null);
          onCompare(selection);
        })
        .on("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (clickTimer.current) clearTimeout(clickTimer.current);
            setHover(null);
            if (e.ctrlKey || e.metaKey) onCompare(selection);
            else onSelect(selection);
          }
        });
    }
    root
      .append("g")
      .attr("class", "chart-grid")
      .attr("transform", `translate(${left},0)`)
      .call(
        d3
          .axisLeft(y)
          .ticks(4)
          .tickSize(-(right - left))
          .tickFormat(() => ""),
      );
    // Guides, symbols and connectors are below the data. Nothing opaque covers the curve.
    const guides = root
      .append("g")
      .attr("class", "timeline-guide-layer")
      .style("pointer-events", "none");
    const curves = root
      .append("g")
      .attr("class", "timeline-curve-layer")
      .style("pointer-events", "none");
    const axes = root
      .append("g")
      .attr("class", "timeline-axis-layer")
      .style("pointer-events", "none");
    axes
      .append("g")
      .attr("class", "chart-axis")
      .attr("transform", `translate(${left},0)`)
      .call(
        d3
          .axisLeft(y)
          .ticks(4)
          .tickFormat((v) => d3.format(".3~g")(+v)),
      );
    axes
      .append("g")
      .attr("class", "chart-axis")
      .attr("transform", `translate(0,${plotBottom})`)
      .call(d3.axisBottom(x).ticks(Math.max(3, Math.floor(w / 130))));
    axes
      .append("text")
      .attr("x", left)
      .attr("y", 13)
      .attr("class", "axis-label")
      .text("Recorded bound gap / %");
    axes
      .append("text")
      .attr("x", right)
      .attr("y", h - 2)
      .attr("text-anchor", "end")
      .attr("class", "axis-label")
      .text("Elapsed time / s");
    for (const observations of d3
      .group(valid, (p) =>
        p.node_id == null
          ? run.meta.n_runs
          : run.nodes.raw(p.node_id - 1, "run"),
      )
      .values()) {
      if (observations.length > 1)
        curves
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
    if (!valid.length)
      curves
        .append("text")
        .attr("x", (left + right) / 2)
        .attr("y", top + 60)
        .attr("text-anchor", "middle")
        .attr("fill", "#61788b")
        .attr("font-size", 12)
        .text("Gap not recorded");
    curves
      .selectAll("circle.observation")
      .data(valid.length <= 200 ? valid : [])
      .join("circle")
      .attr("class", "observation")
      .attr("cx", (p) => x(p.t))
      .attr("cy", (p) => y(p.gap!))
      .attr("r", 2.5)
      .attr("fill", COLORS.gap);
    const hits = root.append("g").attr("class", "timeline-hit-layer");
    hits
      .append("rect")
      .attr("x", left)
      .attr("y", top)
      .attr("width", right - left)
      .attr("height", plotBottom - top)
      .attr("fill", "transparent")
      .style("cursor", "crosshair")
      .on("mousemove", (e) => {
        const t = Math.max(
            0,
            Math.min(
              run.optimal.time_s,
              x.invert(d3.pointer(e, svg.current)[0]),
            ),
          ),
          s = snapshot(run, t);
        setHover({ t, gap: s.obs?.gap ?? null, record: s.obs?.t ?? null });
      })
      .on("mouseleave", () => setHover(null))
      .on("click", (e) => {
        if (e.detail > 1) return;
        onSelect({
          t: Math.max(
            0,
            Math.min(
              run.optimal.time_s,
              x.invert(d3.pointer(e, svg.current)[0]),
            ),
          ),
        });
      });
    const labels = root.append("g").attr("class", "timeline-label-layer");
    for (const event of events) {
      const pos = eventLabels.find((l) => l.key === event.key)!,
        xx = pos.anchor,
        observation = snapshot(run, event.selection).obs,
        yy = observation?.gap == null ? null : y(observation.gap),
        labelY = plotBottom + 47 + pos.lane * 26;
      guides
        .append("line")
        .attr("class", event.key + "-guide")
        .attr("x1", xx)
        .attr("x2", xx)
        .attr("y1", top)
        .attr("y2", plotBottom)
        .attr("stroke", event.color)
        .attr("stroke-dasharray", "3 5")
        .attr("stroke-width", 1.1)
        .attr("opacity", 0.24);
      if (yy != null)
        guides
          .append("path")
          .attr("class", event.key + "-glyph")
          .attr("d", d3.symbol().type(event.symbol).size(125)())
          .attr("transform", `translate(${xx},${yy})`)
          .attr("fill", event.color)
          .attr("fill-opacity", 0.08)
          .attr("stroke", event.color)
          .attr("stroke-opacity", 0.65)
          .attr("stroke-width", 1.8);
      // Label placement can use another lane, but its connector starts at the exact x(t).
      guides
        .append("path")
        .attr(
          "d",
          `M${xx},${plotBottom + 3} V${plotBottom + 28} L${pos.centre},${labelY - 12}`,
        )
        .attr("fill", "none")
        .attr("stroke", event.color)
        .attr("stroke-width", 1)
        .attr("stroke-opacity", 0.4);
      const label = labels
        .append("g")
        .attr("class", event.key + "-time-marker")
        .attr("data-event-time", event.selection.t)
        .attr("data-anchor-x", xx)
        .attr("data-label-lane", pos.lane);
      interactive(label, event.selection, event.label);
      label
        .append("rect")
        .attr("x", pos.left)
        .attr("y", labelY - 14)
        .attr("width", pos.width)
        .attr("height", 23)
        .attr("fill", "transparent");
      label
        .append("text")
        .attr("x", pos.centre)
        .attr("y", labelY + 2)
        .attr("text-anchor", "middle")
        .attr("fill", event.color)
        .attr("font-size", 11)
        .attr("font-weight", 650)
        .text(eventText(event));
      label.append("title").text(event.detail);
      if (yy != null) {
        const point = hits.append("g");
        interactive(point, event.selection, event.label);
        point.attr("tabindex", -1);
        point
          .append("circle")
          .attr("cx", xx)
          .attr("cy", yy)
          .attr("r", 9)
          .attr("fill", "transparent");
        point.append("title").text(event.detail);
      }
    }
    for (const marker of selections) {
      const pos = selectedLabels.find((l) => l.key === marker.key)!,
        obs = snapshot(run, marker.selection).obs,
        xx = pos.anchor,
        yy = obs?.gap == null ? top + 25 : y(obs.gap),
        isCurrent = Math.abs(marker.selection.t - current.t) < 1e-9,
        labelY = 31 + pos.lane * 22;
      guides
        .append("line")
        .attr("x1", xx)
        .attr("x2", xx)
        .attr("y1", top)
        .attr("y2", plotBottom)
        .attr("stroke", marker.color)
        .attr("stroke-width", 1.2)
        .attr("stroke-dasharray", "5 4")
        .attr("opacity", 0.3);
      if (obs?.gap != null)
        guides
          .append("circle")
          .attr("cx", xx)
          .attr("cy", yy)
          .attr("r", isCurrent ? 7 : 5)
          .attr("fill", marker.color)
          .attr("fill-opacity", 0.12)
          .attr("stroke", marker.color)
          .attr("stroke-width", 2)
          .attr("stroke-opacity", 0.8);
      guides
        .append("path")
        .attr("d", `M${pos.centre},${labelY + 5} L${xx},${top - 3}`)
        .attr("fill", "none")
        .attr("stroke", marker.color)
        .attr("stroke-opacity", 0.35);
      const label = labels
        .append("g")
        .attr("class", "time-marker")
        .attr("data-selection-role", marker.key);
      interactive(label, marker.selection, marker.label);
      label
        .append("rect")
        .attr("x", pos.left)
        .attr("y", labelY - 13)
        .attr("width", pos.width)
        .attr("height", 22)
        .attr("fill", "transparent");
      label
        .append("text")
        .attr("x", pos.centre)
        .attr("y", labelY)
        .attr("text-anchor", "middle")
        .attr("fill", marker.color)
        .attr("font-size", 11)
        .attr("font-weight", 650)
        .text(selectedText(marker));
      label
        .append("title")
        .text(
          `${marker.label}: ${fmt(marker.selection.t, 6)} s. Click to view; double click to compare.`,
        );
      if (obs?.gap != null) {
        const point = hits.append("g");
        interactive(point, marker.selection, marker.label);
        point.attr("tabindex", -1);
        point
          .append("circle")
          .attr("class", "time-marker-hit")
          .attr("cx", xx)
          .attr("cy", yy)
          .attr("r", 11)
          .attr("fill", "transparent");
      }
    }
  }, [
    run,
    current,
    viewed,
    onSelect,
    onCompare,
    pickingOption,
    size.w,
    small,
    roles,
    drops,
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
