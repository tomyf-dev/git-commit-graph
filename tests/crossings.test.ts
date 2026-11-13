import { markerGeometry } from '../src/core/markers.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { crossingGaps } from './helpers/crossings.js';
import type { GraphLayout, GraphEdge } from '../src/core/types.js';
const edge = (path: string): GraphEdge => ({path,kind:'parent',fromId:'a',toId:'b',color:'cyan',lane:0,boundary:false});
const graph = (paths: string[]): GraphLayout => ({edges:paths.map(edge),rows:[],width:100,height:100,rowHeight:24,laneWidth:12,laneCount:4,hiddenWorktreeIds:[],hiddenStashIds:[]});

test('same-color transverse crossings cut only the vertical underpass, including horizontal elbow ends', () => {
  const g = graph(['M 24 0 V 100','M 0 50 H 24 Q 36 50 36 38']);
  assert.deepEqual(crossingGaps(g,4,4),[[{x:24,y:50,halfGap:3}],[]]);
});
test('shared roots, elbows of the underpass, and nodes are not cut', () => {
  assert.deepEqual(crossingGaps(graph(['M 24 0 V 50 H 0','M 0 50 H 48']),4,4),[[],[]]);
  const g = graph(['M 24 0 V 100','M 0 50 H 48']);
  g.rows = [{kind:'commit',commit:{id:'a',parentIds:[]},x:24,y:50,lane:0,rowIndex:0,color:'cyan'}];
  assert.deepEqual(crossingGaps(g,4,4),[[],[]]);
});

test('rounded overpasses use exact quadratic intersections and tangent clearance', () => {
  const g = graph(['M 16 0 V 100','M 0 50 Q 24 50 24 26']);
  const gaps = crossingGaps(g,4,4);
  assert.equal(gaps[0].length,1);
  const t = 1-Math.sqrt(1/3);
  assert.ok(Math.abs(gaps[0][0].y-(50-24*t*t)) < 1e-9);
  assert.ok(gaps[0][0].halfGap > 3);
  assert.deepEqual(gaps[1],[]);
  // At this end the curve is almost vertical, so no transverse gap is added.
  assert.deepEqual(crossingGaps(graph(['M 23 0 V 100','M 0 50 Q 24 50 24 26']),4,4),[[],[]]);
});

test('mask rectangles preserve painted elbows and nearby highlight envelopes', () => {
  assert.deepEqual(crossingGaps(graph(['M 24 0 V 52 Q 24 60 32 60','M 0 50.2 H 48']),1,2),[[],[]]);
  const g=graph(['M 24 0 V 100','M 0 50 H 48']);
  g.rows=[{kind:'commit',commit:{id:'nearby',parentIds:[]},x:36,y:50,lane:1,rowIndex:1,color:'cyan'}];
  assert.deepEqual(crossingGaps(g,4,4),[[],[]]);
});

test('rectangular stash highlights retain a visible connection beside crossing gaps', () => {
  const g=graph(['M 24 0 V 100','M 0 50 H 60']);
  g.rows=[{kind:'stash',stash:{id:'s',baseCommitId:'a'},x:37.5,y:50,lane:1,rowIndex:1,color:'cyan'}];
  assert.deepEqual(crossingGaps(g,4,4),[[],[]]);
});

test('all current worktrees and dirty masks keep underpasses inside trunks and away from nodes', { skip: !process.env.GRAPH_EXHAUSTIVE }, async () => {
  const {readFile} = await import('node:fs/promises');
  const {createGraphLayout} = await import('../src/core/layout.js');
  const {flatten} = await import('./helpers/curves.js');
  const data = JSON.parse(await readFile(process.env.GRAPH_REPOSITORY_SNAPSHOT ?? new URL('./fixtures/repository.json',import.meta.url),'utf8'));
  const {regressionDimensions} = await import('./helpers/dimensions.js');
  const all = regressionDimensions();
  assert.equal(all.length,1302);
  const presets = all.filter(d=>process.env.GRAPH_CURRENT_DIMENSIONS ? d.lineWidth===2&&d.laneWidth===22&&d.rowHeight===32&&d.nodeRadius===4&&d.cornerRadius===8 : !process.env.GRAPH_LINE_WIDTH || d.lineWidth===Number(process.env.GRAPH_LINE_WIDTH));
  let count=0, curved=0;
  for (const d of presets) {
  // Reuse only identical path samples; every graph state and gap is still checked.
  const samples = new Map<string, ReturnType<typeof flatten>>();
  const checkedTrunks = new Set<string>();
  const witnesses = new Map<string, string>();
  for (const current of data.worktrees) for(let mask=0;mask<2**data.worktrees.length;mask++) {
    const worktrees=data.worktrees.map((w: {isDirty:boolean},i:number)=>({...w,isDirty:Boolean(mask & 2**i)}));
    const g=createGraphLayout(data.commits,worktrees,{...data,...d,primaryHeadId:current.headCommitId,primaryWorktreeId:current.id});
    const paths=g.edges.map(e=>{
      let sampled=samples.get(e.path);
      if(!sampled) { sampled=flatten(e.path); samples.set(e.path,sampled); }
      return sampled;
    });
    const bounds=markerGeometry(d.nodeRadius,g.laneWidth,g.rowHeight,d.lineWidth).crossingBounds;
    crossingGaps(g,d.lineWidth,d.nodeRadius).forEach((gaps,index)=>gaps.forEach(p=>{
      assert.ok(Number.isFinite(p.y) && Number.isFinite(p.halfGap));
      const context=JSON.stringify({d,current:current.id,mask,edge:index,gap:p});
      for(const row of g.rows) {
        const dx=Math.max(0,Math.abs(row.x-p.x)-d.lineWidth);
        const dy=Math.max(0,Math.abs(row.y-p.y)-p.halfGap);
        const distance=row.kind!=='commit'
          ? Math.hypot(Math.max(0,dx-bounds[row.kind].halfX),Math.max(0,dy-bounds[row.kind].halfY))
          : Math.hypot(dx,dy)-bounds.commit.radius;
        // Every interaction uses this same maximum envelope; checking every
        // row also covers simultaneous hover/selection/focus on different rows.
        assert.ok(distance>=1-1e-7, 'gap joins highlighted node mask / loses connecting segment: '+context);
      }
      // Expand the rectangle by half the stroke to catch clipping the painted
      // edge, not merely its centerline. Quadratics use independent sampling.
      // Identical underpass geometry has identical corner/root clearance.
      const trunkKey=JSON.stringify([g.edges[index].path,p.x,p.y,p.halfGap]);
      if(!checkedTrunks.has(trunkKey)) {
      assert.ok(paths[index].some(s=>!s.curve && s.x===p.x && s.nx===p.x && Math.min(s.y,s.ny)<p.y-p.halfGap && Math.max(s.y,s.ny)>p.y+p.halfGap));
      for(const s of paths[index]) {
        if(!s.curve && s.x===p.x && s.nx===p.x) continue;
        const left=p.x-d.lineWidth-d.lineWidth/2, right=p.x+d.lineWidth+d.lineWidth/2;
        const top=p.y-p.halfGap-d.lineWidth/2, bottom=p.y+p.halfGap+d.lineWidth/2;
        let lo=0,hi=1;
        for(const [start,delta,min,max] of [[s.x,s.nx-s.x,left,right],[s.y,s.ny-s.y,top,bottom]]) {
          if(Math.abs(delta)<1e-12) { if(start<min || start>max) {lo=1;hi=0;} }
          else { const a=(min-start)/delta,b=(max-start)/delta; lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b)); }
        }
        assert.ok(lo>hi, 'mask clips own corner/root: '+context);
      }
      checkedTrunks.add(trunkKey);
      }
      // A cached witness is valid only if that exact other path still exists
      // in this graph. Otherwise search and verify a new witness.
      const pointKey=JSON.stringify([p.x,p.y]);
      const witness=witnesses.get(pointKey);
      if(!g.edges.some((edge,j)=>j!==index && edge.path===witness)) {
      const overpass=paths.findIndex((path,j)=>j!==index && path.some(s=>{
        const dx=s.nx-s.x,dy=s.ny-s.y;
        const t=Math.max(0,Math.min(1,((p.x-s.x)*dx+(p.y-s.y)*dy)/(dx*dx+dy*dy)));
        return Math.hypot(p.x-s.x-t*dx,p.y-s.y-t*dy)<.02;
      }));
      assert.ok(overpass>=0, 'every gap must have an actual overpassing edge');
      witnesses.set(pointKey,g.edges[overpass].path);
      }
      if(p.halfGap>d.lineWidth/2+1+1e-7) curved++;
    }));
    count++;
  }
  console.log(`Dimension ${JSON.stringify(d)}: total ${count}`);
  }
  assert.equal(count,presets.length*data.worktrees.length*2**data.worktrees.length);
  // A partial dimension range may legitimately contain no rounded underpass.
  // Require this coverage only when the entire matrix is selected.
  if (presets.length===all.length) assert.ok(curved>0,'full matrix must exercise actual rounded crossings');
  console.log(`Checked ${count} layouts; ${curved} rounded underpasses`);
});

test('inner lanes cannot cut a foreground outer lane', () => {
  const g=graph(['M 24 0 V 100','M 0 50 H 48']);
  g.edges[0].lane=2; g.edges[1].lane=1;
  assert.deepEqual(crossingGaps(g,2,4),[[],[]]);
  g.edges[1].lane=3;
  assert.equal(crossingGaps(g,2,4)[0].length,1);
});

test('dashed outer annotations cannot cut solid history', () => {
  const g=graph(['M 24 0 V 100','M 0 50 H 48']);
  g.edges[0].lane=1;
  g.edges[1].lane=3;
  g.edges[1].kind='worktree';
  assert.deepEqual(crossingGaps(g,2,4),[[],[]]);
  g.edges[0].kind='worktree';
  g.edges[1].kind='parent';
  g.edges[1].lane=0;
  assert.equal(crossingGaps(g,2,4)[0].length,1);
});
