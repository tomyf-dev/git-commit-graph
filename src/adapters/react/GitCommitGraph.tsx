import { createElement, useEffect, useId, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { GraphProps } from "../../types.js";
import type { GraphLayout } from "../../core/types.js";
import { prepareGraph, renderGraph, rowKey } from "../../render/scene.js";
import type { VNode } from "../../render/vnode.js";
export interface GitCommitGraphProps extends Omit<GraphProps, "style"> { style?: CSSProperties }
function element(node: VNode | string | number): ReactNode {
 if (typeof node !== "object") return node;
 return createElement(node.tag, node.props, ...node.children.map(element));
}
export function GitCommitGraph(props: GitCommitGraphProps) {
 const { commits, worktrees, stashes, layout, appearance, onLayoutChange } = props;
 const neutral = props as GraphProps;
 const prepared = useMemo(() => prepareGraph(neutral), [commits, worktrees, stashes, layout?.primaryWorktreeId, layout?.primaryHeadId, layout?.rowHeight, layout?.laneWidth, layout?.paddingX, appearance?.cornerRadius, appearance?.nodeRadius, appearance?.lineWidth, appearance?.dotDiameter, appearance?.palette]);
 const { graph } = prepared;
 const id = useId();
 const [hoveredRow, setHoveredRow] = useState<string | null>(null);
 const [focusedRow, setFocusedRow] = useState<string | null>(null);
 useEffect(() => {
  const visible = new Set(graph.rows.map(rowKey));
  if (hoveredRow && !visible.has(hoveredRow)) setHoveredRow(null);
  if (focusedRow && !visible.has(focusedRow)) setFocusedRow(null);
 }, [graph, hoveredRow, focusedRow]);
 const notified = useRef<GraphLayout | null>(null);
 useEffect(() => { if (notified.current !== graph) { notified.current = graph; onLayoutChange?.(graph); } }, [graph, onLayoutChange]);
 return element(renderGraph(neutral, prepared, { id, hoveredRow, focusedRow, setHoveredRow, setFocusedRow }));
}
export default GitCommitGraph;
