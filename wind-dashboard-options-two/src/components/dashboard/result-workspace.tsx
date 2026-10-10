import { useRef, useState } from "react";
import type { Cell, Role, Run, Selection } from "@/lib/dashboard/model";
import { Card, ResultGraphic, ResultValues } from "./result-views";
import { ComparisonPanel } from "./comparison-panel";
import { ResultComparisonDock } from "./result-comparison-dock";
import type { GridViewports } from "./chart-shared";

type ResultTab = "compare" | "all" | Role["key"];
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
  const [tab, setTab] = useState<ResultTab>("compare"),
    [tableOpen, setTableOpen] = useState(true),
    viewports = useRef<GridViewports>({});
  const availableTabs = [
    { key: "compare", label: "Compare" },
    ...roles.map((r) => ({ key: r.key, label: r.label })),
    ...(roles.length > 1 ? [{ key: "all", label: "All results" }] : []),
  ];
  const activeTab = availableTabs.some((t) => t.key === tab) ? tab : "compare",
    activeIndex = roles.findIndex((r) => r.key === activeTab),
    activeRole = roles[activeIndex];
  const cells = activeRole ? layouts[activeIndex] : combined,
    pinned = cells?.find((c) => c.cell_id === pinnedCellId);
  const title =
    activeTab === "all"
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
      <div className="result-view-controls">
        <div
          className="result-tabs"
          role="tablist"
          aria-label="Result view"
          onKeyDown={(e) => {
            const index = availableTabs.findIndex((t) => t.key === activeTab);
            let next = index;
            if (e.key === "ArrowRight")
              next = (index + 1) % availableTabs.length;
            else if (e.key === "ArrowLeft")
              next = (index - 1 + availableTabs.length) % availableTabs.length;
            else if (e.key === "Home") next = 0;
            else if (e.key === "End") next = availableTabs.length - 1;
            else return;
            e.preventDefault();
            setTab(availableTabs[next].key as ResultTab);
            (
              e.currentTarget.querySelectorAll("button")[
                next
              ] as HTMLButtonElement
            )?.focus();
          }}
        >
          {availableTabs.map((t) => (
            <button
              key={t.key}
              id={"result-tab-" + t.key}
              role="tab"
              aria-selected={activeTab === t.key}
              aria-controls="result-view-panel"
              tabIndex={activeTab === t.key ? 0 : -1}
              className={activeTab === t.key ? "active" : ""}
              onClick={() => setTab(t.key as ResultTab)}
            >
              {roles.find((r) => r.key === t.key) && (
                <i
                  style={{
                    background: roles.find((r) => r.key === t.key)!.color,
                  }}
                />
              )}
              {t.label}
            </button>
          ))}
        </div>
        {pinnedCellId != null && (
          <div className="pinned-cell">
            <button disabled={!pinned} onClick={() => pinned && onCell(pinned)}>
              Cell {pinnedCellId}
            </button>
            <button aria-label="Clear highlighted cell" onClick={onClearPin}>
              ×
            </button>
          </div>
        )}
      </div>
      <div
        className={
          "result-workspace-layout result-docked-workspace" +
          (tableOpen ? "" : " metrics-collapsed")
        }
      >
        <div
          id="result-view-panel"
          role="tabpanel"
          aria-labelledby={"result-tab-" + activeTab}
          className="result-main-view"
        >
          {activeTab === "all" ? (
            <div
              className="individual-results-tray"
              style={
                tableOpen
                  ? undefined
                  : {
                      gridTemplateColumns: `repeat(${roles.length}, minmax(280px, 1fr))`,
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
            onFocusRole={setTab}
            focusedRole={activeRole?.key ?? null}
          />
        </ResultComparisonDock>
      </div>
    </Card>
  );
}
