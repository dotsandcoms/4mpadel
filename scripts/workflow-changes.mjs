import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { classifyPaths, branchProblems } from './lib/workflow-policy.mjs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const head = process.env.WORKFLOW_HEAD_SHA || git('rev-parse', 'HEAD');
let base = process.env.WORKFLOW_BASE_SHA;
if (!/^[a-f0-9]{40}$/.test(head)) throw new Error('Expected a commit SHA for the change head');
if (!base || /^0+$/.test(base)) {
  try { base = git('rev-parse', 'HEAD^'); } catch { base = null; }
}
if (base && !/^[a-f0-9]{40}$/.test(base)) throw new Error('Expected a commit SHA for the change base');
if (base && process.env.WORKFLOW_PULL_REQUEST === 'true') base = git('merge-base', base, head);
const paths = base
  ? execFileSync('git', ['diff', '--no-renames', '--name-only', '-z', base, head, '--'], { encoding: 'utf8' }).split('\0').filter(Boolean)
  : execFileSync('git', ['ls-tree', '-r', '--name-only', '-z', head], { encoding: 'utf8' }).split('\0').filter(Boolean);
const branch = process.env.WORKFLOW_HEAD_BRANCH;
if (process.env.WORKFLOW_PULL_REQUEST === 'true') {
  const policy = JSON.parse(readFileSync('.github/workstreams.json', 'utf8'));
  const problems = branchProblems(branch, paths, policy);
  if (problems.length) throw new Error(problems.join('\n'));
}
const scopes = classifyPaths(paths);
console.log(JSON.stringify({ branch, base, head, paths, checks: scopes }, null, 2));
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(scopes).map(([key, value]) => `${key}=${value}\n`).join(''));
