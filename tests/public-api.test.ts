import assert from 'node:assert/strict';
import test from 'node:test';
import * as vanilla from 'git-commit-graph';
import * as react from 'git-commit-graph/react';

test('public entries expose only the vanilla and React renderers', async () => {
  assert.deepEqual(Object.keys(vanilla), ['createGitCommitGraph']);
  assert.deepEqual(Object.keys(react).sort(), ['GitCommitGraph', 'default']);
  assert.equal(react.default, react.GitCommitGraph);
  const internalEntry = 'git-commit-graph/core';
  await assert.rejects(import(internalEntry), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
});
