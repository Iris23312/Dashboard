import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  PanelLeftClose,
  PanelLeftOpen,
  ChartNoAxesCombined,
  Split,
  ArrowLeft,
} from "../icons";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "../controls";
import { GapChart, SearchTree } from "./charts";
import { Card, GridRecord, ResultGraphic, ResultValues } from "./result-views";
import { ResultWorkspace } from "./result-workspace";
import { TimeSnapshot } from "./time-snapshot";
import { OverviewPreviews } from "./overview-previews";
import { timelinePathRoles } from "@/lib/dashboard/gap-events";
export { GridRecord, ResultGraphic } from "./result-views";
import { ComparisonPanel } from "./comparison-panel";
import { ViewSwitcher } from "./view-switcher";
import {
  COLORS,
  viewingRoles,
  comparisonRoles,
  isBaseTime,
} from "@/lib/dashboard/appearance";
import { INCLUDE_BEST_BASE } from "@/config";
import {
  Run,
  Cell,
  Selection,
  Role,
  Page,
  CatalogEntry,
  snapshot,
  fmt,
  initialState,
  reducer,
  bestSelection,
  denseLayout,
  combinedLayout,
  isComparisonPage,
} from "@/lib/dashboard/model";
import { loadSpatialGrid } from "@/lib/dashboard/spatial-data";
import { loadPackedRun } from "@/lib/dashboard/load-run";
import { comparisonEntry } from "@/lib/dashboard/comparison-entry";
const NO_ROLES: Role[] = [];
function LoadingScreen({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}) {
  return (
    <main className="loading-shell" aria-busy={!error}>
      <div className="loading-card">
        {!error && <span className="spinner large" />}
        <h1>{error ? "Unable to load run" : "Loading optimisation run"}</h1>
        <p>{error || "Reading tree records and preparing the node index…"}</p>
        {error && (
          <button className="primary" onClick={onRetry}>
            Retry
          </button>
        )}
      </div>
    </main>
  );
}
export default function Dashboard() {
  const [state, dispatch] = useReducer(reducer, initialState),
    [run, setRun] = useState<Run | null>(null),
    [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [collapsed, setCollapsed] = useState(false),
    [candidate, setCandidate] = useState<Selection | null>(null),
    [cell, setCell] = useState<Cell | null>(null);
  const [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(1),
    [input, setInput] = useState(""),
    [returnDialog, setReturnDialog] = useState(false),
    [compareSeed, setCompareSeed] = useState<Selection | null>(null);
  const [resultMap, setResultMap] = useState<"map" | "matrix">("map"),
    [pinnedCellId, setPinnedCellId] = useState<number | null>(null);
  const serial = useRef(0),
    stateRef = useRef(state),
    loadController = useRef<AbortController | null>(null),
    requestedRun = useRef("balanced");
  stateRef.current = state;
  const loadRun = useCallback(async (id: string) => {
    const request = ++serial.current;
    requestedRun.current = id;
    setLoading(true);
    setError("");
    setPlaying(false);
    setCompareSeed(null);
    setReturnDialog(false);
    setCandidate(null);
    setCell(null);
    setPinnedCellId(null);
    try {
      loadController.current?.abort();
      const controller = new AbortController();
      loadController.current = controller;
      let data = await loadPackedRun(id, controller.signal);
      const grid = await loadSpatialGrid("scip-reference");
      data = {
        ...data,
        layout: data.layout.map((c) => ({ ...grid.get(c.cell_id), ...c })),
      };
      if (request !== serial.current) return;
      setRun(data);
      dispatch({ type: "load", time: data.finalResultTime });
      setResultMap("map");
    } catch (e) {
      if (request === serial.current) setError(String(e));
    } finally {
      if (request === serial.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void fetch("/api/runs")
      .then((r) => {
        if (!r.ok) throw Error("Cannot load run list");
        return r.json();
      })
      .then(setCatalog)
      .catch((e) => setError(String(e)));
    void loadRun("balanced");
    return () => loadController.current?.abort();
  }, [loadRun]);
  useEffect(() => {
    setInput(String(state.current.t));
  }, [state.current.t]);
  useEffect(() => {
    setPlaying(false);
    window.history.replaceState(null, "", "#" + state.page);
  }, [state.page]);
  const select = useCallback(
    (s: Selection) => {
      if (!run || !Number.isFinite(s.t)) return;
      dispatch({
        type: "select",
        selection: { ...s, t: Math.max(0, Math.min(run.finalResultTime, s.t)) },
      });
      setPlaying(false);
    },
    [run],
  );
  const go = useCallback((page: Page) => {
    dispatch({ type: "page", page });
    setPlaying(false);
    setCompareSeed(null);
  }, []);
  useEffect(() => {
    const back = () => {
      const p = window.location.hash.slice(1) as Page;
      if (
        ["time", "search", "results", "compare", "compare-results"].includes(p)
      )
        dispatch({ type: "page", page: p });
    };
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);
  const beginCompare = useCallback(
    (selection?: Selection) => {
      if (!run) return;
      setPlaying(false);
      const s = stateRef.current;
      const entry = comparisonEntry(s, INCLUDE_BEST_BASE, selection);
      if (entry.action) {
        setCompareSeed(null);
        dispatch(entry.action);
      } else setCompareSeed(entry.prompt);
    },
    [run],
  );
  const compareNav = useCallback(() => {
    if (isComparisonPage(stateRef.current.page)) {
      go("compare");
      return;
    }
    beginCompare();
  }, [go, beginCompare]);
  const inspectTime = useCallback((s: Selection) => {
      setCandidate(s);
      setPlaying(false);
    }, []),
    inspectCell = useCallback((c: Cell) => {
      setCell(c);
      setPinnedCellId(c.cell_id);
    }, []);
  useEffect(() => {
    if (!playing || !run) return;
    let previous = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now(),
        t = Math.min(
          run.finalResultTime,
          stateRef.current.current.t + ((now - previous) / 1000) * speed,
        );
      previous = now;
      dispatch({ type: "advance", t });
      if (t >= run.finalResultTime) setPlaying(false);
    }, 250);
    return () => window.clearInterval(timer);
  }, [playing, speed, run]);
  const compareRoles = useMemo(
    () =>
      run
        ? comparisonRoles(run, state.one, state.two, INCLUDE_BEST_BASE)
        : NO_ROLES,
    [run, state.one, state.two],
  );
  const compareActive = state.one != null;
  const overviewMarkers = useMemo(
    () =>
      run
        ? state.pending
          ? comparisonRoles(
              run,
              state.pending === "one" ? state.current : state.one,
              state.pending === "two" ? state.current : state.two,
              true,
            )
          : state.one && !state.preview
            ? compareRoles
            : viewingRoles(run, state.current, state.preview)
        : NO_ROLES,
    [
      run,
      state.one,
      state.two,
      state.pending,
      state.current,
      state.preview,
      compareRoles,
    ],
  );
  const overviewRoles = useMemo(
    () =>
      run && !compareActive
        ? timelinePathRoles(run, state.current, state.preview)
        : overviewMarkers,
    [run, compareActive, state.current, state.preview, overviewMarkers],
  );
  const currentRole = run ? viewingRoles(run, state.current)[0] : undefined;
  const toggleCompare = () => {
    setPlaying(false);
    if (compareActive) setReturnDialog(true);
    else beginCompare();
  };
  const currentLayout = useMemo(
    () => (run ? denseLayout(run, state.current.t) : null),
    [run, state.current.t],
  );
  const resultLayouts = useMemo(
    () => (run ? compareRoles.map((r) => denseLayout(run, r.selection.t)) : []),
    [run, compareRoles],
  );
  const sharedLayout = useMemo(
    () =>
      run && compareRoles.length > 0 ? combinedLayout(run, compareRoles) : null,
    [run, compareRoles],
  );
  if (loading || !run)
    return (
      <LoadingScreen
        error={error}
        onRetry={() => loadRun(requestedRun.current)}
      />
    );
  const q = snapshot(run, state.current),
    active = isComparisonPage(state.page) ? "compare" : "time",
    gap = q.obs?.gap == null ? "Not recorded" : fmt(q.obs.gap, 6) + "%";
  const title = {
    time: "Overview",
    search: "Search tree",
    results: "Optimisation result",
    compare: "Compare",
    "compare-results": "Result comparison",
  }[state.page];
  const returnTo = (role: Role) => {
    dispatch({ type: "close", selection: role.selection });
    setPinnedCellId(null);
    setCell(null);
    setCandidate(null);
    setCompareSeed(null);
    setReturnDialog(false);
  };
  const openView = (destination: "overview" | "compare") => {
    if (candidate) {
      if (destination === "overview" && isComparisonPage(state.page))
        returnTo({ ...currentRole!, selection: candidate });
      else if (destination === "overview")
        dispatch({ type: "view", selection: candidate, destination });
      else if (state.pending)
        dispatch({ type: "select", selection: candidate });
      else
        dispatch({ type: "start-compare", one: state.current, two: candidate });
    }
    setCandidate(null);
  };
  const thumbnailCells =
    sharedLayout ?? resultLayouts.find((l) => l != null) ?? null;
  const exitRoles: Role[] = [
    ...(state.one
      ? [
          {
            key: "one" as const,
            label: "Selected 1",
            selection: state.one,
            color: isBaseTime(run, state.one) ? COLORS.best : COLORS.one,
          },
        ]
      : []),
    ...(state.two
      ? [
          {
            key: "two" as const,
            label: "Selected 2",
            selection: state.two,
            color: isBaseTime(run, state.two) ? COLORS.best : COLORS.two,
          },
        ]
      : []),
    {
      key: "best",
      label: "Optimal",
      selection: bestSelection(run),
      color: COLORS.best,
    },
  ];
  const compareActions = (
    <>
      <button
        onClick={() => dispatch({ type: "swap" })}
        disabled={!state.one || !state.two}
      >
        Swap selections
      </button>
    </>
  );
  return (
    <div className={"app-shell " + (collapsed ? "sidebar-compact" : "")}>
      <aside className="app-sidebar" aria-label="Run and navigation">
        <div className="sidebar-heading">
          <strong>{collapsed ? "Workspace" : "Spatial workspace"}</strong>
          <button
            className="icon-button nav-toggle"
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            title={collapsed ? "Expand navigation" : "Collapse navigation"}
            onClick={() => setCollapsed((v) => !v)}
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </button>
        </div>
        {collapsed ? (
          <button
            className="compact-run"
            aria-label={"Change run: " + run.title}
            title="Expand navigation to choose a run"
            onClick={() => setCollapsed(false)}
          >
            <span>RUN</span>
            <strong>{run.title}</strong>
          </button>
        ) : (
          <>
            <label className="run-label" htmlFor="run-select">
              OPTIMISATION RUN
            </label>
            <select
              id="run-select"
              title={run.title}
              aria-label="Optimisation run"
              value={run.id}
              onChange={(e) => loadRun(e.target.value)}
            >
              {catalog.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
            <span className="sidebar-status">SCIP · {run.meta.status}</span>
          </>
        )}
        <section className="sidebar-metrics" aria-label="Selection summary">
          <div className="selected-time">
            <span>
              {compareActive && !isComparisonPage(state.page) && !state.pending
                ? "SELECTED 1 · TIME"
                : "SELECTED TIME"}
            </span>
            <strong title={"Selected time: " + fmt(state.current.t, 6) + " s"}>
              {fmt(state.current.t, 3)} <small>s</small>
            </strong>
          </div>
          <div>
            <span>OBJECTIVE WEIGHTS</span>
            <div className="weight-values">
              {run.meta.lambdas.map((v: number, i: number) => (
                <div
                  key={i}
                  title={["Cost", "Exposure", "Energy"][i] + ": " + String(v)}
                >
                  <span>λ{i + 1}</span>
                  <small>{["Cost", "Exposure", "Energy"][i]}</small>
                  <strong>{fmt(v, collapsed ? 3 : 6)}</strong>
                </div>
              ))}
            </div>
          </div>
          <div>
            <span>GAP · RECORDED BOUNDS</span>
            <strong
              className="gap-value"
              title={"Gap from recorded bounds: " + gap}
            >
              {collapsed && q.obs?.gap != null ? fmt(q.obs.gap, 5) + "%" : gap}
            </strong>
          </div>
          <div>
            <span>OBJECTIVE VALUE</span>
            <strong
              className="objective-value"
              title={
                "Displayed solution objective value: " +
                fmt(q.incumbent?.objective, 9)
              }
            >
              {fmt(q.incumbent?.objective, collapsed ? 8 : 9)}
            </strong>
          </div>
        </section>
        <span className="workspace-label">WORKSPACE</span>
        <nav aria-label="Main navigation">
          <button
            className={active === "time" ? "active" : ""}
            aria-label="Overview"
            title="Overview"
            aria-current={active === "time" ? "page" : undefined}
            onClick={() => go("time")}
          >
            <ChartNoAxesCombined size={20} />
            <span className="nav-label">Overview</span>
          </button>
          <button
            className={active === "compare" ? "active" : ""}
            aria-label="Compare"
            title="Compare"
            aria-current={active === "compare" ? "page" : undefined}
            onClick={compareNav}
          >
            <Split size={20} />
            <span className="nav-label">Compare</span>
            {compareActive && (
              <span
                className="compare-nav-indicator"
                title="Compare mode on"
                aria-label="Compare mode on"
              />
            )}
          </button>
        </nav>
      </aside>
      <main
        className={
          "app-main " + (isComparisonPage(state.page) ? "comparison-main" : "")
        }
      >
        <header className="page-heading">
          <div className="page-title-group">
            {state.page !== "time" && (
              <button
                className="icon-button back-overview"
                title="Back to Overview"
                aria-label="Back to Overview"
                onClick={() => go("time")}
              >
                <ArrowLeft size={19} />
              </button>
            )}
            <h1>{title}</h1>
          </div>
          <span className="run-status">{run.title}</span>
        </header>
        {error && <div className="notice error">{error}</div>}
        {state.pending && (
          <div className="notice choose-notice">
            <strong>
              Choose {state.pending === "one" ? "Selected 1" : "Selected 2"} on
              the gap-time chart.
            </strong>
            <button onClick={() => go(state.pendingReturn)}>
              Cancel selection
            </button>
          </div>
        )}
        {state.page === "time" && (
          <>
            <div className="overview-grid">
              <Card
                title="Gap over time"
                className="gap-panel"
                actions={
                  <button
                    className={
                      "compare-mode-toggle " + (compareActive ? "is-on" : "")
                    }
                    aria-pressed={compareActive}
                    aria-label={
                      "Compare mode " + (compareActive ? "on" : "off")
                    }
                    title={
                      compareActive
                        ? "Turn off comparison and choose one time"
                        : "Start a comparison"
                    }
                    onClick={toggleCompare}
                  >
                    <Split size={16} />
                    <span>Compare</span>
                    <strong>{compareActive ? "On" : "Off"}</strong>
                  </button>
                }
              >
                <GapChart
                  run={run}
                  current={state.current}
                  viewed={state.preview}
                  roles={overviewMarkers}
                  pickingOption={state.pending != null}
                  color={currentRole!.color}
                  onSelect={select}
                  onCompare={beginCompare}
                />
                {state.preview && (
                  <div className="overview-time-preview">
                    {overviewRoles.map((r) => (
                      <span key={r.key} style={{ color: r.color }}>
                        {r.label} · {fmt(r.selection.t, 6)} s
                      </span>
                    ))}
                    <button onClick={() => dispatch({ type: "clear-preview" })}>
                      Clear preview
                    </button>
                  </div>
                )}
                <input
                  className="timeline-range"
                  type="range"
                  aria-label="Selected elapsed time"
                  min={0}
                  max={run.finalResultTime}
                  step="any"
                  value={state.current.t}
                  onChange={(e) =>
                    state.pending
                      ? dispatch({ type: "scrub", t: +e.target.value })
                      : select({ t: +e.target.value })
                  }
                  onPointerUp={(e) => {
                    if (state.pending) select({ t: +e.currentTarget.value });
                  }}
                  onKeyUp={(e) => {
                    if (
                      state.pending &&
                      [
                        "ArrowLeft",
                        "ArrowRight",
                        "Home",
                        "End",
                        "PageUp",
                        "PageDown",
                      ].includes(e.key)
                    )
                      select({ t: +e.currentTarget.value });
                  }}
                />
                <div className="time-controls">
                  <button
                    className="primary"
                    disabled={state.pending != null}
                    title={
                      state.pending
                        ? "Choose the comparison time with the chart, slider or time input"
                        : undefined
                    }
                    onClick={() => {
                      if (!playing && state.current.t >= run.finalResultTime)
                        dispatch({ type: "select", selection: { t: 0 } });
                      setPlaying((v) => !v);
                    }}
                  >
                    {playing ? "Pause" : "Play"}
                  </button>
                  <select
                    aria-label="Playback speed"
                    value={speed}
                    onChange={(e) => setSpeed(+e.target.value)}
                  >
                    {[1, 10, 60, 300].map((v) => (
                      <option key={v} value={v}>
                        {v}×
                      </option>
                    ))}
                  </select>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (input.trim() && Number.isFinite(+input))
                        select({ t: +input });
                    }}
                  >
                    <label>
                      {state.pending
                        ? `Selected ${state.pending === "one" ? 1 : 2}`
                        : compareActive
                          ? "Selected 1"
                          : "Time"}{" "}
                      / s{" "}
                      <input
                        type="number"
                        min={0}
                        max={run.finalResultTime}
                        step="any"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                      />
                    </label>
                    <button type="submit">Go</button>
                  </form>
                </div>
              </Card>
              <TimeSnapshot
                run={run}
                selection={state.current}
                color={currentRole!.color}
              />
            </div>
            <OverviewPreviews
              run={run}
              roles={overviewRoles}
              compareRoles={compareRoles}
              comparison={compareActive && !state.pending}
              currentRole={currentRole!}
              currentLayout={currentLayout}
              sharedLayout={sharedLayout}
              onGo={go}
              onViewTime={inspectTime}
              onCell={inspectCell}
            />
          </>
        )}
        {state.page === "search" && (
          <Card title="Whole search tree">
            <SearchTree
              run={run}
              roles={overviewRoles}
              onViewTime={inspectTime}
            />
          </Card>
        )}
        {state.page === "compare" && (
          <Card
            title="Whole search tree"
            className="comparison-tree-card"
            actions={compareActions}
          >
            <SearchTree run={run} roles={compareRoles} onViewTime={inspectTime}>
              <ComparisonPanel
                run={run}
                one={state.one}
                two={state.two}
                includeBase={INCLUDE_BEST_BASE}
                onEdit={(role) => dispatch({ type: "edit", role })}
              />
            </SearchTree>
          </Card>
        )}
        {state.page === "results" && (
          <div className="results-grid">
            <Card title="Optimisation result" color={currentRole!.color}>
              <ResultGraphic
                run={run}
                cells={currentLayout}
                onCell={inspectCell}
                color={currentRole!.color}
                label="Selected grids"
              />
            </Card>
            <Card title="Solution values">
              <ResultValues run={run} selection={state.current} />
            </Card>
          </div>
        )}
        {state.page === "compare-results" && (
          <ResultWorkspace
            run={run}
            roles={compareRoles}
            layouts={resultLayouts}
            combined={sharedLayout}
            one={state.one}
            two={state.two}
            includeBase={INCLUDE_BEST_BASE}
            onEdit={(role) =>
              dispatch({ type: "edit", role, returnTo: "compare-results" })
            }
            onCell={inspectCell}
            pinnedCellId={pinnedCellId}
            onClearPin={() => setPinnedCellId(null)}
            view={resultMap}
            onViewChange={setResultMap}
            onSwap={() => dispatch({ type: "swap" })}
          />
        )}
      </main>
      {isComparisonPage(state.page) && (
        <ViewSwitcher
          run={run}
          roles={compareRoles}
          cells={thumbnailCells}
          color={
            compareRoles[resultLayouts.findIndex((l) => l != null)]?.color ??
            COLORS.one
          }
          destination={state.page === "compare" ? "results" : "tree"}
          onClick={() =>
            go(state.page === "compare" ? "compare-results" : "compare")
          }
        />
      )}
      <Dialog
        open={candidate != null}
        onOpenChange={(v) => {
          if (!v) setCandidate(null);
        }}
      >
        <DialogContent className="time-destination-dialog">
          <DialogTitle>View this time</DialogTitle>
          <DialogDescription>
            {candidate ? fmt(candidate.t, 6) + " s" : ""}
          </DialogDescription>
          <div className="destination-options">
            <button onClick={() => openView("overview")}>
              <strong>
                {isComparisonPage(state.page)
                  ? "View in Overview"
                  : "Stay in Overview"}
              </strong>
              <span>Highlight this time on the gap chart and tree.</span>
            </button>
            <button className="primary" onClick={() => openView("compare")}>
              <strong>Open Compare</strong>
              <span>
                {state.pending
                  ? "Use this time for the selected slot."
                  : "Inspect the selected paths and results."}
              </span>
            </button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={compareSeed != null}
        onOpenChange={(v) => {
          if (!v) setCompareSeed(null);
        }}
      >
        <DialogContent className="time-destination-dialog">
          <DialogTitle>Add Selected 2?</DialogTitle>
          <DialogDescription>
            {compareSeed
              ? `Selected 1 · ${fmt(compareSeed.t, 6)} s. Optimal is included in the comparison.`
              : ""}
          </DialogDescription>
          <div className="destination-options">
            <button
              className="primary"
              onClick={() => {
                if (compareSeed)
                  dispatch({
                    type: "start-compare",
                    one: compareSeed,
                    two: null,
                    pick: true,
                  });
                setCompareSeed(null);
              }}
            >
              <strong>Yes, choose another time</strong>
              <span>Stay in Overview and select Selected 2.</span>
            </button>
            <button
              onClick={() => {
                if (compareSeed)
                  dispatch({
                    type: "start-compare",
                    one: compareSeed,
                    two: null,
                  });
                setCompareSeed(null);
              }}
            >
              <strong>No, compare now</strong>
              <span>Compare Selected 1 with Optimal.</span>
            </button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={returnDialog} onOpenChange={setReturnDialog}>
        <DialogContent className="time-destination-dialog">
          <DialogTitle>Turn off Compare?</DialogTitle>
          <DialogDescription>
            Choose the time to keep in Overview. The comparison selections will
            be cleared.
          </DialogDescription>
          <div className="return-time-options">
            {exitRoles.map((r) => (
              <button
                key={r.key}
                onClick={() => returnTo(r)}
                style={{ borderLeft: "4px solid " + r.color }}
              >
                <strong style={{ color: r.color }}>{r.label}</strong>
                <span>{fmt(r.selection.t, 6)} s</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={cell != null}
        onOpenChange={(v) => {
          if (!v) setCell(null);
        }}
      >
        <DialogContent className="cell-dialog">
          <DialogTitle>Grid record · cell {cell?.cell_id}</DialogTitle>
          <DialogDescription>Source values</DialogDescription>
          {cell && (
            <GridRecord
              cell={cell}
              layouts={resultLayouts}
              roles={compareRoles}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
