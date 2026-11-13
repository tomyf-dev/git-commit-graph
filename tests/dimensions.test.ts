import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createGraphLayout } from "../src/core/layout.js";
import type { GitWorktree, GraphRow } from "../src/core/types.js";
import { flatten, curvedOverlap } from "./helpers/curves.js";
import { regressionDimensions } from "./helpers/dimensions.js";

type Point = { x: number; y: number };
function geometry(path: string, id: number) {
  const segments = flatten(path);
  const points = segments.flatMap(s => [{ x: s.x, y: s.y }, { x: s.nx, y: s.ny }]);
  return { id, segments, straight: segments.filter(s => !s.curve),
    ends: [points[0], points.at(-1)!],
    left: Math.min(...points.map(p => p.x)), right: Math.max(...points.map(p => p.x)),
    top: Math.min(...points.map(p => p.y)), bottom: Math.max(...points.map(p => p.y)) };
}
type Geometry = ReturnType<typeof geometry>;
function straightOverlap(a: Geometry, b: Geometry, shared: Point[], width: number, radius: number, junctionYs: number[] = []) {
  for (const s of a.straight) for (const t of b.straight) {
    const vertical = s.x === s.nx && t.x === t.nx;
    const horizontal = s.y === s.ny && t.y === t.ny;
    if (!vertical && !horizontal) continue;
    const distance = vertical ? Math.abs(s.x-t.x) : Math.abs(s.y-t.y);
    if (distance >= width - .01) continue;
    if (horizontal && junctionYs.some(y => Math.abs(s.y-y) < .01 && Math.abs(t.y-y) < .01)) continue;
    const low = vertical ? Math.max(Math.min(s.y,s.ny),Math.min(t.y,t.ny)) : Math.max(Math.min(s.x,s.nx),Math.min(t.x,t.nx));
    const high = vertical ? Math.min(Math.max(s.y,s.ny),Math.max(t.y,t.ny)) : Math.min(Math.max(s.x,s.nx),Math.max(t.x,t.nx));
    if (high <= low + .01) continue;
    // Ignore only intervals covered by a common endpoint's rendered node.
    const covered = shared.some(p => {
      const cross = vertical ? Math.max(Math.abs(s.x-p.x),Math.abs(t.x-p.x)) : Math.max(Math.abs(s.y-p.y),Math.abs(t.y-p.y));
      const outer = radius + width/2;
      const extent = Math.sqrt(Math.max(0, outer*outer-cross*cross));
      const axis = vertical ? p.y : p.x;
      return cross <= outer && low >= axis-extent && high <= axis+extent;
    });
    if (!covered) return true;
  }
  return false;
}
const rowId = (row: GraphRow) => row.kind === "commit" ? row.commit.id : row.kind === "worktree" ? row.worktree.id : row.stash.id;

test("all regression dimensions × current worktree × dirty mask", { skip: !process.env.GRAPH_EXHAUSTIVE }, async () => {
  const data = JSON.parse(await readFile(process.env.GRAPH_REPOSITORY_SNAPSHOT ?? new URL("./fixtures/repository.json", import.meta.url), "utf8"));
  const worktrees: GitWorktree[] = data.worktrees;
  const states = 2 ** worktrees.length;
  const dimensions = regressionDimensions();
  assert.equal(dimensions.length, 1302, "update the regression matrix count when dimensions change");
  // Optional shards partition the full matrix by stroke width without sampling states.
  const selected = dimensions.filter(d => !process.env.GRAPH_LINE_WIDTH || d.lineWidth === Number(process.env.GRAPH_LINE_WIDTH));
  assert.ok(selected.length);
  let checked = 0;
  for (const dimensions of selected) {
    const {lineWidth, nodeRadius} = dimensions;
    // Memoize only identical SVG paths / pairs. Every state still gets a fresh
    // layout and assertions; this does not deduplicate or sample graph states.
    const paths = new Map<string, Geometry>();
    const pairs = new Set<string>();
    const nodes = new Set<string>();
    for (const current of worktrees) {
      const options = { ...data, ...dimensions, primaryHeadId: current.headCommitId, primaryWorktreeId: current.id };
      const baseline = createGraphLayout(data.commits, worktrees.map(w => ({ ...w, isDirty: true })), options);
      const lanes = new Map(baseline.rows.map(r => [rowId(r), r.lane]));
      for (let mask = 0; mask < states; mask++) {
        const graph = createGraphLayout(data.commits, worktrees.map((w, i) => ({ ...w, isDirty: Boolean(mask & (1 << i)) })), options);
        const context = `${JSON.stringify(dimensions)} current=${current.id} mask=${mask}`;
        const extent = (r: GraphRow) => Math.max(nodeRadius + 3, r.kind === "stash" ? Math.hypot(nodeRadius+1,nodeRadius) : 0) + lineWidth/2;
        for (let i = 0; i < graph.rows.length; i++) {
          const row = graph.rows[i];
          if (row.kind === "commit") assert.equal(row.lane, lanes.get(rowId(row)), context);
          for (let j = i+1; j < graph.rows.length; j++) {
            const other = graph.rows[j];
            const sum = extent(row) + extent(other);
            if (other.y-row.y >= sum) break;
            assert.ok(Math.hypot(other.x-row.x, other.y-row.y) >= sum-.05, `${context}: node/node ${rowId(row)} ${rowId(other)}`);
          }
        }
        const shapes = graph.edges.map(edge => {
          let shape = paths.get(edge.path);
          if (!shape) { shape = geometry(edge.path, paths.size); paths.set(edge.path, shape); }
          return shape;
        });
        for (let i=0; i<graph.edges.length; i++) {
          const edge = graph.edges[i], shape = shapes[i];
          for (const row of graph.rows) {
            const id = rowId(row);
            if ((row.kind === "commit" && (id === edge.fromId || (edge.kind === "parent" && id === edge.toId))) || (row.kind === edge.kind && id === edge.toId)) continue;
            const clearance = extent(row) + lineWidth/2;
            if (row.x < shape.left-clearance || row.x > shape.right+clearance || row.y < shape.top-clearance || row.y > shape.bottom+clearance) continue;
            const key = `${shape.id}:${row.x},${row.y},${row.kind}`;
            if (nodes.has(key)) continue;
            for (const s of shape.segments) {
              if (row.x < Math.min(s.x,s.nx)-clearance || row.x > Math.max(s.x,s.nx)+clearance || row.y < Math.min(s.y,s.ny)-clearance || row.y > Math.max(s.y,s.ny)+clearance) continue;
              const dx=s.nx-s.x, dy=s.ny-s.y;
              const t=Math.max(0,Math.min(1,((row.x-s.x)*dx+(row.y-s.y)*dy)/(dx*dx+dy*dy)));
              const distance=Math.hypot(row.x-s.x-t*dx,row.y-s.y-t*dy);
              assert.ok(distance >= clearance-.05, `${context}: ${edge.kind} ${edge.toId} touches ${row.kind} ${id}, distance=${distance}`);
            }
            nodes.add(key);
          }
          for (let j=i+1; j<graph.edges.length; j++) {
            const otherEdge = graph.edges[j];
            // A merge edge and the branch's first-parent edge intentionally
            // share the tail leading to their common parent commit.
            if (edge.kind === "parent" && otherEdge.kind === "parent" && edge.toId === otherEdge.toId) continue;
            const other = shapes[j];
            if (shape.left > other.right+lineWidth || other.left > shape.right+lineWidth || shape.top > other.bottom+lineWidth || other.top > shape.bottom+lineWidth) continue;
            const historyPair = edge.kind === "parent" && otherEdge.kind === "parent";
            const key = `${historyPair}:` + (shape.id < other.id ? `${shape.id}:${other.id}` : `${other.id}:${shape.id}`);
            if (pairs.has(key)) continue;
            const shared = shape.ends.filter(p => other.ends.some(q => p.x === q.x && p.y === q.y));
            // All edges at a shared commit can share horizontal roots and
            // rounded fan-in/out. Vertical trunks remain checked.
            const junctionYs = shared.map(p => p.y);
            const outsideJunction = (g: Geometry) => {
              // Exempt only the corner directly attached to a shared horizontal
              // root, not every corner in a row-height band around that root.
              const rootCorners = new Set<Geometry["segments"][number]>();
              for (const reverse of [false, true]) {
                const segments = reverse ? [...g.segments].reverse() : g.segments;
                const endpoint = g.ends[reverse ? 1 : 0];
                if (!shared.some(p => p.x === endpoint.x && p.y === endpoint.y)) continue;
                const first = segments[0];
                let horizontalRoot = Boolean(first?.curve && Math.abs(first.ny-first.y) <= Math.abs(first.nx-first.x) / 32);
                for (const segment of segments) {
                  if (!segment.curve) {
                    if (segment.y !== endpoint.y || segment.ny !== endpoint.y) break;
                    horizontalRoot = true;
                  } else {
                    if (!horizontalRoot) break;
                    rootCorners.add(segment);
                    const next = segments[segments.indexOf(segment) + 1];
                    if (!next?.curve) break;
                  }
                }
              }
              return g.segments.filter(s => !rootCorners.has(s));
            };
            const a = outsideJunction(shape), b = outsideJunction(other);
            assert.ok(!straightOverlap(shape, other, shared, lineWidth, nodeRadius, junctionYs), `${context}: straight ${edge.kind} ${edge.toId} overlaps ${graph.edges[j].kind} ${graph.edges[j].toId}`);
            assert.ok(!curvedOverlap(a, b, shared, lineWidth, nodeRadius) && !curvedOverlap(b, a, shared, lineWidth, nodeRadius), `${context}: corner ${edge.kind} ${edge.toId} overlaps ${graph.edges[j].kind} ${graph.edges[j].toId}`);
            pairs.add(key);
          }
        }
        checked++;
      }
    }
    console.log(`Checked ${JSON.stringify(dimensions)}: ${worktrees.length * states} states; total ${checked}`);
  }
  assert.equal(checked, selected.length * worktrees.length * states);
});
