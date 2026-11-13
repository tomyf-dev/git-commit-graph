import { readFileSync } from 'node:fs';
const tree = readFileSync(new URL('../src/assets/icons/tree.svg',import.meta.url),'utf8');
const archive = readFileSync(new URL('../src/assets/icons/archive.svg',import.meta.url),'utf8');
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { GitCommitGraph } from "git-commit-graph/react";

test("React renders filled commits (including merges), tree worktrees and row-aligned SVG", () => {
  const html = renderToStaticMarkup(<GitCommitGraph
    commits={[{ id: "merge", parentIds: ["a", "b"] }, { id: "a", parentIds: [] }, { id: "b", parentIds: [] }]}
    worktrees={[{ id: "w", headCommitId: "merge" }]}
  />);
  const document = new JSDOM(html).window.document;
  const nodes = document.querySelectorAll('[data-row-kind="commit"] [data-node]');
  assert.equal(nodes.length, 3);
  for (const node of nodes) assert.notEqual(node.querySelector("circle")!.getAttribute("fill"), "none");
  const worktree = document.querySelector('[data-worktree-id="w"]')!;
  assert.equal(worktree.getAttribute("data-row-index"), "0");
  assert.equal(document.querySelector('[data-commit-id="merge"]')?.getAttribute("data-row-index"), "1");
  assert.equal(worktree.querySelector("[data-node]")?.getAttribute("data-icon"), "tree");
  assert.equal(document.querySelector("svg")?.getAttribute("height"), "112");
  assert.equal(document.querySelectorAll('path[data-edge-kind="parent"]').length, 2);
  assert.equal(document.querySelectorAll("image").length, 0);
  assert.ok(document.querySelector("mask"), "paths must be clipped behind annotation icons");
});

test("selection is controlled and inputs are escaped as text", () => {
  const html = renderToStaticMarkup(<GitCommitGraph commits={[{ id: '<script>alert(1)</script>', parentIds: [] }]} selectedCommitId={'<script>alert(1)</script>'} onCommitClick={() => {}} />);
  const document = new JSDOM(html).window.document;
  assert.equal(document.querySelectorAll("script").length, 0);
  assert.equal(document.querySelector('[role="button"]')?.getAttribute("aria-pressed"), "true");
});


test("stash has an archive glyph, dashed connection and its own accessible label", () => {
  const html = renderToStaticMarkup(<GitCommitGraph
    commits={[{ id: "base", parentIds: [] }]}
    stashes={[{ id: "stash@{0}", baseCommitId: "base", label: "Saved changes" }]}
    onStashClick={() => {}}
  />);
  const document = new JSDOM(html).window.document;
  const stash = document.querySelector('[data-stash-id="stash@{0}"]')!;
  assert.equal(stash.getAttribute("aria-label"), "Stash Saved changes");
  assert.equal(stash.getAttribute("role"), "button");
  assert.ok(stash.querySelector('[data-icon="archive"] path'));
  assert.equal(document.querySelectorAll('[data-row-kind="commit"]').length, 1);
  assert.equal(document.querySelector('[data-edge-kind="stash"]')?.getAttribute("stroke-dasharray"), "0 4");
});

test("appearance dimensions reach the annotation router", async () => {
  const { createGraphLayout } = await import("../src/core/layout.js");
  const commits = [{ id: "child", parentIds: ["base"] }, { id: "base", parentIds: [] }];
  const worktrees = [{ id: "interior", headCommitId: "base" }];
  const layout = { rowHeight: 40, laneWidth: 24, paddingX: 16 };
  for (const appearance of [{ nodeRadius: 2, lineWidth: 4, cornerRadius: 0 }, { nodeRadius: 8, lineWidth: 4, cornerRadius: 24 }]) {
    const document = new JSDOM(renderToStaticMarkup(<GitCommitGraph commits={commits} worktrees={worktrees} layout={layout} appearance={appearance} />)).window.document;
    const expected = createGraphLayout(commits, worktrees, { ...layout, ...appearance });
    assert.equal(document.querySelector('[data-edge-kind="worktree"]')?.getAttribute("d"), expected.edges.find(e => e.kind === "worktree")?.path);
  }
});

test("regression dimensions keep dashed caps separated and annotation markers readable", async () => {
  const { regressionDimensions } = await import("./helpers/dimensions.js");
  for (const d of regressionDimensions()) {
    const document = new JSDOM(renderToStaticMarkup(<GitCommitGraph
      commits={[{ id: "base", parentIds: [] }]} worktrees={[{ id: "w", headCommitId: "base" }]}
      stashes={[{ id: "s", baseCommitId: "base" }]} layout={d} appearance={d} selectedCommitId="base"
    />)).window.document;
    for (const edge of document.querySelectorAll('[data-edge-kind="worktree"], [data-edge-kind="stash"]')) {
      const gap = Number(edge.getAttribute("stroke-dasharray")!.split(" ")[1]);
      assert.ok(gap - d.lineWidth >= 1, "round caps must leave at least one pixel of visible gap");
    }
    const wip = document.querySelector('[data-worktree-id="w"] [data-node]')!;
    const stash = document.querySelector('[data-stash-id="s"] [data-node]')!;
    for (const icon of [wip,stash]) {
      assert.equal(icon.querySelector('svg')!.getAttribute('viewBox'),icon === wip ? '0 0 256 256' : '0 0 256 256');
      assert.ok(Number(icon.getAttribute('width')) <= d.laneWidth);
      assert.ok(Number(icon.getAttribute('height')) <= d.rowHeight);
    }
    const ring = document.querySelector('[data-commit-id="base"] [data-highlight]')!;
    const inner = Number(ring.getAttribute("width"))/2 - Number(ring.getAttribute("stroke-width"))/2;
    assert.ok(inner - (d.nodeRadius+d.lineWidth/2) >= .5, "selection ring must remain separate from the filled node");
  }
});

test("solid edges paint above dashed annotations and annotation markers are larger than commits", () => {
  const document = new JSDOM(renderToStaticMarkup(<GitCommitGraph
    commits={[{id:'merge',parentIds:['main','branch']},{id:'main',parentIds:['root']},{id:'branch',parentIds:['root']},{id:'root',parentIds:[]}]}
    worktrees={[{id:'w',headCommitId:'branch',isDirty:true}]}
    stashes={[{id:'s',baseCommitId:'root'}]}
    layout={{laneWidth:22,rowHeight:28,paddingX:16}}
  />)).window.document;
  const edges = [...document.querySelectorAll('[data-edge-lane]')];
  const priority = edges.map(e=>e.hasAttribute('stroke-dasharray') ? 0 : 1);
  assert.deepEqual(priority,[...priority].sort());
  for (const solid of [0,1]) {
    const lanes=edges.filter((_,i)=>priority[i]===solid).map(e=>Number(e.getAttribute('data-edge-lane')));
    assert.deepEqual(lanes,[...lanes].sort((a,b)=>a-b));
  }
  assert.equal(document.querySelector('[data-worktree-id="w"] [data-node]')!.getAttribute('data-icon'),'tree');
  assert.equal(document.querySelector('[data-stash-id="s"] [data-node]')!.getAttribute('width'),'20');
  assert.equal(document.querySelector('[data-commit-id="root"] [data-node]')!.getAttribute('width'),'8');
});

test("annotation SVG paths come from bundled SVG data without network loading", () => {
  const document = new JSDOM(renderToStaticMarkup(<GitCommitGraph commits={[{id:'base',parentIds:[]}]} worktrees={[{id:'w',headCommitId:'base',isDirty:true}]} stashes={[{id:'s',baseCommitId:'base'}]} />)).window.document;
  for (const [name,icon] of [['tree',tree],['archive',archive]] as const) {
    const official = new JSDOM(icon).window.document;
    assert.deepEqual([...document.querySelectorAll(`[data-icon="${name}"] path`)].map(p=>p.getAttribute('d')),[...official.querySelectorAll('path')].map(p=>p.getAttribute('d')));
  }
});

test('dot size changes independently of solid lines and uses twice the diameter as spacing', () => {
  for (const dotDiameter of [2.5,3]) {
    const document=new JSDOM(renderToStaticMarkup(<GitCommitGraph commits={[{id:'a',parentIds:['b']},{id:'b',parentIds:[]}]} worktrees={[{id:'w',headCommitId:'a',isDirty:true}]} stashes={[{id:'s',baseCommitId:'b'}]} appearance={{lineWidth:2,dotDiameter}} />)).window.document;
    for (const edge of document.querySelectorAll('[data-edge-kind]')) {
      const solid=edge.getAttribute('data-edge-kind')==='parent';
      assert.equal(Number(edge.getAttribute('stroke-width')),solid?2:dotDiameter);
      assert.equal(edge.getAttribute('stroke-dasharray'),solid?null:`0 ${dotDiameter*2}`);
    }
  }
});
