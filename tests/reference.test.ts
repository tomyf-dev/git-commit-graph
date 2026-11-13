import test from "node:test";
import assert from "node:assert/strict";
import { createGraphLayout } from "../src/core/layout.js";
import { referenceCommits, referenceWorktrees, referenceLanes } from "./fixtures/reference.js";
import repository from "./fixtures/repository.json" with { type: "json" };

test("reference image has 30 rows on the observed six lanes, with clean WIP absent", () => {
  const graph = createGraphLayout(referenceCommits, referenceWorktrees, { ...repository, laneWidth: 22, rowHeight: 28 });
  assert.deepEqual(graph.rows.map(r => r.lane), referenceLanes);
  assert.equal(graph.laneCount, 6);
  assert.deepEqual(graph.rows.filter(r => r.kind === "worktree").map(r => r.worktree.label),
    ["main", "feature/active", "feature/conflict", "feature/merged-continued"]);
  // Secondary parents leave a merge immediately; first-parent branches join
  // their older spine at the parent, rather than drifting between lanes.
  for (const edge of graph.edges.filter(e => e.kind === "parent")) {
    const source = graph.rows.find(r => r.kind === "commit" && r.commit.id === edge.fromId)!;
    const target = graph.rows.find(r => r.kind === "commit" && r.commit.id === edge.toId)!;
    const commit = referenceCommits.find(c => c.id === edge.fromId)!;
    assert.equal(edge.lane, commit.parentIds[0] === edge.toId ? source.lane : target.lane);
    if (source.lane !== target.lane) {
      assert.match(edge.path, / Q /);
      if (commit.parentIds[0] === edge.toId) assert.ok(edge.path.endsWith(`H ${target.x}`));
      else assert.match(edge.path, /^M [\d.]+ [\d.]+ H /);
    }
  }
});

test("clean interior current HEAD reserves no invisible WIP corridor", () => {
  const commits = [{id: "tip", parentIds: ["base"]}, {id: "base", parentIds: []}];
  const options = {primaryHeadId: "base", primaryWorktreeId: "current", stashes: [{id: "stash", baseCommitId: "base"}]};
  const clean = createGraphLayout(commits, [{id: "current", headCommitId: "base", isDirty: false}], options);
  const absent = createGraphLayout(commits, [], options);
  assert.deepEqual(clean.rows, absent.rows);
  assert.deepEqual(clean.edges, absent.edges);
  assert.equal(clean.width, absent.width);
});

test("all reference current worktrees and dirty masks have no empty lanes or clean WIP", () => {
  for (const current of referenceWorktrees) for (let mask = 0; mask < 256; mask++) {
    const worktrees = referenceWorktrees.map((w, i) => ({...w, isDirty: Boolean(mask & (1 << i))}));
    const graph = createGraphLayout(referenceCommits, worktrees, {...repository, primaryWorktreeId: current.id, primaryHeadId: current.headCommitId});
    for (let lane = 0; lane < graph.laneCount; lane++) {
      assert.ok(graph.rows.some(r => r.lane === lane) || graph.edges.some(e => e.lane === lane), `empty lane ${lane}, ${current.id}, ${mask}`);
    }
    for (const worktree of worktrees) {
      const row = graph.rows.find(r => r.kind === "worktree" && r.worktree.id === worktree.id);
      const visible = referenceCommits.some(c => c.id === worktree.headCommitId);
      assert.equal(Boolean(row), worktree.isDirty && visible);
      if (row && worktree.id === current.id) assert.equal(row.rowIndex, 0);
    }
  }
});

test("reference stash uses a center-to-center horizontal root instead of a diagonal WIP entry", () => {
  const graph = createGraphLayout(referenceCommits, referenceWorktrees, {...repository, laneWidth: 22, rowHeight: 28, cornerRadius: 6});
  const stash = graph.rows.find(r => r.kind === "stash")!;
  const edge = graph.edges.find(e => e.kind === "stash")!;
  const base = graph.rows.find(r => r.kind === "commit" && r.commit.id === edge.fromId)!;
  assert.equal(edge.path, `M ${stash.x} ${stash.y} V ${base.y - 6} Q ${stash.x} ${base.y} ${stash.x - 6} ${base.y} H ${base.x}`);
});

test("stash retains a visible horizontal root at narrow spacing and large corners", () => {
  const current = referenceWorktrees.find(w => w.label === "feature/ui")!;
  const graph = createGraphLayout(referenceCommits, referenceWorktrees, {...repository,
    primaryHeadId: current.headCommitId, primaryWorktreeId: current.id,
    laneWidth: 12, rowHeight: 24, nodeRadius: 4, lineWidth: 4, cornerRadius: 24});
  const edge = graph.edges.find(e => e.kind === "stash")!;
  const base = graph.rows.find(r => r.kind === "commit" && r.commit.id === edge.fromId)!;
  const endOfCorner = edge.path.match(/Q [\d.]+ [\d.]+ ([\d.]+) [\d.]+ H/)!;
  assert.ok(endOfCorner, "stash must have a horizontal entry");
  assert.ok(Math.abs(Number(endOfCorner[1]) - base.x) >= 8, "root must extend beyond the 6px rendered node outline");
});
