# Private draw rehearsal

Gregg (`greggogoski@gmail.com`) and super admins can start a rehearsal from Event Manager. Gregg receives a dedicated event list and rehearsal entry point; this does not add an `admin_sidebar_permissions` row. The legacy `is_4m_admin()` helper treats any row in that table as live draw-management access.

## Workflow

1. Sign in with the existing account and open `/admin?tab=event-mgmt` (also linked from Gregg’s account menu).
2. Choose **Start private rehearsal** beside a native event.
3. Review entrants, configure and generate draws, schedule, publish privately, and record results or simulated points.
4. **Leave rehearsal** preserves the copy for the same account, event and browser. **Start fresh copy** discards that rehearsal and reads the latest entrants and settings. Copies are not shared across devices or testers and cannot be promoted into live records.

The copy starts without existing live draws/results, keeping the event’s entrants, pairings, stored player rankings/licence indicators, divisions, play days and ranking points configuration. Payment details, recipient tokens and login credentials are excluded. Real licence/payment exceptions still need review. Legacy live RankedIn refresh and public links are disabled; the normal bracket preview remains available.

## Isolation

The parent calls three authenticated, read-only RPCs. Each checks the active, confirmed account against Gregg or a super-admin identity. `private_draw_rehearsal_snapshot` projects only the selected event’s draw inputs. Nothing creates an event registration, draw, match, award, notification job or audit row in the hosted database.

The standard `NativeDrawManager` runs inside an opaque-origin iframe (`allow-scripts allow-downloads`, without `allow-same-origin`, forms, popups or top navigation). Its separately built bundle replaces every Supabase import with a finite local adapter, replaces the RankedIn hook, and refuses to build if any hosted Supabase module/reference is present. Its CSP sets `connect-src 'none'` and excludes external scripts, images and fonts. The iframe cannot read parent authentication storage. Publication, announcements, matches, scores and point awards only change the adapter’s state.

Parent/iframe messaging accepts messages from the expected Window only. The parent persists snapshots under account/event-specific local-storage keys; no message handler performs hosted mutations. Storage failures are shown to the operator. Opening a saved copy rechecks server access before supplying it to the iframe.

Admin impersonation uses the same effective email for both `useAdminPermissions` and the Event Manager controls. The signed-in account still authorises every snapshot RPC and owns the browser-local copy; impersonation does not change database identity or grant access. Regression coverage mounts the actual Admin → Event Management entry chain for an admin impersonating Gregg, Gregg signing in directly, and an unrelated account. The impersonation case reproduced the previously inert button before this identity-wiring correction.

This exercises the real generator and scheduling UI with local persistence. It is not a test of hosted mutation/RLS enforcement or notification delivery. The adapter reuses score validation and standings, and simulates progression/Americano persistence. Keep backend integration tests for live transaction and concurrency guarantees.

## Build and checks

`npm run dev` and `npm run build` generate the isolated HTML via `scripts/build-private-draw-rehearsal.mjs`. Generated `public/private-draw-rehearsal/` is ignored by Git and rebuilt on deployment. The explicit Vercel rewrite serves this HTML rather than the SPA route.

```sh
node --test tests/privateDrawRehearsal.test.mjs
node --test tests/privateRehearsalImpersonation.test.mjs
node scripts/test-private-draw-rehearsal-browser.mjs
psql -X -h /private/tmp -p 55443 -d postgres -q -f tests/privateDrawRehearsal.sql
npm run test:data-api
npm run test:data-api:db
npm run build
```

The SQL fixture only runs on disposable local port 55443 and rolls back all test objects. The browser test uses synthetic data and a mocked read-only parent client; it checks generation, scheduling/publication, save/reopen, mobile layout, parent/storage isolation and blocked networking. Safari also verified entrant confirmation, generation and draw saving.

## Hosted installation

Migration `20261106115035_private_draw_rehearsal.sql` is installed in `uzglrpbixubfijvjbtgz`. The local filename matches the version assigned by the migration tool. Do not replay it. Gregg’s authenticated access was verified against event 523: 5 divisions, 155 registration rows, 115 linked profiles at verification time. Rehearsal access is true, live draw access remains false, and no legacy admin row was created. Anonymous RPC execution is denied.

The website was published on 6 November 2026 with explicit user approval. Current deployment: `dpl_2k62qGSPGUyMzi8CB4h9rc8QyuXY` (`4mpadel-qck7nncsh-brad-elins-projects.vercel.app`), promoted to `4mpadel.co.za`. This includes the impersonation identity correction; all three access regression cases and five local persistence/isolation tests pass. The release package contains the website only; concurrent mobile and Supabase Edge Function changes were excluded. Production HTML/asset routing and the isolated page’s network-denying CSP were verified. The direct button above the finance list opens the lightweight rehearsal event picker.

Validation: 81 targeted unit tests, the synthetic full browser workflow, local SQL authorisation/redaction checks, the 66-table/4-sequence Data API database audit and production build passed. New and modified draw/rehearsal modules pass targeted lint. Legacy Navbar/Event Finance/Manual Event Manager/Admin lint diagnostics remain outside this change. The existing `eventManagerWorkflow` browser test times out at its initial export-button wait on both the changed code and the unchanged HEAD version; the rehearsal browser test passes independently. Existing CSS gradient and bundle-size build warnings remain.

The pre-feature production deployment was `dpl_9zjZ7zcyBKXLLYnjyAo4tS5G5Vuh`; it can be promoted to roll back the website without touching live tournament data. The additive rehearsal RPCs can remain installed during a website rollback.

To disable the pilot, revoke execution on the three rehearsal RPCs; to remove it, revert the frontend entry points and drop those functions. Existing live tournament data needs no rollback because the feature writes none.
