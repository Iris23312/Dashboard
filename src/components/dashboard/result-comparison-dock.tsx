import { useRef, type ReactNode } from "react";
import { ChevronLeft } from "../icons";

export function ResultComparisonDock({
  id,
  open,
  onOpenChange,
  children,
}: {
  id: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  const toggle = useRef<HTMLButtonElement>(null);
  return (
    <aside
      className={
        "result-metrics-dock result-table-dock" + (open ? "" : " is-collapsed")
      }
      aria-label="Result comparison data"
    >
      <button
        ref={toggle}
        type="button"
        className="result-table-toggle"
        aria-expanded={open}
        aria-controls={id}
        aria-label={
          open ? "Hide result comparison table" : "Show result comparison table"
        }
        title={open ? "Hide table" : "Show table"}
        onClick={() => onOpenChange(!open)}
      >
        {open ? (
          <span className="minus-glyph" aria-hidden="true">
            −
          </span>
        ) : (
          <ChevronLeft size={16} />
        )}
      </button>
      <div
        id={id}
        className="result-table-content"
        hidden={!open}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onOpenChange(false);
            requestAnimationFrame(() => toggle.current?.focus());
          }
        }}
      >
        {children}
      </div>
    </aside>
  );
}
