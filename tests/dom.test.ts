import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createGitCommitGraph } from 'git-commit-graph';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GitCommitGraph } from 'git-commit-graph/react';
import type { GraphProps } from '../src/types.js';
const props: GraphProps = {
 commits: [{id:'b',parentIds:['a']},{id:'a',parentIds:[]}],
 worktrees:[{id:'w',headCommitId:'b',isDirty:true}],
 stashes:[{id:'s',baseCommitId:'b'}],
 layout:{rowHeight:32,laneWidth:22,paddingX:16,primaryWorktreeId:'w'},
 appearance:{lineWidth:2,dotDiameter:3,cornerRadius:8},
};
test('DOM and React share paths, icons, masks, positions and dimensions', () => {
 const dom = new JSDOM('<div id="host"></div>');
 const host = dom.window.document.querySelector('#host')!;
 const graph = createGitCommitGraph(host,props);
 const react = new JSDOM(renderToStaticMarkup(createElement(GitCommitGraph,props)));
 const snapshot = (doc: ParentNode) => [...doc.querySelectorAll('svg, path, circle, rect')].map(e => [...e.attributes].filter(a => !['id','mask','style'].includes(a.name)).map(a => [a.name,a.value]));
 assert.deepEqual(snapshot(host),snapshot(react.window.document));
 graph.destroy(); assert.equal(host.children.length,0);
 assert.throws(()=>graph.update(props),/destroyed/);
});
test('DOM update preserves keyed focus and replaces event callbacks; removed WIP loses highlight', () => {
 const dom = new JSDOM('<div></div>',{pretendToBeVisual:true}); const host=dom.window.document.querySelector('div')!;
 let first=0,second=0;
 const graph=createGitCommitGraph(host,{...props,onCommitClick:()=>first++,onWorktreeClick:()=>{}});
 const commit=host.querySelector('[data-commit-id="b"]') as SVGElement;
 commit.focus();
 graph.update({...props,worktrees:[{...props.worktrees![0],isDirty:false}],onCommitClick:()=>second++});
 assert.equal(host.querySelector('[data-commit-id="b"]'),commit);
 assert.equal(dom.window.document.activeElement,commit);
 commit.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
 assert.equal(first,0);assert.equal(second,1);
 graph.update({...props,onWorktreeClick:()=>{}});
 const wip=host.querySelector('[data-worktree-id]') as SVGElement; wip.focus();
 graph.update({...props,worktrees:[]});graph.update({...props,onWorktreeClick:()=>{}});
 assert.equal(host.querySelector('[data-worktree-id]')!.hasAttribute('data-highlighted'),false);
 graph.destroy();
});
test('DOM imports without browser globals and escapes untrusted labels',()=>{
 const dom=new JSDOM('<div></div>');const host=dom.window.document.querySelector('div')!;
 const graph=createGitCommitGraph(host,{commits:[{id:'<img src=x onerror=alert(1)>',parentIds:[]}]});
 assert.equal(host.querySelector('img'),null); assert.match(host.textContent!,/<img/);graph.destroy();
});

test('changing datasets while a removed node is focused completes without reentrant reconciliation', () => {
 const dom = new JSDOM('<div></div>', { pretendToBeVisual: true });
 const host = dom.window.document.querySelector('div')!;
 let notified = 0;
 const graph = createGitCommitGraph(host, { ...props, onCommitClick: () => {} });
 const node = host.querySelector('[data-commit-id="b"]') as SVGElement;
 node.focus();
 // Browsers synchronously dispatch blur while removing a focused SVG subtree.
 const remove = host.querySelector('svg')!.removeChild.bind(host.querySelector('svg'));
 host.querySelector('svg')!.removeChild = ((child: Node) => {
   if (child === node) node.dispatchEvent(new dom.window.FocusEvent('blur'));
   return remove(child);
 }) as typeof remove;
 assert.doesNotThrow(() => graph.update({ commits: [{ id: 'new', parentIds: [] }], onLayoutChange: () => notified++ }));
 assert.equal(host.querySelectorAll('[data-row-kind]').length, 1);
 assert.equal(host.querySelector('[data-commit-id]')!.getAttribute('data-commit-id'), 'new');
 assert.equal(notified, 1);
 graph.destroy();
});
