# Player push notifications

The mobile app uses native iOS/Android notification permissions and React Native switches. Open **Menu → Notification settings** or **Notifications → Settings**. Preferences are saved per player; OS permission remains per device. The inbox shows the latest 50 updates even if push is disabled. Refresh it by pulling down.

## Implemented events

Database changes enqueue notifications for profile creation, new/reactivated entries, entry by a partner (including single-row organiser teams), partner links/removal, withdrawals for both players, payment confirmation, refunds, division changes, event/division cancellation and published draws. Repeated saves of the same state do not enqueue another event. Reciprocal registration inserts notify each player once about their entry.

Calendar cancellation is recorded after the existing refund flow withdraws entries. Its audience therefore includes all players who entered the event, including withdrawn entries, so cancellation cannot silently miss them. Withdrawal and refund confirmations may precede the cancellation update. This does not change the existing refund workflow.

Tournament notifications now include:

| Stage or change | Audience and timing |
| --- | --- |
| Registration opens | Existing tournament followers when entries open |
| Early bird / entries closing | Followers who have not entered, 24 hours before the deadline |
| Payment outstanding | The unpaid registration holder, 24 hours before the applicable deadline |
| Registration closed | Active teams with a paid/comped entry |
| Draw published | Players in that division, linking directly to its draw |
| Published schedule / schedule changed | Actual assigned players; changes show the previous and new time/court |
| Match reminder | Both partners, 15, 30 or 60 minutes before their published match |
| Tomorrow’s first match | Players with a published match tomorrow, at 18:00 SAST |
| Progression / opponent confirmed | Actual assigned teams; possible feeder players are excluded |
| Match live | Assigned players when the match is marked in progress |
| Result confirmed / corrected | Both teams, including a score correction that does not change the winner |
| Tournament finished | Division participants after authoritative finalisation |
| Rankings | Affected player when points are awarded/corrected or published rankings change |
| Dates, venue or deadline changed | Entrants and followers |
| Event cancelled | Entrants and followers |

Following is separate from participation. Adding an event to My Schedule automatically follows it; users can subsequently unfollow without removing it from their schedule. Removing a saved event turns off general tournament following, while active-entry alerts remain eligible. Entered players and their partners receive personal updates automatically. Following does not subscribe spectators to someone else’s match reminders. The native event screen exposes follow/unfollow, published match details, scores and the signed-in player’s awarded points. Notification links preserve event, division, match and Draws/Results context.

Settings include category switches, followed-event updates, reminder lead time, and quiet hours with a saved timezone. Quiet hours apply to all push types. Time-sensitive notifications that would arrive after their deadline are skipped; the inbox retains the relevant event history. Defaults are 30-minute match reminders and quiet hours disabled (22:00–07:00 when enabled).

Stage dates are expectations, not evidence that a draw, match or tournament has completed. Match and results notifications use native Tournament Manager records and published schedule snapshots. Private schedule edits never notify players. RankedIn/external events do not yet supply authoritative match/result webhooks to this worker; they retain the existing external draw link. Partner invitations and club announcements remain reserved catalog types pending producers in those features.

## Production setup

1. Apply the shared backend migrations first, including `../supabase/migrations/20260814_player_push_notifications.sql`, the current event cancellation/draw schema, Tournament Manager, schedule, operations, finalisation and ranking-points tables. Apply `mobile/supabase/migrations/20260925100000_push_delivery.sql`, followed by `mobile/supabase/migrations/20260925120000_tournament_notifications.sql` to that **same database**, through your normal reviewed migration deployment. The mobile Supabase directory is not a complete database migration history: do not run a blanket `db push` from it against the shared project.
2. Link the app to its real EAS project. Set `EXPO_PUBLIC_EAS_PROJECT_ID` in build environments, or configure `expo.extra.eas.projectId`. No project ID is invented or committed here. Provision APNs credentials and Android FCM v1 credentials for `com.fourmpadel.app`; provide the Android `google-services.json` build configuration and Apple team ID as required by your existing native build setup. Rebuild the native app.
3. From `mobile`, deploy `supabase functions deploy deliver-push --project-ref YOUR_PROJECT_REF`. The function deliberately disables gateway JWT validation and instead requires its dedicated, random `PUSH_WORKER_SECRET` bearer secret. Provision that secret via Supabase secrets. It must never be an `EXPO_PUBLIC_*` variable. If Expo push access security is enabled, also set the server-only `EXPO_ACCESS_TOKEN`.
4. Provision Vault secrets `push_worker_url` (the deployed `/functions/v1/deliver-push` URL) and `push_worker_secret` (the same worker secret). Apply `supabase/setup/schedule-push.sql`. The job runs every minute; its request includes no recipients or notification content. The worker first reconciles tournament stages and reminders, then claims 20 device deliveries per run with at most five concurrent Expo calls.
5. On two physical devices, sign in as different players and enable push. Enter one player with the other as partner; verify both pushes and native tap destinations with the app foregrounded, backgrounded and closed. Test partner withdrawal, payment, cancellation, opt-out before dispatch, OS permission denial and sign-out. Check Expo receipts before treating delivery as verified.

## Scheduling and stale-message protection

The scheduler runs every minute. Immediate match/event changes have a 60-second settling period to combine rapid edits. Scheduled jobs have a stable recipient/topic key and a source revision. Rescheduling, withdrawal, payment, unfollowing, cancellation or a newer score invalidates outdated queued messages. Source state, audience, preferences and quiet hours are checked again immediately before sending. Public events with participants/followers are reconciled through seven days after their end date; result/finalisation and ranking triggers also create jobs directly.

Reminders expire at their applicable deadline or match start. Other unsent updates expire within 24 hours. Follow settings and match details are authenticated RPCs; recipient email resolution, queue management and scheduling are service-only. Match cards refresh every 30 seconds while the app is active and display up to 200 published matches.

## Delivery and diagnostics

`push_outbox` records events; `push_deliveries` records each device, retry lease and Expo ticket/receipt. Both are protected from direct client access. Worker RPCs are service-role only. Device ownership and preferences are checked again immediately before sending. An Expo ticket marks `accepted`; only a successful provider receipt marks `sent`. Receipt success means APNs/FCM accepted it, not that the player read it.

The worker retries transient failures with backoff, checks receipts after 15 minutes, expires unsent events after 24 hours, and deletes tokens reported as `DeviceNotRegistered`. A process/network failure after Expo accepted a message but before the ticket was persisted can still duplicate delivery: the external push API does not provide exactly-once delivery. Authenticated settings cannot override OS permissions.

Inspect pending/failed `push_deliveries`, its `error`, `available_at`, `attempts` and `ticket_id`, plus `cron.job_run_details` and pg_net HTTP results. Do not log tokens, player emails or secrets. A growing queue requires a higher dispatch frequency or larger tested batch. Disable scheduling with `SELECT cron.unschedule('player-push-delivery');`.

## Verification

- `npm run check` includes delivery-policy, safe-routing and event-catalog tests.
- `deno check supabase/functions/deliver-push/index.ts` checks the Edge Function.
- In an empty disposable PostgreSQL database only: apply `tests/push-fixture.sql`, the shared push foundation migration, the delivery migration, then `tests/push-transitions.sql`. For tournament coverage, start with a fresh database, apply `tests/push-fixture.sql`, `tests/tournament-push-fixture.sql`, the shared push foundation, both mobile migrations, then `tests/tournament-notifications.sql`. Tests roll back their data and cover recipients, duplicates, preferences, leases, token ownership, inbox isolation, stale schedules, results corrections, progression, cancellations and timezone/DST quiet hours. The fixture is intentionally minimal and is not a production schema migration.
- Native JS exports: `npx expo export --platform ios --platform android --output-dir /tmp/4m-push-export`.

References: [Expo SDK 57 Notifications](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/) and [Expo delivery and receipts](https://docs.expo.dev/push-notifications/sending-notifications/).

## September 28 follow and schedule changes

Applied migrations `20260928140000_followed_registration_closed.sql` and `20260928141000_schedule_auto_follow.sql` to the linked backend. Registration-closed alerts now include users who followed before the deadline, including withdrawn entrants who explicitly follow. Late follows do not replay missed milestones. Follow and participant recipients share a deadline key to avoid duplicates. Delivery checks reject unfollows, late re-follows and obsolete deadlines.

New schedule saves atomically activate following through a database trigger. Existing schedules are not backfilled, and a later explicit opt-out is respected. The native event banner slides down over the content, stays until dismissed, and can be swiped up or hidden with its accessible button. Its collapsed state is saved per account/event on the device; the bell control reopens it. Hiding the banner does not disable updates. OS permission and category preferences still apply.

`tests/followed-event-milestones.sql` covers these transitions in a disposable database alongside the tournament and dynamic-copy suites. Delivery is enabled for all eligible registered devices; player preferences and message freshness still apply.

Applied `20260928150000_schedule_removal_unfollow.sql`: deleting a schedule row disables the event follow atomically. Adding again enables it again. Active registrations are untouched. The collapsed banner now occupies its own row below the app header, keeping hero image controls unobstructed.
