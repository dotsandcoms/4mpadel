export const defaultBranch = 'main';

const sharedAnalyticsFiles = new Set([
  'mobile/src/lib/telemetry-privacy.js',
  'mobile/src/lib/entry-analytics.js',
]);

export function isWorkflowPath(path) {
  return path === 'AGENTS.md' || path === 'mobile/AGENTS.md' || path === 'README.md'
    || path.startsWith('.github/') || path.startsWith('.githooks/')
    || path.startsWith('docs/development-workflow') || path.startsWith('scripts/workflow-')
    || path.startsWith('scripts/lib/workflow-') || path.startsWith('tests/workflow');
}

export function isSharedClient(path) {
  return ['mobile/src/lib/protected-data-api.ts', 'mobile/supabase/functions/_shared/protected-data-api.ts'].includes(path);
}

export function isMobileProduct(path) {
  return path.startsWith('mobile/') && !path.startsWith('mobile/tests/')
    && !path.startsWith('mobile/scripts/') && !path.startsWith('mobile/supabase/')
    && !path.startsWith('mobile/docs/') && path !== 'mobile/AGENTS.md';
}

export function isWebProduct(path) {
  return /^(src|api|public|reactmath-package)\//.test(path)
    || sharedAnalyticsFiles.has(path)
    || path.startsWith('sandbox/private-draw-rehearsal/')
    || /^(package(?:-lock)?\.json|vite\.config\.[cm]?js|index\.html|vercel\.json|\.vercelignore|postcss\.config\.[cm]?js|tailwind\.config\.[cm]?js)$/.test(path);
}

export function classifyPaths(paths) {
  const result = { web: false, mobile: false, backend: false, workflow: true };
  for (const path of paths) {
    if (path.startsWith('.github/workflows/') || path.startsWith('scripts/workflow-') || path.startsWith('scripts/lib/workflow-')) {
      result.web = result.mobile = result.backend = true;
    } else if (isSharedClient(path)) {
      result.web = result.mobile = result.backend = true;
    } else if (path.startsWith('mobile/')) {
      result.mobile = true;
      if (sharedAnalyticsFiles.has(path)) result.web = true;
      if (path.startsWith('mobile/supabase/')) result.backend = true;
    } else if (path.startsWith('supabase/') || path === 'deno.lock') {
      result.backend = result.web = true;
    } else if (isWebProduct(path) || path.startsWith('tests/') || path.startsWith('scripts/')) {
      result.web = true;
      if (/migration|data-api|refundReadAuthorization/.test(path)) result.backend = true;
    } else if (!isWorkflowPath(path) && !/^(docs\/|.*\.md$|\.gitignore$|\.editorconfig$|\.nvmrc$)/.test(path)) {
      // Unknown inputs receive all checks rather than silently bypassing validation.
      result.web = result.mobile = result.backend = true;
    }
  }
  return result;
}

export function branchScope(branch, policy) {
  return policy.activeBranches.find(item => item.branch === branch)?.scope
    || branch.match(/^brad\/(app|web|admin|backend|shared|workflow)-[a-z0-9][a-z0-9-]*$/)?.[1]
    || null;
}

export function branchProblems(branch, paths, policy) {
  if (!branch || branch === defaultBranch || branch === 'master') return ['Use a task branch in its own working folder; direct commits to main are disabled.'];
  const scope = branchScope(branch, policy);
  if (!scope) return ['Use brad/app-…, brad/web-…, brad/admin-…, brad/backend-…, brad/shared-… or brad/workflow-… from current main.'];
  if (scope === 'shared' || scope === 'workflow') return [];
  return paths.filter(path => !isWorkflowPath(path) && (
    scope === 'app' && isWebProduct(path)
    || ['web', 'admin', 'backend'].includes(scope) && isMobileProduct(path)
  )).map(path => `${path} belongs to another product. Use a separate task worktree, or a brad/shared-… branch for one coordinated change.`);
}

export function pushesToMain(input) {
  return input.split(/\r?\n/).filter(Boolean).some(line => {
    const [, , remote] = line.trim().split(/\s+/);
    return remote === `refs/heads/${defaultBranch}`;
  });
}
