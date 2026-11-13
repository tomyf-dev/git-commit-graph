export interface GitCommit {
  id: string;
  /** Parents in Git's order. The first entry is the first parent. */
  parentIds: readonly string[];
}

export interface GitWorktree {
  /** Unique identifier; a worktree path can be used. */
  id: string;
  headCommitId: string;
  isDetached?: boolean;
  label?: string;
  /** false hides the WIP row; omitted preserves legacy marker behavior. */
  isDirty?: boolean;
  /** Changed files, including untracked files; each path is counted once. */
  changedFileCount?: number;
}

export interface GitStash {
  id: string;
  commitId?: string;
  /** Branch recorded when saved; "(no branch)" means detached HEAD. */
  sourceBranch?: string;
  subject?: string;
  body?: string;
  baseCommitId: string;
  label?: string;
}

export interface GraphOptions {
  /** Stashes are display annotations, never normal merge commits. */
  stashes?: readonly GitStash[];
  /** Pin this worktree's WIP to the first row. Defaults to the first primary HEAD worktree. */
  primaryWorktreeId?: string;
  /** Reserve the leftmost first-parent spine for this visible commit. */
  primaryHeadId?: string;
  rowHeight?: number;
  laneWidth?: number;
  paddingX?: number;
  cornerRadius?: number;
  /** Rendered dimensions used to keep annotation approaches clear. */
  nodeRadius?: number;
  lineWidth?: number;
  palette?: readonly string[];
}

interface RowPosition {
  rowIndex: number;
  lane: number;
  x: number;
  y: number;
  color: string;
}

export type GraphRow = RowPosition & (
  | { kind: "commit"; commit: GitCommit }
  | { kind: "worktree"; worktree: GitWorktree }
  | { kind: "stash"; stash: GitStash }
);

export interface GraphEdge {
  /** Lane occupied by the vertical part of the connection. */
  lane: number;
  kind: "parent" | "worktree" | "stash";
  fromId: string;
  toId: string;
  color: string;
  path: string;
  /** True only when the parent is outside the supplied history. */
  boundary: boolean;
}

export interface GraphLayout {
  rows: readonly GraphRow[];
  edges: readonly GraphEdge[];
  width: number;
  height: number;
  rowHeight: number;
  laneWidth: number;
  laneCount: number;
  /** Worktrees whose HEAD is outside the supplied commits. */
  hiddenWorktreeIds: readonly string[];
  hiddenStashIds: readonly string[];
}
