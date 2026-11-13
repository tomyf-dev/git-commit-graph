import type { GraphEdge } from './types.js';

export function resolveEdgeStyle(lineWidth: number, dotDiameter = lineWidth) {
  if (!Number.isFinite(dotDiameter) || dotDiameter <= 0) throw new Error('dotDiameter must be a positive finite number');
  return { lineWidth, dotDiameter, dotSpacing: Math.max(3, dotDiameter * 2), crossingWidth: Math.max(lineWidth, dotDiameter) };
}
export type EdgeStyle = ReturnType<typeof resolveEdgeStyle>;
export function isSolidEdge(edge: Pick<GraphEdge, 'kind' | 'boundary'>): boolean {
  return edge.kind === 'parent' && !edge.boundary;
}
export function edgeStroke(edge: Pick<GraphEdge, 'kind' | 'boundary'>, style: EdgeStyle) {
  return { strokeWidth: isSolidEdge(edge) ? style.lineWidth : style.dotDiameter,
    strokeDasharray: isSolidEdge(edge) ? undefined : `0 ${style.dotSpacing}` };
}
