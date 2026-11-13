import assert from "node:assert/strict";
import test from "node:test";
import { createGraphLayout } from "../src/core/layout.js";
import { flatten, curvedOverlap } from "./helpers/curves.js";
import { enterNode, svgPath } from "../src/core/path.js";
import type { GitCommit, GitWorktree } from "../src/core/types.js";

test("one row per commit, first-parent chains remain vertical", () => {
  const layout = createGraphLayout([{ id: "b", parentIds: ["a"] }, { id: "a", parentIds: [] }]);
  assert.deepEqual(layout.rows.map(r => [r.kind, r.rowIndex, r.lane, r.y]), [["commit", 0, 0, 14], ["commit", 1, 0, 42]]);
  assert.equal(layout.edges.length, 1);
  assert.equal(layout.edges[0].path, "M 12 14 V 42");
});

test("forks and merges preserve every parent, and render rounded turns", () => {
  const commits = [
    { id: "merge", parentIds: ["main", "feature"] },
    { id: "feature", parentIds: ["root"] },
    { id: "main", parentIds: ["root"] },
    { id: "root", parentIds: [] },
  ];
  const layout = createGraphLayout(commits);
  assert.equal(layout.rows.length, 4);
  assert.equal(layout.laneCount, 2);
  assert.deepEqual(layout.edges.map(e => `${e.fromId}->${e.toId}`).sort(), ["merge->main", "merge->feature", "main->root", "feature->root"].sort());
  assert.ok(layout.edges.some(e => e.path.includes(" Q ")));
  assert.equal(layout.rows[0].lane, layout.rows[2].lane);
  assert.equal(layout.rows[0].color, layout.rows[2].color);
  assert.notEqual(layout.rows[0].color, layout.rows[1].color);
  assert.deepEqual(createGraphLayout(commits), layout);
});

test("worktrees get separate rows immediately above HEAD and never become commit parents", () => {
  const commits = [{ id: "head", parentIds: ["root", "feature"] }, { id: "feature", parentIds: ["root"] }, { id: "root", parentIds: [] }];
  const worktrees = [
    { id: "/main", headCommitId: "head" },
    { id: "/detached", headCommitId: "head" },
    { id: "/older", headCommitId: "root" },
  ];
  const layout = createGraphLayout(commits, worktrees);
  assert.deepEqual(layout.rows.map(r => r.kind === "commit" ? r.commit.id : r.kind === "worktree" ? r.worktree.id : r.stash.id), ["/main", "/detached", "head", "feature", "/older", "root"]);
  assert.equal(layout.rows[0].lane, 0);
  assert.notEqual(layout.rows[1].lane, layout.rows[0].lane);
  assert.ok(layout.rows[0].y < layout.rows[2].y);
  assert.ok(layout.rows[4].y < layout.rows[5].y);
  assert.equal(layout.edges.filter(e => e.kind === "parent").length, 3);
  assert.equal(layout.edges.filter(e => e.kind === "worktree").length, 3);
  assert.equal(layout.height, 6 * 28);
});

test("missing parents have boundary edges, unknown HEAD worktrees remain hidden", () => {
  const layout = createGraphLayout([{ id: "head", parentIds: ["missing"] }], [{ id: "w", headCommitId: "unknown" }]);
  assert.equal(layout.rows.length, 1);
  assert.equal(layout.edges[0].boundary, true);
  assert.equal(layout.edges[0].toId, "missing");
  assert.deepEqual(layout.hiddenWorktreeIds, ["w"]);
});

test("octopus merge, disconnected roots, and empty history", () => {
  const layout = createGraphLayout([
    { id: "merge", parentIds: ["a", "b", "c"] },
    { id: "a", parentIds: [] }, { id: "b", parentIds: [] }, { id: "c", parentIds: [] },
    { id: "separate", parentIds: [] },
  ]);
  assert.equal(layout.edges.length, 3);
  assert.equal(layout.laneCount, 3);
  assert.ok(!layout.edges.some(e => e.fromId === "separate" || e.toId === "separate"));
  assert.equal(createGraphLayout([]).height, 0);
});

test("invalid graphs fail instead of silently changing relationships", () => {
  const cases: GitCommit[][] = [
    [{ id: "a", parentIds: [] }, { id: "a", parentIds: [] }],
    [{ id: "a", parentIds: ["a"] }],
    [{ id: "a", parentIds: ["b", "b"] }],
    [{ id: "a", parentIds: ["b"] }, { id: "b", parentIds: ["a"] }],
    [{ id: "parent", parentIds: [] }, { id: "child", parentIds: ["parent"] }],
  ];
  for (const commits of cases) assert.throws(() => createGraphLayout(commits));
  assert.throws(() => createGraphLayout([], [], { rowHeight: NaN }));
  assert.throws(() => createGraphLayout([], [], { palette: [] }));
  assert.throws(() => createGraphLayout([], [{ id: "w", headCommitId: "a" }, { id: "w", headCommitId: "b" }]));
});

test("deterministic generated DAGs preserve all edges and avoid intermediate nodes on active lanes", () => {
  let seed = 12345;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let trial = 0; trial < 30; trial++) {
    const commits: GitCommit[] = Array.from({ length: 40 }, (_, i) => {
      const parents = new Set<string>();
      for (let p = 0; p < 3 && i < 39; p++) {
        if (random() < 0.6) parents.add(String(i + 1 + Math.floor(random() * (39 - i))));
      }
      return { id: String(i), parentIds: [...parents] };
    });
    const layout = createGraphLayout(commits);
    assert.equal(layout.rows.length, commits.length);
    assert.deepEqual(layout.edges.map(e => `${e.fromId}:${e.toId}`).sort(), commits.flatMap(c => c.parentIds.map(p => `${c.id}:${p}`)).sort());
    assert.equal(new Set(layout.rows.map(r => r.y)).size, commits.length);
    assert.ok(layout.edges.every(e => !/NaN|undefined|Infinity/.test(e.path)));
    for (const edge of layout.edges) {
      for (let i = Number(edge.fromId) + 1; i < Number(edge.toId); i++) {
        assert.notEqual(layout.rows[i].lane, edge.lane, "an active edge cannot pass through an unrelated node");
      }
    }
  }
});

test("preferred main spine survives earlier branch tips and post-merge continuation", () => {
  const commits = [
    { id: "continued", parentIds: ["feature"] },
    { id: "main", parentIds: ["base", "feature"] },
    { id: "base", parentIds: ["root"] },
    { id: "feature", parentIds: ["root"] },
    { id: "root", parentIds: [] },
  ];
  const graph = createGraphLayout(commits, [], { primaryHeadId: "main" });
  const row = (id: string) => graph.rows.find(r => r.kind === "commit" && r.commit.id === id)!;
  for (const id of ["main", "base", "root"]) assert.equal(row(id).lane, 0);
  assert.equal(row("continued").lane, row("feature").lane);
  assert.equal(row("continued").color, row("feature").color);
  assert.notEqual(row("feature").lane, 0);
});

test("clean worktrees do not add WIP; dirty branch and detached tips continue vertically", () => {
  const commits = [{ id: "tip", parentIds: ["root"] }, { id: "root", parentIds: [] }];
  const graph = createGraphLayout(commits, [
    { id: "clean", headCommitId: "root", isDirty: false },
    { id: "dirty", headCommitId: "tip", isDirty: true },
    { id: "detached", headCommitId: "tip", isDirty: true },
  ]);
  assert.equal(graph.rows.length, 4);
  assert.equal(graph.rows[0].lane, graph.rows[2].lane);
  assert.notEqual(graph.rows[0].lane, graph.rows[1].lane);
  assert.equal(graph.edges.filter(e => e.kind === "parent").length, 1);
});

test("released lanes reuse colors without moving a surviving spine", () => {
  const graph = createGraphLayout([
    { id: "m", parentIds: ["b", "f"] }, { id: "f", parentIds: ["b"] },
    { id: "b", parentIds: ["root", "g"] }, { id: "g", parentIds: ["root"] },
    { id: "root", parentIds: [] },
  ]);
  assert.equal(graph.rows[1].lane, graph.rows[3].lane);
  assert.equal(graph.rows[1].color, graph.rows[3].color);
});


test("primary WIP precedes all commits and reserves its lane above HEAD", () => {
  const graph = createGraphLayout([
    { id: "other", parentIds: [] },
    { id: "main", parentIds: ["base"] },
    { id: "base", parentIds: [] },
  ], [{ id: "main-worktree", headCommitId: "main", isDirty: true }], { primaryHeadId: "main" });
  assert.equal(graph.rows[0].kind, "worktree");
  assert.equal(graph.rows[0].lane, 0);
  assert.notEqual(graph.rows[1].lane, 0);
  assert.equal(graph.rows[2].lane, 0);
  assert.equal(graph.edges.filter(e => e.kind === "worktree").length, 1);
});

test("stash rows are independent annotations above their base, including multiple and missing bases", () => {
  const commits = [{ id: "main", parentIds: ["base"] }, { id: "base", parentIds: [] }];
  const graph = createGraphLayout(commits, [], { stashes: [
    { id: "stash@{0}", baseCommitId: "base" },
    { id: "stash@{1}", baseCommitId: "base" },
    { id: "stash@{2}", baseCommitId: "missing" },
  ] });
  assert.deepEqual(graph.rows.map(r => r.kind), ["commit", "stash", "stash", "commit"]);
  assert.notEqual(graph.rows[1].lane, graph.rows[2].lane);
  assert.equal(graph.edges.filter(e => e.kind === "parent").length, 1);
  assert.equal(graph.edges.filter(e => e.kind === "stash").length, 2);
  assert.deepEqual(graph.hiddenStashIds, ["stash@{2}"]);
  assert.throws(() => createGraphLayout(commits, [], { stashes: [
    { id: "same", baseCommitId: "base" }, { id: "same", baseCommitId: "main" },
  ] }));
});

test("merge and fork elbows connect horizontally at node centers", () => {
  const graph = createGraphLayout([
    { id: "merge", parentIds: ["main", "feature"] },
    { id: "main", parentIds: ["root"] },
    { id: "feature", parentIds: ["root"] },
    { id: "root", parentIds: [] },
  ]);
  const merge = graph.edges.find(e => e.fromId === "merge" && e.toId === "feature")!;
  const fork = graph.edges.find(e => e.fromId === "feature")!;
  assert.equal(merge.path, "M 12 14 H 26 Q 28 14 28 16 V 70");
  assert.equal(fork.path, "M 28 70 V 96 Q 28 98 26 98 H 12");
});

test("WIP at merged nested branch and detached interior HEAD does not occupy history lanes", () => {
  const commits = [
    { id: "main", parentIds: ["base", "ui"] },
    { id: "ui", parentIds: ["navigation", "nested"] },
    { id: "navigation", parentIds: ["shell"] },
    { id: "nested", parentIds: ["shell"] },
    { id: "shell", parentIds: ["base"] },
    { id: "base", parentIds: [] },
  ];
  const worktrees = [
    { id: "nested-worktree", headCommitId: "nested", isDirty: true },
    { id: "detached-navigation", headCommitId: "navigation", isDirty: true },
  ];
  const graph = createGraphLayout(commits, worktrees, { primaryHeadId: "main" });
  const baseline = createGraphLayout(commits, [], { primaryHeadId: "main" });
  for (const row of graph.rows) {
    if (row.kind === "commit") {
      assert.equal(row.lane, baseline.rows.find(r => r.kind === "commit" && r.commit.id === row.commit.id)!.lane);
    } else if (row.kind === "worktree") {
      const head = graph.rows.find(r => r.kind === "commit" && r.commit.id === row.worktree.headCommitId)!;
      assert.notEqual(row.lane, head.lane);
      assert.ok(row.y < head.y);
    }
  }
  for (const edge of graph.edges.filter(e => e.kind === "parent")) {
    const source = graph.rows.find(r => r.kind === "commit" && r.commit.id === edge.fromId)!;
    const target = graph.rows.find(r => r.kind === "commit" && r.commit.id === edge.toId)!;
    for (const row of graph.rows.filter(r => r.y > source.y && r.y < target.y)) {
      assert.notEqual(row.lane, edge.lane, "history must not pass through a WIP or unrelated commit");
    }
  }
});

test("all 10240 current-worktree and dirty-state combinations preserve history lanes and avoid overlapping connections", async () => {
  const { readFile } = await import("node:fs/promises");
  const data = JSON.parse(await readFile(new URL("./fixtures/repository.json", import.meta.url), "utf8"));
  assert.equal(data.worktrees.length, 10, "fixture must cover ten worktrees");
  type Segment = { x1: number; y1: number; x2: number; y2: number };
  const segments = (path: string): Segment[] => {
    const tokens = path.split(/\s+/); const result: Segment[] = []; let x = 0, y = 0;
    for (let i = 0; i < tokens.length;) {
      const command = tokens[i++];
      if (command === "M") { x = Number(tokens[i++]); y = Number(tokens[i++]); }
      else if (command === "Q") { i += 2; x = Number(tokens[i++]); y = Number(tokens[i++]); }
      else if (command === "H" || command === "V") {
        const value = Number(tokens[i++]); const nx = command === "H" ? value : x, ny = command === "V" ? value : y;
        if (nx !== x || ny !== y) result.push({ x1: x, y1: y, x2: nx, y2: ny });
        x = nx; y = ny;
      } else assert.fail(`Unsupported path command: ${command}`);
    }
    return result;
  };
  const overlap = (a: Segment, b: Segment) => {
    const range = (a1: number, a2: number, b1: number, b2: number) => Math.min(Math.max(a1,a2), Math.max(b1,b2)) > Math.max(Math.min(a1,a2), Math.min(b1,b2));
    return a.x1 === a.x2 && b.x1 === b.x2 && a.x1 === b.x1 && range(a.y1,a.y2,b.y1,b.y2)
      || a.y1 === a.y2 && b.y1 === b.y2 && a.y1 === b.y1 && range(a.x1,a.x2,b.x1,b.x2);
  };
  for (const current of data.worktrees as GitWorktree[]) {
    const options = { ...data, primaryWorktreeId: current.id, primaryHeadId: current.headCommitId };
    const baseline = createGraphLayout(data.commits, data.worktrees.map((w: GitWorktree) => ({ ...w, isDirty: true })), options);
    for (let mask = 0; mask < 2 ** data.worktrees.length; mask++) {
    const graph = createGraphLayout(data.commits, data.worktrees.map((w: GitWorktree, i: number) => ({ ...w, isDirty: Boolean(mask & (1 << i)) })), options);
    const currentHead = graph.rows.find(r => r.kind === "commit" && r.commit.id === current.headCommitId)!;
    assert.equal(currentHead.lane, 0, `current ${current.id}, mask ${mask}: preferred HEAD must stay leftmost`);
    const currentWip = graph.rows.find(r => r.kind === "worktree" && r.worktree.id === current.id);
    const currentDirty = Boolean(mask & (1 << data.worktrees.findIndex((w: GitWorktree) => w.id === current.id)));
    if (currentDirty) assert.equal(currentWip?.rowIndex, 0);
    else assert.equal(currentWip, undefined);
    const identity = (r: typeof graph.rows[number]) => r.kind === "commit" ? r.commit.id : r.kind === "worktree" ? r.worktree.id : r.stash.id;
    for (const row of graph.rows) {
      const original = baseline.rows.find(r => r.kind === row.kind && identity(r) === identity(row))!;
      if (row.kind === "commit") assert.equal(row.lane, original.lane, `current ${current.id}, mask ${mask}: ${identity(row)} changed lane`);
      assert.equal(row.color, original.color, `current ${current.id}, mask ${mask}: ${identity(row)} changed color`);
    }
    assert.equal(graph.rows.filter(r => r.kind === "worktree").length, mask.toString(2).replaceAll("0", "").length);
    for (const edge of graph.edges.filter(e => e.kind === "parent")) {
      const original = baseline.edges.find(e => e.kind === "parent" && e.fromId === edge.fromId && e.toId === edge.toId)!;
      assert.equal(edge.lane, original.lane, `current ${current.id}, mask ${mask}: history edge changed lane`);
      const source = graph.rows.find(r => r.kind === "commit" && r.commit.id === edge.fromId)!;
      const target = graph.rows.find(r => r.kind === "commit" && r.commit.id === edge.toId)!;
      for (const row of graph.rows.filter(r => r.y > source.y && r.y < target.y)) assert.notEqual(row.lane, edge.lane, `current ${current.id}, mask ${mask}: history passes through node`);
    }
  const flattened = new Map(graph.edges.map(edge => [edge, flatten(edge.path)]));
  for (const wip of graph.edges.filter(e => e.kind === "worktree")) {
    const curveHead = graph.rows.find(r => r.kind === "commit" && r.commit.id === wip.fromId)!;
    for (const other of graph.edges.filter(e => e !== wip)) {
      const sharedRoot = other.kind === "parent" ? other.fromId === wip.fromId || other.toId === wip.fromId : other.fromId === wip.fromId;
      const outsideRoot = (edge: typeof wip) => flattened.get(edge)!.filter(s => !sharedRoot || !s.curve || Math.abs(s.y - curveHead.y) > 6 || Math.abs(s.ny - curveHead.y) > 6);
      assert.ok(!curvedOverlap(outsideRoot(wip), outsideRoot(other), curveHead), `current ${current.id}, mask ${mask}: WIP corner overlaps ${other.kind} ${other.toId}`);
      assert.ok(!segments(wip.path).some(a => segments(other.path).some(b => !(sharedRoot && a.y1 === a.y2 && b.y1 === b.y2 && a.y1 === curveHead.y && b.y1 === curveHead.y) && overlap(a,b))), `WIP ${wip.toId} overlaps ${other.kind} ${other.toId}`);
    }
    const marker = graph.rows.find(r => r.kind === "worktree" && r.worktree.id === wip.toId)!;
    const head = graph.rows.find(r => r.kind === "commit" && r.commit.id === wip.fromId)!;
    if (marker.x !== head.x) {
      assert.ok(wip.path.endsWith(`H ${head.x}`), "WIP must join at the commit center horizontally");
      const tail = flattened.get(wip)!.at(-1)!;
      assert.equal(tail.y, head.y);
      assert.equal(tail.ny, head.y);
    }
    for (const row of graph.rows.filter(r => r.y > marker.y && r.y < head.y)) assert.notEqual(row.lane, wip.lane);
  }
  }
  }
});


test("annotation connections use a straight center-height root and bounded rounded corners", () => {
  for (const [from, to] of [[120, 12], [12, 120]]) {
    const path = svgPath(enterNode(from, to, 100, 6));
    assert.ok(path.includes(" H "), "wide connections must have a horizontal straight segment");
    const tokens = path.split(/\s+/); let x = from, y = 72; let turns = 0;
    for (let i = 0; i < tokens.length;) {
      const command = tokens[i++];
      if (command === "V") y = Number(tokens[i++]);
      else if (command === "H") x = Number(tokens[i++]);
      else if (command === "Q") {
        const cx = Number(tokens[i++]), cy = Number(tokens[i++]);
        const nx = Number(tokens[i++]), ny = Number(tokens[i++]);
        assert.ok(Math.max(x,cx,nx) - Math.min(x,cx,nx) <= 6);
        assert.ok(Math.max(y,cy,ny) - Math.min(y,cy,ny) <= 6);
        x = nx; y = ny; turns++;
      } else assert.fail(command);
    }
    assert.equal(turns, 1);
    assert.equal(x, to);
    assert.equal(y, 100);
  }
});

test("each worktree can be current, with WIP pinned only when dirty", async () => {
  const { readFile } = await import("node:fs/promises");
  const data = JSON.parse(await readFile(new URL("./fixtures/repository.json", import.meta.url), "utf8"));
  for (const current of data.worktrees as GitWorktree[]) {
    for (const dirty of [false, true]) {
      const graph = createGraphLayout(data.commits, data.worktrees.map((w: GitWorktree) => ({ ...w, isDirty: w.id === current.id ? dirty : true })),
        { ...data, primaryWorktreeId: current.id, primaryHeadId: current.headCommitId });
      const head = graph.rows.find(r => r.kind === "commit" && r.commit.id === current.headCommitId)!;
      assert.equal(head.lane, 0);
      const wip = graph.rows.find(r => r.kind === "worktree" && r.worktree.id === current.id);
      if (dirty) assert.equal(wip?.rowIndex, 0);
      else assert.equal(wip, undefined);
      for (const edge of graph.edges.filter(e => e.kind === "worktree")) {
        const marker = graph.rows.find(r => r.kind === "worktree" && r.worktree.id === edge.toId)!;
        const target = graph.rows.find(r => r.kind === "commit" && r.commit.id === edge.fromId)!;
        for (const row of graph.rows.filter(r => r.y > marker.y && r.y < target.y)) assert.notEqual(row.lane, edge.lane, current.id);
      }
    }
  }
});

test("curve overlap check detects the former elongated corner outside the shared node", () => {
  const head = { x: 28, y: 70 };
  const history = flatten("M 28 0 V 70");
  const former = flatten("M 60 42 V 50 Q 60 56 54 56 H 34 Q 28 56 28 70");
  assert.equal(curvedOverlap(former, history, head), true);
  const rounded = flatten(`M 60 42 ${svgPath(enterNode(60, 28, 70, 6))}`);
  assert.equal(curvedOverlap(rounded, history, head), false);
});

test("square annotation roots intentionally coincide with horizontal history", () => {
  for (const [from, to] of [[60, 12], [12, 60]]) {
    const path = `M ${from} 42 ${svgPath(enterNode(from, to, 70, 0))}`;
    const segments = flatten(path);
    assert.ok(segments.filter(s => s.y === s.ny).every(s => s.y === 70));
    assert.equal(segments.at(-1)?.nx, to);
    assert.equal(segments.at(-1)?.ny, 70);
  }
});

test("stashes stay beside their base and WIP when another worktree owns the left lane", () => {
  const commits = [{ id: "main", parentIds: ["root"] }, { id: "other", parentIds: ["root"] }, { id: "root", parentIds: [] }];
  for (const current of ["main", "other"]) for (const mainDirty of [false, true]) for (const otherDirty of [false, true]) {
    const graph = createGraphLayout(commits, [
      { id: "main-wt", headCommitId: "main", isDirty: mainDirty },
      { id: "other-wt", headCommitId: "other", isDirty: otherDirty },
    ], { primaryHeadId: current, primaryWorktreeId: `${current}-wt`, rowHeight: 32,
      stashes: [{ id: "stash", baseCommitId: "main", label: "Saved" }, { id: "stash2", baseCommitId: "main", label: "Saved again" }] });
    const base = graph.rows.find(r => r.kind === "commit" && r.commit.id === "main")!;
    const annotations = graph.rows.filter(r => r.kind === "stash" || (r.kind === "worktree" && r.worktree.headCommitId === "main"));
    assert.equal(new Set(annotations.map(r => r.lane)).size, annotations.length);
    for (const stash of graph.rows.filter(r => r.kind === "stash")) {
      assert.ok(stash.lane > base.lane);
      const edge = graph.edges.find(e => e.kind === "stash" && e.toId === (stash.kind === "stash" ? stash.stash.id : ""))!;
      assert.equal(edge.fromId, "main");
    }
  }
});
