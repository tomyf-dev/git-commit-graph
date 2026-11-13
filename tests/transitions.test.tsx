import assert from 'node:assert/strict';
import test from 'node:test';
import {flushSync} from 'react-dom';
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import {GitCommitGraph} from 'git-commit-graph/react';
import {createGitCommitGraph} from 'git-commit-graph';
import {regressionDimensions} from './helpers/dimensions.js';
for (const renderer of ['vanilla', 'react']) test(`${renderer}: selection, focus and crossing identity across current/dirty transitions`, async () => {
  const {readFile}=await import('node:fs/promises');
  const data=JSON.parse(await readFile(process.env.GRAPH_REPOSITORY_SNAPSHOT ?? new URL('./fixtures/repository.json',import.meta.url),'utf8'));
  const {createGraphLayout}=await import('../src/core/layout.js');
  const {crossingGaps}=await import('./helpers/crossings.js');
  const dom=new JSDOM('<button id="outside">Outside</button><div id="root"></div>');
  const old={window:globalThis.window,document:globalThis.document};
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
  const host=dom.window.document.getElementById('root')!;
  const vanilla=renderer==='vanilla';
  const root=vanilla ? null : createRoot(host);
  let graph: ReturnType<typeof createGitCommitGraph> | undefined;
  const doc=dom.window.document;
  const heads=[...new Set<string>(data.worktrees.map((w: {headCommitId:string})=>w.headCommitId))];
  assert.ok(heads.length >= 2, 'transition fixture needs two distinct heads');
  const [selected,focusId]=heads;
  const states=2**data.worktrees.length;
  assert.ok(data.worktrees.length < 31, 'dirty masks use 32-bit bitwise operations');
  const focusedNode=()=>doc.querySelector(`[data-commit-id="${focusId}"]`)!;
  const all=regressionDimensions();
  const shard=Number(process.env.GRAPH_SHARD_INDEX ?? 0), shards=Number(process.env.GRAPH_SHARD_COUNT ?? 1);
  const chosen=(process.env.GRAPH_TRANSITION_FULL ? all : all.filter(d=>process.env.GRAPH_CURRENT_DIMENSIONS ? d.lineWidth===2&&d.laneWidth===22&&d.rowHeight===32&&d.nodeRadius===4&&d.cornerRadius===8 : d.lineWidth===4&&d.laneWidth===12&&d.rowHeight===24&&d.nodeRadius===4&&d.cornerRadius===24)).filter((_,i)=>i%shards===shard);
  assert.ok(chosen.length, 'dimension selection must not be empty');
  let checked=0,wipRoundTrips=0;
  let d=chosen[0];
  // Production React plus synchronous commits exercises actual reconciliation
  // and DOM focus without development-only act bookkeeping in the large run.
  const commit=async(fn:()=>void)=>{
    if(vanilla) fn();
    else if(process.env.NODE_ENV==='production') flushSync(fn);
    else await act(fn);
  };
  const render=async(current:number,mask:number)=>{
    const worktrees=data.worktrees.map((w:object,i:number)=>({...w,isDirty:Boolean(mask&2**i)}));
    const layout={...d,primaryWorktreeId:data.worktrees[current].id,primaryHeadId:data.worktrees[current].headCommitId};
    const props={...data,worktrees,layout,appearance:d,selectedCommitId:selected,onCommitClick:()=>{},onWorktreeClick:()=>{}};
    await commit(()=>{
      if(vanilla) { if(graph) graph.update(props); else graph=createGitCommitGraph(host,props); }
      else root!.render(<GitCommitGraph {...props} />);
    });
    return createGraphLayout(data.commits,worktrees,{...data,...layout});
  };
  try {
    for(d of chosen) {
    await render(0,states-1);
    const original=focusedNode();
    await commit(()=> (original as SVGElement).focus());
    for(const current of data.worktrees.keys()) for(const mask of Array.from({length:states},(_,i)=>i^(i>>1))) {
      const g=await render(current,mask);
      assert.equal(focusedNode(),original,'keyed DOM identity must survive reordering');
      assert.equal(doc.activeElement,original,'keyboard focus must remain on the same commit');
      const highlights=[...doc.querySelectorAll('[data-highlighted]')].map(e=>e.getAttribute('data-commit-id')).sort();
      assert.deepEqual(highlights,[selected,focusId].sort());
      for(const id of [selected,focusId]) {
        const row=g.rows.find(r=>r.kind==='commit'&&r.commit.id===id)!;
        const ring=doc.querySelector(`[data-commit-id="${id}"] [data-highlight]`)!;
        const node=ring.parentElement!.querySelector('[data-node]')!;
        assert.equal(Number(node.getAttribute('width')),d.nodeRadius*2,'commit diameter must follow appearance');
        assert.equal(Number(node.getAttribute('height')),d.nodeRadius*2);
        assert.equal(Number(node.getAttribute('stroke-width')),d.lineWidth,'raw SVG must inherit the requested stroke width');
        assert.equal(node.querySelector('circle')!.getAttribute('vector-effect'),'non-scaling-stroke');
        assert.equal(ring.getAttribute('stroke-width'),'1');
        assert.equal(ring.querySelector('circle')!.getAttribute('vector-effect'),'non-scaling-stroke');
        assert.equal(Number(ring.getAttribute('x'))+Number(ring.getAttribute('width'))/2,row.x);assert.equal(Number(ring.getAttribute('y'))+Number(ring.getAttribute('height'))/2,row.y);
        assert.equal(Number(ring.getAttribute('width'))/2,Math.min(d.nodeRadius+3,d.rowHeight/2-2.5));
      }
      const actual=[...doc.querySelectorAll('[data-crossing-gap]')].map(e=>[Number(e.getAttribute('x')),Number(e.getAttribute('y')),Number(e.getAttribute('height'))]);
      assert.deepEqual(actual,crossingGaps(g,d.lineWidth,d.nodeRadius).flatMap(ps=>ps.map(p=>[p.x-d.lineWidth,p.y-p.halfGap,p.halfGap*2])));
      checked++;
    }
    for (let w=0;w<data.worktrees.length;w++) {
    await render(0,states-1);
    const wip=doc.querySelector(`[data-worktree-id="${data.worktrees[w].id}"]`)!;
    const wipId=wip.getAttribute('data-worktree-id');
    await commit(()=> (wip as SVGElement).focus());
    // Preserve focus when only another worktree disappears and lanes reorder.
    await render((w+1)%data.worktrees.length,1<<w);
    assert.equal(doc.activeElement,wip);
    await render(w,0); await render(w,states-1);
    assert.equal(doc.querySelector(`[data-worktree-id="${wipId}"]`)!.getAttribute('data-highlighted'),null,'removed WIP must not regain stale focus');
    wipRoundTrips++;
    }
    await commit(()=>doc.getElementById('outside')!.focus());
    await render(0,Math.floor((states-1)/3));
    assert.equal(doc.activeElement,doc.getElementById('outside'),'never steal focus from controls');
    console.log(JSON.stringify({renderer,shard,dimensions:all.indexOf(d),checked,wipRoundTrips}));
    }
    assert.equal(checked,chosen.length*data.worktrees.length*states);
    console.log(JSON.stringify({complete:true,renderer,shard,dimensionCount:chosen.length,checked,wipRoundTrips}));
  } finally {await commit(()=>{graph?.destroy();root?.unmount();});Object.assign(globalThis,old);dom.window.close();}
});
