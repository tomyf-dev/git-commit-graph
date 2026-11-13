import type { Segment } from './path.js';
import { routeHistory, routeAnnotation } from "./routing.js";
import type { GitCommit, GitWorktree, GitStash, GraphEdge, GraphLayout, GraphOptions, GraphRow } from "./types.js";

export const DEFAULT_PALETTE = ["#16a6bd", "#1677ff", "#62c936", "#c829dc", "#f018a6", "#ef4935"] as const;

function dimension(name: string, value: number, minimum: number): number {
  if (!Number.isFinite(value) || value < minimum) {
    throw new Error(`${name} must be a finite number >= ${minimum}`);
  }
  return value;
}

/**
 * Input order is display order: every known parent must follow its children.
 * The primary WIP is first; other WIP and stash rows precede their base.
 * This function is pure and does not read Git, the filesystem, or the DOM.
 */
export function createGraphLayout(
  commits: readonly GitCommit[],
  worktrees: readonly GitWorktree[] = [],
  options: GraphOptions = {},
): GraphLayout {
  return computeGraph(commits, worktrees, options).graph;
}

/** Internal result carries numeric paths; the public layout remains unchanged. */
export function computeGraph(commits: readonly GitCommit[], worktrees: readonly GitWorktree[] = [], options: GraphOptions = {}) {

  const rowHeight = dimension("rowHeight", options.rowHeight ?? 28, 1);
  const laneWidth = dimension("laneWidth", options.laneWidth ?? 16, 1);
  const paddingX = dimension("paddingX", options.paddingX ?? 12, 0);
  const nodeRadius = dimension("nodeRadius", options.nodeRadius ?? 4, Number.MIN_VALUE);
  const lineWidth = dimension("lineWidth", options.lineWidth ?? 2, Number.MIN_VALUE);
  const radius = dimension("cornerRadius", options.cornerRadius ?? 2, 0);
  const palette = options.palette ?? DEFAULT_PALETTE;
  if (!palette.length || palette.some(color => !color.trim())) throw new Error("palette must contain non-empty colors");

  const commitIndex = new Map<string, number>();
  commits.forEach((commit, index) => {
    if (!commit.id || commitIndex.has(commit.id)) throw new Error(`Duplicate or empty commit id: ${commit.id}`);
    commitIndex.set(commit.id, index);
  });
  commits.forEach((commit, index) => {
    const seen = new Set<string>();
    for (const parent of commit.parentIds) {
      if (!parent || seen.has(parent)) throw new Error(`Duplicate or empty parent of ${commit.id}`);
      seen.add(parent);
      const parentIndex = commitIndex.get(parent);
      if (parentIndex !== undefined && parentIndex <= index) {
        throw new Error(`Parent ${parent} must follow child ${commit.id} (cycle or invalid order)`);
      }
    }
  });

  const byHead = new Map<string, GitWorktree[]>();
  const worktreeIds = new Set<string>();
  const hiddenWorktreeIds: string[] = [];
  for (const worktree of worktrees) {
    if (!worktree.id || !worktree.headCommitId || worktreeIds.has(worktree.id)) {
      throw new Error(`Duplicate or invalid worktree: ${worktree.id}`);
    }
    worktreeIds.add(worktree.id);
    if (!commitIndex.has(worktree.headCommitId)) {
      hiddenWorktreeIds.push(worktree.id);
      continue;
    }
    const group = byHead.get(worktree.headCommitId) ?? [];
    group.push(worktree);
    byHead.set(worktree.headCommitId, group);
  }

  const stashesByBase = new Map<string, GitStash[]>();
  const stashIds = new Set<string>();
  const hiddenStashIds: string[] = [];
  for (const stash of options.stashes ?? []) {
    if (!stash.id || !stash.baseCommitId || stashIds.has(stash.id)) throw new Error(`Duplicate or invalid stash: ${stash.id}`);
    stashIds.add(stash.id);
    if (!commitIndex.has(stash.baseCommitId)) { hiddenStashIds.push(stash.id); continue; }
    const group = stashesByBase.get(stash.baseCommitId) ?? [];
    group.push(stash);
    stashesByBase.set(stash.baseCommitId, group);
  }
  const primaryWorktree = options.primaryWorktreeId
    ? worktrees.find(w => w.id === options.primaryWorktreeId)
    : worktrees.find(w => w.headCommitId === options.primaryHeadId);
  const pinned = primaryWorktree && primaryWorktree.isDirty !== false && commitIndex.has(primaryWorktree.headCommitId)
    ? primaryWorktree : undefined;

  // Assign first-parent chains before drawing. A merge cannot steal the lane
  // of a branch that continues above it, and a preferred spine owns its ancestry.
  const byId = new Map(commits.map(c => [c.id, c]));
  const owner = new Map<string, number>();
  const chains: { start: number; end: number; lane: number }[] = [];
  for (const tip of [...(options.primaryHeadId ? [options.primaryHeadId] : []), ...commits.map(c => c.id)]) {
    if (!byId.has(tip) || owner.has(tip)) continue;
    const chain = { start: commitIndex.get(tip)!, end: 0, lane: 0 };
    const index = chains.length;
    let id: string | undefined = tip;
    while (id && byId.has(id) && !owner.has(id)) {
      owner.set(id, index);
      const commit: GitCommit = byId.get(id)!;
      chain.end = commitIndex.get(id)!;
      id = commit.parentIds[0];
    }
    if (id) chain.end = commitIndex.get(id) ?? commits.length;
    chains.push(chain);
  }
  // A secondary-parent edge occupies its destination chain from the merge row.
  for (const [index, commit] of commits.entries()) {
    for (const parent of commit.parentIds.slice(1)) {
      const chain = owner.get(parent);
      if (chain !== undefined) chains[chain].start = Math.min(chains[chain].start, index);
    }
  }
  const hasChildren = new Set(commits.flatMap(c => [...c.parentIds]));
  // Keep the preferred spine reserved even when its WIP is hidden. Otherwise
  // cleaning the current worktree lets earlier histories steal its lane.
  if (options.primaryHeadId && owner.has(options.primaryHeadId)) chains[owner.get(options.primaryHeadId)!].start = -1;
  const occupied: { start: number; end: number }[][] = [];
  const reserve = (start: number, end: number, minimum = 0) => {
    let lane = minimum;
    while (occupied[lane]?.some(span => (start < span.end && end > span.start) || start === span.start)) lane++;
    (occupied[lane] ??= []).push({ start, end });
    return lane;
  };
  // The preferred chain is first; remaining chains follow their visible start.
  const ordered = chains.map((chain, index) => ({ chain, index }));
  ordered.sort((a, b) => {
    if (options.primaryHeadId && (a.index === 0 || b.index === 0)) return a.index - b.index;
    return a.chain.start - b.chain.start || a.index - b.index;
  });
  for (const { chain } of ordered) chain.lane = reserve(chain.start, chain.end);
  const rows: GraphRow[] = [];
  const edges: GraphEdge[] = [];
  const paths: Segment[][] = [];
  const commitRows = new Map<string, GraphRow>();
  const markers: { row: GraphRow; head: string }[] = [];
  const x = (lane: number) => paddingX + lane * laneWidth;
  const color = (lane: number) => palette[lane % palette.length];
  let laneCount = occupied.length;
  const position = (lane: number, shade = color(lane)) => {
    laneCount = Math.max(laneCount, lane + 1);
    return { rowIndex: rows.length, lane, x: x(lane), y: (rows.length + 0.5) * rowHeight, color: shade };
  };
  if (pinned && commitIndex.has(pinned.headCommitId)) {
    const headLane = chains[owner.get(pinned.headCommitId)!].lane;
    // Only visible WIP needs a corridor; clean worktrees reserve no marker lane.
    const lane = hasChildren.has(pinned.headCommitId) ? reserve(-1, commitIndex.get(pinned.headCommitId)!, headLane + 1) : headLane;
    const row: GraphRow = { kind: "worktree", worktree: pinned, ...position(lane, color(headLane)) };
    rows.push(row);
    markers.push({ row, head: pinned.headCommitId });
  }
  for (const [index, commit] of commits.entries()) {
    const lane = chains[owner.get(commit.id)!].lane;
    let usedHeadLane = hasChildren.has(commit.id) || pinned?.headCommitId === commit.id;
    for (const worktree of byHead.get(commit.id) ?? []) {
      if (worktree.isDirty === false || worktree === pinned) continue;
      // A tip WIP continues its branch vertically. At an interior HEAD, use
      // a separate lane so an existing history edge cannot run through WIP.
      const markerLane = usedHeadLane ? reserve(index - 0.5, index, lane + 1) : lane;
      usedHeadLane = true;
      const row: GraphRow = { kind: "worktree", worktree, ...position(markerLane, color(lane)) };
      rows.push(row);
      markers.push({ row, head: commit.id });
    }
    for (const stash of stashesByBase.get(commit.id) ?? []) {
      // A stash is a sibling of WIP, never a continuation of its HEAD lane.
      // Chain reservations start at the commit, so they do not cover this
      // preceding annotation interval. Search to the right of the base lane.
      const stashLane = reserve(index - 0.5, index, lane + 1);
      const row: GraphRow = { kind: "stash", stash, ...position(stashLane, palette[4 % palette.length]) };
      rows.push(row);
      markers.push({ row, head: commit.id });
    }
    const row: GraphRow = { kind: "commit", commit, ...position(lane) };
    rows.push(row);
    commitRows.set(commit.id, row);
  }
  for (const commit of commits) {
    const source = commitRows.get(commit.id)!;
    commit.parentIds.forEach((parentId, parentIndex) => {
      const target = commitRows.get(parentId);
      // First-parent edges stay on the child lane until they join the older
      // spine. Merge edges leave immediately and follow the parent's lane.
      let lane = target ? (parentIndex === 0 ? source.lane : target.lane)
        : reserve(commitIndex.get(commit.id)!, commits.length);
      if (target && rows.some(row => row.kind === "commit" && row.y > source.y && row.y < target.y && row.lane === lane)) {
        lane = reserve(commitIndex.get(commit.id)!, commitIndex.get(parentId)!);
      }
      laneCount = Math.max(laneCount, lane + 1);
      const endY = target?.y ?? rows.length * rowHeight;
      const route = routeHistory(source, target, x(lane), endY, radius);
      edges.push({ kind: "parent", fromId: commit.id, toId: parentId, color: parentIndex === 0 ? source.color : (target?.color ?? color(lane)), lane, path: route.path, boundary: !target });
      paths.push(route.segments);
    });
  }
  for (const { row, head } of markers) {
    const target = commitRows.get(head)!;
    const route = routeAnnotation(row, target, radius, nodeRadius, lineWidth);
    paths.push(route.segments);
    edges.push({ kind: row.kind === "stash" ? "stash" : "worktree", fromId: head, toId: row.kind === "worktree" ? row.worktree.id : row.kind === "stash" ? row.stash.id : "", color: row.color, lane: row.lane,
      path: route.path, boundary: false });
  }
  const graph: GraphLayout = { rows, edges, width: laneCount ? paddingX * 2 + (laneCount - 1) * laneWidth : 0,
    height: rows.length * rowHeight, rowHeight, laneWidth, laneCount, hiddenWorktreeIds, hiddenStashIds };
  return { graph, paths };
}
