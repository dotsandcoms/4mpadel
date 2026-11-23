import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { branchProblems, classifyPaths, pushesToMain } from '../scripts/lib/workflow-policy.mjs';
import { skipWebBuild } from '../scripts/workflow-vercel-ignore.mjs';
import { previewArgs, sourceManifest, verifyArchive } from '../scripts/workflow-app-preview.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const policy = JSON.parse(readFileSync(path.join(root, '.github/workstreams.json'), 'utf8'));

test('app-only changes skip web; shared API clients always validate all consumers', () => {
  assert.deepEqual(classifyPaths(['mobile/src/app/settings.tsx']), { web: false, mobile: true, backend: false, workflow: true });
  for (const file of ['mobile/src/lib/protected-data-api.ts', 'mobile/supabase/functions/_shared/protected-data-api.ts']) {
    assert.deepEqual(classifyPaths([file]), { web: true, mobile: true, backend: true, workflow: true });
    assert.equal(skipWebBuild([file]), false);
  }
  assert.equal(skipWebBuild(['mobile/src/app/settings.tsx']), true);
});

test('shared analytics helpers are included and trigger web and app checks', () => {
  const included = readFileSync(path.join(root, '.vercelignore'), 'utf8').split(/\r?\n/);
  for (const file of ['mobile/src/lib/telemetry-privacy.js', 'mobile/src/lib/entry-analytics.js']) {
    assert.deepEqual(classifyPaths([file]), { web: true, mobile: true, backend: false, workflow: true });
    assert.equal(skipWebBuild([file]), false);
    assert.ok(included.includes(`!${file}`));
  }
});

test('web/admin, migrations, unknown inputs and workflow changes get the needed checks', () => {
  assert.equal(classifyPaths(['src/pages/Admin.jsx']).web, true);
  assert.equal(classifyPaths(['supabase/migrations/new.sql']).backend, true);
  assert.equal(classifyPaths(['mobile/supabase/migrations/new.sql']).backend, true);
  for (const file of ['new-build-input.config', '.github/workflows/repository-checks.yml']) {
    assert.deepEqual(classifyPaths([file]), { web: true, mobile: true, backend: true, workflow: true });
  }
  assert.equal(skipWebBuild(['src/deleted-web-file.jsx', 'mobile/src/moved-file.tsx']), false, 'both sides of a rename matter');
  assert.equal(skipWebBuild(['docs/development-workflow.md']), true);
  assert.equal(skipWebBuild(['src/pages/Admin.jsx'], 'brad/backup-before-tour'), true);
});

test('the active admin previews are preserved and allow admin changes without allowing app screens', () => {
  for (const branch of ['brad/admin-ui-preview', 'brad/admin-preview-v2']) {
    assert.equal(policy.activeBranches.find(item => item.branch === branch)?.preserve, true);
    assert.deepEqual(branchProblems(branch, ['src/pages/Admin.jsx'], policy), []);
    assert.equal(branchProblems(branch, ['mobile/src/app/index.tsx'], policy).length, 1);
  }
  assert.equal(branchProblems('brad/mobile-messaging', ['src/pages/Admin.jsx'], policy).length, 1);
  assert.deepEqual(branchProblems('brad/shared-account-update', ['src/pages/Profile.jsx', 'mobile/src/app/profile.tsx'], policy), []);
});

test('main is blocked even when pushing a differently named local branch or deleting a remote ref', () => {
  assert.equal(branchProblems('main', ['README.md'], policy).length, 1);
  assert.equal(pushesToMain('refs/heads/brad/web-fix abc refs/heads/main def\n'), true);
  assert.equal(pushesToMain('(delete) 000000 refs/heads/main abc\n'), true);
  assert.equal(pushesToMain('refs/heads/brad/web-fix abc refs/heads/brad/web-fix def\n'), false);
});

function fixture() {
  const folder = mkdtempSync(path.join(os.tmpdir(), 'fourm-workflow-test-'));
  const env = { ...process.env };
  for (const name of ['CI', 'VERCEL', 'EAS_BUILD']) delete env[name];
  const run = (command, args, options = {}) => spawnSync(command, args, { cwd: folder, env, encoding: 'utf8', ...options });
  const git = (...args) => { const result = run('git', args); assert.equal(result.status, 0, result.stderr); return result.stdout.trim(); };
  git('init', '--initial-branch=main'); git('config', 'user.name', 'Workflow Fixture'); git('config', 'user.email', 'workflow@example.test');
  for (const file of ['scripts/workflow-install.mjs', 'scripts/workflow-guard.mjs', 'scripts/workflow-vercel-ignore.mjs', 'scripts/lib/workflow-policy.mjs', '.github/workstreams.json']) {
    mkdirSync(path.dirname(path.join(folder, file)), { recursive: true }); copyFileSync(path.join(root, file), path.join(folder, file));
  }
  writeFileSync(path.join(folder, 'AGENTS.md'), 'Fixture workflow guidance\n');
  git('add', '.'); git('commit', '-m', 'fixture');
  return { folder, env, run, git, close: () => rmSync(folder, { recursive: true, force: true }) };
}

test('installed hooks prevent main commits and cross-product app commits, including on legacy checkouts', () => {
  const f = fixture();
  try {
    assert.equal(f.run(process.execPath, ['scripts/workflow-install.mjs']).status, 0);
    const hooks = f.git('config', '--get', 'core.hooksPath');
    assert.ok(existsSync(path.join(hooks, 'pre-commit')));
    writeFileSync(path.join(f.folder, 'README.md'), 'change\n'); f.git('add', 'README.md');
    assert.notEqual(f.run('git', ['commit', '-m', 'blocked main']).status, 0);
    f.git('switch', '-c', 'brad/app-fixture');
    mkdirSync(path.join(f.folder, 'src'), { recursive: true }); writeFileSync(path.join(f.folder, 'src/web.js'), 'export default 1;\n'); f.git('add', 'src/web.js');
    assert.notEqual(f.run('git', ['commit', '-m', 'blocked mixed work']).status, 0);
    f.git('restore', '--staged', 'src/web.js');
    mkdirSync(path.join(f.folder, 'mobile/src'), { recursive: true }); writeFileSync(path.join(f.folder, 'mobile/src/app.ts'), 'export default 1;\n'); f.git('add', 'mobile/src/app.ts');
    assert.equal(f.run('git', ['commit', '-m', 'app fixture']).status, 0);
    rmSync(path.join(f.folder, 'scripts/workflow-guard.mjs'));
    writeFileSync(path.join(f.folder, 'mobile/src/app.ts'), 'export default 2;\n'); f.git('add', 'mobile/src/app.ts');
    assert.equal(f.run('git', ['commit', '-m', 'older checkout still guarded']).status, 0);
    assert.notEqual(f.run(path.join(hooks, 'pre-push'), [], { input: 'refs/heads/brad/app-fixture abc refs/heads/main def\n' }).status, 0);
  } finally { f.close(); }
});

test('installation preserves an existing custom hooks configuration', () => {
  const f = fixture();
  try {
    f.git('config', 'core.hooksPath', '.custom-hooks');
    assert.notEqual(f.run(process.execPath, ['scripts/workflow-install.mjs']).status, 0);
    assert.equal(f.git('config', '--get', 'core.hooksPath'), '.custom-hooks');
  } finally { f.close(); }
});

test('phone archive validation rejects missing, changed, extra and secret files', () => {
  const source = { '.env.example': 'placeholder', 'app.json': 'one', 'src/app.tsx': 'two' };
  const archive = { 'app.json': 'one', 'src/app.tsx': 'two' };
  assert.equal(verifyArchive(source, archive), 2);
  assert.throws(() => verifyArchive(source, { 'app.json': 'one' }));
  assert.throws(() => verifyArchive(source, { ...archive, 'app.json': 'changed' }));
  assert.throws(() => verifyArchive(source, { ...archive, 'untracked.txt': 'extra' }));
  assert.throws(() => verifyArchive({ '.env': 'secret' }, { '.env': 'secret' }));
});

test('installation also preserves active hooks in the default Git hooks directory', () => {
  const f = fixture();
  try {
    const hook = path.join(f.folder, '.git/hooks/pre-commit');
    writeFileSync(hook, '#!/bin/sh\nexit 0\n');
    assert.notEqual(f.run(process.execPath, ['scripts/workflow-install.mjs']).status, 0);
    assert.equal(readFileSync(hook, 'utf8'), '#!/bin/sh\nexit 0\n');
  } finally { f.close(); }
});

test('Vercel compares all commits since the successful deployment and builds without a known baseline', () => {
  const f = fixture();
  try {
    f.git('switch', '-c', 'brad/shared-fixture');
    const initial = f.git('rev-parse', 'HEAD');
    mkdirSync(path.join(f.folder, 'src')); writeFileSync(path.join(f.folder, 'src/web.js'), 'web change');
    f.git('add', 'src'); f.git('commit', '-m', 'web change');
    const web = f.git('rev-parse', 'HEAD');
    mkdirSync(path.join(f.folder, 'mobile/src'), { recursive: true }); writeFileSync(path.join(f.folder, 'mobile/src/app.ts'), 'app change');
    f.git('add', 'mobile'); f.git('commit', '-m', 'app change');
    const invoke = previous => f.run(process.execPath, ['scripts/workflow-vercel-ignore.mjs'], {
      env: { ...f.env, VERCEL_GIT_COMMIT_REF: 'brad/shared-fixture', VERCEL_GIT_PREVIOUS_SHA: previous },
    }).status;
    assert.equal(invoke(''), 1, 'first multi-commit push must include earlier web changes');
    assert.equal(invoke(initial), 1, 'web has changed since the successful deployment');
    assert.equal(invoke(web), 0, 'only app inputs changed since the successful deployment');
    assert.equal(invoke('a'.repeat(40)), 1, 'missing Git history must continue building');
  } finally { f.close(); }
});

test('phone commands permit only internal preview with frozen credentials and no store submission', () => {
  for (const platform of ['ios', 'android']) {
    const args = previewArgs(platform, 'abc123');
    assert.equal(args[args.indexOf('--profile') + 1], 'preview');
    assert.ok(args.includes('--freeze-credentials'));
    assert.ok(args.includes('--no-wait'));
    assert.ok(!args.some(arg => /submit|production/.test(arg)));
  }
  assert.throws(() => previewArgs('all', 'abc123'));
  const folder = mkdtempSync(path.join(os.tmpdir(), 'fourm-manifest-'));
  try {
    writeFileSync(path.join(folder, 'app.json'), 'committed source');
    mkdirSync(path.join(folder, 'node_modules')); writeFileSync(path.join(folder, 'node_modules/local'), 'dependency');
    assert.deepEqual(Object.keys(sourceManifest(folder)), ['app.json']);
    const before = sourceManifest(folder); writeFileSync(path.join(folder, 'app.json'), 'different source');
    assert.notEqual(before['app.json'], sourceManifest(folder)['app.json']);
  } finally { rmSync(folder, { recursive: true, force: true }); }
});
