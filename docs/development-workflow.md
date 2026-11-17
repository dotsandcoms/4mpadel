# Development and release workflow

This is the default for Brad, Codex and contributors. Root/mobile `AGENTS.md`
carry the rules into future coding tasks. Local Git guards and required GitHub
checks enforce the core rules independently of chat memory.

## Repository and branches

Use one repository and one integration branch, `main`. Web and app releases have
different destinations; they do not need permanent web/mobile source branches.
Installed phone versions can lag behind main, so backend changes must support
the website and existing released apps.

| Scope | Task branch prefix | Source | Preview / release |
| --- | --- | --- | --- |
| Native app | `brad/app-` | `mobile/` | Expo internal preview; approved store release later |
| Website | `brad/web-` | `src/`, `api/`, `public/` | Vercel PR preview; main publishes web changes |
| Admin | `brad/admin-` | Existing web/admin source | Vercel PR preview; same web release process |
| Backend | `brad/backend-` | Both Supabase folders | Local contracts; separately authorized hosted rollout |
| Coordinated change | `brad/shared-` | Multiple consumers | Test all consumers; compatible backend rollout first |
| Tooling | `brad/workflow-` | Instructions/checks/scripts | Checked PR; review deployment impact |

Use short task names such as `brad/app-event-title`. One independent task/chat
uses one worktree. Inspect status, branch, worktrees, open PRs and the active
registry first. Fetch current `origin/main`; reuse a suitable clean worktree or
create one with Codex's managed worktree tools. Never switch/reset/stash/clean
another task's working folder. Install dependencies from committed lockfiles.

Root `npm ci` installs Git guards; refresh with `npm run workflow:install`. Hooks
live in Git's common directory and cover all existing worktrees, including old
branches without these scripts. Custom hook configurations are preserved and need
deliberate integration. Server checks remain authoritative.

## Preserve unfinished work

`.github/workstreams.json` is a preservation register, not a merge list:

- `brad/admin-preview-v2`: active local admin work with substantial unfinished
  changes. Keep its working folder, local files and branch intact.
- `brad/admin-ui-preview`: older pushed admin snapshot. Keep until admin work
  is reviewed and Brad explicitly retires it.
- `brad/mobile-messaging`: transitional app work during current phone testing.
  New unrelated app tasks start from main.
- `brad/fix-delayed-refund-entry-status`: existing draft PR #2, awaiting review.

A GitHub rule prevents deletion and force pushes for the preserved names,
including the local admin branch if pushed later. Remove an entry/rule only on
Brad's explicit retirement instruction. To finish admin, inspect its diff and
move completed pieces onto current main through a focused admin PR. Test its
preview before release. Never merge the stale working folder wholesale.

Other historical branches need review before retirement. Unique commit counts
can include already-squashed work. Check diffs, PRs and working folders; archive
a reviewed revision before deletion. Never delete dirty worktrees. Future merged
task branches can be deleted automatically; registered active work stays protected.
Pushed task commits, PR history and release receipts replace per-task backup branches.

## Daily change and merge

1. Make a focused change. Keep app-only and web/admin-only work separate; use
   `brad/shared-*` for an intentional change spanning products.
2. Run applicable README commands. Review the staged diff for unrelated files,
   secrets and generated assets. Commit and push only the task's work.
3. Open a PR into main describing behavior, affected products, validation,
   backend compatibility and intended release. A push request authorizes a task
   branch/PR; a code change alone does not authorize production rollout.
4. Require **Repository checks** on the up-to-date PR. It runs workflow policy,
   web build/tests, native types/tests and iOS/Android bundle checks, and local
   database access checks for affected paths. Unknown inputs/workflow changes
   run all checks. Skipped irrelevant jobs are expected; applicable failures,
   cancellations or missing jobs block the gate. Shared mobile API helpers used
   by the web validate both consumers.
5. Review the preview and release impact before an authorized merge. Main
   requires a PR, green checks and resolved conversations, including for admins.
   No direct/force main pushes or main deletion. Required approval count is zero
   because Brad cannot approve his own PR; PR/check requirements still apply.
   Squash a finished task with a useful title.
6. Record source/result. Retire only the finished task's branch and managed
   worktree; never include unfinished registered work in cleanup.

## Web and admin deployment

Vercel previews web/admin PRs. The committed ignore script skips app-only,
documentation-only and backup-branch changes. Shared mobile API helpers used by
web trigger builds. Missing history triggers a build rather than risk a missed
release. Installing the ignore script can itself cause the initial deployment.

Main remains Vercel's web production source. Before an authorized production
merge, compare main with the live deployment, reconcile separately published
changes and verify current Event Manager, finance and registration behavior.
After deployment, record URL/ID and commit and check the affected flow. Never
deploy a stale baseline for a tooling-only fix. Vercel must honor committed
`ignoreCommand` rather than an overriding dashboard setting.

## Phone test and store release

EAS `preview` is internal iPhone/APK testing; `simulator` is simulator testing;
`production` is an explicitly approved store release. Git pushes/merges never
submit an app or publish a production OTA update.

From clean, pushed source with dependencies installed:

```sh
npm run app:preview -- --platform ios
```

The helper validates the app, exports `HEAD:mobile` into a unique local release
folder, inspects the actual EAS archive and records source SHA-256 hashes. It
rejects dirty/unpushed source and unexpected archive files. It uses the registry's
tested EAS CLI version and existing Expo login. Add `--build` when an internal
build is requested: it always uses internal `preview` and frozen credentials,
with no store profile or submission option. The ignored receipt records returned
build details. Keep checking until the build finishes; queued is not ready.
Verify installer integrity, signing, versions, registered phones and key changed
features before delivering the installation link.

Brad tests on his phone, requests fixes, then explicitly approves a specific store
release. Identify tested source/version/build before preparing or submitting it.
Push/build approval is not store approval. Receipts belong under ignored
`mobile/release/`; never commit credentials, provisioning profiles or installers.
Upgrade the pinned CLI through a tested PR.

## Database and recovery

Both migration directories share the hosted database. Follow root migration
instructions and `docs/data-api-grants.md`. CI uses disposable local Postgres;
it never resets or migrates a hosted project. Apply compatible hosted changes
separately when authorized. Do not replay/rename old migrations to consolidate
folders during branch cleanup.

For a production regression, identify deployed source/build and a compatible
rollback revision. A web revert is a checked PR. Installed apps keep using the
backend, so schema rollback needs separate compatibility review. Never rewrite
main or reset a hosted database.
