# Deploy player and tournament notifications

These steps document deployment to the existing Supabase project shared by the app and website. Starting the worker can send pending notifications from the last 24 hours to registered devices.

## 1. Check the shared database

Open that project in Supabase Dashboard → SQL Editor. Run `mobile/supabase/setup/check-push-prerequisites.sql`. Shared tables and columns must all show `true`. The three installation markers may show `false` before installation.

If a shared table/column is missing, finish the existing shared backend migrations first, in their established order. Relevant files include:

- `supabase/migrations/20260819_native_draw_data_model.sql`
- `supabase/migrations/20260819_native_ranking_foundation.sql`
- `supabase/migrations/20260824_event_cancellation.sql`
- `supabase/migrations/20260910140000_americano_draws.sql`
- `supabase/migrations/20260914160000_division_cancellation.sql`
- Tournament compatibility/manager/schedule/operations/preparation migrations through `20260916140000_tournament_activity_actors.sql`.

These have their own earlier dependencies; this list is not a replacement for the full shared migration history. Do not apply test fixtures to this database.

## 2. Run the notification SQL in order

Open each file, copy the entire contents into a new SQL Editor query, and run it. Stop if any query fails.

1. `supabase/migrations/20260814_player_push_notifications.sql` from the repository root — only if the shared push foundation has not already been applied.
2. `mobile/supabase/migrations/20260925100000_push_delivery.sql`.
3. `mobile/supabase/migrations/20260925120000_tournament_notifications.sql`.
4. `mobile/supabase/migrations/20260928100000_scoped_push_testing.sql`.
5. `mobile/supabase/migrations/20260928110000_free_entry_push_copy.sql`.
6. `mobile/supabase/migrations/20260928120000_dynamic_event_update_copy.sql`.

The mobile migrations are each transactional and are intended to run once. Do not rerun successful migrations. Keep a record of manual application in your normal migration workflow; SQL Editor execution does not automatically reconcile Supabase CLI migration history. Do not run blanket `supabase db push` from `mobile`: its migration folder does not contain the shared schema history.

At this point authenticated players with profiles can load/save native notification settings. No scheduled worker runs yet.

## 3. Configure and deploy the worker

Generate a random secret in your own terminal:

```sh
openssl rand -hex 32
```

Save it securely. In Supabase Dashboard → Edge Functions → Secrets, create `PUSH_WORKER_SECRET` with that value. Do not put it in app configuration or an `EXPO_PUBLIC_*` variable. If Expo push access security is enabled on your EAS project, also add server-only `EXPO_ACCESS_TOKEN`.

From your terminal:

```sh
cd /Users/bradein/Sites/4m-Padel/mobile
npx supabase login
npx supabase functions deploy deliver-push --project-ref YOUR_PROJECT_REF
```

Replace `YOUR_PROJECT_REF` with the Supabase project reference from project settings. The function source is `supabase/functions/deliver-push/index.ts`; deploy the function folder including `policy.ts`. The checked-in `supabase/config.toml` sets `verify_jwt = false` for this worker because it verifies its dedicated bearer secret itself. Do not remove that secret check.

## 4. Configure the app’s Expo project and credentials

```sh
cd /Users/bradein/Sites/4m-Padel/mobile
npx eas-cli login
npx eas-cli init
```

Choose the existing 4M Padel EAS project where available. Confirm `app.json` has the resulting `expo.extra.eas.projectId`. The app also accepts `EXPO_PUBLIC_EAS_PROJECT_ID`, but persisting the real project ID in `app.json` avoids different build environments omitting it.

The `expo-notifications` dependency and config plugin are already installed. Keep both app identifiers as `com.fourmpadel.app`.

For iOS, use your Apple Developer account and provision/verify push credentials:

```sh
npx eas-cli credentials --platform ios
```

Ensure the app identifier has Push Notifications enabled and EAS has an APNs push key. Allow EAS to create/update the provisioning profile when building.

For Android:

1. Register the Firebase Android app as `com.fourmpadel.app`.
2. Download its client `google-services.json` into the mobile project.
3. Add `"googleServicesFile": "./google-services.json"` inside `expo.android` in `app.json`, preserving the other fields.
4. Configure the Firebase FCM v1 service-account credential using `npx eas-cli credentials --platform android`. The service-account private key belongs in EAS credentials, never the mobile app bundle. It is different from the client `google-services.json`.
5. Ensure the client configuration file is available in the EAS build upload, or use EAS file environment configuration with a matching app-config path.

Official instructions: https://docs.expo.dev/push-notifications/push-notifications-setup/ and https://docs.expo.dev/push-notifications/fcm-credentials/.

## 5. Build and install the app

Keep `expo.name` as `FourM Padel`: Expo SDK 57 release builds can fail to register native modules when the generated iOS product name starts with a digit ([upstream issue](https://github.com/expo/expo/issues/47550)). The visible app name remains `4M Padel` through `ios.infoPlist.CFBundleDisplayName` and the Android display-name plugin. Changing this requires a new native build; restarting the installed app cannot fix it. Preview builds increment their build number so installations can be distinguished.

Use the existing physical-device preview profile:

```sh
npx eas-cli device:create
npx eas-cli build --platform ios --profile preview
npx eas-cli build --platform android --profile preview
```

Device registration is for iOS internal distribution. Ensure the builds use the same `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` as the database you configured. Set these in the EAS build environment if not already supplied. Keep service-role credentials out of the app.

Install the builds on your test phones, sign in with completed player profiles, then open Menu → Notification settings → Enable on this device. Allow the OS permission prompt. Enable Push notifications and the categories you are testing. Keep quiet hours off for the first test.

Expo SDK 57 supports remote push on Android emulators with Google Play services when using a development build. The app allows registration on those emulators; images without FCM support will fail token registration safely. Use physical phones as well for final delivery verification.

## 6. Add Vault secrets and start scheduling

In Supabase Dashboard → Vault, add:

| Name | Value |
| --- | --- |
| `push_worker_url` | `https://YOUR_PROJECT_REF.supabase.co/functions/v1/deliver-push` |
| `push_worker_secret` | The identical value used for `PUSH_WORKER_SECRET` |

If Vault is not enabled, enable its extension first through Database → Extensions. Do not create duplicate secret names. Use the dashboard rather than saving secret values in a committed SQL file.

Now run `mobile/supabase/setup/schedule-push.sql` in SQL Editor. It enables the required extensions, creates the restricted dispatch function and schedules one run per minute. The implementation follows Supabase’s pg_cron + pg_net + Vault pattern: https://supabase.com/docs/guides/functions/schedule-functions.

Starting this job enables real dispatch to every eligible registered device. Pending notifications from the last 24 hours may be sent; older queued items expire.

## 7. Verify delivery

The worker now claims deliveries for all registered Expo devices. It still checks token ownership, player notification preferences, quiet hours, and message freshness before sending. The old `PUSH_TEST_RECIPIENTS` Edge Function secret is no longer read by the worker and can be removed from the project secrets.

The initial account-only test scope was removed on 2 October 2026 at the user's request.

Native free/EFT/external checkout now requests the existing `event_registration` email after saving new entries. It also respects `PUSH_TEST_RECIPIENTS` during this test period. Paystack-paid entry emails remain owned by the existing payment handlers. Existing active entries are excluded from routine retry emails; delivery failures are reported separately from registration success and can be inspected in `email_queue`. This path does not implement a durable email retry worker. The free-entry push migration suppresses payment-received messages for rows whose payment method is `free`; their entry confirmation remains enabled.

Use a test tournament and two test players:

Tournament detail edits show the specific changed fields with before/after values (dates and times in SAST). Supported fields include registration opening/closing, early bird deadline/fee, event start/end, venue/city, entry fee, tournament name and planned draw release. Edits observed during the 60-second settling period merge into one update; reverting them cancels that pending update. Draw-release dates are labelled as planned and do not imply the draw is published.

1. Player A enters with B as partner. Check both inboxes and pushes.
2. Publish the draw and schedule. Check links open the correct event/division/match.
3. Change a published court/time. Verify the new details and that the old reminder is suppressed.
4. Record a result, advance the team and correct the score. Check appropriate updates on both teams.
5. Test withdrawal, cancellation, muted categories, quiet hours and sign-out.
6. Repeat notification taps with the app open, backgrounded and fully closed.

Allow one to a few minutes for reconciliation/dispatch; rapid edits have a 60-second settling period. Run `mobile/supabase/setup/check-push-delivery.sql` for device counts, delivery status, cron results and recent HTTP responses. It does not print tokens or player emails.

`accepted` means Expo accepted the ticket. Receipts are checked after 15 minutes; `sent` means APNs/FCM accepted delivery, not that the player opened the notification. A successful cron status alone only proves the HTTP request was queued. HTTP 401 usually means the two worker secrets differ; HTTP 500 requires checking Edge Function logs and migration setup.

To pause dispatch:

```sql
SELECT cron.unschedule('player-push-delivery');
```

This stops scheduled delivery but leaves notification history and preferences intact. Run the scheduling file again to resume.

## 8. Release

After device verification, build the existing production profile and distribute through your usual TestFlight/App Store and Google Play process:

```sh
npx eas-cli build --platform all --profile production
```

Native Tournament Manager drives match/stage/result alerts. External RankedIn match/result events still need a separate authoritative integration; deploying this does not create that feed. Partner invitations and club announcements are catalog types without new producers in this implementation.

### Native licence payment and UI update (28 September)

- Apply `supabase/migrations/20260928130000_native_license_checkout.sql` and deploy `native-license-checkout` using the mobile config. Both were applied to the linked project on 28 September.
- The function validates the player's JWT itself and uses server pricing from `commerce_config`. Checkout references are server-owned with RLS; Paystack success is verified before activation. The existing licence webhook uses the same ledger reference, so it also completes purchases if the app is closed.
- The new `/license` route replaces the profile website link. Review and confirmation are native; Paystack opens in the platform browser sheet, then returns via `fourmpadel://license`. No licence purchase was made during development.
- Event follow consent now appears at the top; “No” is remembered per signed-in account/event on this device. Unfollowing general event updates does not disable transactional entry/match alerts.
- Successful registration displays an in-app confirmation banner, with distinct pending-payment wording. Automatic push delivery remains restricted to the existing test recipient.
- Ship an updated preview build for the interface changes. Retest size selection, follow yes/no, entry banner and full licence checkout on a physical phone.

Build 3 (`b40c0fc3-31bb-4ec8-9957-a108f0d8d5a4`) completed successfully and was installed on the registered iPhone. TypeScript and 87 automated tests passed. Simulator screenshots verified the top event banner, spacious size grid, light result card, neutral unsanctioned-event action, licence notice and entry banner. The payment endpoint rejects unauthenticated requests (401); its fixed HTTPS return redirects to the app (302). A real licence purchase remains untested.

### Followed milestones and schedule subscriptions (28 September)

Applied `20260928140000_followed_registration_closed.sql` and `20260928141000_schedule_auto_follow.sql` to the linked database. New schedule saves atomically enable tournament following. Later explicit unfollows remain respected. Followers present before the deadline now receive registration-closed alerts; late follows do not replay them. Existing saved schedules are not backfilled. Delivery remains restricted to the test recipient.

Build 4 (`f510ef11-2aa9-4cb9-8c33-4692687a162d`) completed and was installed on the registered iPhone. It includes the persistent, swipe-dismissable event overlay and schedule-triggered permission request. TypeScript, all 87 JavaScript tests, and the follower/schedule, tournament, and dynamic-copy SQL suites passed. Simulator screenshot verifies placement; physical swipe/reopen behavior and a future real deadline remain manual device checks.

### Schedule removal and collapsed banner placement

Applied `20260928150000_schedule_removal_unfollow.sql` on 28 September: removing an event from My Schedule stops general following, while active registrations retain their alert eligibility. Re-adding enables following. No historical removals were backfilled. The collapsed banner now occupies a separate row below the header, clear of the hero buttons.

Build 5 (`f84f5e82-8ad0-4b40-96b3-67c3ed3a0e13`) completed and was installed on the registered iPhone. TypeScript and the followed milestone/schedule, tournament and dynamic-copy SQL suites passed. A temporary collapsed-state simulator preview verified all hero buttons visible; the override was removed, and was never included in the uploaded build.

### Private-event deadline guard

Build 6 (`ca27546c-f559-41d7-9890-76e3611cb6ea`) was installed on the registered iPhone. Closed registration no longer exposes the private access-code form, including direct registration links. The screen re-evaluates its deadline while open and fetches current event state before unlocking. Checkout already rejected closed events; its cutoff now includes the exact deadline. The updated native-event-checkout function is deployed. TypeScript and all 89 tests passed, including private-code closure regressions. Simulator verification showed Brad Test's closed message without an entry form. Existing payment status recovery remains available.
