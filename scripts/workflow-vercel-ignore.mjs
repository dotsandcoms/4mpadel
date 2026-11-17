import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { classifyPaths } from './lib/workflow-policy.mjs';

export function skipWebBuild(paths, branch = '') {
  if (/^brad\/backup-/.test(branch)) return true;
  return !classifyPaths(paths).web;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const branch = process.env.VERCEL_GIT_COMMIT_REF || '';
  if (/^brad\/backup-/.test(branch)) {
    console.log('Skipping deployment of a backup checkpoint.');
    process.exit(0);
  }
  try {
    const previous = process.env.VERCEL_GIT_PREVIOUS_SHA;
    const base = previous && /^[a-f0-9]{40}$/.test(previous) && !/^0+$/.test(previous) ? previous : 'HEAD^';
    const paths = execFileSync('git', ['diff', '--no-renames', '--name-only', '-z', base, 'HEAD', '--'], { encoding: 'utf8' }).split('\0').filter(Boolean);
    const skip = skipWebBuild(paths, branch);
    console.log(skip ? 'No web or shared web inputs changed; skipping website build.' : 'Web inputs changed; continuing website build.');
    process.exit(skip ? 0 : 1);
  } catch {
    // Shallow/missing history must never suppress a needed production build.
    console.log('Change history unavailable; continuing website build.');
    process.exit(1);
  }
}
