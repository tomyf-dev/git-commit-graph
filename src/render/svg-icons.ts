import { h } from './vnode.js';

/** Trusted bundled SVG remains intact; the outer viewport supplies placement and color. */
export function SvgIcon({ icon, children: _children, ...props }: { icon: string; [key: string]: any }) {
 return h('svg', { xmlns: 'http://www.w3.org/2000/svg', ...props, dangerouslySetInnerHTML: { __html: icon } });
}

/** Unit-circle artwork scales to the requested radius; its stroke stays in screen pixels. */
export function SvgShape({ shape, color, cx, cy, r, children: _children, ...props }: {
 shape: string; color: string; cx: number; cy: number; r: number; [key: string]: any;
}) {
 return SvgIcon({ icon: shape, ...props, x: cx - r, y: cy - r, width: r * 2, height: r * 2,
   overflow: 'visible', style: { color } });
}
