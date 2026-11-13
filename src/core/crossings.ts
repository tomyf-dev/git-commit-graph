import { compareEdgePaintOrder } from "./edge-order.js";
import type { MarkerGeometry } from "./markers.js";
import type { GraphLayout } from './types.js';

import type { Segment } from './path.js';

/** Solve Q(t).x = x, then use the tangent to distinguish a crossing from a merge. */
function crossingsAt(s: Segment, x: number) {
  if (s.cx === undefined || s.cy === undefined) {
    return s.y === s.ny && x >= Math.min(s.x,s.nx) && x <= Math.max(s.x,s.nx)
      ? [{ y: s.y, slope: 0 }] : [];
  }
  if (x < Math.min(s.x,s.cx,s.nx) || x > Math.max(s.x,s.cx,s.nx)) return [];
  const a = s.x-2*s.cx+s.nx, b = 2*(s.cx-s.x), c = s.x-x;
  const discriminant = b*b-4*a*c;
  const roots = Math.abs(a) < 1e-9 ? (Math.abs(b) < 1e-9 ? [] : [-c/b])
    : discriminant < 0 ? [] : [(-b+Math.sqrt(discriminant))/(2*a),(-b-Math.sqrt(discriminant))/(2*a)];
  return roots.filter((t,i) => t >= 0 && t <= 1 && roots.indexOf(t) === i).flatMap(t => {
    const dx = 2*((1-t)*(s.cx!-s.x)+t*(s.nx-s.cx!));
    const dy = 2*((1-t)*(s.cy!-s.y)+t*(s.ny-s.cy!));
    // Nearly parallel curves are junctions, not unambiguous underpasses.
    if (Math.abs(dx) < 1e-9 || Math.abs(dy) > Math.abs(dx)) return [];
    return [{ y:(1-t)**2*s.y+2*(1-t)*t*s.cy!+t*t*s.ny, slope:dy/dx }];
  });
}

/** Transparent underpasses distinguish crossings from connections, even in one color. */
export function crossingGaps(graph: GraphLayout, lineWidth: number, sizes: MarkerGeometry, paths: readonly (readonly Segment[])[]) {
  return paths.map((under, index) => {
    const gaps: { x: number; y: number; halfGap: number }[] = [];
    for (const v of under) {
      if (v.cx !== undefined || v.x !== v.nx) continue;
      for (let j = 0; j < paths.length; j++) {
        if (j === index || compareEdgePaintOrder(graph.edges[j], graph.edges[index]) < 0) continue;
        for (const over of paths[j]) for (const crossing of crossingsAt(over,v.x)) {
          // An oblique stroke covers a longer interval along the vertical line.
          const halfGap = (lineWidth / 2 + 1) * Math.hypot(1,crossing.slope);
          const y = crossing.y;
          // Keep the gap inside the vertical run, clear of its elbows and
          // shared roots, and outside the largest node/highlight envelope.
          const stroke = lineWidth / 2;
          if (y <= Math.min(v.y,v.ny) + halfGap + stroke || y >= Math.max(v.y,v.ny) - halfGap - stroke) continue;
          // Match the actual rectangular SVG mask, including its horizontal
          // extent. Center-distance alone misses a nearby ring or root.
          if (graph.rows.some(row => {
            const dx = Math.max(0,Math.abs(row.x-v.x)-lineWidth);
            const dy = Math.max(0,Math.abs(row.y-y)-halfGap);
            const clearance = row.kind !== 'commit'
              ? Math.hypot(Math.max(0,dx-(row.kind === "worktree" ? sizes.crossingBounds.worktree.halfX : sizes.crossingBounds.stash.halfX)),Math.max(0,dy-(row.kind === "worktree" ? sizes.crossingBounds.worktree.halfY : sizes.crossingBounds.stash.halfY)))
              : Math.hypot(dx,dy)-sizes.crossingBounds.commit.radius;
            return clearance < 1;
          })) continue;
          // The mask belongs to the entire edge. Protect other pieces of that
          // edge as well as the trunk being cut; use conservative curve bounds.
          const left=v.x-lineWidth-stroke, right=v.x+lineWidth+stroke;
          const top=y-halfGap-stroke, bottom=y+halfGap+stroke;
          if (under.some(s => s !== v &&
            Math.min(s.x,s.nx,s.cx ?? s.x) <= right && Math.max(s.x,s.nx,s.cx ?? s.x) >= left &&
            Math.min(s.y,s.ny,s.cy ?? s.y) <= bottom && Math.max(s.y,s.ny,s.cy ?? s.y) >= top)) continue;
          const existing = gaps.find(p => p.x === v.x && Math.abs(p.y-y) < 1e-7);
          if (existing) existing.halfGap = Math.max(existing.halfGap,halfGap);
          else gaps.push({ x: v.x, y, halfGap });
        }
      }
    }
    return gaps;
  });
}
