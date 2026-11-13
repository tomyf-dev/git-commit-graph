import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createGitCommitGraph, type GraphProps } from 'git-commit-graph';
import { GitCommitGraph } from 'git-commit-graph/react';

test('inline SVG keeps color, size and stroke props identical in vanilla updates and React', () => {
  const dom = new JSDOM('<div id="graph"></div>');
  const host = dom.window.document.getElementById('graph')!;
  const base: GraphProps = {
    commits: [{ id: 'tip', parentIds: ['base'] }, { id: 'base', parentIds: [] }],
    worktrees: [{ id: 'worktree', headCommitId: 'tip', isDirty: true }],
    stashes: [{ id: 'stash', baseCommitId: 'base' }],
    layout: { rowHeight: 40, laneWidth: 24, paddingX: 24, primaryWorktreeId: 'worktree' },
    selectedCommitId: 'tip',
  };
  const graph = createGitCommitGraph(host, base);
  const iconSizes: number[] = [];
  const originals = new Map(['tree', 'archive', 'commit', 'selection-ring'].map(name => {
    const source = new JSDOM(readFileSync(new URL(`../src/assets/icons/${name}.svg`, import.meta.url), 'utf8'));
    const markup = source.window.document.querySelector('svg')!.outerHTML;
    source.window.close();
    return [name, markup];
  }));
  try {
    for (const [radius, width, color] of [[2, 1, '#a12345'], [6, 4, '#123abc']] as const) {
      const props: GraphProps = { ...base, appearance: { nodeRadius: radius, lineWidth: width, palette: [color] } };
      graph.update(props);
      const react = new JSDOM(renderToStaticMarkup(createElement(GitCommitGraph, props)));
      try {
        for (const document of [dom.window.document, react.window.document]) {
          const commit = document.querySelector('[data-commit-id="tip"] [data-node]')!;
          assert.equal(commit.tagName, 'svg');
          assert.equal(commit.querySelector('svg')!.outerHTML, originals.get('commit'));
          assert.equal(commit.querySelector('circle')!.getAttribute('vector-effect'), 'non-scaling-stroke');
          assert.equal(Number(commit.getAttribute('width')) / 2, radius);
          assert.equal(commit.getAttribute('stroke-width'), String(width));
          assert.equal(commit.querySelector('circle')!.getAttribute('fill'), 'currentColor');
          assert.equal(commit.querySelector('circle')!.getAttribute('stroke'), 'currentColor');
          assert.equal((commit as SVGElement).style.color, color === '#a12345' ? 'rgb(161, 35, 69)' : 'rgb(18, 58, 188)');
          const ring = document.querySelector('[data-commit-id="tip"] [data-highlight]')!;
          assert.equal(ring.tagName, 'svg');
          assert.equal(ring.querySelector('svg')!.outerHTML, originals.get('selection-ring'));
          assert.equal((ring as SVGElement).style.color, (commit as SVGElement).style.color);
          assert.equal(Number(ring.getAttribute('width')) / 2, radius + 3);
          assert.equal(ring.getAttribute('stroke-width'), '1');
          assert.equal(ring.querySelector('circle')!.getAttribute('fill'), 'none');
          assert.equal(ring.querySelector('circle')!.getAttribute('vector-effect'), 'non-scaling-stroke');
          for (const name of ['tree', 'archive']) {
            const icon = document.querySelector(`[data-icon="${name}"]`)!;
            assert.equal(icon.querySelector('svg')!.outerHTML, originals.get(name));
            assert.equal(icon.querySelector('svg')!.getAttribute('viewBox'), '0 0 256 256');
            assert.equal((icon as SVGElement).style.color, color === '#a12345' ? 'rgb(161, 35, 69)' : 'rgb(18, 58, 188)');
            assert.ok(icon.querySelector('path[fill="currentColor"]'));
          }
          assert.equal(document.querySelectorAll('img, image, use').length, 0);
        }
        const treeSize = host.querySelector('[data-icon="tree"]')!.getAttribute('width');
        assert.equal(treeSize, react.window.document.querySelector('[data-icon="tree"]')!.getAttribute('width'));
        iconSizes.push(Number(treeSize));
      } finally { react.window.close(); }
    }
    assert.ok(iconSizes[1] > iconSizes[0], 'nodeRadius updates annotation size within the existing bounds');
  } finally { graph.destroy(); dom.window.close(); }
});
