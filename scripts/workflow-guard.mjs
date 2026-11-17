import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { branchProblems, pushesToMain } from './lib/workflow-policy.mjs';

const folder = path.dirname(fileURLToPath(import.meta.url));
const policyFile = existsSync(path.join(folder, 'workstreams.json'))
  ? path.join(folder, 'workstreams.json') : path.join(folder, '../.github/workstreams.json');
const policy = JSON.parse(readFileSync(policyFile, 'utf8'));
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const action = process.argv[2] || 'check';
let problems = [];
if (action === 'pre-push') {
  if (pushesToMain(readFileSync(0, 'utf8'))) problems.push('Push a task branch and merge its checked pull request. Direct pushes and deletions of main are disabled.');
} else {
  const branch = git('branch', '--show-current');
  const paths = execFileSync('git', ['diff', '--cached', '--name-only', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  problems = branchProblems(branch, paths, policy);
}
if (problems.length) {
  console.error('4M workflow: ' + problems.join('\n'));
  console.error('Read AGENTS.md and docs/development-workflow.md. Existing unfinished admin work is preserved.');
  process.exit(1);
}
