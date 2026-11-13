import type { GitCommit, GitStash, GitWorktree, GraphProps } from '../../src/index.js';

/** Both bundled samples and capture-repository output use this JSON shape. */
export interface RepositoryData {
  commits: (GitCommit & { subject: string; body?: string; refs?: string })[];
  worktrees: GitWorktree[];
  stashes: GitStash[];
  primaryWorktreeId: string;
  primaryHeadId: string;
}

const files = import.meta.glob<RepositoryData>(['../data/*.json', '../../tmp/data/*.json'], { eager: true, import: 'default' });
export const sources = Object.entries(files).map(([path, data]) => ({
  id: path.split('/').pop()!, data,
})).sort((a, b) => Number(b.id === 'sample.json') - Number(a.id === 'sample.json') || a.id.localeCompare(b.id));
export const initialSource = sources.find(source => source.id === 'sample.json')!;

export function graphProps(data: RepositoryData): GraphProps {
  return {
    commits: data.commits, worktrees: data.worktrees, stashes: data.stashes,
    layout: { rowHeight: 32, laneWidth: 22, paddingX: 16, primaryWorktreeId: data.primaryWorktreeId, primaryHeadId: data.primaryHeadId },
    appearance: { nodeRadius: 4, lineWidth: 2, dotDiameter: 3, cornerRadius: 8 },
  };
}
