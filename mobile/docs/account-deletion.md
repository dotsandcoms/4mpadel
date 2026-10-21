# Direct account deletion

Route: Account & settings → Delete account. No support email is required.

The Edge Function `delete-account` validates the current access token through Auth.getUser. Its request accepts only `confirmation: "DELETE"` and, for linked Apple accounts, a fresh Apple authorization code. Clients cannot supply another user ID/email as the deletion target. Both database preparation/completion functions have service-role-only EXECUTE grants and fixed search paths.

Deletion removes Auth sessions/identity/refresh tokens, player profiles and gallery fields, owned profile/coach photos via Storage API, drafts, devices/push tokens/outbox, account schedules/follows/preferences/memberships and transient profile feed caches. It anonymizes retained tournament entries/draws and payment metadata, preserves amounts/references and other players' records, and detaches former staff authors. Restrictive RLS policies verify that an authenticated user's Auth account still exists, including after an email is reused. This does not remedy the separately documented existing privileged RPC/permission findings.

Photo removal precedes the database transaction. A Storage error leaves the account available for retry; already removed photos cannot be restored. The transaction refuses to delete the account while its planned owned photos remain. Registration-trigger audit snapshots are scrubbed after anonymization.

After server confirmation, the client clears the encrypted profile draft, local session, Google session and image caches, and publishes a cleared companion account to the paired Watch/widgets. An offline Watch receives the latest cleared application context when reconnecting.

Apple revocation uses Apple's HTTPS token exchange/revocation APIs, validates the returned Apple subject/issuer/audience against the verified linked identity, and keeps all Apple credentials exclusively in server secrets. The client secret is generated as a short-lived ES256 JWT from APPLE_PRIVATE_KEY / APPLE_TEAM_ID / APPLE_KEY_ID / APPLE_CLIENT_ID. An externally managed APPLE_CLIENT_SECRET is also supported. Missing configuration or unsuccessful revocation stops deletion before any photos/profile are removed.

Validation: 334 app tests, Deno server check, native Release simulator build; rollback-only SQL fixtures for account deletion, partner/receipt preservation, owned-photo guard, audit snapshot anonymization, stale-JWT RLS denial and restricted RPC access; live end-to-end endpoint test using a uniquely named disposable fixture for Auth/profile/Storage removal and rejected re-login. Mark's account was not deleted. The existing 4M Padel Apple key is configured in server-only secrets; all secret digests matched the intended values. Apple's token endpoint accepted the generated client credential and rejected only an intentionally invalid authorization code. Live Apple authorization exchange/revocation still needs a real Apple-sign-in device test before public release.

The advisor's intentional SECURITY DEFINER notice for account_is_active is reviewed: this helper reads only whether the caller's own auth.uid exists and returns a boolean. It has a fixed search path, no caller-supplied target and no anonymous EXECUTE grant. Authenticated EXECUTE is required for the restrictive RLS policies.

For server-only live integration testing, `node scripts/test-account-deletion-e2e.cjs /path/to/server.env` requires a service-role key. Never include server credentials in the app or public web environment. The script creates/removes only its own unique test account.
