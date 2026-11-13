import { crossingGaps as computeGaps } from '../../src/core/crossings.js';
import { markerGeometry } from '../../src/core/markers.js';
import type { GraphLayout } from '../../src/core/types.js';
type Segment = { x: number; y: number; nx: number; ny: number; cx?: number; cy?: number };
function segments(path: string): Segment[] {
  const tokens = path.split(/\s+/), result: Segment[] = [];
  let x = 0, y = 0;
  for (let i = 0; i < tokens.length;) {
    const command = tokens[i++];
    if (command === 'M') { x = Number(tokens[i++]); y = Number(tokens[i++]); }
    else if (command === 'Q') {
      const cx = Number(tokens[i++]), cy = Number(tokens[i++]);
      const nx = Number(tokens[i++]), ny = Number(tokens[i++]);
      result.push({x,y,nx,ny,cx,cy}); x = nx; y = ny;
    } else if (command === 'H' || command === 'V') {
      const nx = command === 'H' ? Number(tokens[i++]) : x;
      const ny = command === 'V' ? Number(tokens[i++]) : y;
      if (nx !== x || ny !== y) result.push({ x, y, nx, ny });
      x = nx; y = ny;
    } else throw new Error(`Unsupported SVG command: ${command}`);
  }
  return result;
}


export function crossingGaps(graph: GraphLayout, width: number, radius: number) {
 return computeGaps(graph, width, markerGeometry(radius, graph.laneWidth, graph.rowHeight, width), graph.edges.map(edge => segments(edge.path)));
}
