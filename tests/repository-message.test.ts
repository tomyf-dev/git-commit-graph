import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { readRepository } from '../scripts/capture-repository.js';

test('repository reader preserves commit and stash bodies without exposing stash internals', () => {
  const path = mkdtempSync(join(tmpdir(), 'graph-message-'));
  const git = (...args: string[]) => execFileSync('git', ['-C', path, ...args], { encoding: 'utf8' }).trim();
  try {
    git('init', '-b', 'main');
    git('config', 'user.name', 'Graph test');
    git('config', 'user.email', 'graph@example.invalid');
    writeFileSync(join(path, 'file'), 'base\n');
    git('add', 'file');
    const body = '説明の一行目\n二行目\n\n別の段落';
    git('commit', '-m', 'コミット件名', '-m', body);
    const head = git('rev-parse', 'HEAD');
    assert.equal(readRepository(path).worktrees[0].changedFileCount, 0);
    writeFileSync(join(path, 'file'), 'changed\n');
    assert.equal(readRepository(path).worktrees[0].changedFileCount, 1);
    git('stash', 'push', '-m', `スタッシュ件名\n\n${body}`);
    const snapshot = readRepository(path);
    assert.equal(snapshot.commits.length, 1);
    assert.equal(snapshot.commits[0].id, head);
    assert.equal(snapshot.commits[0].subject, 'コミット件名');
    assert.equal(snapshot.commits[0].body, body);
    assert.equal(snapshot.stashes[0].subject, 'スタッシュ件名');
    assert.equal(snapshot.stashes[0].sourceBranch, 'main');
    assert.equal(snapshot.stashes[0].body, body);
    assert.equal(snapshot.stashes[0].baseCommitId, head);
    assert.equal(snapshot.stashes[0].commitId, git('rev-parse', 'stash@{0}'));
    git('checkout', '--detach');
    writeFileSync(join(path, 'file'), 'detached change');
    git('stash', 'push', '-m', 'On example: 入力した件名');
    const detached = readRepository(path).stashes[0];
    assert.equal(detached.subject, 'On example: 入力した件名');
    assert.equal(detached.sourceBranch, '(no branch)');
    git('mv', 'file', 'renamed');
    writeFileSync(join(path, 'renamed'), 'modified after staging rename');
    writeFileSync(join(path, 'untracked\nfile'), 'new');
    assert.equal(readRepository(path).worktrees[0].changedFileCount, 2, 'rename paths and staged/unstaged changes must not be double-counted');
  } finally { rmSync(path, { recursive: true, force: true }); }
});
