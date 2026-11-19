// Publish one macOS arm64 package directory to a commit-scoped GitHub release.
// Stable v* releases stay on the three-platform publisher.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const gh = args => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 });

function readJson(runGh, args) {
  try { return JSON.parse(runGh(args)); }
  catch (error) {
    const detail = `${error.stderr || ''}\n${error.message || ''}`;
    if (/404|Not Found|release not found/i.test(detail)) return null;
    throw error;
  }
}

export function publishMacosBuild(directory, context, runGh = gh) {
  const { tag, commit, repository } = context;
  if (!/^macos-arm64(?:-release)?-[0-9a-f]{40}$/.test(tag ?? '')) throw new Error('macOS package releases use a commit tag, not a stable version tag');
  if (!/^[0-9a-f]{40}$/.test(commit ?? '')) throw new Error('A full source commit SHA is required');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? '')) throw new Error('Invalid repository');
  const present = readdirSync(directory).filter(name => !name.startsWith('.')).sort();
  const files = present.filter(name => name !== 'build-info.json');
  if (!files.some(name => name.endsWith('.zip'))) throw new Error('macOS package zip is missing');
  let info = {};
  if (present.includes('build-info.json')) info = JSON.parse(readFileSync(`${directory}/build-info.json`, 'utf8'));
  let version = '';
  try { version = JSON.parse(readFileSync('package.json', 'utf8')).version; } catch { /* title stays unversioned */ }
  const short = commit.slice(0, 7);
  const profile = info.profile === 'release' ? 'release' : 'CI test';
  const title = `AntiGravity Switch${version ? ` ${version}` : ''} macOS arm64 (${short})`;
  const notes = [
    `Apple Silicon ${profile} package from commit \`${commit}\`.`,
    '',
    'This release contains the macOS arm64 archive only. It is not the three-platform stable release and it is not Developer ID signed or notarized.',
    '',
    ...files.filter(name => /\.(?:zip|tar\.gz)$/.test(name)).map(name => `- [${name}](https://github.com/${repository}/releases/download/${tag}/${name})`),
    '',
    `Source commit: ${commit}`,
  ].join('\n');
  const existing = readJson(runGh, ['api', `repos/${repository}/releases/tags/${tag}`]);
  if (existing) {
    const target = existing.target_commitish;
    if (target && target !== commit && target !== short) throw new Error('This package tag already points at a different commit');
  }
  const pages = readJson(runGh, ['api', '--paginate', '--slurp', `repos/${repository}/releases`]) ?? [];
  const stable = (Array.isArray(pages) ? pages.flat() : []).some(release => !release.draft && !release.prerelease && /^v\d+\.\d+\.\d+$/.test(release.tag_name ?? ''));
  const paths = files.map(name => `${directory}/${name}`);
  if (!existing) {
    runGh(['release', 'create', tag, '--repo', repository, '--target', commit, '--title', title, '--notes', notes, ...(stable ? [] : ['--latest']), ...paths]);
  } else {
    runGh(['release', 'upload', tag, '--repo', repository, '--clobber', ...paths]);
    runGh(['release', 'edit', tag, '--repo', repository, '--title', title, '--notes', notes, ...(stable ? [] : ['--latest'])]);
  }
  return { tag, title, files };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [directory, tag, commit, repository, ...extra] = process.argv.slice(2);
    if (!directory || !tag || !commit || !repository || extra.length) throw new Error('Usage: publish-macos-build.mjs DIRECTORY TAG COMMIT OWNER/REPOSITORY');
    const published = publishMacosBuild(resolve(directory), { tag, commit, repository });
    console.log(`Published ${published.files.length} file(s) to ${published.tag}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
