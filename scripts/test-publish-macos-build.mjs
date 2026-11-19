import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publishMacosBuild } from './publish-macos-build.mjs';

const commit = '504c71dc025974348fc0c5a7b363c42585ca144f';
const tag = `macos-arm64-${commit}`;
const repository = 'fixture/agy-switch';

function directory() {
  const root = mkdtempSync(join(tmpdir(), 'agy-macos-publish-'));
  writeFileSync(join(root, 'agy-switch-test.zip'), 'zip');
  writeFileSync(join(root, 'build-info.json'), JSON.stringify({ profile: 'debug' }));
  return root;
}

test('creates a commit-scoped macOS release and keeps it latest when no stable release exists', () => {
  const root = directory();
  const calls = [];
  try {
    const result = publishMacosBuild(root, { tag, commit, repository }, args => {
      calls.push(args);
      if (args[1] === `repos/${repository}/releases/tags/${tag}`) throw new Error('HTTP 404: Not Found');
      if (args.includes(`repos/${repository}/releases`)) return '[]';
      return '';
    });
    assert.equal(result.tag, tag);
    assert.deepEqual(result.files, ['agy-switch-test.zip']);
    const create = calls.find(args => args[0] === 'release' && args[1] === 'create');
    assert.equal(create.includes('--latest'), true);
    assert.equal(create.includes('--target'), true);
    assert.equal(create.at(-1).endsWith('agy-switch-test.zip'), true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('updates an existing package release without replacing a stable latest release', () => {
  const root = directory();
  const calls = [];
  try {
    publishMacosBuild(root, { tag, commit, repository }, args => {
      calls.push(args);
      if (args[1] === `repos/${repository}/releases/tags/${tag}`) return JSON.stringify({ tag_name: tag, target_commitish: commit, draft: false });
      if (args.includes(`repos/${repository}/releases`)) return JSON.stringify([{ tag_name: 'v4.10.18', draft: false, prerelease: false }]);
      return '';
    });
    assert.equal(calls.some(args => args[1] === 'upload' && args.includes('--clobber')), true);
    const edit = calls.find(args => args[1] === 'edit');
    assert.equal(edit.includes('--latest'), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('refuses a stable version tag and a missing zip', () => {
  const root = directory();
  try {
    assert.throws(() => publishMacosBuild(root, { tag: 'v4.10.18', commit, repository }, () => '[]'), /commit tag/);
    rmSync(join(root, 'agy-switch-test.zip'));
    assert.throws(() => publishMacosBuild(root, { tag, commit, repository }, () => { throw new Error('HTTP 404: Not Found'); }), /zip is missing/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
