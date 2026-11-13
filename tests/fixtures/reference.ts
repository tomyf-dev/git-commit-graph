import repository from "./repository.json" with { type: "json" };

// Reproduce only the history visible in the supplied GitKraken image.
// The detached experiment is absent there; this is not a historical Git snapshot.
export const referenceCommits = repository.commits.filter(c => !c.id.startsWith("1ec8cea"));
export const referenceWorktrees = repository.worktrees.slice(0, 8).map((w, index) => ({
  ...w, isDirty: [0, 2, 3, 5, 7].includes(index),
}));
export const referenceLanes = [0, 1, 1, 2, 3, 3, 0, 4, 0, 0, 0, 3, 3, 4, 5, 0, 4, 0, 0, 0, 0, 1, 1, 4, 1, 0, 0, 3, 3, 0];
