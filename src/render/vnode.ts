export interface VNode { tag: string; props: Record<string, any>; children: (VNode | string | number)[] }
export function h(tag: string, props: Record<string, any> | null, ...children: any[]): VNode {
 const flat = children.flat(Infinity).filter(v => v !== null && v !== undefined && typeof v !== 'boolean');
 return { tag, props: props ?? {}, children: flat };
}
