import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export function readRepository(repository: string) {
const git = (args: string[], cwd = repository) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
const worktrees = git(['worktree', 'list', '--porcelain', '-z']).split('\0\0').filter(Boolean).flatMap(record => {
  const fields = record.split('\0');
  const field = (name: string) => fields.find(f => f.startsWith(name + ' '))?.slice(name.length + 1);
  const id = field('worktree'), headCommitId = field('HEAD');
  if (!id || !headCommitId) return [];
  const status = git(['status', '--porcelain=v1', '-z', '--untracked-files=all'], id).split('\0');
  let changedFileCount = 0;
  for (let i = 0; i < status.length; i++) {
    if (!status[i]) continue;
    changedFileCount++;
    if (/[RC]/.test(status[i].slice(0, 2))) i++; // Renames/copies include a second path.
  }
  return [{ id, headCommitId, label: field('branch')?.replace('refs/heads/', '') ?? 'detached HEAD',
    isDetached: fields.includes('detached'), changedFileCount, isDirty: changedFileCount > 0 }];
});
const records = git(['log', '-z', '--date-order', '--format=%H%x00%P%x00%s%x00%b%x00%D', '--exclude=refs/stash', '--all', ...worktrees.map(w => w.headCommitId)]).split('\0');
const commits = [];
for (let i = 0; i + 4 < records.length; i += 5) {
  const [id, parents, subject, body, refs] = records.slice(i, i + 5);
  commits.push({ id, parentIds: parents ? parents.split(' ') : [], subject, body: body.trimEnd(), refs });
}
const stashes = git(['stash', 'list', '--format=%H%x00%gd']).trim().split('\n').filter(Boolean).map(line => {
  const [commitId, id] = line.split('\0');
  const [rawSubject, body] = git(['show', '-s', '--format=%s%x00%b', commitId]).split('\0');
  const prefix = rawSubject.match(/^(?:On|WIP on) ([^:]+): /);
  const subject = prefix ? rawSubject.slice(prefix[0].length) : rawSubject;
  const sourceBranch = prefix?.[1];
  return { id, commitId, sourceBranch, label: subject, subject, body: body.trimEnd(), baseCommitId: git(['rev-parse', `${commitId}^1`]).trim() };
});
return { commits, worktrees, stashes, primaryWorktreeId: git(['rev-parse', '--show-toplevel']).trim(), primaryHeadId: git(['rev-parse', 'HEAD']).trim() };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) throw new Error('Usage: npm run capture -- /path/to/repository [output.json]');
  const repository = resolve(process.argv[2]);
  const output = process.argv[3] ? resolve(process.argv[3]) : fileURLToPath(new URL(`../tmp/data/${encodeURIComponent(basename(repository))}.json`, import.meta.url));
  if (!output.endsWith('.json')) throw new Error('Output must end in .json. Save local Git data under tmp/data/ to keep it out of commits.');
  const data = readRepository(repository);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(data, null, 2) + '\n');
  console.log(`Saved ${output}`);
  console.log(`Captured ${data.commits.length} commits and ${data.worktrees.length} worktrees (read-only).`);
}
