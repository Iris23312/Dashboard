export type WindowBox = { x: number; y: number; width: number; height: number };
export type WindowBounds = { width: number; height: number };
export type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const margin = 8;
const clamp = (v: number, low: number, high: number) =>
  Math.max(low, Math.min(Math.max(low, high), v));
export function clampWindow(box: WindowBox, bounds: WindowBounds): WindowBox {
  const maxW = Math.max(1, bounds.width - margin * 2),
    maxH = Math.max(1, bounds.height - margin * 2);
  const width = clamp(box.width, Math.min(380, maxW), maxW),
    height = clamp(box.height, Math.min(220, maxH), maxH);
  return {
    width,
    height,
    x: clamp(box.x, margin, bounds.width - margin - width),
    y: clamp(box.y, margin, bounds.height - margin - height),
  };
}
export function resizeWindow(
  box: WindowBox,
  edge: ResizeEdge,
  dx: number,
  dy: number,
  bounds: WindowBounds,
): WindowBox {
  let left = box.x,
    right = left + box.width,
    top = box.y,
    bottom = top + box.height;
  const minW = Math.min(380, bounds.width - margin * 2),
    minH = Math.min(220, bounds.height - margin * 2);
  if (edge.includes("w")) left = clamp(left + dx, margin, right - minW);
  if (edge.includes("e"))
    right = clamp(right + dx, left + minW, bounds.width - margin);
  if (edge.includes("n")) top = clamp(top + dy, margin, bottom - minH);
  if (edge.includes("s"))
    bottom = clamp(bottom + dy, top + minH, bounds.height - margin);
  return clampWindow(
    { x: left, y: top, width: right - left, height: bottom - top },
    bounds,
  );
}
