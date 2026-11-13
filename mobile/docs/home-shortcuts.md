# Home shortcuts and discovery

## Direction and reference lock

Product: help 4M players find events, playing partners, rankings, licences and courts in the app.
Character: calm, sporting, precise.
World: club courts and real player identities; use the existing Home light page, white surfaces and forest-green actions.
Moments: actual player portraits and club imagery; financial amounts remain plain and legible.
Signature: consistent native segmented controls with concise labels and quiet green actions.

Dominant reference: the approved 4M Home implementation and the user’s screenshots, rather than a new design system. Home retains its compact followed-player cards. Discover uses the original photo-led cards, as requested in the 9 November 14:42 screenshot: rectangular photos (144-point cards with 128-point images after the compact-size refinement), blue SAPA frames, corner flags/ranking badges, club metadata and full-width native Follow actions. FIP badges keep the current dark green treatment rather than reintroducing neon yellow. Its actions guide licence/club CTAs. iOS native sheets, navigation/search and segmented pickers, and Android Material segmented buttons/CTAs supply platform interactions. Refero’s bundled craft guidance supplies spacing, alignment, contrast and state checks; no live Refero tools were available. Unslop by Damir Sokolovsky (https://x.com/heydamir), CC BY 4.0, informs the audit and polish.

## Audit and changes

- Search: a flex wrapper around the virtual list disappeared when the native form sheet expanded. Give the list the screen’s flex layout directly, with no collapsible native root wrapper. Verify both detents after opening the sheet afresh.
- Find tournaments: use a named, events-only search containing upcoming events and events still running today, based on the South African date. Completed and undated events stay out of this finder, including name/city/venue searches. The toolbar search retains all four directories and recent history; the calendar retains past events. Local club results open native club details.
- Players: remove the scroll-direction logic that unmounted search/filters and changed the list’s viewport. Keep a stable compact header. Remove marketing copy while preserving the original Discover photo layout, including blue local-player frames. Native segmented pickers control view, source and category. Followed players use filled hearts; unfollowed players use outlines. Virtualize horizontal player rails to avoid mounting all native follow buttons at once.
- Rankings: replace neon page selections with dark green/white, and correct the unreadable white text on inactive pagination buttons. Keep category and organisation identities unchanged.
- SAPA licence: annual-only purchase/renewal page with native back navigation, season rows and quote. Temporary licences can be selected only within the app’s event registration/payment flow. The standalone app client rejects temporary quote/checkout requests; it still verifies saved payments from older app versions. The shared web checkout function remains compatible with website registration. No real payment was initiated during UI verification.
- Clubs: use the same published/4M-approved/4M-premium statuses as the website, with explicit public-field projections. Show an in-app directory/details screen, facilities/hours when supplied, and a user-initiated maps action.

## Location and data

Location is never requested on launch. “Use my location” explains its purpose before the foreground OS prompt. Use one balanced-accuracy fix, with a 12-second bound after permission. No background subscriptions, uploads, analytics coordinates or persistent location storage. Coordinates live only in directory screen state; popping the directory route clears that state. Distances are approximate straight-line kilometres, calculated on the device; radius choices are 10, 25, 50 and 100 km. Missing club coordinates are excluded only from Nearby results and remain searchable under All clubs. Denied/disabled/unavailable location preserves manual browsing; a settings action is available after permission is blocked.

The public club list is paginated and cached in memory for five minutes. Refresh bypasses the cache. Details load on demand, using the public status filter on the server and validating it again in the projection. Only published business contact fields are requested on club detail; raw contact arrays, applicant/owner identifiers and moderation fields remain excluded. Club team identities use club_members_public and players_public; coaches use approved directory fields without application/contact data. No database migration or grant expansion was necessary.

The app config explicitly declares the nearby-club foreground permission explanation for the next native build. The running simulator binary already contains Expo Location and the generic OS usage description.

## Validation

- TypeScript and all 660 mobile tests pass after the live club additions.
- Club tests cover public projections/status, pagination/cache/cancellation, manual/radius filtering, missing or invalid coordinates, distance math, detail parsing, native permission denial and timeout. Existing licence checkout and ranking identity tests remain in place.
- iOS simulator: fresh tournament sheet, expand, filter Durban, open the event; Home shortcut into Discover; scroll both directions with stable filters; load real SAPA licence renewal quote; load 307 clubs; native location prompt and denied/manual-search path; club details and native search.
- Android Compose components compile/typecheck; Android visual/device testing is still required. A successful real-device GPS fix has not been verified in this session.

See [Native clubs](native-clubs.md) for live Google media, review handling, group search parity and the visual audit.
