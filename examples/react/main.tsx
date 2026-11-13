import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GitCommitGraph, type GraphLayout } from '../../src/adapters/react/index.js';
import { sources, initialSource, graphProps } from '../shared/data.js';
import '../shared/style.css';

function App() {
  const [sourceId, setSourceId] = useState(initialSource.id);
  const source = sources.find(entry => entry.id === sourceId)!;
  const sample = graphProps(source.data);
  const commits = source.data.commits;
  const [current, setCurrent] = useState(sample.layout!.primaryWorktreeId!);
  const [worktrees, setWorktrees] = useState(sample.worktrees!);
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState('未選択');
  const layout = { ...sample.layout, primaryWorktreeId: current, primaryHeadId: worktrees.find(w => w.id === current)?.headCommitId ?? source.data.primaryHeadId };
  const [graph, setGraph] = useState<GraphLayout | null>(null);
  const select = (kind: string, id: string) => { setSelected(kind === 'Commit' ? id : null); setMessage(`${kind}: ${id}`); };
  return <>
    <h1>React adapter</h1><p>JSONデータによる分岐・マージ・Changes・スタッシュのサンプル</p>
    <div className="controls">
      <label>データソース<select aria-label="データソース" value={sourceId} onChange={e => {
        const next = sources.find(entry => entry.id === e.target.value)!;
        setGraph(null); setSourceId(next.id); setCurrent(next.data.primaryWorktreeId); setWorktrees(next.data.worktrees); setSelected(null); setMessage('未選択');
      }}>{sources.map(entry => <option key={entry.id} value={entry.id}>{entry.id}</option>)}</select></label>
      <label>現在のワークツリー<select aria-label="現在のワークツリー" value={current} onChange={e => setCurrent(e.target.value)}>{worktrees.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}</select></label>
      <label><input type="checkbox" disabled={!worktrees.some(w => w.id === current)} checked={worktrees.find(w => w.id === current)?.isDirty === true} onChange={e => setWorktrees(worktrees.map(w => w.id === current ? { ...w, isDirty: e.target.checked } : w))} /> 現在のワークツリーに変更あり</label>
      <button onClick={() => { setCurrent(sample.layout!.primaryWorktreeId!); setWorktrees(sample.worktrees!); setSelected(null); setMessage('未選択'); }}>リセット</button>
    </div>
    <div className="history">
      <GitCommitGraph onLayoutChange={setGraph} {...sample} worktrees={worktrees} layout={layout} selectedCommitId={selected} onCommitClick={c => select('Commit', c.id)} onWorktreeClick={w => select('Worktree', w.id)} onStashClick={s => select('Stash', s.id)} />
      <div className="messages">{graph?.rows.map(row => <div className="message" key={JSON.stringify([row.kind,row.kind === 'commit' ? row.commit.id : row.kind === 'worktree' ? row.worktree.id : row.stash.id])}><span style={{ borderColor: row.color }}>{row.kind === 'worktree' ? `Changes · ${row.worktree.label}` : row.kind === 'stash' ? row.stash.subject : commits.find(c => c.id === row.commit.id)!.subject}</span></div>)}</div>
    </div><output>{message}</output>
  </>;
}
const root = createRoot(document.getElementById('app')!);
root.render(<App />);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
