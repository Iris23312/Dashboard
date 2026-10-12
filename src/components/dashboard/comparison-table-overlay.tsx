import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import { ChevronLeft } from "../icons";
import {
  clampWindow,
  resizeWindow,
  type ResizeEdge,
  type WindowBox,
  type WindowBounds,
} from "@/lib/dashboard/panel-window";

export function ComparisonTableOverlay({
  id,
  open,
  title,
  onOpenChange,
  children,
}: {
  id: string;
  open: boolean;
  title: string;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  const reopen = useRef<HTMLButtonElement>(null),
    close = useRef<HTMLButtonElement>(null),
    panel = useRef<HTMLElement>(null);
  const [box, setBox] = useState<WindowBox | null>(null);
  const bounds = useRef<WindowBounds>({ width: 800, height: 600 });
  const drag = useRef<{
    x: number;
    y: number;
    box: WindowBox;
    edge: ResizeEdge | "move";
  } | null>(null);
  useEffect(() => {
    const parent = panel.current?.parentElement;
    if (!parent) return;
    const observer = new ResizeObserver(() => {
      bounds.current = {
        width: parent.clientWidth,
        height: parent.clientHeight,
      };
      setBox((old) =>
        clampWindow(
          old ?? {
            x: parent.clientWidth - 638,
            y: 16,
            width: 620,
            height: 490,
          },
          bounds.current,
        ),
      );
    });
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);
  const setOpen = (value: boolean) => {
    onOpenChange(value);
    requestAnimationFrame(() =>
      (value ? close.current : reopen.current)?.focus(),
    );
  };
  const start = (
    event: PointerEvent<HTMLElement>,
    edge: ResizeEdge | "move",
  ) => {
    if (
      !box ||
      event.button !== 0 ||
      (edge === "move" && (event.target as Element).closest("button"))
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, box, edge };
  };
  const move = (event: PointerEvent<HTMLElement>) => {
    if (!drag.current) return;
    event.stopPropagation();
    const d = drag.current,
      dx = event.clientX - d.x,
      dy = event.clientY - d.y;
    setBox(
      d.edge === "move"
        ? clampWindow(
            { ...d.box, x: d.box.x + dx, y: d.box.y + dy },
            bounds.current,
          )
        : resizeWindow(d.box, d.edge, dx, dy, bounds.current),
    );
  };
  const end = (event: PointerEvent<HTMLElement>) => {
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const arrows = (key: string) =>
    ({
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    })[key];
  return (
    <>
      <button
        ref={reopen}
        type="button"
        className="comparison-table-reopen"
        hidden={open}
        aria-expanded={open}
        aria-controls={id}
        aria-label="Show comparison table"
        title="Show table"
        onClick={() => setOpen(true)}
      >
        <ChevronLeft size={16} />
      </button>
      <aside
        ref={panel}
        id={id}
        className="floating-comparison-table resizable-comparison-window"
        hidden={!open}
        aria-labelledby={id + "-title"}
        style={
          box
            ? {
                left: box.x,
                top: box.y,
                width: box.width,
                height: box.height,
                right: "auto",
              }
            : undefined
        }
        onWheel={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            setOpen(false);
          }
        }}
      >
        <header
          className="floating-table-header window-drag-handle"
          tabIndex={0}
          aria-label="Move comparison window with arrow keys"
          title="Drag to move. Arrow keys also move this window."
          onPointerDown={(e) => start(e, "move")}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          onKeyDown={(e) => {
            const v = arrows(e.key);
            if (e.target !== e.currentTarget || !v || !box) return;
            e.preventDefault();
            const step = e.shiftKey ? 48 : 12;
            setBox(
              clampWindow(
                { ...box, x: box.x + v[0] * step, y: box.y + v[1] * step },
                bounds.current,
              ),
            );
          }}
        >
          <strong id={id + "-title"}>{title}</strong>
          <button
            ref={close}
            type="button"
            className="floating-table-close"
            aria-label="Hide comparison table"
            title="Hide table"
            onClick={() => setOpen(false)}
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div className="floating-table-body">{children}</div>
        {(["n", "s", "e", "w", "ne", "nw", "sw"] as ResizeEdge[]).map(
          (edge) => (
            <div
              key={edge}
              className={"window-resize-edge edge-" + edge}
              aria-hidden="true"
              onPointerDown={(e) => start(e, edge)}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
            />
          ),
        )}
        <button
          type="button"
          className="window-resize-edge edge-se window-resize-grip"
          aria-label="Resize comparison window"
          title="Drag to resize. Arrow keys change width and height."
          onPointerDown={(e) => start(e, "se")}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          onKeyDown={(e) => {
            const v = arrows(e.key);
            if (!v || !box) return;
            e.preventDefault();
            const step = e.shiftKey ? 48 : 12;
            setBox(
              resizeWindow(box, "se", v[0] * step, v[1] * step, bounds.current),
            );
          }}
        >
          <span aria-hidden="true">◢</span>
        </button>
      </aside>
    </>
  );
}
