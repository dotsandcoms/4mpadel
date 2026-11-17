import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function sourceManifest(folder, prefix = '') {
  const result = {};
  for (const entry of readdirSync(path.join(folder, prefix), { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) Object.assign(result, sourceManifest(folder, name));
    else {
      if (!lstatSync(path.join(folder, name)).isFile()) throw new Error(`Unexpected non-file source: ${name}`);
      result[name] = createHash('sha256').update(readFileSync(path.join(folder, name))).digest('hex');
    }
  }
  return result;
}

export function verifyArchive(source, archive) {
  // The committed placeholder is intentionally excluded by .easignore.
  const expected = Object.keys(source).filter(name => name !== '.env.example').sort();
  const actual = Object.keys(archive).sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error('EAS archive files differ from committed app source');
  for (const name of actual) {
    if (/(^|\/)\.env(?:\.|$)|\.(?:p8|p12|key|mobileprovision)$/.test(name)) throw new Error(`Private build input: ${name}`);
    if (source[name] !== archive[name]) throw new Error(`EAS archive content changed: ${name}`);
  }
  return actual.length;
}

export function previewArgs(platform, commit) {
  if (!['ios', 'android'].includes(platform)) throw new Error('Choose --platform ios or android');
  return ['build', '--platform', platform, '--profile', 'preview', '--non-interactive',
    '--freeze-credentials', '--no-wait', '--json', '--message', `Internal phone test from ${commit}`];
}

function main() {
  const args = process.argv.slice(2);
  const platformIndex = args.indexOf('--platform');
  const platform = platformIndex === -1 ? 'ios' : args[platformIndex + 1];
  const allowed = new Set(['--build', '--platform', platform]);
  if (args.some(arg => !allowed.has(arg))) throw new Error('Only --platform ios|android and --build are supported');
  previewArgs(platform, 'validation');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const git = (...values) => execFileSync('git', values, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
  const clean = () => {
    if (git('status', '--porcelain', '--untracked-files=normal')) throw new Error('Use a clean task worktree; commit/review its changes before a build');
  };
  clean();
  const commit = git('rev-parse', 'HEAD');
  if (!git('for-each-ref', `--contains=${commit}`, '--format=%(refname)', 'refs/remotes/origin/')) {
    throw new Error('Push this source commit to origin before preparing a phone build');
  }
  const checked = spawnSync('npm', ['--prefix', 'mobile', 'run', 'check'], { cwd: root, stdio: 'inherit' });
  if (checked.status !== 0) throw new Error('App validation failed');
  clean();
  if (git('rev-parse', 'HEAD') !== commit) throw new Error('Source revision changed during validation');
  const releases = path.join(root, 'mobile/release');
  mkdirSync(releases, { recursive: true });
  const receiptFolder = mkdtempSync(path.join(releases, `internal-${platform}-${commit.slice(0, 8)}-`));
  const sourceFolder = path.join(receiptFolder, 'source');
  const archiveFolder = path.join(receiptFolder, 'archive');
  mkdirSync(sourceFolder);
  const tar = execFileSync('git', ['archive', `${commit}:mobile`], { cwd: root, maxBuffer: 128 * 1024 * 1024 });
  execFileSync('tar', ['-xf', '-', '-C', sourceFolder], { input: tar });
  const manifest = sourceManifest(sourceFolder);
  const dependencies = path.join(root, 'mobile/node_modules');
  if (!existsSync(dependencies)) throw new Error('Install mobile dependencies from its lockfile first');
  symlinkSync(dependencies, path.join(sourceFolder, 'node_modules'), 'dir');
  const profile = JSON.parse(readFileSync(path.join(sourceFolder, 'eas.json'), 'utf8')).build.preview;
  if (profile.distribution !== 'internal' || profile.extends || profile.ios?.simulator) throw new Error('Preview must be a direct internal phone profile');
  const cli = JSON.parse(readFileSync(path.join(root, '.github/workstreams.json'), 'utf8')).expoCliVersion;
  if (!/^\d+\.\d+\.\d+$/.test(cli)) throw new Error('Pin an exact tested EAS CLI version');
  const env = { ...process.env, EAS_NO_VCS: '1', EAS_PROJECT_ROOT: sourceFolder, EAS_BUILD_WORKINGDIR: sourceFolder };
  delete env.EAS_AUTO_SUBMIT;
  const eas = (values, capture = false) => {
    const result = spawnSync('npx', ['--yes', `eas-cli@${cli}`, ...values], {
      cwd: sourceFolder, env, encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit', maxBuffer: 16 * 1024 * 1024,
    });
    if (result.status !== 0) throw new Error(`EAS command failed; inspect ${receiptFolder}`);
    return result.stdout;
  };
  eas(['build:inspect', '--platform', platform, '--profile', 'preview', '--stage', 'archive', '--output', archiveFolder]);
  const files = verifyArchive(manifest, sourceManifest(archiveFolder));
  const receipt = { commit, branch: git('branch', '--show-current'), platform, profile: 'preview', distribution: 'internal',
    cliVersion: cli, sourceFolder, archiveFolder, archiveFiles: files, checkedAt: new Date().toISOString(), submittedToStore: false };
  writeFileSync(path.join(receiptFolder, 'source-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  writeFileSync(path.join(receiptFolder, 'release.json'), JSON.stringify(receipt, null, 2) + '\n');
  if (args.includes('--build')) {
    verifyArchive(manifest, sourceManifest(archiveFolder));
    if (JSON.stringify(sourceManifest(sourceFolder)) !== JSON.stringify(manifest)) throw new Error('Frozen app source changed after inspection');
    const output = eas(previewArgs(platform, commit), true);
    const builds = JSON.parse(output);
    if (!(Array.isArray(builds) ? builds : [builds]).every(build => build.distribution === 'INTERNAL')) {
      throw new Error('Expo returned an unexpected distribution; inspect the build immediately');
    }
    writeFileSync(path.join(receiptFolder, 'build-start.json'), JSON.stringify(builds, null, 2) + '\n');
    console.log(output);
  }
  console.log(`Verified internal source receipt: ${path.join(receiptFolder, 'release.json')}`);
  console.log('Follow any started build to completion and verify its installer before reporting it ready.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
