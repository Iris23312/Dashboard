import type { Cell, Page, Role, Run, Selection } from "@/lib/dashboard/model";
import { Maximize } from "../icons";
import { Card, ResultGraphic } from "./result-views";
import { SearchTree } from "./search-tree";

export function OverviewPreviews({
  run,
  roles,
  compareRoles,
  comparison,
  currentRole,
  currentLayout,
  sharedLayout,
  onGo,
  onViewTime,
  onCell,
}: {
  run: Run;
  roles: Role[];
  compareRoles: Role[];
  comparison: boolean;
  currentRole: Role;
  currentLayout: Cell[] | null;
  sharedLayout: Cell[] | null;
  onGo: (page: Page) => void;
  onViewTime: (s: Selection) => void;
  onCell: (c: Cell) => void;
}) {
  const treePage = comparison ? "compare" : "search",
    resultPage = comparison ? "compare-results" : "results";
  return (
    <div className="preview-grid">
      <Card
        title="Search tree"
        actions={
          <button
            className="icon-button"
            onClick={() => onGo(treePage)}
            aria-label="Expand search tree"
            title="Expand search tree"
          >
            <Maximize />
          </button>
        }
      >
        <SearchTree
          run={run}
          roles={roles}
          onViewTime={onViewTime}
          preview
          onOpen={comparison ? () => onGo("compare") : undefined}
        />
      </Card>
      <Card
        title={comparison ? "Shared and unique grids" : "Optimisation result"}
        actions={
          <button
            className="icon-button"
            onClick={() => onGo(resultPage)}
            aria-label="Expand optimisation result"
            title="Expand optimisation result"
          >
            <Maximize />
          </button>
        }
      >
        <div
          className={comparison ? "linked-result-preview" : undefined}
          role={comparison ? "link" : undefined}
          tabIndex={comparison ? 0 : undefined}
          aria-label={
            comparison ? "Open shared grids in Compare results" : undefined
          }
          onKeyDown={(e) => {
            if (
              comparison &&
              e.target === e.currentTarget &&
              (e.key === "Enter" || e.key === " ")
            ) {
              e.preventDefault();
              onGo("compare-results");
            }
          }}
          onClickCapture={(e) => {
            if (
              comparison &&
              (e.target as Element).closest("canvas, .grid-chart svg")
            ) {
              e.preventDefault();
              e.stopPropagation();
              onGo("compare-results");
            }
          }}
        >
          <ResultGraphic
            run={run}
            cells={comparison ? sharedLayout : currentLayout}
            onCell={comparison ? () => onGo("compare-results") : onCell}
            compact
            kind={comparison ? "membership" : "selection"}
            roles={comparison ? compareRoles : undefined}
            color={currentRole.color}
            label="Selected grids"
          />
        </div>
      </Card>
    </div>
  );
}
