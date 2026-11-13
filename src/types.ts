import type { GitCommit, GitWorktree, GitStash, GraphLayout, GraphOptions } from "./core/types.js";
export interface GraphProps {
  commits: readonly GitCommit[];
  worktrees?: readonly GitWorktree[];
  stashes?: readonly GitStash[];
  onStashClick?: (stash: GitStash) => void;
  layout?: Pick<GraphOptions, "rowHeight" | "laneWidth" | "paddingX" | "primaryHeadId" | "primaryWorktreeId">;
  appearance?: {
    nodeRadius?: number;
    lineWidth?: number;
    dotDiameter?: number;
    cornerRadius?: number;
    palette?: readonly string[];
    background?: string;
  };
  selectedCommitId?: string | null;
  onCommitClick?: (commit: GitCommit) => void;
  onWorktreeClick?: (worktree: GitWorktree) => void;
  /** Rows include worktree markers, so a host can align its text with the graph. */
  onLayoutChange?: (layout: GraphLayout) => void;
  className?: string;
  style?: Record<string, string | number | undefined>;
  ariaLabel?: string;
}

