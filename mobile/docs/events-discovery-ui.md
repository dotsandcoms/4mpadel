# Events discovery refresh — 9 November 2026

## Reference lock

Direct implementation against the approved 4M Home and Clubs UI. The existing event
calendar, real event posters and the user's screenshots define the content and order.
Refero live tools were unavailable; its bundled craft guidance supplies hierarchy,
touch-target and performance checks. Unslop by Damir Sokolovsky
([@heydamir](https://x.com/heydamir)), CC BY 4.0, supplies the nine-pass audit.

Product: find, follow and enter tournaments.
Character: sporting, direct, precise.
World: event posters, venues and dates.
Moments: real poster artwork and meaningful event/tier status.
Signature: the same 4M / international native source picker used on Home.

| Decision | Source and role | Implementation |
| --- | --- | --- |
| Quiet canvas, system type and green actions | Approved Home/Clubs system | Existing lightBrand tokens, 24 pt heading, 16 pt event name, 12–14 pt supporting text |
| Event imagery carries richness | Existing event posters and user references | Compact poster next to full event name, dates and venue |
| Native controls | User's explicit iOS/Android preference | SwiftUI/Compose segmented pickers and buttons, iOS page sheet, searchable city selection |
| Obvious saved state | User's feedback during review | Solid Scheduled button with white check; pale Save event with plus; pending action disabled |
| No duplicate date controls | User's feedback during review | Upcoming / Past / My schedule tabs; 4M modal only contains City and Event type; no international Filters button |
| Separate circuits | User's naming and filter feedback | 4M label, local tiers without FIP; FIP seasons/levels remain international |

## Audit and passes

1. Spacing: replace oversized header gaps and inconsistent insets with a 4 pt rhythm,
   16 pt page/card insets, 12 pt list gaps and compact controls.
2. Colour: remove neon selections from discovery chrome; preserve meaningful tier
   colours inside cards and use the Home green for actions.
3. Icons: native symbols for controls; consistent small search, people and chevrons.
4. Copy: specific event/date labels, concise search hints and contextual empty states.
5. Type: remove rounded display typography, 700–800 weights and tracked uppercase
   labels from discovery; keep readable full event names.
6. Layout: poster and facts side by side; schedule and alert controls remain separate.
7. Details: 16 pt card corners, quiet hairlines, no zero filter badge, actual extra
   filter count, accessible add/remove schedule labels.
8. Visuals: retain real event artwork and the website's local tier fallback assets.
   International thumbnails use contain to retain the full poster.
9. Motion: retain native control/sheet transitions and Android ripple; no decorative
   entrance sequences or layout animations.

No generated imagery was needed. A style callback on Pressable failed to apply row
layout in the running native build; static container styles now keep both calendars'
poster and text aligned.

## Preserved functionality

- 4M: search by event/venue/city/organiser, all local tiers, upcoming/past/saved
  dates, event type, searchable city selection, clear filters, empty/error states,
  pull to refresh, full event detail/entry navigation, registration counts,
  cancelled/code-required state, personal schedule and independent alert bell.
- International: season directory, Premier Padel / Cupra FIP / Promises seasons,
  all available levels including Bronze, search, upcoming/past, source freshness,
  pagination, snapshot fallback, refresh/retry and official/API event destinations.
- Request cancellation, public/private access rules and backend services are unchanged.
- Date-range 'On now' means the local event's scheduled dates include today;
  it does not claim that a match has a live score.

## Validation

TypeScript and the mobile test suite pass. iOS simulator review covered corrected
4M row layout, native filters/city selection, empty results and distinct Scheduled
state. International source selection and filters were exercised; static row styles
were corrected in both calendars. Android uses the existing native Compose controls;
Android device review remains outstanding. No database deployment is required.

## Activity follow-up

The existing event activity list keeps its order, routing, category filters,
refresh cadence and pagination. Category colour now has a fixed meaning:
players use blue (#245C8D), matches amber (#8A570C), and event updates purple
(#68448A). Native filter buttons use the same category ink. Every row also has
an explicit type label and its original distinct icon; colour is not the only
cue. Live matches and withdrawals use warning red. Surfaces stay white/neutral.

Measured category-label contrast against the chosen tints is 6.22:1, 5.54:1 and
6.52:1 respectively; white selected-button labels exceed 6:1. TypeScript and all
33 existing Following/activity tests pass after the presentation update.

## Published match updates

The Activity filter is now **Match updates**. It reads published fixtures/results
through both existing 4M native draws and RankedIn draw readers, rather than
depending solely on activity records being emitted when an old result was saved.
The All activity filter previews three matches and links to the complete match list.
Result/schedule/live rows are not repeated in the player/event timeline.

- Discover published choices for this event only; reject hidden, code-protected or
  unapproved events before requesting public match data.
- Load at most two draws concurrently, with a visible coverage count and pagination
  for the remaining divisions/stages. Matches are revealed twenty at a time.
- Use the existing RankedIn gateway/shared cache and native published-draw readers.
  Active events refresh every two minutes while focused; past events do not poll.
- Preserve actual players, score orientation, status, known schedule and court.
  Empty future bracket slots and cancelled matches are omitted. Unknown match
  completion timestamps are not invented.
- Surface partial source failures and stale snapshots. Failed requests do not
  become a misleading empty feed. Empty states explain publication and link to
  Draws/Results.
- Match links retain the exact source, class, draw choice and match. RankedIn numeric
  targets are accepted only when that source is explicitly specified.

Model tests cover both sources, event boundaries, pagination, score normalization,
stale/failed reads and a real Adidas fixture. The iOS simulator loaded Adidas
RankedIn results. End-to-end result highlighting and Android device review remain
manual checks; concurrent simulator navigation interrupted that part of review.
No database schema or hosted deployment changed.
