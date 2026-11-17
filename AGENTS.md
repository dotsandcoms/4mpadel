# Development workflow

Read `docs/development-workflow.md` before starting a task, changing branches,
publishing a build or merging a PR. These are standing instructions; Brad does
not need to repeat them in each chat.

- Inspect status, branches, open PRs and worktrees first. Preserve other chats'
  changes. Never reset, stash, clean, switch or commit someone else's unfinished
  working folder to make this task easier.
- Start independent work from current `origin/main` in a suitable clean task
  worktree: `brad/app-*`, `brad/web-*`, `brad/admin-*`, `brad/backend-*`,
  `brad/shared-*` or `brad/workflow-*`. Use managed worktree tools in Codex when
  creating a new folder. One independent task/chat uses one worktree.
- Read `.github/workstreams.json` before cleanup. Preserve BOTH unfinished admin
  previews and their working folders. Review and move completed pieces onto
  current main through a focused PR; never merge a stale working folder wholesale.
- Keep native screens in `mobile/` and web/admin screens in `src/`. Backend
  changes must support installed app versions. The web imports protected API
  helpers from mobile; validate both consumers when those helpers change.
- Run `npm run workflow:install` if the shared Git guards are not installed.
  Commit only reviewed task files. Push a task branch and use a checked PR into
  main. Never bypass hooks/checks, force-push main, or retire unfinished branches.
- Implementing code authorizes local changes and verification. A request to push
  code authorizes the task branch/PR; a production release/merge still needs release
  authorization. Require the green `Repository checks` gate before merging.
- Record source commit, validation and deployment/build URL for a release. Phone
  testing uses internal `preview`. Use root `npm run app:preview -- --platform
  ios --build` from clean, pushed source when an internal build is requested.
  Follow it to completion and verify the installer before reporting it ready.
- Store submission, production app builds/OTA updates, hosted migrations and web
  production releases need authorization for that release. Brad must approve his
  current phone test before Apple submission. Ordinary CI must never submit apps.
- Finish with behavior changed, validation, branch/PR and what was released.
  Keep credentials out of source and logs.

# Database migrations

New or recreated public tables must declare API access in the migration that
creates them. Do not depend on Supabase's former automatic grants.

- Enable RLS and define policies for intended row access.
- Explicitly GRANT only the operations needed by `anon`, `authenticated` and
  `service_role`; explicitly REVOKE client access for RPC-only/worker tables.
- Keep private schemas private and preserve intentional column-level grants.
- Grant sequence USAGE to roles that need it; service-role RLS bypass does not
  replace table or sequence grants.
- Add the table's reviewed access contract to `tests/fixtures/data-api-access.mjs`
  and run `npm run test:data-api`. Use `npm run test:data-api:db` for database
  verification against the empty local `fourm_data_api_grant_test` database.
- Audit both `supabase/migrations` and `mobile/supabase/migrations`: they share
  the hosted database. Do not replay old migrations or reset a hosted project
  to apply historical grant corrections.

See `docs/data-api-grants.md` for the audit scope and verification limits.

# Production website releases

`main` is Vercel's automatic production source. Every push to `main`, including
scripts or workflow fixes, can replace the entire live website.

- Before pushing to `main`, compare its website source with the currently live
  deployment. Reconcile any separately released changes first; never deploy an
  older website baseline to publish a scripts-only fix.
- Publish website changes from a committed source revision on `main`. If an
  emergency deployment uses another source, reconcile it into `main` before
  the next production push.
- Verify the deployed Event Manager retains the Bronze switch, event messages,
  Help requests and private rehearsal controls, alongside existing finance and
  registration behavior. Record the deployment ID and source commit.
