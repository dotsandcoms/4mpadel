# 4M Padel V2 — light court-side editorial

## Version boundaries
V1 is preserved on `brad/mobile-v1` (29271a1). V2 lives on `brad/mobile-v2`.
The V1 commit snapshots mobile source, assets and native targets; unrelated parent-project changes and local Supabase temporary files remain untouched. Neither branch has been pushed.

## Reference lock
Primary: the user's existing 4M native product and tournament journey, rebuilt around light surfaces and legible data.
- Padel Nachos: player-first discovery, portraits, following and compact score presentation.
- Premier Padel: editorial hierarchy and the personalised “For you” feed. Photography belongs to players/events, not behind dense data.
- FIP: explicit tournament states, dates, places and clearly labelled ranking columns.
- Refero bundled color guidance: restrained neutrals, semantic accents and strong contrast for data-heavy interfaces.

## Decisions
- Off-white canvas, white cards, navy-charcoal text, visible neutral dividers.
- Keep 4M lime for primary filled actions; use deep green for readable links and selected text.
- Lead home with tournament discovery and pending actions; surface player feed before secondary history.
- Preserve native tabs, safe areas, sheets, haptics, refresh and platform navigation.
- Preserve onboarding, authentication, API contracts, event eligibility, partner selection and payment logic.
- Show published data, timestamps, loading/error/empty states. Do not claim live scores until live coverage exists.
- No fabricated feed entries, rankings, prices or registration availability.

## Data boundary
Existing Supabase bundles and Pro Padel adapters remain the source of truth. Full upstream API integration is a future task; this redesign retains follows, published fixtures/results, rankings, stale-data disclosures and retry behavior.

## Verification
- TypeScript and all 50 existing tests pass, including checkout, registration navigation, partner search, rankings, feed adapters and companion schedules.
- iOS and Android production JavaScript/Hermes bundles export successfully on Expo SDK 57.
- Phone-width browser review covered home, real player portraits, tournament cards, event details, rankings and the existing RankedIn registration handoff.
- No live registration, follow, schedule or payment writes were made during verification.
- Native device interaction and signed-in checkout still require device QA. Expo also reports the existing missing `ios.appleTeamId` setting for signing.
- Onboarding/auth retain V1 styling. Secondary legal and edit-profile screens retain their existing dark form styling; their status/navigation theme follows that choice.
- Full live API coverage has not been added by this visual redesign.

### V2 onboarding and account setup

Extended the approved light palette to the three onboarding slides, sign-in/signup,
profile completion, shared form fields, pickers and toasts. Profile editing uses the
same controls and palette. Retained onboarding navigation, authentication handlers,
validation, profile persistence and consent behavior. Native Apple sign-in now uses
the black button; native keyboards and selection sheets use light appearance.

Validation: TypeScript and all 50 existing tests pass; iOS and Android exports pass.
Browser review at 390 × 844 covered all slides, the signup handoff and the expanded
email/password form without submitting an account. Native visual inspection was
unavailable while the host Mac was locked.

### World padel introduction and launch screen

Onboarding now has four slides: local events, world padel, partners, rankings.
The second slide introduces player profiles, world rankings, tournament coverage,
and match schedules/results. The preview is a feature illustration, with no
invented scores, live-status claims or account writes.

The splash uses a full light background with a centred dark wordmark and the line
“Play local. Follow the world.” The court photo, split panel, heavy overlays and
decorative circles were removed. Status-bar content is dark during launch.
Native splash background is aligned to the V2 page colour; native builds need
prebuild/rebuild to apply it.

Development builds (`__DEV__`) replay onboarding on every launch for review.
Release builds retain the persisted first-launch check. No saved onboarding flag
or account/session data is cleared by this testing behaviour.

Validated at 390 × 844: world padel is slide two of four. TypeScript and the 50
existing tests pass; both iOS and Android exports pass.
