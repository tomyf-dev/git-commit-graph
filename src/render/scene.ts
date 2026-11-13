import { h, type VNode } from "./vnode.js";
import { SvgIcon, SvgShape } from "./svg-icons.js";
import commitShape from "../assets/icons/commit.svg?raw";
import selectionRingShape from "../assets/icons/selection-ring.svg?raw";
import tree from "../assets/icons/tree.svg?raw";
import archive from "../assets/icons/archive.svg?raw";
import { EdgeMasks, EdgeLines } from "./edges.js";
import { resolveEdgeStyle } from "../core/edge-style.js";
import { markerGeometry } from "../core/markers.js";
import { nodeOcclusion } from "../core/occlusion.js";
import { crossingGaps } from "../core/crossings.js";
import { computeGraph } from "../core/layout.js";
import type { GraphRow } from "../core/types.js";
import type { GraphProps } from "../types.js";
export const rowKey = (row: GraphRow) => JSON.stringify([row.kind, row.kind === "commit" ? row.commit.id : row.kind === "worktree" ? row.worktree.id : row.stash.id]);
export function prepareGraph(props: GraphProps) {
 const { commits, worktrees, stashes, layout, appearance } = props;
  const { graph, paths } = computeGraph(commits, worktrees, {
    stashes,
    primaryWorktreeId: layout?.primaryWorktreeId,
    primaryHeadId: layout?.primaryHeadId,
    rowHeight: layout?.rowHeight,
    laneWidth: layout?.laneWidth,
    paddingX: layout?.paddingX,
    cornerRadius: appearance?.cornerRadius,
    nodeRadius: appearance?.nodeRadius,
    lineWidth: appearance?.lineWidth,
    palette: appearance?.palette,
  });
  const radius = appearance?.nodeRadius ?? 4;
  const lineWidth = appearance?.lineWidth ?? 2;
  const edgeStyle = resolveEdgeStyle(lineWidth, appearance?.dotDiameter);
  const { crossingWidth } = edgeStyle;
  const markers = markerGeometry(radius, graph.laneWidth, graph.rowHeight, crossingWidth);
  const { treeRadius, ringRadius } = markers;
  const hitRadius = Math.min(Math.max(radius + 4, 8), graph.rowHeight / 2, graph.laneWidth / 2);
  const overhang = radius + lineWidth + 3;
  const padding = layout?.paddingX ?? 12;
  if (graph.rows.length && (overhang > padding || overhang * 2 > graph.rowHeight || radius * 2 + lineWidth > graph.laneWidth)) {
    throw new Error("Increase paddingX, rowHeight or laneWidth to fit the nodes and their highlight rings");
  }

  const gaps = crossingGaps(graph, crossingWidth, markers, paths);
  return { graph, edgeStyle, radius, lineWidth, crossingWidth, markers, treeRadius, hitRadius, gaps, ringRadius };
}
export function renderGraph(props: GraphProps, prepared: ReturnType<typeof prepareGraph>, state: {
 id: string; hoveredRow: string | null; focusedRow: string | null;
 setHoveredRow: (id: string | null) => void; setFocusedRow: (id: string | null) => void;
}): VNode {
 const { layout, appearance, selectedCommitId, onCommitClick, onWorktreeClick, onStashClick, className, style, ariaLabel = "Git commit graph" } = props;
 const { graph, radius, lineWidth, crossingWidth, treeRadius, hitRadius, gaps, ringRadius } = prepared;
 const { id, hoveredRow, focusedRow, setHoveredRow, setFocusedRow } = state;
 const isHighlighted = (row: GraphRow) => (row.kind === "commit" && row.commit.id === selectedCommitId) || hoveredRow === rowKey(row) || focusedRow === rowKey(row);
  return h('svg', {
    xmlns: 'http://www.w3.org/2000/svg',
    width: graph.width,
    height: graph.height,
    role: 'group',
    'aria-label': ariaLabel,
    className,
    style: { display: 'block', flex: 'none', background: appearance?.background, ...style },
    'data-git-commit-graph': '',
  },
    h('title', null, ariaLabel),
    EdgeMasks({ id, graph, gaps, crossingWidth,
      nodeMasks: graph.rows.map(row => nodeOcclusion({
        key: rowKey(row), kind: row.kind, x: row.x, y: row.y, highlighted: isHighlighted(row),
      }, prepared.markers)),
    }),
    EdgeLines({ id, graph, gaps, style: prepared.edgeStyle }),
    graph.rows.map(row => {
      const isCommit = row.kind === 'commit';
      const isCurrentWorktree = row.kind === 'worktree' && row.worktree.id === layout?.primaryWorktreeId;
      const label = isCommit ? `Commit ${row.commit.id}` : row.kind === 'worktree' ? `Worktree ${row.worktree.label ?? row.worktree.id}` : `Stash ${row.stash.label ?? row.stash.id}`;
      const interactive = isCommit ? Boolean(onCommitClick) : row.kind === 'worktree' ? Boolean(onWorktreeClick) : Boolean(onStashClick);
      const selected = isCommit && row.commit.id === selectedCommitId;
      const highlighted = isHighlighted(row);
      const activate = () => {
        if (row.kind === 'commit') onCommitClick?.(row.commit);
        else if (row.kind === 'worktree') onWorktreeClick?.(row.worktree);
        else onStashClick?.(row.stash);
      };
      return h('g', {
        key: rowKey(row),
        role: interactive ? 'button' : 'img',
        tabIndex: interactive ? 0 : undefined,
        'aria-label': label,
        'aria-pressed': interactive && isCommit ? selected : undefined,
        'data-row-kind': row.kind,
        'data-highlighted': highlighted || undefined,
        'data-row-index': row.rowIndex,
        'data-commit-id': isCommit ? row.commit.id : undefined,
        'data-worktree-id': row.kind === 'worktree' ? row.worktree.id : undefined,
        'data-stash-id': row.kind === 'stash' ? row.stash.id : undefined,
        style: { cursor: interactive ? 'pointer' : undefined, outline: 'none' },
        onClick: activate,
        onKeyDown: (event: KeyboardEvent) => {
          if (interactive && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            activate();
          }
        },
        onPointerEnter: () => setHoveredRow(rowKey(row)),
        onPointerLeave: () => setHoveredRow(null),
        onFocus: () => setFocusedRow(rowKey(row)),
        onBlur: () => setFocusedRow(null),
      },
        h('title', null, label),
        highlighted && isCommit && SvgShape({
          shape: selectionRingShape, color: row.color, 'data-highlight': '',
          cx: row.x, cy: row.y, r: ringRadius, strokeWidth: 1,
          opacity: selected || focusedRow === rowKey(row) ? 1 : .5, pointerEvents: 'none',
        }),
        row.kind === 'stash'
          ? SvgIcon({ icon: archive, 'data-node': '', 'data-icon': 'archive',
              x: row.x - treeRadius, y: row.y - treeRadius, width: 2 * treeRadius, height: 2 * treeRadius, style: { color: row.color } })
          : row.kind === 'worktree'
            ? SvgIcon({ icon: tree, 'data-node': '', 'data-current-worktree': isCurrentWorktree ? '' : undefined, 'data-icon': 'tree',
                x: row.x - treeRadius, y: row.y - treeRadius, width: 2 * treeRadius, height: 2 * treeRadius, style: { color: row.color } })
            : SvgShape({ shape: commitShape, color: row.color, 'data-node': '', cx: row.x, cy: row.y, r: radius, strokeWidth: lineWidth }),
        h('circle', { cx: row.x, cy: row.y, r: hitRadius, fill: 'transparent', stroke: 'none' }),
      );
    }),
  );
}
