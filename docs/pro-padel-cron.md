# Pro Padel daily refresh

Configured in Supabase project `uzglrpbixubfijvjbtgz` on 17 September 2026.
The website remains a separate deployment. These refresh jobs already run without Vercel.

| Job | UTC | South Africa |
| --- | --- | --- |
| pro-padel-rankings | 05:00 daily | 07:00 daily |
| pro-padel-tour | 05:10 daily | 07:10 daily |
| pro-padel-fixtures | 05:20 daily | 07:20 daily |

`public.refresh_pro_padel(scope)` reads the endpoint and authorization secret from
Vault, then invokes the `pro-padel-sync` Edge Function through pg_net. Only the
database owner can call the wrapper; website users cannot trigger provider usage.
The function authenticates requests using `PRO_PADEL_CRON_SECRET` and accepts only
the three scopes above. JWT verification is disabled because this endpoint uses
its own server-only bearer credential. Provider and storage credentials never
appear in the public snapshot or response.

The provider token is an Edge secret named `PADEL_API_TOKEN`. Vault names are
`pro_padel_cron_secret` and `pro_padel_refresh_url`. Rotating the cron credential
requires updating both Vault and the matching Edge secret. Do not commit values.

Shared provider normalization and publishing code lives in
`supabase/functions/_shared/pro-padel.mjs`; `server/pro-padel.mjs` re-exports it
for local tools and the optional manual Vercel endpoint. There are no Vercel cron
entries, preventing duplicate refreshes when the site is deployed.

## Maintenance

Deploy updates with:
```sh
supabase functions deploy pro-padel-sync --use-api --project-ref uzglrpbixubfijvjbtgz
```

The isolated migration is `20260917160000_pro_padel_cron.sql`. It is already
applied and recorded in migration history. Do not push unrelated pending migrations
as part of maintaining these jobs. Reapplying this migration updates the named jobs.

## Verify or run manually

From the Supabase SQL editor as the database owner:
```sql
select jobname, schedule, active from cron.job where jobname like 'pro-padel-%';
select public.refresh_pro_padel('rankings'); -- returns a pg_net request ID
-- Wait for completion, then substitute the returned ID:
select id, status_code, timed_out, error_msg, content
from net._http_response where id = 123;
```

Run scopes sequentially, allowing completion and at least 6.5 seconds before
starting the next, to respect provider pacing. A 200 response confirms publication.
A successful cron SQL run alone means the HTTP request was queued, not that the
refresh succeeded: check pg_net responses (retained temporarily) and cache
`updatedAt` timestamps. Daily data is not a live score service.

Snapshots remain in the public `pro-padel` storage bucket as `rankings-v1.json`,
`tour-v1.json`, and `fixtures-v1.json`. Failed builds preserve the previous file.
The website displays a stale warning after 48 hours. Provider usage is bounded to
at most 12 requests per daily cycle; manual tests use extra requests.

Pause a job without deleting it:
```sql
select cron.alter_job(jobid, active := false)
from cron.job where jobname = 'pro-padel-fixtures';
```

Supabase reference: https://supabase.com/docs/guides/functions/schedule-functions
