/** Shared marker sizing. Keep drawing, node masks and crossing clearance together. */
export function markerGeometry(radius: number, laneWidth: number, rowHeight: number, crossingWidth: number) {
  const markerRadius = Math.max(radius, Math.min(radius + 4, laneWidth / 2 - 3, rowHeight / 2 - 5));
  const iconBase = Math.max(markerRadius, Math.min(markerRadius + 2, laneWidth / 2 - 2, rowHeight / 2 - 4));
  const treeRadius = Math.min(10, iconBase + 1);
  const ringRadius = Math.min(radius + 3, rowHeight / 2 - 2.5);
  const nodeMasks = {
    worktree: { halfX: treeRadius, halfY: treeRadius + 4 },
    stash: { halfX: markerRadius, halfY: markerRadius },
  };
  // Preserve the established crossing clearance, which is deliberately distinct
  // from the visible masks. Changing it moves the transparent underpasses.
  const stashX = Math.max(markerRadius + 2, radius + 3 + Math.min(crossingWidth, radius / 2) / 2) + 1.5;
  const stashY = Math.min(markerRadius + 2, rowHeight / 2 - 2.5) + 1.5;
  const crossingBounds = {
    commit: { radius: ringRadius + 1.5 },
    stash: { halfX: stashX, halfY: stashY },
    worktree: { halfX: Math.max(stashX, iconBase + 3.5), halfY: Math.max(stashY, Math.min(iconBase + 2, rowHeight / 2 - 2.5) + 1.5) },
  };
  return { radius, ringRadius, treeRadius, nodeMasks, crossingBounds };
}
export type MarkerGeometry = ReturnType<typeof markerGeometry>;
