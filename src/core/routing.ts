import { enterNode, leaveNode, pathGeometry, type PathCommand } from './path.js';

export interface Point { x: number; y: number }

/** History follows an already allocated corridor; routing never assigns lanes. */
export function routeHistory(source: Point, target: Point | undefined, corridorX: number, endY: number, cornerRadius: number) {
  const commands: PathCommand[] = [['M', source.x, source.y]];
  const radius = Math.min(cornerRadius, (endY - source.y) / 2);
  if (source.x !== corridorX) commands.push(...leaveNode(source.x, corridorX, source.y, radius));
  if (target && target.x !== corridorX) commands.push(...enterNode(corridorX, target.x, endY, radius));
  else commands.push(['V', endY]);
  return pathGeometry(commands);
}

/** An annotation joins the commit center, preserving a straight shared root. */
export function routeAnnotation(source: Point, target: Point, cornerRadius: number, nodeRadius: number, lineWidth: number) {
  const radius = Math.min(cornerRadius, (target.y - source.y) / 2,
    Math.max(0, Math.abs(source.x - target.x) - nodeRadius - lineWidth / 2 - 2));
  return pathGeometry([['M', source.x, source.y], ...enterNode(source.x, target.x, target.y, radius)]);
}
