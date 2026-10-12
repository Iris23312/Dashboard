import { useRef, useState } from "react";
import type { Cell, Role, Run, Selection } from "@/lib/dashboard/model";
import { Card, ResultGraphic, ResultValues } from "./result-views";
import { ComparisonPanel, type ResultDisplay } from "./comparison-panel";
import { ResultComparisonDock } from "./result-comparison-dock";
import type { GridViewports } from "./chart-shared";

export function ResultWorkspace({
  run,
  roles,
  layouts,
  combined,
  one,
  two,
  includeBase,
  onEdit,
  onCell,
  pinnedCellId,
  onClearPin,
  view,
  onViewChange,
  onSwap,
}: {
  run: Run;
  roles: Role[];
  layouts: (Cell[] | null)[];
  combined: Cell[] | null;
  one: Selection | null;
  two: Selection | null;
  includeBase: boolean;
  onEdit: (role: "one" | "two") => void;
  onCell: (cell: Cell) => void;
  pinnedCellId: number | null;
  onClearPin: () => void;
  view: "map" | "matrix";
  onViewChange: (view: "map" | "matrix") => void;
  onSwap: () => void;
}) {
  const [display, setDisplay] = useState<ResultDisplay>("compare"),
    [tableOpen, setTableOpen] = useState(true),
    viewports = useRef<GridViewports>({});
  const activeDisplay =
    display === "compare" ||
    display === "all" ||
    roles.some((r) => r.key === display)
      ? display
      : "compare";
  const activeIndex = roles.findIndex((r) => r.key === activeDisplay),
    activeRole = roles[activeIndex];
  const cells = activeRole ? layouts[activeIndex] : combined,
    pinned = cells?.find((c) => c.cell_id === pinnedCellId);
  const title =
    activeDisplay === "all"
      ? "Individual results"
      : activeRole
        ? activeRole.label + " · result"
        : "Shared and unique grids";
  return (
    <Card
      title={title}
      className="result-workspace-card"
      actions={
        <>
          <div className="segmented" aria-label="Grid representation">
            <button
              aria-pressed={view === "map"}
              className={view === "map" ? "active" : ""}
              onClick={() => onViewChange("map")}
            >
              Map
            </button>
            <button
              aria-pressed={view === "matrix"}
              className={view === "matrix" ? "active" : ""}
              onClick={() => onViewChange("matrix")}
            >
              Cell ID matrix
            </button>
          </div>
          <button onClick={onSwap} disabled={!one || !two}>
            Swap selections
          </button>
        </>
      }
    >
      {pinnedCellId != null && (
        <div className="result-pin-row">
          <div className="pinned-cell">
            <button disabled={!pinned} onClick={() => pinned && onCell(pinned)}>
              Cell {pinnedCellId}
            </button>
            <button aria-label="Clear highlighted cell" onClick={onClearPin}>
              ×
            </button>
          </div>
        </div>
      )}
      <div
        className={
          "result-workspace-layout result-docked-workspace" +
          (tableOpen ? "" : " metrics-collapsed")
        }
      >
        <div
          id="result-view-panel"
          role="region"
          aria-label={title}
          className="result-main-view"
          data-result-display={activeDisplay}
        >
          {activeDisplay === "all" ? (
            <div
              className="individual-results-tray"
              style={
                tableOpen
                  ? undefined
                  : {
                      gridTemplateColumns: `repeat(${roles.length}, minmax(260px, 1fr))`,
                    }
              }
            >
              {roles.map((r, i) => (
                <Card
                  key={r.key}
                  title={r.label}
                  color={r.color}
                  className="result-role-card"
                >
                  <ResultGraphic
                    run={run}
                    cells={layouts[i]}
                    onCell={onCell}
                    compact
                    color={r.color}
                    label={r.label}
                    view={view}
                    pinnedCellId={pinnedCellId}
                  />
                  <ResultValues run={run} selection={r.selection} />
                </Card>
              ))}
            </div>
          ) : (
            <ResultGraphic
              run={run}
              cells={cells}
              onCell={onCell}
              color={activeRole?.color}
              label={activeRole?.label}
              kind={activeRole ? "selection" : "membership"}
              roles={roles}
              view={view}
              viewports={viewports}
              pinnedCellId={pinnedCellId}
            />
          )}
        </div>
        <ResultComparisonDock
          id="result-comparison-table"
          open={tableOpen}
          onOpenChange={setTableOpen}
        >
          <ComparisonPanel
            run={run}
            one={one}
            two={two}
            includeBase={includeBase}
            onEdit={onEdit}
            scope="results"
            onFocusRole={(key) =>
              setDisplay(activeDisplay === key ? "compare" : key)
            }
            focusedRole={activeRole?.key ?? null}
            display={activeDisplay}
            onDisplayChange={setDisplay}
          />
        </ResultComparisonDock>
      </div>
    </Card>
  );
}
