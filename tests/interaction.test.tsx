import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { GitCommitGraph } from "git-commit-graph/react";
import { regressionDimensions } from "./helpers/dimensions.js";

test("hover/focus/selection masks surround rings, and highlight identity survives row insertion", async () => {
  const dom = new JSDOM('<div id="root"></div>');
  const old = { window: globalThis.window, document: globalThis.document };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(dom.window.document.getElementById("root")!);
  const commits = [{id:"new",parentIds:["head"]},{id:"head",parentIds:[]}];
  const render = async (d: ReturnType<typeof regressionDimensions>[number], dirty = true) => {
    await act(async () => root.render(<GitCommitGraph commits={commits}
      worktrees={[{id:"w",headCommitId:"head",isDirty:true},{id:"tip",headCommitId:"new",isDirty:dirty}]}
      stashes={[{id:"s",baseCommitId:"head"}]} layout={d} appearance={d} selectedCommitId="head"
      onCommitClick={()=>{}} onWorktreeClick={()=>{}} onStashClick={()=>{}} />));
  };
  const node = (selector:string) => dom.window.document.querySelector(selector)!;
  const mask = (kind:string,id:string) => [...dom.window.document.querySelectorAll('[data-mask-row]')].find(e=>e.getAttribute('data-mask-row')===JSON.stringify([kind,id]))!;
  try {
    for (const d of regressionDimensions()) {
      await render(d);
      await act(async()=>{
        node('[data-worktree-id="w"]').dispatchEvent(new dom.window.FocusEvent('focusin',{bubbles:true}));
        node('[data-stash-id="s"]').dispatchEvent(new dom.window.MouseEvent('pointerover',{bubbles:true}));
      });
      const ring = node('[data-commit-id="head"] [data-highlight]');
      assert.equal(Number(mask('commit','head').getAttribute('r')) - (Number(ring.getAttribute('width'))/2+.5),1);
      for (const [selector,kind,id] of [['[data-worktree-id="w"]','worktree','w'],['[data-stash-id="s"]','stash','s']]) {
        assert.equal(node(selector).querySelector('[data-highlight]'), null, 'annotation icons must have no surrounding frame');
        const before = mask(kind,id).outerHTML;
        const colorBefore = (node(selector+' [data-node]') as SVGElement).style.color;
        await act(async()=>node(selector).dispatchEvent(new dom.window.FocusEvent('focusin',{bubbles:true})));
        assert.equal(mask(kind,id).outerHTML, before, 'focus must not expand the edge mask');
        assert.equal((node(selector+' [data-node]') as SVGElement).style.color, colorBefore, 'focus must preserve the lane color');
      }
      await act(async()=>node('[data-worktree-id="w"]').dispatchEvent(new dom.window.FocusEvent('focusin',{bubbles:true})));
      await render(d,false);
      assert.equal(node('[data-worktree-id="w"]').getAttribute('data-highlighted'),'true');
      assert.equal(node('[data-stash-id="s"]').getAttribute('data-highlighted'),'true');
      assert.equal(node('[data-commit-id="new"]').hasAttribute('data-highlighted'),false);
    }
  } finally {
    await act(async()=>root.unmount());
    Object.assign(globalThis,old);
    dom.window.close();
  }
});

test('real fixture highlights keep crossing masks stable and separated in every preview dimension', async () => {
  const {readFile}=await import('node:fs/promises');
  const data=JSON.parse(await readFile(new URL('./fixtures/repository.json',import.meta.url),'utf8'));
  const dom=new JSDOM('<div id="root"></div>');
  const old={window:globalThis.window,document:globalThis.document};
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
  const root=createRoot(dom.window.document.getElementById('root')!);
  try {
    for(const d of regressionDimensions()) {
      const props={...data,layout:d,appearance:d,onCommitClick:()=>{},onWorktreeClick:()=>{},onStashClick:()=>{}};
      await act(async()=>root.render(<GitCommitGraph {...props} />));
      const doc=dom.window.document;
      const before=[...doc.querySelectorAll('[data-crossing-gap]')].map(e=>e.outerHTML);
      await act(async()=>{
        doc.querySelector('[data-worktree-id]')!.dispatchEvent(new dom.window.FocusEvent('focusin',{bubbles:true}));
        doc.querySelector('[data-stash-id]')!.dispatchEvent(new dom.window.MouseEvent('pointerover',{bubbles:true}));
        root.render(<GitCommitGraph {...props} selectedCommitId={data.commits[0].id} />);
      });
      assert.deepEqual([...doc.querySelectorAll('[data-crossing-gap]')].map(e=>e.outerHTML),before,'interaction must not move crossings');
      for(const row of doc.querySelectorAll('[data-highlighted]')) {
        const ring=row.querySelector('[data-highlight]')!;
        if(row.getAttribute('data-row-kind') === 'commit') assert.ok(ring && !ring.closest('[mask]'),'commit rings must render outside masked edge groups');
        else assert.equal(ring,null,'annotation icons have no surrounding frame');
        const kind=row.getAttribute('data-row-kind')!;
        const id=row.getAttribute(kind==='commit'?'data-commit-id':kind==='worktree'?'data-worktree-id':'data-stash-id')!;
        const mask=[...doc.querySelectorAll('[data-mask-row]')].find(e=>e.getAttribute('data-mask-row')===JSON.stringify([kind,id]))!;
        const n=(e:Element,a:string)=>Number(e.getAttribute(a));
        for(const gap of doc.querySelectorAll('[data-crossing-gap]')) {
          const x=n(gap,'x'),y=n(gap,'y'),right=x+n(gap,'width'),bottom=y+n(gap,'height');
          let distance;
          if(mask.tagName==='circle') distance=Math.hypot(Math.max(x-n(mask,'cx'),0,n(mask,'cx')-right),Math.max(y-n(mask,'cy'),0,n(mask,'cy')-bottom))-n(mask,'r');
          else distance=Math.hypot(Math.max(x-n(mask,'x')-n(mask,'width'),0,n(mask,'x')-right),Math.max(y-n(mask,'y')-n(mask,'height'),0,n(mask,'y')-bottom));
          assert.ok(distance>=1-1e-7,'actual rendered masks retain a visible connecting segment');
        }
      }
    }
  } finally {await act(async()=>root.unmount());Object.assign(globalThis,old);dom.window.close();}
});

