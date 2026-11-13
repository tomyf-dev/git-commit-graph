export type PathCommand = ['M', number, number] | ['H' | 'V', number] | ['Q', number, number, number, number];
export interface Segment { x: number; y: number; nx: number; ny: number; cx?: number; cy?: number }
export function svgPath(commands: readonly PathCommand[]): string {
  return commands.map(command => command.join(' ')).join(' ');
}
/** Keep numeric geometry alongside the public SVG path, without reparsing SVG. */
export function pathGeometry(commands: readonly PathCommand[]) {
  const segments: Segment[] = [];
  let x = 0, y = 0;
  for (const command of commands) {
    if (command[0] === 'M') { x = command[1]; y = command[2]; continue; }
    if (command[0] === 'Q') {
      const [, cx, cy, nx, ny] = command;
      segments.push({ x, y, nx, ny, cx, cy }); x = nx; y = ny;
    } else {
      const nx = command[0] === 'H' ? command[1] : x;
      const ny = command[0] === 'V' ? command[1] : y;
      if (nx !== x || ny !== y) segments.push({ x, y, nx, ny });
      x = nx; y = ny;
    }
  }
  return { path: svgPath(commands), segments };
}

/** Leave a merge horizontally at its center, then round into the branch lane. */
export function leaveNode(fromX: number, toX: number, y: number, radius: number): PathCommand[] {
  if (fromX === toX) return [];
  const direction = Math.sign(toX - fromX);
  const r = Math.min(radius, Math.abs(toX - fromX));
  return [['H', toX - direction * r], ['Q', toX, y, toX, y + r]];
}

/** Join the parent horizontally at its center, rounding out of the branch lane. */
export function enterNode(fromX: number, toX: number, y: number, radius: number): PathCommand[] {
  if (fromX === toX) return [['V', y]];
  const direction = Math.sign(toX - fromX);
  const r = Math.min(radius, Math.abs(toX - fromX));
  return [['V', y - r], ['Q', fromX, y, fromX + direction * r, y], ['H', toX]];
}

