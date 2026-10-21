# Phone and watch audit — 9 October 2026

**Release recommendation: hold the App Store release until the shared backend permissions below are corrected and verified.** Local performance improvements are implemented, but neither a code review nor simulator tests can establish zero memory leaks, zero battery impact, or freedom from every security vulnerability.

## What the security findings mean

The phone app and website use the same Supabase database. The watch receives a limited schedule from the phone. Some live database permissions currently allow ordinary users, or unauthenticated API callers, to perform actions that should require ownership checks or trusted server approval. These permissions are enforceable through the API even when the app has no button for the action.

This review found permission weaknesses. It did not establish that anyone has exploited them, and it was not an investigation of historical access logs. No attack requests, record modifications, or production permission changes were performed during the audit.

## Confirmed backend release blockers

Evidence comes from read-only inspection of live policies, function bodies, role grants, column privileges, and triggers on 9 October 2026, alongside the corresponding application call sites.

| Finding | Evidence and consequence | Required correction |
| --- | --- | --- |
| Profile image writes are not restricted to the player's folder | The `profile-pics` INSERT and UPDATE policies check only the bucket and the authenticated role. The UPDATE policy has no player ownership predicate. An authenticated caller can target another player's image path. | Check the caller's ownership of the player ID encoded in the object path on both INSERT and UPDATE. Keep intentional public image reads separate. Review other media buckets with similarly broad write rules. |
| Licence and ranking changes lack sufficient protection | Authenticated users can update their own `players` row, including `paid_registration`, `license_type`, `approved`, `points`, `rank_label`, and `account_type`. No protective BEFORE trigger was present. `grant_partner_full_license(bigint)` is executable by `anon` and `authenticated` and updates the supplied player ID without an authorization check. `mark_player_paid(text)` grants the caller a licence without verifying payment. | Restrict editable profile fields; protect privileged fields on the server. Apply licences only after a verified payment or an authorized administrative action. Update and test the existing website payment and partner flows before removing their client RPC access. |
| Notification worker operations are exposed to clients | Both overloads of `claim_push_deliveries` and `push_delivery_context(uuid)` are SECURITY DEFINER functions executable by `anon` and `authenticated`. Claiming jobs updates notification queue state. The intended caller is the service-role push worker. | Revoke explicit client-role EXECUTE grants as well as PUBLIC grants, retain service-role access, and verify both overloads. Existing migrations that revoke only PUBLIC do not remove explicit `anon` or `authenticated` grants. |
| Registration lookup accepts someone else's email | `check_my_registration(bigint,text)` is executable by anonymous and authenticated callers. Its SECURITY DEFINER body returns registration details, including email and payment status, for a supplied email using `ILIKE`, without binding the lookup to the caller. Wildcard input can broaden the lookup. | Bind private registration lookups to the authenticated identity and use exact comparisons. Provide a separate intentional public entry-list interface containing only approved public fields. |

The website currently calls `mark_player_paid` in `src/components/LicensePaymentModal.jsx` and `grant_partner_full_license` in `src/pages/EventDetails.jsx`. The trusted webhook and payment reconciliation paths also apply licence changes. Remediation must account for those shared production flows; restricting only the mobile UI will not fix the permissions.

Additional follow-up: Supabase's advisor reports disabled leaked-password protection. Review enabling it. Review the intentionally public views and their exposed columns, particularly linkable unsalted email hashes in `event_registrations_public`. A SECURITY DEFINER view warning or an RLS table with no policies does not, by itself, prove a data leak; each object's actual access and contents need review. Other advisor warnings and RPCs remain outside the fully verified blockers above.

## Local improvements implemented

- Polling now pauses in the background and prevents overlapping requests on the updated live tour, match, and tournament screens. Countdown subscribers share a foreground clock, and decorative looping animations pause when their screen is inactive.
- Native authentication refresh follows app visibility instead of continuously refreshing in the background.
- Native profile drafts move from ordinary AsyncStorage into encrypted SecureStore. Existing drafts for previously used accounts are migrated. Chunked writes support large Unicode drafts, preserve the previous draft if a replacement fails, and keep account keys separate. The web storage behavior is unchanged.
- Match, tournament, and player portrait caches have bounded entry counts.
- Watch and widget artwork uses downsampled images and a bounded thumbnail cache. Downloads have timeouts, temporary files are removed, and the image loader uses an ephemeral session without cookies. Watch image tasks follow visibility. Watch time displays pause while inactive.
- Identical schedule snapshots no longer cause redundant widget reloads. Watch schedule data remains bounded and excludes login tokens, account email, and payment references.
- Compatible dependency updates patched `shell-quote`, `source-map-js`, and `brace-expansion`. npm's reported critical advisory count fell from one to zero. The resulting report still contains 45 moderate/high package advisories, including development/build tooling and upstream dependency chains. These need package-by-package triage; the count is not a count of exploitable vulnerabilities in the installed app. No forced Expo SDK downgrade was performed.

These changes reduce known unnecessary work and improve local storage protection. Requests already in flight may finish when an app enters the background. Cache entry limits and NSCache cost limits are not a proof of the app's total memory footprint.

## Verification and limits

- `npm run check` passed: TypeScript and 325 tests, including foreground lifecycle, timer cleanup, overlapping-request prevention, secure draft migration, failed-write recovery, and account isolation.
- After the final small storage changes, TypeScript and all six secure draft tests passed again.
- Standalone Swift watch refresh and navigation checks passed.
- The final native watch simulator build succeeded and was installed on the paired watch simulator.
- Earlier simulator testing covered the 40 mm and 46 mm watch layouts, event navigation from a widget, remembered category selection, and schedule refresh behavior.
- A simulator Instruments attach attempt did not produce a usable recording. No completed Instruments leak or power recording is claimed. The physical phone/watch were unavailable for profiling during this review.
- No privileged server key was found in the inspected mobile source. Authentication uses SecureStore and PKCE. This is a scoped review, not a complete penetration test or third-party security certification.

Before release, verify ownership and role restrictions with separate anonymous, player A, player B, administrator, and service-role test sessions. Confirm successful image uploads, profile editing, verified payment fulfilment, partner licence assignment, registration lookup, and push delivery after remediation. Then profile the release configuration on a real iPhone and paired Apple Watch through repeated navigation, large image loading, background/foreground transitions, poor connectivity, and sign-out. Check memory stabilization, retained objects, CPU/network activity while inactive, and measured power use.

No release archive, App Store upload, or production backend change was made as part of this audit.

## References

- [Expo SDK 57 documentation](https://docs.expo.dev/versions/v57.0.0/)
- [Expo SDK 57 SecureStore](https://docs.expo.dev/versions/v57.0.0/sdk/securestore/)
- [Supabase native authentication refresh lifecycle](https://supabase.com/docs/reference/javascript/auth-startautorefresh)
- [Supabase SECURITY DEFINER function access warning](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)
