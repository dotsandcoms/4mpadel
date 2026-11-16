# Authenticator setup, backups and recovery

Open [Admin → Security](https://4mpadel.co.za/admin?tab=security) while signed in with the account whose authenticator you want to manage. Each login email has its own connections. The same connection protects banking, event messages and help requests.

## First setup and backups

An account with no verified authenticator can name its device, select **Set up authenticator**, scan the QR in an authenticator app, and verify the app’s current six-digit code. A manual setup key is available for same-phone setup. Codes and setup secrets are never saved in application storage or logged by this flow; Supabase Auth manages the enrollment.

A connected account selects **Add backup authenticator**, verifies an existing connection, names the backup, and scans a new QR on a separate device or in a secure password manager. Verify the backup’s code before relying on it. Multiple connected authenticators are selectable during verification, including banking actions.

**Remove** requires verification followed by an explicit review. Removing the last connection returns this account to first-time setup. Refreshing a screen or switching to the authenticator app preserves a pending enrollment in memory; the QR is hidden while the page is in the background. Signing out or changing accounts clears it. Abandoned setup keys cannot be reconstructed from a later login.

There is no shared master code and no downloadable recovery-code feature. Rotating six-digit codes expire and cannot be kept as recovery codes.

## Assisted recovery

A Super Admin with a working authenticator can use **Help another administrator recover access**:

1. Verify a fresh code from their own authenticator.
2. Find the affected administrator or event organiser by their exact login email.
3. Select the lost connections, verify the person’s identity directly outside the request, and record how that identity was checked.
4. Review the email, selected connections and sign-out consequence, then confirm the reset.
5. The affected person signs in again and enrolls a new authenticator before accessing protected messages, help or banking.

Supabase’s Admin MFA deletion API signs the affected user out of their active sessions when deleting a verified connection. The reset preserves their permissions and does not return an old QR or secret. An administrator cannot use this assisted route to reset their own account; they use their own Security controls or ask another verified Super Admin.

If every Super Admin loses all factors, the project owner must verify identities and recover the affected account through Supabase Auth administration. A normal login or password reset alone cannot authorise the recovery endpoint.

## Server and access contract

Migration `supabase/migrations/20261116072343_authenticator_backup_and_recovery.sql` adds an RPC-only audit table. RLS is enabled and direct table grants are revoked from public, anonymous, authenticated and service roles. UUID IDs need no sequence. The reviewed contract is in `tests/fixtures/data-api-access.mjs`.

`authenticator_recovery_action` validates the current confirmed, non-anonymous, non-banned user, matching email and live session, actual database Super Admin role, a verified TOTP attached to that session, and a TOTP challenge within five minutes. Recovery targets must be existing confirmed staff accounts. The routine excludes self-recovery, binds each request to the exact target/factor snapshot and identity-check reason, limits requests to ten per actor per hour, and serialises concurrent approvals. Client role metadata never grants access.

The `admin-authenticator-recovery` Edge Function verifies the caller through Auth and invokes the checked routine as that caller. Only after approval does it construct a service client and delete the exact approved factors through the Auth Admin API. `finish_authenticator_recovery` is service-only, checks that completion IDs match the approval, and records full or partial success. No browser receives a service credential. The gateway JWT check is disabled because the handler performs Auth verification itself; SQL independently validates session and fresh MFA.

Retries reuse the same request UUID. An existing processing or completed request never repeats deletion. A failed request records exactly which factors were removed; look up the account again before a new attempt. If deletion succeeds but completion logging fails, the UI explicitly requires review. A project operator must compare the request’s exact factor IDs with current Auth metadata before reconciling a stuck audit row; do not reset newly enrolled factors to resolve an old request. Audit records deliberately survive account deletion and contain no message transcript or authenticator secret.

## Verification and rollout

- Browser/component checks: `node --test tests/accountSecurity.test.mjs tests/messagingAuthenticator.test.mjs tests/messagingAccountSwitch.test.mjs`.
- Endpoint boundary checks: `node --test tests/authenticatorRecoveryHandler.test.mjs`.
- Isolated PostgreSQL and empty-database grant verification: `node scripts/test-authenticator-recovery-db.mjs`.
- Migration inventory: `npm run test:data-api`.
- Edge Function type check: `deno check --no-lock supabase/functions/admin-authenticator-recovery/index.ts`.

The hosted migration and Edge Function version 1 are deployed. Live read-only checks confirm RLS, denied direct table access, caller/worker RPC separation, and rejection of anonymous endpoint calls. The earlier Brad and Mark resets were explicitly requested by the account owner in this chat and performed through the Auth Admin API; no other real account was reset during automated QA.

The web release is prepared from production deployment `dpl_7bHkXmp8CryF3TH7GeF2F85o5jai` and its exact Git commit, with nine security files changed or added and one required deployment packaging correction. Unrelated finance workspace changes are excluded. Release receipts are in `outputs/authenticator-security-release-20261116`. Roll back the web deployment if sign-in or normal message access regresses; the additive audit table and restricted endpoint can remain. If assisted recovery misbehaves, remove its UI entry or disable the Edge Function while retaining audit history.

## Live release — 16 November 2026

Security is live at https://4mpadel.co.za/admin?tab=security on deployment `dpl_4PzyZGZRM6en5Y13oKuh75dAQX9V`. The candidate was built with production settings and checked before promotion. Five live routes return the verified application entry, and the live Security module matches the reviewed candidate hash. Invalid Auth tokens are rejected with HTTP 401.

The CLI packaging inventory explicitly includes only the reviewed web sources, the five private rehearsal build sources and the two shared Data API modules. Its deployment-only ignore file avoids the CLI’s nested-directory exclusion issue. The repository’s original `.vercelignore` is preserved. No unfinished finance edits were shipped. A temporary Vercel project accidentally created during a failed packaging attempt was removed after its exact ID/name/creation time were checked; the 4M project was unaffected.

For rollback, promote deployment `dpl_7bHkXmp8CryF3TH7GeF2F85o5jai`. Reconcile the production source receipts before a later main-branch deployment so the published Security module is preserved. Physical authenticator setup and peer-assisted recovery should be exercised by the account owners; automated flows used fictional accounts.

## Event selection fix — 16 November 2026

Deployment `dpl_6KvkL9mjftW3FGvC6oYGjmUtKzpp` fixed the indefinite authenticator check after selecting an event. Event selection now clears only event data and retains verified account state; factor checks have a separate request counter. Failed checks show an error and Refresh retries. Five lifecycle tests and an actual picker/composer flow with a fictional backend passed. Live module hashes were verified; receipts are in `outputs/event-messaging-auth-hotfix-20261116`. The later player-message queue release preserves this fix.
