# reconcile-payments

Automated safety net for the `payments` ledger. Pulls recent **successful**
Paystack transactions and writes a ledger row for any **license / membership**
charge that doesn't have one yet — the same thing the admin "backfill" button in
FinanceManager does, but automatically and on a schedule.

## Why it exists

Membership/license purchases (LicensePaymentModal) get their `payments` row from
**only one** place: the `paystack-webhook` → `finalizeWebLicensePayment`, which
fires only when it recognises the charge via `metadata.source === 'web_license_modal'`.
The browser writes no ledger row of its own (it only calls `mark_player_paid`).

That single dependency fails for real reasons — most notably **Apple Pay**, where
the charge can reach the webhook without the custom metadata, so the webhook
skips and no row is written until someone backfills by hand. This function closes
that gap.

It is **idempotent**: every row is keyed on the Paystack transaction id (the same
key the webhook and the manual backfill use via `onConflict: 'reference'`), so it
can never create a duplicate. It only touches license/membership charges; event
payments already have their own safety net (`confirm-manual-payment`).

## Detection

For each successful transaction it reconciles when:

- `metadata.source === 'web_license_modal'` (explicit), **or**
- metadata has no `source` **and** the amount is exactly **R450** (full /
  membership) or **R120** (temporary) — the Apple Pay fallback.

It never reconciles a charge whose `metadata.source === 'manual_event'`.

## Auth — nothing to configure

The handler accepts only the project's own **service-role or anon key** as the
Bearer token. The Supabase dashboard cron attaches this automatically, so there
is **no secret to create and no header to add**. It reuses the existing
`PAYSTACK_SECRET_KEY`, `PAYSTACK_SECRET_KEY_TEST`, `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_ANON_KEY` secrets — no new config.

## Deploy

```bash
supabase functions deploy reconcile-payments
```

## Schedule (Supabase dashboard — recommended)

First enable the **`pg_net`** extension (Database → Extensions). `pg_cron` is
already on if you can open the cron UI.

Then **Database → Cron → Create a new cron job**:

| Field    | Value                                                  |
|----------|--------------------------------------------------------|
| Name     | `reconcile-payments`                                   |
| Schedule | `*/15 * * * *` (every 15 min)                          |
| Type     | **Supabase Edge Function** → `reconcile-payments`, POST |

Leave the headers as the dashboard pre-fills them (it includes the service-role
key automatically). Click **Create cron job**. Done.

## Run manually / test

From the browser app (already authenticated) or any client with the service-role
key:

```bash
curl -s -X POST 'https://<PROJECT_REF>.functions.supabase.co/reconcile-payments?hours=72&dryRun=true' \
  -H 'Authorization: Bearer <SERVICE_ROLE_KEY>' | jq   # dry run: reports, writes nothing
```

### Query params

| param    | default | meaning                                            |
|----------|---------|----------------------------------------------------|
| `hours`  | `48`    | how far back to scan                               |
| `mode`   | `both`  | `live`, `test`, or `both`                          |
| `dryRun` | `false` | report missing rows without writing                |
