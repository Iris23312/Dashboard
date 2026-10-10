import assert from "node:assert/strict";
import fs from "node:fs";
import { gunzipSync } from "node:zlib";
import { createServer } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
const server = await createServer({
  server: { middlewareMode: true, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
  appType: "custom",
});
const render = (component, props) =>
  renderToStaticMarkup(createElement(component, props));
try {
  const { ComparisonPanel } = await server.ssrLoadModule(
    "/src/components/dashboard/comparison-panel.tsx",
  );
  const { SearchTree, NodeDetailCard } = await server.ssrLoadModule(
    "/src/components/dashboard/search-tree.tsx",
  );
  const { GridRecord, ResultGraphic } = await server.ssrLoadModule(
    "/src/components/dashboard/dashboard.tsx",
  );
  const { ResultWorkspace } = await server.ssrLoadModule(
    "/src/components/dashboard/result-workspace.tsx",
  );
  const { comparisonEntry } = await server.ssrLoadModule(
    "/src/lib/dashboard/comparison-entry.ts",
  );
  const { memberColours, colourBands, paintCell, paintPathEdge } =
    await server.ssrLoadModule("/src/lib/dashboard/mixed-colours.ts");
  const { ViewSwitcher } = await server.ssrLoadModule(
    "/src/components/dashboard/view-switcher.tsx",
  );
  const { hydrateRun } = await server.ssrLoadModule(
    "/src/lib/dashboard/packed-data.ts",
  );
  const { comparisonRoles, roleFor, viewingRoles, COLORS } =
    await server.ssrLoadModule("/src/lib/dashboard/appearance.ts");
  const {
    ancestors,
    snapshot,
    bestSelection,
    denseLayout,
    combinedLayout,
    reducer,
    initialState,
  } = await server.ssrLoadModule("/src/lib/dashboard/model.ts");
  const { treeCoordinates, pathNodeRadius } = await server.ssrLoadModule(
    "/src/lib/dashboard/tree-view.ts",
  );
  function load(id) {
    const meta = JSON.parse(
        fs.readFileSync("public/data/" + id + ".json", "utf8"),
      ),
      raw = gunzipSync(fs.readFileSync("public" + meta.dataFile));
    return hydrateRun(
      meta,
      raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
    );
  }
  const run = load("balanced"),
    one = { t: run.incumbents[3].time_s, nodeId: run.incumbents[3].node_id },
    two = { t: run.incumbents[12].time_s, nodeId: run.incumbents[12].node_id },
    base = bestSelection(run);
  for (const includeBase of [true, false]) {
    const html = render(ComparisonPanel, {
      run,
      one,
      two,
      includeBase,
      onEdit: () => {},
    });
    assert(html.includes("Selected 1"));
    assert(html.includes("Selected 2"));
    assert.equal(html.includes("Base · best recorded"), includeBase);
    assert(html.includes("Only first"));
    assert(html.includes("Unique nodes"));
    assert.equal(html.includes("1,183.321701"), includeBase);
    assert(!html.includes("Option 1"));
    const single = render(ComparisonPanel, {
      run,
      one,
      two: null,
      includeBase,
      onEdit: () => {},
    });
    assert(!single.includes("Selected 2"));
    assert(single.includes("Select second time"));
    assert.equal(
      comparisonRoles(run, one, null, includeBase).length,
      includeBase ? 2 : 1,
    );
  }
  const twoWithBase = comparisonRoles(run, one, base, false);
  assert.equal(twoWithBase.length, 2);
  assert.equal(twoWithBase[1].label, "Base");
  assert.equal(twoWithBase[1].color, COLORS.best);
  assert.equal(comparisonRoles(run, base, two, true).length, 2);
  assert.equal(comparisonRoles(run, base, base, true).length, 1);
  assert.equal(roleFor(run, "two", { t: base.t }).color, COLORS.best);
  // Node cards retain all seven fields in order, even when timestamps/bounds are null.
  const required = [
    "Recorded time",
    "Lower bound",
    "Dual bound",
    "Incumbent",
    "Branch decision",
    "Parent",
    "Depth",
    "View time",
  ];
  for (const node of [
    run.nodes.get(1),
    run.nodes.get(64816),
    {
      ...run.nodes.get(2),
      time_s: null,
      first_seen_s: null,
      layout_time_s: null,
      incumbent: null,
      global_dual_bound: null,
    },
  ]) {
    const html = render(NodeDetailCard, {
      node,
      onViewTime: () => {},
      onClose: () => {},
    });
    let last = -1;
    for (const label of required) {
      const index = html.indexOf(label);
      assert(index > last, label);
      last = index;
    }
    if (
      node.time_s == null &&
      node.first_seen_s == null &&
      node.layout_time_s == null
    )
      assert(html.includes('disabled=""'));
    assert(html.includes("node-detail-action"));
  }
  const roles = comparisonRoles(run, one, two, true),
    layouts = roles.map((r) => denseLayout(run, r.selection.t)),
    shared = combinedLayout(run, roles);
  assert.equal(shared.length, 7406);
  const palette = Object.fromEntries(roles.map((r) => [r.key, r.color]));
  for (const c of shared) {
    const owners = layouts.flatMap((l, i) =>
      l.find((v) => v.cell_id === c.cell_id).b_w > 0.5 ? [roles[i].key] : [],
    );
    assert.deepEqual(c.members, owners);
    assert.equal(
      c.membership,
      owners.length > 1 ? "shared" : (owners[0] ?? "neither"),
    );
    assert.deepEqual(
      memberColours(c, COLORS.one, palette),
      owners.length ? owners.map((k) => palette[k]) : [COLORS.empty],
    );
  }
  const cell = shared.find((c) => c.members.length > 1);
  assert(cell);
  const grid = render(GridRecord, { cell, layouts, roles });
  for (const r of roles) assert(grid.includes(r.label));
  assert(grid.includes("t_w"));
  assert(grid.includes("b_w"));
  assert(!grid.includes("Option"));
  for (const role of roles) {
    const cells = denseLayout(run, role.selection.t),
      html = render(ResultGraphic, {
        run,
        cells,
        onCell: () => {},
        color: role.color,
        label: role.label,
        view: "map",
      });
    assert(html.includes(role.label));
    assert(html.includes(role.color));
    assert(!html.includes("heatmap"));
    assert(!html.includes("Final weight"));
    assert(!html.includes("Node LP"));
  }
  // Closing a comparison retains the exact time but clears all comparison identity.
  let s = reducer(initialState, { type: "start-compare", one, two: base });
  assert.equal(s.page, "compare");
  assert.equal(s.two.t, base.t);
  s = reducer(s, { type: "close", selection: base });
  assert.equal(s.current.t, base.t);
  for (const field of ["one", "two", "preview", "pending"])
    assert.equal(s[field], null);

  for (const selection of [one, two, base]) {
    const closed = reducer(
      {
        ...s,
        one,
        two,
        page: "compare-results",
        pendingReturn: "compare-results",
        preview: base,
      },
      { type: "close", selection },
    );
    assert.deepEqual(closed, { ...initialState, current: selection });
    const normal = viewingRoles(run, closed.current, closed.preview);
    assert.equal(normal.length, 1);
    assert.equal(normal[0].label, "Selected time");
    assert.equal(
      normal[0].color,
      selection.t === base.t ? COLORS.best : COLORS.current,
    );
    assert.deepEqual(normal[0].selection, selection);
    assert(
      comparisonEntry(closed, false).prompt,
      "A fresh Two comparison should ask for its missing second time",
    );
    const standalone = render(ResultGraphic, {
      run,
      cells: denseLayout(run, selection.t),
      onCell: () => {},
      view: "map",
      color: normal[0].color,
    });
    const normalTree = render(SearchTree, {
      run,
      roles: normal,
      onViewTime: () => {},
      preview: true,
    });
    for (const html of [standalone, normalTree])
      for (const oldLabel of ["Selected 1", "Selected 2", "Base"])
        assert(!html.includes(oldLabel));
    assert(standalone.includes("Selected grids"));
    assert(standalone.includes(normal[0].color));
  }
  assert.equal(COLORS.current, "#7851b8");
  assert.equal(
    viewingRoles(run, { t: run.finalResultTime })[0].color,
    COLORS.current,
  );
  assert.equal(viewingRoles(run, one, base)[1].color, COLORS.best);
  const viewed = viewingRoles(run, one, two);
  assert.deepEqual(
    viewed.map((r) => r.label),
    ["Selected time", "Preview time"],
  );
  s = reducer(s, { type: "start-compare", one, two: null, pick: true });
  assert.equal(s.page, "time");
  assert.equal(s.pending, "two");
  s = reducer(s, { type: "select", selection: base });
  assert.equal(s.page, "compare");
  assert.equal(comparisonRoles(run, s.one, s.two, false)[1].label, "Base");
  for (const actual of [run, load("weight-0.33_0.67_0.00")]) {
    const rr = comparisonRoles(
      actual,
      { t: actual.incumbents[0].time_s, nodeId: actual.incumbents[0].node_id },
      {
        t: actual.incumbents.at(-2).time_s,
        nodeId: actual.incumbents.at(-2).node_id,
      },
      true,
    );
    // Stress the deepest timestamped branch, not just the shallower incumbent nodes.
    let deepest = 0;
    for (let i = 0; i < actual.nodes.length; i++)
      if (
        !Number.isNaN(actual.nodes.raw(i, "time_s")) &&
        actual.nodes.raw(i, "depth") > actual.nodes.raw(deepest, "depth")
      )
        deepest = i;
    rr[0] = {
      ...rr[0],
      selection: {
        t: actual.nodes.raw(deepest, "time_s"),
        nodeId: deepest + 1,
      },
    };
    const ids = [
      ...new Set(
        rr.flatMap((r) =>
          ancestors(actual.nodes, snapshot(actual, r.selection).nodeId).map(
            (n) => n.node_id - 1,
          ),
        ),
      ),
    ];
    for (const vertical of [true, false]) {
      const view = treeCoordinates(actual, ids, true, vertical, 600, 630),
        points = ids.map((i) => [view.x(i), view.y(i)]),
        radius = pathNodeRadius(points);
      let min = Infinity;
      points.forEach((p, i) =>
        points.slice(0, i).forEach((q) => {
          min = Math.min(min, Math.hypot(p[0] - q[0], p[1] - q[1]));
        }),
      );
      assert(radius * 2 < min, "Opt-in focus glyphs must not overlap");
      for (const i of ids) {
        const [x, y] = view.inverse(view.x(i), view.y(i));
        assert(Math.abs(x - actual.nodes.raw(i, "x")) < 1e-6);
        assert(Math.abs(y - actual.nodes.raw(i, "y")) < 1e-6);
      }
      console.log(
        `${actual.id}: ${actual.nodes.length} retained nodes; ${ids.length} selected path nodes; ${vertical ? "vertical" : "horizontal"} minimum spacing ${min.toFixed(2)}px, glyph diameter ${(radius * 2).toFixed(2)}px`,
      );
    }
  }
  const shell = render(SearchTree, {
    run,
    roles,
    onViewTime: () => {},
    children: createElement(ComparisonPanel, {
      run,
      one,
      two,
      includeBase: true,
      onEdit: () => {},
    }),
  });
  assert(shell.includes("222,225"));
  assert(shell.includes("Null incumbent"));
  assert(shell.includes("Root"));
  assert(shell.includes("Shared · mixed colours"));
  assert(shell.includes("floating-comparison-table"));
  assert(shell.includes("floating-table-workspace"));
  assert(!shell.includes("tree-data-dock"));
  assert(!shell.includes("tree-inset"));
  assert(shell.includes("Drawing whole tree"));
  assert(!shell.includes("Incumbent missing"));
  for (const destination of ["tree", "results"])
    assert(
      render(ViewSwitcher, {
        run,
        roles,
        cells: shared,
        destination,
        onClick: () => {},
      }).includes("view-thumbnail"),
    );

  // The Overview card contains exactly four rows; a full tree card keeps all seven.
  const compact = render(NodeDetailCard, {
    node: run.nodes.get(64816),
    compact: true,
    onViewTime: () => {},
    onClose: () => {},
  });
  assert.equal((compact.match(/<dt>/g) || []).length, 4);
  for (const k of required.slice(0, 4)) assert(compact.includes(k));
  assert(compact.includes("View time"));
  for (const k of ["Branch decision", "Parent", "Depth"])
    assert(!compact.includes(k));
  assert.match(shell, /<button class="active">Fit tree<\/button>/);
  assert.match(shell, /<button class="">Focus paths<\/button>/);
  assert(
    shell.indexOf("floating-comparison-table") < shell.indexOf("tree-bottom"),
    "The floating table stays inside the plot, above the separate controls",
  );
  // Both ways of already having a pair bypass the Base/manual question in both variants.
  for (const includeBase of [true, false]) {
    const preview = { ...initialState, current: one, preview: two },
      p = comparisonEntry(preview, includeBase);
    assert(!p.prompt);
    const compared = reducer(preview, p.action);
    assert.equal(compared.page, "compare");
    assert.deepEqual(compared.two, two);
    const paired = { ...initialState, current: two, one, two },
      direct = comparisonEntry(paired, includeBase);
    assert(!direct.prompt);
    assert.equal(reducer(paired, direct.action).page, "compare");
  }
  assert(comparisonEntry({ ...initialState, current: one }, false).prompt);
  assert(!comparisonEntry({ ...initialState, current: one }, true).prompt);
  // Editing a result time returns to its results workspace, not the tree page.
  let edit = reducer(
    { ...initialState, one, two, current: two, page: "compare-results" },
    { type: "edit", role: "two", returnTo: "compare-results" },
  );
  const pending = comparisonEntry(edit, false, base);
  assert(!pending.prompt);
  edit = reducer(edit, pending.action);
  assert.equal(edit.page, "compare-results");
  assert.deepEqual(edit.two, base);
  const resultPanel = render(ComparisonPanel, {
    run,
    one,
    two,
    includeBase: true,
    onEdit: () => {},
    scope: "results",
    onFocusRole: () => {},
  });
  for (const label of [
    "Result comparison",
    "Objective value",
    "Selected grids",
    "Result time / s",
    "Differences",
    "View Selected 1 result",
  ])
    assert(resultPanel.includes(label));
  assert(!resultPanel.includes("Path relationships"));
  for (const includeBase of [true, false]) {
    const rs = comparisonRoles(run, one, two, includeBase),
      ls = rs.map((r) => denseLayout(run, r.selection.t));
    const html = render(ResultWorkspace, {
      run,
      roles: rs,
      layouts: ls,
      combined: combinedLayout(run, rs),
      one,
      two,
      includeBase,
      onEdit: () => {},
      onCell: () => {},
      pinnedCellId: null,
      onClearPin: () => {},
      view: "map",
      onViewChange: () => {},
      onSwap: () => {},
      onClose: () => {},
    });
    assert(html.includes("Shared and unique grids"));
    assert(html.includes("Hide table"));
    assert.match(
      html,
      /aria-expanded="true" aria-controls="result-comparison-table"/,
    );
    assert(html.includes('id="result-comparison-table"'));
    assert.match(html, /id="result-tab-compare"[^>]*aria-selected="true"/);
    assert(html.includes("All results"));
    assert(html.includes("Objective value"));
    assert.equal(html.includes("result-tab-best"), includeBase);
    assert(!html.includes("Individual results</h2>"));
    assert(html.includes("linear-gradient"));
  }
  // Two/three-owner cells allocate equal bands without mixing numeric source values.
  for (const colours of [
    [COLORS.one, COLORS.two],
    [COLORS.one, COLORS.two, COLORS.best],
  ]) {
    const bands = colourBands(colours);
    assert.equal(bands[0].start, 0);
    assert.equal(bands.at(-1).end, 1);
    assert.equal(bands.length, colours.length);
    const rects = [],
      ctx = {
        fillStyle: null,
        fillRect(x, y, w, h) {
          rects.push({ colour: this.fillStyle, x, y, w, h });
        },
      };
    paintCell(ctx, 0, 0, 120, 20, colours);
    assert.equal(rects.length, colours.length);
    assert.equal(
      rects.reduce((n, r) => n + r.w, 0),
      120,
    );
    assert.deepEqual(
      rects.map((r) => r.colour),
      colours,
    );
  }
  const stops = [],
    segments = [],
    ctx = {
      beginPath() {},
      moveTo(...p) {
        segments.push(p);
      },
      lineTo(...p) {
        segments.push(p);
      },
      createLinearGradient() {
        return {
          addColorStop(t, c) {
            stops.push([t, c]);
          },
        };
      },
      stroke() {
        this.strokes = (this.strokes ?? 0) + 1;
      },
    };
  paintPathEdge(
    ctx,
    [-1e9, 5],
    [1e9, 5],
    [COLORS.one, COLORS.two],
    3,
    [0, 0, 120, 20],
  );
  assert.equal(ctx.strokes, 1);
  assert(stops.length <= 800);
  assert.deepEqual(
    [...new Set(stops.map((s) => s[1]))],
    [COLORS.one, COLORS.two],
  );
  assert(Math.abs(segments[0][0]) < 1e-6);
  assert(Math.abs(segments[1][0] - 120) < 1e-6);
  assert.equal(denseLayout(run, -1), null);
  assert.equal(
    combinedLayout(run, [{ ...roles[0], selection: { t: -1 } }, roles[1]]),
    null,
  );
  console.log(
    "Passed: purple ordinary selection and green Base selection before/after return, ordinary labels after all three return choices, fresh comparison state, result table toggle markup, compact/full node cards, Fit tree, direct comparison entry, result editing return state, shared-first tabs, mixed membership, Base/Two identity and source values. SSR + data checks; browser interaction/FPS not measured.",
  );
} finally {
  await server.close();
}
