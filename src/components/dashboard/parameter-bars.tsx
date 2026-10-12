import { useId, useRef, useState } from "react";
import * as d3 from "d3";
import { fmt, signed, type Role } from "@/lib/dashboard/model";
import {
  relativeDifference,
  type ParameterRow,
} from "@/lib/dashboard/parameter-comparison";
import { useSize } from "./chart-shared";
import { percentageScaleMaximum } from "@/lib/dashboard/parameter-scale";

export function percentageLabel(value: number | null) {
  if (value == null) return "N/A";
  if (value === 0) return "0%";
  return (
    (Math.abs(value) < 0.001
      ? d3.format("+.2~e")(value)
      : d3.format("+,.3~f")(value)) + "%"
  );
}
export function ParameterBar({
  value,
  optimal,
  color,
  side,
  width,
  maximum,
}: {
  value: number | null;
  optimal: number | null;
  color: string;
  side: "left" | "right";
  width: number;
  maximum: number;
}) {
  const d = relativeDifference(value, optimal),
    label = percentageLabel(d.percent),
    usable = Math.max(40, width - 12);
  const scale = d3
    .scaleLinear()
    .domain([0, maximum || 1])
    .range([0, usable]);
  const barWidth = d.percent == null ? 0 : scale(Math.abs(d.percent));
  const x = side === "left" ? width - barWidth : 0,
    textX = side === "left" ? 10 : width - 10;
  const explanation =
    d.reason === "missing"
      ? "Value not recorded"
      : d.reason === "zero-base"
        ? "Optimal is zero; relative percentage is undefined. Open row for the absolute difference."
        : `${label} relative to Optimal`;
  return (
    <svg
      className="parameter-bar"
      width="100%"
      height="44"
      viewBox={`0 0 ${width} 44`}
      role="img"
      aria-label={explanation}
    >
      <title>{explanation}</title>
      <rect x={0} y={8} width={width} height={28} rx={4} fill="#edf1f6" />
      {barWidth > 0 && (
        <>
          <rect
            x={x}
            y={8}
            width={barWidth}
            height={28}
            rx={4}
            fill={color}
            fillOpacity={0.22}
          />
          <rect x={x} y={33} width={barWidth} height={3} rx={1} fill={color} />
        </>
      )}
      {d.percent === 0 && (
        <line
          x1={side === "left" ? width - 1 : 1}
          x2={side === "left" ? width - 1 : 1}
          y1={8}
          y2={36}
          stroke={color}
          strokeWidth={2}
        />
      )}
      <text
        x={textX}
        y={26.5}
        textAnchor={side === "left" ? "start" : "end"}
        fill="#26394e"
        fontSize={width < 105 ? 11 : 14}
        fontWeight={650}
      >
        {label}
      </text>
    </svg>
  );
}

export function ParameterBars({
  rows,
  optimal,
  left,
  right,
}: {
  rows: ParameterRow[];
  optimal: Role;
  left?: Role;
  right?: Role;
}) {
  const id = useId(),
    host = useRef<HTMLDivElement>(null),
    size = useSize(host),
    [expanded, setExpanded] = useState<string | null>(null),
    [scaling, setScaling] = useState<"row" | "shared">("row");
  const sides = [left, right].filter((r): r is Role => !!r);
  const maximum =
    d3.max(
      rows.flatMap((row) =>
        sides.map((role) =>
          Math.abs(
            relativeDifference(row.values[role.key], row.values[optimal.key])
              .percent ?? 0,
          ),
        ),
      ),
    ) ?? 0;
  const scaleMaximum = d3
    .scaleLinear()
    .domain([0, maximum || 1])
    .nice(4)
    .domain()[1];
  const width = Math.max(70, (size.w - 140) / Math.max(1, sides.length));
  const roles = [left, optimal, right].filter((r): r is Role => !!r);
  const structure =
    "parameter-columns" +
    (!left ? " no-left" : "") +
    (!right ? " no-right" : "");
  return (
    <div ref={host} className="parameter-bars">
      <div className="parameter-scale-controls">
        <span>Scale</span>
        <div className="segmented" aria-label="Parameter bar scale">
          <button
            type="button"
            aria-pressed={scaling === "row"}
            className={scaling === "row" ? "active" : ""}
            onClick={() => setScaling("row")}
          >
            Per parameter
          </button>
          <button
            type="button"
            aria-pressed={scaling === "shared"}
            className={scaling === "shared" ? "active" : ""}
            onClick={() => setScaling("shared")}
          >
            Shared scale
          </button>
        </div>
      </div>
      <div className="parameter-chart-caption">
        <span title="(Selected − Optimal) / |Optimal| × 100. Positive does not necessarily mean better.">
          Difference from Optimal (%)
        </span>
        <span>
          {scaling === "row"
            ? "Compare within each row"
            : `0–${d3.format(".3~g")(scaleMaximum)}%`}
        </span>
      </div>
      {rows.map((row) => {
        const isOpen = expanded === row.key,
          detailsId = `${id}-${row.key}`,
          base = row.values[optimal.key];
        const differences = sides
          .map((role) => relativeDifference(row.values[role.key], base).percent)
          .filter((v): v is number => v != null);
        const localMaximum = d3.max(differences, (v) => Math.abs(v)) ?? 0;
        const rowMaximum = percentageScaleMaximum(differences);
        const displayMaximum = scaling === "row" ? rowMaximum : scaleMaximum;
        const rangeLabel =
          localMaximum > 0
            ? `0–${d3.format(".3~g")(rowMaximum)}%`
            : differences.length
              ? "Equal"
              : "N/A";
        return (
          <section
            key={row.key}
            className={"parameter-row" + (isOpen ? " is-expanded" : "")}
          >
            <button
              type="button"
              className={"parameter-row-button " + structure}
              aria-expanded={isOpen}
              aria-controls={detailsId}
              aria-label={`Show values for ${row.label}`}
              onClick={() => setExpanded(isOpen ? null : row.key)}
            >
              {left && (
                <ParameterBar
                  value={row.values[left.key]}
                  optimal={base}
                  color={left.color}
                  side="left"
                  width={width}
                  maximum={displayMaximum}
                />
              )}
              <span className="optimal-parameter-label">
                <strong>{row.label}</strong>
                {row.unit && <small>{row.unit}</small>}
                <small
                  className="row-scale-label"
                  title={
                    scaling === "row"
                      ? "Both bars in this row use this linear range. Ranges differ between parameters."
                      : "All parameters use one shared linear range."
                  }
                >
                  {scaling === "row" ? rangeLabel : ""}
                </small>
                <span className="parameter-disclosure" aria-hidden="true">
                  {isOpen ? "−" : "+"}
                </span>
              </span>
              {right && (
                <ParameterBar
                  value={row.values[right.key]}
                  optimal={base}
                  color={right.color}
                  side="right"
                  width={width}
                  maximum={displayMaximum}
                />
              )}
            </button>
            <div id={detailsId} className="parameter-values" hidden={!isOpen}>
              <dl className={structure}>
                {roles.map((role) => {
                  const value = row.values[role.key],
                    delta = relativeDifference(value, base);
                  return (
                    <div key={role.key} style={{ borderTopColor: role.color }}>
                      <dt style={{ color: role.color }}>{role.label}</dt>
                      <dd
                        title={value == null ? "Not recorded" : String(value)}
                      >
                        {fmt(value, row.digits)}
                        {row.unit && <small>{row.unit}</small>}
                      </dd>
                      {role.key !== optimal.key && (
                        <dd className="absolute-difference">
                          Δ {signed(delta.absolute, row.digits)}
                          {row.unit === "%"
                            ? " pp"
                            : row.unit
                              ? " " + row.unit
                              : ""}
                        </dd>
                      )}
                      {row.solutionAt?.[role.key] != null && (
                        <dd className="record-time">
                          Result found {fmt(row.solutionAt[role.key], 6)} s
                        </dd>
                      )}
                      {row.recordedAt?.[role.key] != null && (
                        <dd className="record-time">
                          Recorded {fmt(row.recordedAt[role.key], 6)} s
                        </dd>
                      )}
                    </div>
                  );
                })}
              </dl>
              {left && right && (
                <p className="direct-difference">
                  <span style={{ color: right.color }}>Selected 2</span> −{" "}
                  <span style={{ color: left.color }}>Selected 1</span>:{" "}
                  <strong>
                    {signed(
                      row.values[left.key] == null ||
                        row.values[right.key] == null
                        ? null
                        : row.values[right.key]! - row.values[left.key]!,
                      row.digits,
                    )}
                  </strong>
                  {row.unit === "%" ? " pp" : row.unit ? " " + row.unit : ""}
                </p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
