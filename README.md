# 4M Padel

One repository for website/admin (`src/`), the Expo native app (`mobile/`) and
shared backend (`supabase/` and `mobile/supabase/`). Read the
[development workflow](docs/development-workflow.md) and [agent rules](AGENTS.md).

Use Node 24 (at least 24.12) and committed lockfiles. Install `npm ci` in the root
and `npm ci --prefix mobile` for native work. Root installation installs shared
Git guards. Keep real environment values local.

| Task | Command from repository root |
| --- | --- |
| Web/admin development | `npm run dev` |
| Native development | `npm --prefix mobile start` |
| Web/admin build and tests | `npm run check:web` |
| Native types and tests | `npm --prefix mobile run check` |
| Workflow tests | `npm run test:workflow` |
| Data API access contracts | `npm run test:data-api` |
| Restore shared Git guards | `npm run workflow:install` |
| Prepare committed iPhone source | `npm run app:preview -- --platform ios` |
| Start an approved internal iPhone build | `npm run app:preview -- --platform ios --build` |

`main` is the checked integration branch and Vercel web production source. Use
task branches and separate working folders. Both migration folders share one
hosted database: follow [the access contract](docs/data-api-grants.md).
