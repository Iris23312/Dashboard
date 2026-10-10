import { COLORS } from "./appearance";
import type { Cell } from "./model";

export function memberColours(
  cell: Cell,
  fallback: string,
  palette: Record<string, string>,
) {
  if (cell.members?.length)
    return [
      ...new Set(cell.members.map((key) => palette[key]).filter(Boolean)),
    ];
  if (
    cell.membership &&
    cell.membership !== "neither" &&
    cell.membership !== "shared"
  )
    return [palette[cell.membership] ?? fallback];
  return [cell.b_w > 0.5 ? fallback : COLORS.empty];
}
export function colourBands(colours: string[]) {
  const list = colours.length ? colours : [COLORS.empty];
  return list.map((colour, i) => ({
    colour,
    start: i / list.length,
    end: (i + 1) / list.length,
  }));
}
export function mixedSwatch(colours: string[]) {
  return `linear-gradient(90deg, ${colourBands(colours)
    .map((b) => `${b.colour} ${b.start * 100}%, ${b.colour} ${b.end * 100}%`)
    .join(", ")})`;
}
export function paintCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  colours: string[],
) {
  for (const band of colourBands(colours)) {
    ctx.fillStyle = band.colour;
    ctx.fillRect(
      x + width * band.start,
      y,
      width * (band.end - band.start),
      height,
    );
  }
}
// Clip only the drawn segment, keeping its topology and both endpoints intact.
function visibleLine(
  a: [number, number],
  b: [number, number],
  box?: [number, number, number, number],
): [[number, number], [number, number]] | null {
  if (!box) return [a, b];
  const [left, top, right, bottom] = box,
    dx = b[0] - a[0],
    dy = b[1] - a[1];
  let lo = 0,
    hi = 1;
  const p = [-dx, dx, -dy, dy],
    q = [a[0] - left, right - a[0], a[1] - top, bottom - a[1]];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null;
      continue;
    }
    const r = q[i] / p[i];
    if (p[i] < 0) lo = Math.max(lo, r);
    else hi = Math.min(hi, r);
    if (lo > hi) return null;
  }
  return [
    [a[0] + lo * dx, a[1] + lo * dy],
    [a[0] + hi * dx, a[1] + hi * dy],
  ];
}
export function paintPathEdge(
  ctx: CanvasRenderingContext2D,
  a: [number, number],
  b: [number, number],
  colours: string[],
  width: number,
  box?: [number, number, number, number],
) {
  const line = visibleLine(a, b, box);
  if (!line) return;
  const [p, q] = line;
  const length = Math.hypot(q[0] - p[0], q[1] - p[1]);
  if (length < 0.01) return;
  ctx.beginPath();
  ctx.moveTo(...p);
  ctx.lineTo(...q);
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  if (colours.length < 2) ctx.strokeStyle = colours[0] ?? COLORS.ink;
  else {
    const gradient = ctx.createLinearGradient(...p, ...q),
      segments = Math.max(colours.length, Math.min(400, Math.ceil(length / 9)));
    for (let i = 0; i < segments; i++) {
      gradient.addColorStop(i / segments, colours[i % colours.length]);
      gradient.addColorStop((i + 1) / segments, colours[i % colours.length]);
    }
    ctx.strokeStyle = gradient;
  }
  ctx.stroke();
}
export function paintNodeSectors(
  ctx: CanvasRenderingContext2D,
  r: number,
  colours: string[],
  filled: boolean,
) {
  // Caller has already clipped to the actual circle/diamond glyph.
  colourBands(colours).forEach((b) => {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(
      0,
      0,
      r * 2,
      b.start * Math.PI * 2 - Math.PI / 2,
      b.end * Math.PI * 2 - Math.PI / 2,
    );
    ctx.closePath();
    ctx.fillStyle = b.colour;
    ctx.fill();
  });
  if (!filled) {
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(0.1, r - 1.45), 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
  }
}
