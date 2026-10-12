import { useEffect, useState } from "react";
export { COLORS } from "@/lib/dashboard/appearance";
export function useSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ w: 800, h: 500, ready: false });
  useEffect(() => {
    if (!ref.current) return;
    const o = new ResizeObserver(([e]) =>
      setSize({
        w: Math.max(1, e.contentRect.width),
        h: Math.max(1, e.contentRect.height),
        ready: true,
      }),
    );
    o.observe(ref.current);
    return () => o.disconnect();
  }, [ref]);
  return size;
}
export type StoredViewport = { key: string; x: number; y: number; k: number };
export type GridViewports = { map?: StoredViewport; matrix?: StoredViewport };
