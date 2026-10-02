# App welcome email

After `create_player_profile` succeeds, the app persists a per-account pending marker and calls `native-welcome-email`. Email failures do not fail profile creation. Pending sends retry once per minute while the app is active, on foreground, and after sign-in/relaunch. There is no bulk backfill or independent scheduled worker; app retry markers are device-local.

The function authenticates a verified account, checks its existing player profile, and derives the recipient/name from server data. Client-provided recipient/template values are ignored. The service-only `native_welcome_emails` table stores a unique record per user, the immutable email payload, provider ID, state and last error. A one-minute atomic lease avoids concurrent attempts. Resend receives the same idempotency key and payload on retries. Permanent sent records suppress subsequent sends. “Sent” means accepted by the provider, not inbox delivery.

Unconfirmed sends older than 23 hours become `needs_review` rather than risking a duplicate beyond Resend's 24-hour idempotency window. Review provider delivery history before recovery. Failed attempts remain pending while the app is closed; retry resumes when reopened. Uninstalling before the backend request is first accepted can lose the device-local intent.

The email introduces registration, partner entry, payments/balances, local and international player follows, rankings, local events and tours. It uses the existing RESEND_API_KEY and RESEND_VERIFIED_SENDER project secrets. A sandbox sender is rejected instead of redirecting private welcomes elsewhere.

Deployment: targeted migration `20260929110000_native_welcome_email.sql`, then `supabase functions deploy native-welcome-email --project-ref uzglrpbixubfijvjbtgz --no-verify-jwt`. Authentication is checked inside the function. Do not apply the mobile directory's partial migration history as a blanket database push.

Validation: `npm run check`, `deno check supabase/functions/native-welcome-email/index.ts`, deployed unauthorized-call smoke test, and live table RLS/grant inspection. Tests mock the provider; no test welcome is sent to a real recipient.

Rollback: remove the app's queue hook or disable the function; retain delivery records to preserve duplicate protection. Failed attempts remain non-blocking. Existing website email templates are unchanged.
