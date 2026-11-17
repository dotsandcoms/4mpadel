import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.env.CI || process.env.VERCEL || process.env.EAS_BUILD) process.exit(0);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
let common;
try { common = git('rev-parse', '--path-format=absolute', '--git-common-dir'); } catch { process.exit(0); }
const hooks = path.join(common, 'fourm-workflow/hooks');
let previous = '';
try { previous = git('config', '--local', '--get', 'core.hooksPath'); } catch {}
if (previous && path.resolve(root, previous) !== hooks) {
  console.error(`Existing Git hooks at ${previous} were preserved. Integrate the 4M guards there before replacing them.`);
  process.exit(1);
}
if (!previous && ['pre-commit', 'pre-push'].some(event => existsSync(path.join(common, 'hooks', event)))) {
  console.error('Existing default Git hooks were preserved. Integrate the 4M guards before changing core.hooksPath.');
  process.exit(1);
}
mkdirSync(path.join(common, 'fourm-workflow/lib'), { recursive: true });
mkdirSync(hooks, { recursive: true });
for (const [source, destination] of [
  ['scripts/workflow-guard.mjs', 'workflow-guard.mjs'],
  ['scripts/lib/workflow-policy.mjs', 'lib/workflow-policy.mjs'],
  ['.github/workstreams.json', 'workstreams.json'],
  ['AGENTS.md', 'AGENTS.md'],
]) copyFileSync(path.join(root, source), path.join(common, 'fourm-workflow', destination));
for (const event of ['pre-commit', 'pre-push']) {
  const target = path.join(hooks, event);
  writeFileSync(target, `#!/bin/sh\ncommon=$(git rev-parse --path-format=absolute --git-common-dir) || exit 1\nexec node "$common/fourm-workflow/workflow-guard.mjs" ${event} "$@"\n`);
  chmodSync(target, 0o755);
}
git('config', '--local', 'core.hooksPath', hooks);
git('config', '--local', 'fourm.workflowInstructions', path.join(common, 'fourm-workflow/AGENTS.md'));
console.log('4M Git guards installed for this repository and all its worktrees.');
