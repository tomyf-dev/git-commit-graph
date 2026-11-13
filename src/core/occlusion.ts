import type { MarkerGeometry } from './markers.js';

export interface MaskNode { key: string; kind: 'commit' | 'worktree' | 'stash'; x: number; y: number; highlighted: boolean }

/** Geometry only; the SVG renderer chooses mask IDs and element attributes. */
export function nodeOcclusion(node: MaskNode, sizes: MarkerGeometry) {
  if (node.kind === 'commit') return { kind: 'circle' as const, key: node.key, cx: node.x, cy: node.y,
    r: node.highlighted ? sizes.ringRadius + 1.5 : sizes.radius };
  const { halfX, halfY } = sizes.nodeMasks[node.kind];
  return { kind: 'rect' as const, key: node.key, x: node.x - halfX, y: node.y - halfY, width: 2 * halfX, height: 2 * halfY, rx: 1 };
}
