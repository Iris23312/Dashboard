import { useRef, type ReactNode } from "react";
import { ChevronLeft } from "../icons";

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
  const reopen = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const setOpen = (value: boolean) => {
    onOpenChange(value);
    requestAnimationFrame(() =>
      (value ? close.current : reopen.current)?.focus(),
    );
  };
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
        id={id}
        className="floating-comparison-table"
        hidden={!open}
        aria-labelledby={id + "-title"}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            setOpen(false);
          }
        }}
      >
        <header className="floating-table-header">
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
      </aside>
    </>
  );
}
