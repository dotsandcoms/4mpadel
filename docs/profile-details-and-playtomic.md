# Private profile details and Playtomic levels

## Current update — 5 November 2026

The latest requested behavior supersedes the optional-upload descriptions in earlier release records below:

- A Playtomic level **and screenshot are required**, unless the player explicitly selects “I don’t have a Playtomic profile or level.” That declaration bypasses both requirements, saves an unknown level (not zero), and records a server timestamp. Clearing the declaration requires a valid level and screenshot again. Existing records are not backfilled.
- New screenshots automatically extract three independent values: padel level, number labelled Matches, and Level reliability percentage. The example is **5.17, 660, 93%**. Missing/ambiguous values stay null; follower/following counts and challenge targets are ignored. Players can correct the level manually and save a readable uploaded image even during an extraction outage.
- Success displays a green tick and the extracted details for **2 seconds**, with an optional Done action. Details remain visible inline after automatic closure. Dismissing processing does not reopen the popup on success. Stale results and old success timers cannot affect replacement uploads; manual edits retain priority.
- New clients use `save_player_profile_details_v3` / `create_player_profile_with_details_v3`. The legacy and v2 RPCs keep their previous contracts for released apps. Signup retries reuse the authenticated account; native secure drafts retain the no-profile declaration and extracted preview.
- `playtomic_profile_extractions` is a service-only, RLS-enabled table with explicit grants and no client policies. The Edge Function records validated numeric values against an immutable screenshot path and its storage object ID. Reusing a deleted filename cannot inherit the previous image’s evidence. Clients cannot submit algorithm inputs. The checked private getter joins only the profile’s saved screenshot, so replacing/removing it detaches old metrics. Pending signup evidence belongs to the authenticated account, transfers to the player on attachment, and cascades on deletion of the pending account or beneficiary player. Only owners and Players admins can read saved details.
- These are **inputs for a future starting 4M level algorithm**. This update does not invent a formula or change 4M ratings. Extracted evidence is separate from the editable player-submitted level; neither is Playtomic verification.
- OpenAI receives the screenshot on upload to extract these three values. The privacy notice discloses this processing and storage purpose. The existing server key, pinned configurable model, 20/day atomic quota, 20-second timeout, private storage and `store: false` remain in place. No names are extracted.

Deploy the forward migration, then the compatible Edge Function, before publishing updated clients. Keep both migration trees in the access audit; do not replay historical migrations. The native source needs an app-store release.

Website and database deployed on 2 November 2026 at [Player profile](https://4mpadel.co.za/profile). The native source is implemented and tested; no new App Store or Google Play binary was released.

## Player experience

- Date of birth is required when signing up or saving profile details in the updated web and native clients. All three responsive web editors use the same date control. Native signup drafts retain the date securely alongside the other profile fields.
- The previous editable age field is replaced by date of birth. Saving calculates age for the existing player cards; birth dates are not added to public player queries. Existing players are not given invented birth dates or logged out.
- The profile editor also shows a read-only Age field that recalculates immediately as date of birth changes. The web profile's age displays calculate from the saved birth date and today's Johannesburg date, so reopening the profile after a birthday does not rely on a stale age saved in the player row. Tests cover before/on/after birthdays, leap-day births and missing dates.
- Playtomic padel level is required during signup and profile saving in updated clients. Profile screenshots are optional. Levels range from 0 to 7, with up to two decimal places. Zero is preserved. Existing missing levels are collected on the next profile save; no values are invented.
- Web accepts JPG, PNG and WebP, up to 5 MB. Native converts library images, including HEIC photos, to bounded JPEG without cropping screenshots. Players can preview, replace and remove proof.
- The level is labelled player submitted. Uploading an image does not assert that Playtomic verified it. The level and proof are edited in the native Edit profile screen and existing web profile forms.

## Access and lifecycle

`public.player_profile_details` is RPC-only: RLS enabled, all direct client grants revoked, explicit service-role CRUD. Its access contract is in `tests/fixtures/data-api-access.mjs`. Owners and administrators with the Players permission (including super admins) may use the checked RPCs. Admins can use the existing Players → View profile flow to review and edit evidence.

Proof uses the private `playtomic-proofs` bucket and short-lived signed URLs. Uploads are scoped to a player folder. Saved proof cannot be overwritten or deleted until it is replaced or removed from the profile. Restrictive storage policies preserve those boundaries even in the presence of an unrelated broad policy. Replaced proof is removed after saving; cancelled uploads may remain unreferenced until account deletion. The deletion worker's storage lookup includes proof in the beneficiary's folder, including admin-uploaded evidence, and the details row cascades when the player is deleted.

`create_player_profile_with_details_v2` validates the authenticated account and commits its birth date, required level and optional screenshot with profile creation. Legacy creation endpoints remain available for released clients and organisation setup; this change does not force old native binaries to collect a birth date. Deploy the migration before the website and release the updated native client to apply the new required field there. No historical migration should be replayed.

The web and native profile editors save private details before updating the existing public player fields. If that second operation fails, private details may already have saved; retrying is safe.

## Automatic Playtomic level retrieval

The current **official** third-party API documents player levels. These published docs were checked on 2 November 2026:

- [Players](https://third-party.playtomic.io/endpoints/players/): the venue player list and single-player endpoint support `include=SPORTS`. Select the `sports` entry whose `sport_id` is `PADEL` and read `level_value`. That field is optional; a missing level must not become zero.
- Access is scoped to a venue. The single-player endpoint returns 404 when the player is not found in that venue. The documented interface is not a global lookup from an arbitrary public profile link.
- [Getting started](https://third-party.playtomic.io/): credentials are generated in Playtomic Manager → Settings → Developer tools. Chain clubs should contact Playtomic support.
- [Authentication](https://third-party.playtomic.io/endpoints/auth/): client ID and secret produce a bearer token expiring in one hour. These credentials and tokens must stay on the server.

An official sync is feasible for players accessible through an authorized club account. The next implementation should confirm actual venue access and the provider's endpoint naming (the documentation's route headings and examples differ), securely associate the local player with a Playtomic player ID, and fetch only the padel level server-side. Use a user-confirmed association or verified matching identity; names alone are insufficient. Store the retrieval timestamp and source separately from manual evidence, handle missing levels and revoked venue access, and obey the account's rate limits.

No authenticated Playtomic request was made and no automatic sync was added. A public profile URL or screenshot alone does not grant third-party API access. No Playtomic passwords are requested from players.

## Verification

- `node --test tests/profileDetails.test.mjs tests/privacyPolicy.test.mjs`: 13 passed.
- `npm run test:data-api`: 3 passed; both migration trees audited.
- `node scripts/test-profile-details-db.mjs`: temporary local PostgreSQL cluster, never Supabase. Covers DOB and level validation, atomic signup, RPC-only grants, owner/admin separation, cross-player proof isolation, broad-policy resistance, immutable saved proof, replacement, and deletion cleanup. Runs `npm run test:data-api:db` against the empty local `fourm_data_api_grant_test` database: 64 contracts plus sequence and column-grant checks passed.
- Mobile `npm run typecheck` and `npm test`: passed, 488 tests.
- New web components and utility pass ESLint. Existing profile files were checked with their pre-existing unused-variable lint errors excluded.
- Production website build passed with `.tmp/license-build/vite.config.mjs`, which uses the already-recovered tracked `featuredbg.jpeg`; the normal build encounters the pre-existing macOS read restriction on that asset.
- Mocked browser review verified DOB validation, missing-proof errors, upload preview and successful save. The 390 px web form has no horizontal overflow. No live profile was changed or uploaded to during QA. Native device interaction was not tested.

The visual direction preserves the current dark profile canvas, lime accent, existing control shapes and spacing. Refero's bundled form/focus guidance informed the new labelled controls and keyboard focus states. A mocked form preview is saved at `outputs/profile-details-20261102/profile-form-mobile.jpg`.


## Production deployment — 2 November 2026

The website is live on deployment `dpl_9Gr6BdRast5p5bkp5ci7NA7hRFef`. It was prepared from the current production commit `6d1fc6f67ff0daec7d579d7885e0900db03d7d84`; only the two profile/auth files and two new profile-field/helper files changed, and 1,395 other production files were verified unchanged. The production dependency lock matched the tested local lock. The isolated candidate passed its local and Vercel builds before promotion.

The additive migration is recorded as `20261102073216_player_profile_birth_date_and_playtomic.sql`; its local filename and SQL fixture now match hosted history. Existing player, payment and license counts, and existing age values, were unchanged. No real profile, test account, DOB or proof image was inserted during release checks.

Post-deployment checks confirmed the private table has RLS and no direct anon/authenticated grants, explicit service-role CRUD, locked RPC search paths, no anonymous RPC execution, six scoped proof policies, and a non-public 5 MB image bucket. Anonymous REST table and RPC requests both return 401. Security-advisor error counts are unchanged; the new RPC-only table and permission-checked authenticated RPC findings are intentional and reviewed.

Home, profile, calendar, rankings and admin routes return 200 with the candidate's asset manifest. The live bundle contains the required DOB, calculated age and Playtomic upload/RPC code. Browser review of the live registration screen confirmed the required birth-date field and read-only Age, which calculated 15 from an unsaved synthetic 2 November 2011 DOB. No account was submitted. The signed-in profile save/upload flow was tested against isolated fixtures and mocked UI earlier; a signed-in production write was deliberately not performed.

Release source, hashes, live checks, migration verification, screenshots and rollback instructions are in `outputs/profile-details-20261102/deploy`. Rollback restores the preceding website deployment while retaining private user submissions and the compatible database additions. Automatic Playtomic API synchronization is not part of this release; it still requires authorized club credentials.


The level input was renamed to **Playtomic Level** on 2 November 2026 and published as deployment `dpl_8oH3xjTLu7z6Rg6SRXx9X6ab44u3`. This wording-only update changes one website file and requires no database migration. Native source wording and existing label-based tests were updated to match.


## Required levels and screenshot reading — 5 November 2026

Updated web and mobile clients use `save_player_profile_details_v2(player_id, details)` and `create_player_profile_with_details_v2(profile, details)`. The legacy RPCs remain compatible with released apps and DOB-only signup. The forward migration relaxes the original level/proof pairing constraint to allow a level without a screenshot, while still rejecting a screenshot without a level. RLS, RPC-only details access and owner/Players-admin permissions remain in force.

Web signup creates an authenticated account after the personal/padel steps, then collects the required level and optional screenshot before atomically creating the player profile. Retries reuse that session. On subsequent sign-in, an account without a player row resumes at `/profile`. Native setup already runs after authentication and retains the level and screenshot path in its secure profile draft. Screenshots uploaded before a player row exists use `signup/<auth-user-id>/<random-id>.<extension>` in the same private bucket. Unattached images are accessible only to the uploader; attached images follow the player's owner/admin permissions and cannot be deleted until detached. Account deletion includes this prefix and attached images uploaded for the player.

Upload labels say “Upload a screenshot of your Playtomic profile (optional)”. Each new upload automatically sends the selected image to the authenticated `extract-playtomic-level` Edge Function. It checks the caller and storage access, reads at most 5 MB of JPG/PNG/WebP bytes, and uses OpenAI's Responses API with strict output, high image detail and `store: false`. Only the current padel level is requested; a blurred name is acceptable. Decimal commas are normalized (`5,17` → `5.17`); reliability percentages and other numbers are not candidate levels. Screenshots and provider responses are not logged by the handler. Provider-side processing remains subject to OpenAI's applicable policies; `store: false` is not a claim of zero retention.

The default model is `gpt-5.4-mini-2026-03-17`. Configure `OPENAI_API_KEY` in Supabase Edge Function secrets; `PLAYTOMIC_EXTRACTION_MODEL` optionally overrides the model. No key is bundled into either client. Requests time out after 20 seconds. A service-only atomic quota allows 20 attempts per authenticated account per UTC day, with seven days of usage counters retained. Missing configuration, quota exhaustion, unreadable images and provider failures leave manual entry available.

A successful result automatically fills the editable level field. While processing, the form says “4M is processing the screenshot. Check the suggested level before saving.” There are no read/confirmation buttons on the successful path. Saving waits until upload and processing finish. Manual edits made while processing are preserved, results from replaced/removed images are discarded, and saved screenshots are not reprocessed on reopening the form. Failed or unreadable screenshots retain the entered level and offer a retry. The level remains player submitted rather than verified by Playtomic. This is screenshot reading, separate from the official venue API integration discussed above.

Release order: apply the new forward migration, deploy `extract-playtomic-level` with JWT verification enabled, then publish the web client. Native changes require an app release. Roll back the website to its preceding deployment if signup, profile saves or private upload access regress; retain the compatible migration and user submissions. Disabling screenshot reading must not disable manual entry. Do not replay historical migrations or deploy unrelated dirty workspace changes.


## Production release — 5 November 2026

The required-level, optional-screenshot and screenshot-reading website is live as deployment `dpl_5PBVeLbhoezzNwhXMTS4i191GS6A`, promoted after explicit user approval. The candidate was prepared from production `dpl_7sigAWACu4m91MtFi64S7qfdeNbu`, with only six reviewed website files changed and 1,397 unrelated production files verified unchanged. The local and Vercel builds passed; the live JavaScript hash matches the tested candidate. Home, profile, privacy, admin, rankings and calendar return 200 with the new asset manifest. A live 390 px browser check confirmed the three-step signup, updated privacy notice, no horizontal overflow and no JavaScript errors; no signup was submitted.

The forward migration is recorded in hosted history as `20261105080030_required_playtomic_level_and_extraction.sql`; the local filename and SQL fixture match. The `extract-playtomic-level` Edge Function is active, version 1, with JWT verification enabled. Post-migration counts remained 2,098 players, 50 private-details rows, four submitted levels and four screenshots. Anonymous HTTP calls to the function and both private tables return 401. Security-advisor error counts are unchanged; the service-only usage table's RLS-without-client-policy informational finding is intentional.

Validation passed: 493 mobile tests, mobile typecheck, 26 web/backend unit tests, 14 mocked browser tests, three Data API source checks, and 65 isolated PostgreSQL access contracts plus sequence/column/RLS checks. The example's decimal comma is covered by the extraction parser and mocked provider tests. No live customer profile was changed and no real image was sent through OpenAI during release verification. The user confirmed configuring the OpenAI secret; authenticated provider behavior remains a live integration check rather than a claim of the mocked test suite. Native source changes require a new app release; no App Store or Google Play binary was published.

Release records, source hashes, smoke checks, screenshots and rollback instructions are under `outputs/playtomic-20261105/`.


## Automatic screenshot autofill enhancement — 5 November 2026

New web and native screenshot uploads automatically request the existing extraction endpoint and fill the editable Playtomic level when a clear value is returned. The upload remains optional, and the player checks the level before saving. The processing message uses 4M branding; the privacy notice continues to identify OpenAI as the image-processing provider. No database or backend change is required. A saved screenshot is not reread just by opening the editor. Manual edits during processing take precedence over a delayed result. Retry appears only after a failure or no-result response.


The automatic-fill enhancement is live as deployment `dpl_iZp7LYm5wBKW7RoeEMb65aKqP2j3`, published after explicit approval. Its candidate changed only the shared web screenshot field and the Playtomic privacy paragraph; 1,401 other production files were verified unchanged. The Vercel build passed, the live bundle matches the tested candidate, and six public routes return 200. Live browser smoke checks found no JavaScript errors or horizontal overflow and verified the automatic-processing privacy text without submitting a signup or profile. Validation included 16 mocked browser tests, 13 profile/privacy unit tests, 507 mobile suite tests, five focused native autofill scenarios and mobile typecheck. No database or backend deployment was needed. Native changes remain pending an app release; real-provider image processing was not exercised during release verification. Release evidence and rollback details are in `outputs/playtomic-auto-20261105/`.


## Extraction progress popup — 5 November 2026

New screenshot uploads show a progress popup above the signup/profile editor. Web displays an upload message followed by “We’re extracting your Playtomic level”; native displays the extraction popup after the image upload. The popup closes automatically on success, no result or failure. “Keep editing”, Escape on web and the native back action dismiss only the popup; extraction continues and manual-edit precedence still applies. Retries reopen the popup. The existing inline status remains visible if the popup is dismissed. Web uses a native modal dialog in the top layer, focus containment and restoration, and a reduced-motion-aware spinner. Native uses the platform modal and activity indicator. This changes presentation only; extraction, validation, storage permissions and save behavior remain unchanged.


The progress-popup website update is live as deployment `dpl_5q3mYfgVadnnug5F65eEmxNnMZLd`, published after explicit approval. One reviewed form file changed and 1,402 production files were preserved. The local and Vercel builds passed. Validation covered 13 admin browser scenarios, four signup browser scenarios, seven native processing scenarios, mobile typecheck, keyboard focus/Escape handling and automatic closure. Live bundle and six route checks passed, and the live registration/privacy smoke check found no JavaScript errors or horizontal overflow. No signup or profile was submitted during release checks. The user confirmed the existing live extraction worked before this presentation update. Native popup source is ready for the next app release. Evidence and rollback details are under `outputs/playtomic-modal-20261105/`.


## Success details, screenshot requirement and exemption release — 5 November 2026

Live website deployment `dpl_9zjZ7zcyBKXLLYnjyAo4tS5G5Vuh` supersedes `dpl_5q3mYfgVadnnug5F65eEmxNnMZLd`. The isolated candidate changed seven reviewed website files and preserved 1,396 other production files. Both local and Vercel builds passed. The published bundle SHA-256 matches the tested candidate; home, profile, privacy, admin, rankings and calendar return 200. A live mobile-width registration/privacy check found no JavaScript errors, horizontal overflow or profile writes.

The forward migration is recorded as `20261105102417_playtomic_profile_evidence.sql`, matching hosted history and the isolated fixture. Edge Function `extract-playtomic-level` is active at version 2 with JWT verification. Existing player count (2,099), private-details count (52), level count (5), proof count (4), and a hash of all pre-existing private-detail values were unchanged by migration. No real profile was modified during verification.

Validation: 31 web/backend/privacy unit tests, 18 mocked browser scenarios against the exact candidate, 513 full mobile-suite tests, 37 final focused native checks (including the new restored-exemption signup scenario), mobile typecheck, three Data API source checks, and 66 isolated PostgreSQL access contracts with sequence/column/RLS checks. Database tests also cover service-only evidence writes, owner/admin reads, staged ownership transfer, reused filename isolation, pending/attached account deletion, atomic exempt signup, retries and legacy RPC compatibility. Real-provider output for the new three-value schema was not exercised during release verification; the example is covered through parser tests and a mocked model response.

Security review adds the expected RLS-without-client-policy notice for the service-only evidence table and authenticated SECURITY DEFINER notices for the two permission-checked v3 RPCs. Existing error findings are unchanged. Evidence, source hashes, screenshots and verification records are under `outputs/playtomic-stats-20261105/`. The native source is implemented and tested; it needs a new app binary. The starting 4M formula remains unchanged.

Rollback: promote the prior website deployment above if signup or profile saving regresses. Retain the additive migration, extracted evidence and legacy/v2 RPCs; do not delete player submissions or replay historical migrations. The compatible version-2 extraction response still includes `status` and `level` for older clients. Disable image processing through server configuration only if needed; valid uploaded screenshots can still be saved with a manually entered level, and the no-profile declaration remains available.
