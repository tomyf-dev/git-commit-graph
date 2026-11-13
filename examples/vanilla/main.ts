import { createGitCommitGraph, type GraphProps } from '../../src/index.js';
import { sources, initialSource, graphProps } from '../shared/data.js';
import '../shared/style.css';

let source = initialSource;
let sample = graphProps(source.data);
let commits = source.data.commits;
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `<h1>Vanilla DOM API</h1><p>JSONデータによる分岐・マージ・Changes・スタッシュのサンプル</p>
<div class="controls"><label>データソース<select aria-label="データソース"></select></label><label>現在のワークツリー<select aria-label="現在のワークツリー"></select></label><label><input type="checkbox" checked> 現在のワークツリーに変更あり</label><button>リセット</button></div>
<div class="history"><div class="graph"></div><div class="messages"></div></div><output>未選択</output>`;
const sourceSelect = app.querySelector<HTMLSelectElement>('[aria-label="データソース"]')!;
for (const entry of sources) sourceSelect.add(new Option(entry.id, entry.id));
const currentSelect = app.querySelector<HTMLSelectElement>('[aria-label="現在のワークツリー"]')!;
const dirtyInput = app.querySelector('input')!;
const output = app.querySelector('output')!;
for (const w of sample.worktrees!) currentSelect.add(new Option(w.label, w.id));
let current = sample.layout!.primaryWorktreeId!;
let worktrees = sample.worktrees!;
let selected: string | null = null;
function selectedItem(kind: string, id: string) {
  selected = kind === 'Commit' ? id : null;
  output.textContent = `${kind}: ${id}`;
  graph.update(options());
}
function options(): GraphProps {
  return { ...sample, worktrees, selectedCommitId: selected,
    layout: { ...sample.layout, primaryWorktreeId: current, primaryHeadId: worktrees.find(w => w.id === current)?.headCommitId ?? source.data.primaryHeadId },
    onCommitClick: c => selectedItem('Commit', c.id),
    onWorktreeClick: w => selectedItem('Worktree', w.id),
    onStashClick: s => selectedItem('Stash', s.id),
    onLayoutChange: layout => {
      const messages = app.querySelector('.messages')!;
      messages.replaceChildren(...layout.rows.map(row => {
        const element = document.createElement('div'); element.className = 'message';
        const span = document.createElement('span'); span.style.borderColor = row.color;
        span.textContent = row.kind === 'worktree' ? `Changes · ${row.worktree.label}` : row.kind === 'stash' ? row.stash.subject! : commits.find(c => c.id === row.commit.id)!.subject;
        element.append(span); return element;
      }));
    },
  };
}
const graph = createGitCommitGraph(app.querySelector('.graph')!, options());
function update() { currentSelect.value = current; dirtyInput.disabled = !worktrees.some(w => w.id === current); dirtyInput.checked = worktrees.find(w => w.id === current)?.isDirty === true; graph.update(options()); }
sourceSelect.onchange = () => {
  source = sources.find(entry => entry.id === sourceSelect.value)!;
  sample = graphProps(source.data); commits = source.data.commits;
  current = source.data.primaryWorktreeId; worktrees = source.data.worktrees; selected = null; output.textContent = '未選択';
  currentSelect.replaceChildren(...worktrees.map(w => new Option(w.label ?? w.id, w.id)));
  update();
};
currentSelect.onchange = () => { current = currentSelect.value; update(); };
dirtyInput.onchange = () => { worktrees = worktrees.map(w => w.id === current ? { ...w, isDirty: dirtyInput.checked } : w); update(); };
app.querySelector('button')!.onclick = () => { current = sample.layout!.primaryWorktreeId!; worktrees = sample.worktrees!; selected = null; output.textContent = '未選択'; update(); };
// Dispose listeners and SVG when Vite replaces this development module.
if (import.meta.hot) import.meta.hot.dispose(() => graph.destroy());
