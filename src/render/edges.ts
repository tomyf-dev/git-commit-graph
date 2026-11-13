import { h } from './vnode.js';
import type { GraphLayout } from '../core/types.js';
import { compareEdgePaintOrder } from '../core/edge-order.js';
import { edgeStroke, type EdgeStyle } from '../core/edge-style.js';
import type { nodeOcclusion } from '../core/occlusion.js';
import type { crossingGaps } from '../core/crossings.js';

interface MaskProps {
  id: string;
  graph: GraphLayout;
  gaps: ReturnType<typeof crossingGaps>;
  crossingWidth: number;
  nodeMasks: ReturnType<typeof nodeOcclusion>[];
}

export function EdgeMasks({ id, graph, gaps, crossingWidth, nodeMasks }: MaskProps) {
  return h('defs', null,
    // Cut paths away from hollow nodes without painting a fake background.
    h('mask', { id, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: graph.width, height: graph.height },
      h('rect', { width: graph.width, height: graph.height, fill: 'white' }),
      nodeMasks.map(shape => shape.kind === 'rect'
        ? h('rect', { key: shape.key, 'data-mask-row': shape.key, x: shape.x, y: shape.y, width: shape.width, height: shape.height, rx: shape.rx, fill: 'black' })
        : h('circle', { key: shape.key, 'data-mask-row': shape.key, cx: shape.cx, cy: shape.cy, r: shape.r, fill: 'black' })),
    ),
    gaps.map((points, index) => points.length > 0 && h('mask', {
      key: index, id: `${id}-crossing-${index}`, maskUnits: 'userSpaceOnUse',
      x: 0, y: 0, width: graph.width, height: graph.height,
    },
      h('rect', { width: graph.width, height: graph.height, fill: 'white' }),
      points.map(p => h('rect', {
        key: `${p.x},${p.y}`, 'data-crossing-gap': '',
        x: p.x - crossingWidth, y: p.y - p.halfGap,
        width: crossingWidth * 2, height: p.halfGap * 2, fill: 'black',
      })),
    )),
  );
}

export function EdgeLines({ id, graph, gaps, style }: Pick<MaskProps, 'id' | 'graph' | 'gaps'> & { style: EdgeStyle }) {
  return h('g', {
    fill: 'none', strokeWidth: style.lineWidth, strokeLinecap: 'round', strokeLinejoin: 'round',
    mask: `url(#${id})`, 'aria-hidden': 'true',
  },
    graph.edges.map((edge, index) => ({ edge, index }))
      .sort((a, b) => compareEdgePaintOrder(a.edge, b.edge))
      .map(({ edge, index }) => h('path', {
        key: JSON.stringify([edge.kind, edge.fromId, edge.toId]),
        mask: gaps[index].length ? `url(#${id}-crossing-${index})` : undefined,
        'data-edge-lane': edge.lane,
        'data-edge-kind': edge.kind,
        'data-from': edge.fromId,
        'data-to': edge.toId,
        'data-boundary': edge.boundary || undefined,
        d: edge.path,
        stroke: edge.color,
        ...edgeStroke(edge, style),
      })),
  );
}
