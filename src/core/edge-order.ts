import { isSolidEdge } from './edge-style.js';
import type { GraphEdge } from './types.js';

/** SVG paints later edges on top: solid history takes precedence over dashed annotations. */
export function compareEdgePaintOrder(a: GraphEdge, b: GraphEdge): number {
  const solid = (edge: GraphEdge) => Number(isSolidEdge(edge));
  return solid(a) - solid(b) || a.lane - b.lane;
}
