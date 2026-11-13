import { prepareGraph, renderGraph, rowKey } from '../../render/scene.js';
import type { GraphProps } from '../../types.js';
import type { VNode } from '../../render/vnode.js';

const namespace = 'http://www.w3.org/2000/svg';
let nextId = 0;
const attributes: Record<string, string> = { className: 'class', tabIndex: 'tabindex', strokeWidth: 'stroke-width', strokeLinecap: 'stroke-linecap', strokeLinejoin: 'stroke-linejoin', strokeDasharray: 'stroke-dasharray', pointerEvents: 'pointer-events' };
const eventNames: Record<string, string> = { onClick: 'click', onKeyDown: 'keydown', onPointerEnter: 'pointerenter', onPointerLeave: 'pointerleave', onFocus: 'focus', onBlur: 'blur' };
type Child = VNode | string | number;
interface Mounted { node: Node; value: Child; children: Mounted[] }
function patch(parent: Node, old: Mounted | undefined, value: Child): Mounted {
 const object = typeof value === 'object';
 const compatible = old && (typeof old.value === 'object' ? object && old.value.tag === (value as VNode).tag : !object);
 if (!compatible) {
  const node = object ? parent.ownerDocument!.createElementNS(namespace, value.tag) : parent.ownerDocument!.createTextNode(String(value));
  if (old) parent.replaceChild(node, old.node); else parent.appendChild(node);
  old = { node, value: object ? { tag: value.tag, props: {}, children: [] } : '', children: [] };
 }
 const mounted = old!;
 if (!object) { if (mounted.value !== value) mounted.node.textContent = String(value); mounted.value = value; return mounted; }
 const element = mounted.node as SVGElement;
 const previous = (mounted.value as VNode).props;
 for (const key of new Set([...Object.keys(previous), ...Object.keys(value.props)])) {
  const before = previous[key], after = value.props[key];
  if (before === after || key === 'key') continue;
  if (eventNames[key]) {
   if (before) element.removeEventListener(eventNames[key], before);
   if (after) element.addEventListener(eventNames[key], after);
  } else if (key === 'style') {
   element.removeAttribute('style');
   for (const [name, item] of Object.entries(after ?? {})) if (item != null) {
    const css = name.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
    element.style.setProperty(css, typeof item === 'number' && item !== 0 && !['opacity', 'flex', 'flex-grow', 'flex-shrink', 'font-weight', 'z-index'].includes(css) && !css.startsWith('--') ? `${item}px` : String(item));
   }
  } else if (key === 'dangerouslySetInnerHTML') {
   // Only bundled SVG artwork uses this internal field; caller text uses text nodes.
   if (before?.__html !== after?.__html) element.innerHTML = after?.__html ?? '';
  } else {
   const name = attributes[key] ?? key;
   if (after == null) element.removeAttribute(name); else element.setAttribute(name, String(after));
  }
 }
 const keyed = new Map(mounted.children.filter(c => typeof c.value === 'object' && c.value.props.key != null).map(c => [(c.value as VNode).props.key, c]));
 const used = new Set<Mounted>();
 const children = value.children.map((child, index) => {
  const key = typeof child === 'object' ? child.props.key : undefined;
  const candidate = key != null ? keyed.get(key) : mounted.children[index];
  const match = candidate && !used.has(candidate) && (key != null || typeof candidate.value !== 'object' || candidate.value.props.key == null) ? candidate : undefined;
  if (match) used.add(match);
  const result = patch(element, match, child);
  const at = element.childNodes[index];
  if (at !== result.node) element.insertBefore(result.node, at ?? null);
  return result;
 });
 for (const child of mounted.children) if (!used.has(child) && child.node.parentNode === element) element.removeChild(child.node);
 mounted.children = children;
 mounted.value = value;
 return mounted;
}

/** Mount into a dedicated host. Updates replace props, preserving keyed node identity. */
export function createGitCommitGraph(container: Element, initial: GraphProps) {
 let props = initial;
 let prepared = prepareGraph(props);
 let mounted: Mounted | undefined;
 let destroyed = false;
 const state = {
  id: `git-graph-${++nextId}`, hoveredRow: null as string | null, focusedRow: null as string | null,
  setHoveredRow(id: string | null) { state.hoveredRow = id; draw(); },
  setFocusedRow(id: string | null) { state.focusedRow = id; draw(); },
 };
 let drawing = false;
 let redrawRequested = false;
 function draw() {
  if (destroyed) return;
  // Moving/removing focused SVG nodes can synchronously dispatch blur/focus.
  // Finish reconciliation before applying the resulting highlight state.
  if (drawing) { redrawRequested = true; return; }
  drawing = true;
  try {
   do {
    redrawRequested = false;
    const active = container.ownerDocument.activeElement;
    mounted = patch(container, mounted, renderGraph(props, prepared, state));
    if (active && container.contains(active) && container.ownerDocument.activeElement !== active && 'focus' in active) {
     (active as SVGElement).focus({ preventScroll: true });
    }
   } while (redrawRequested && !destroyed);
  } finally { drawing = false; }
 }
 draw();
 props.onLayoutChange?.(prepared.graph);
 return {
  get layout() { return prepared.graph; },
  update(next: GraphProps) {
   if (destroyed) throw new Error('Cannot update a destroyed graph');
   const computed = prepareGraph(next);
   props = next; prepared = computed;
   const visible = new Set(prepared.graph.rows.map(rowKey));
   if (!visible.has(state.hoveredRow ?? '')) state.hoveredRow = null;
   if (!visible.has(state.focusedRow ?? '')) state.focusedRow = null;
   draw(); props.onLayoutChange?.(prepared.graph);
  },
  destroy() { destroyed = true; mounted?.node.parentNode?.removeChild(mounted.node); mounted = undefined; },
 };
}
export type GitCommitGraphController = ReturnType<typeof createGitCommitGraph>;
