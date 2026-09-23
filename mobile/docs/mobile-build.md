# Native event journey

## Reference lock

Build target: the actual mobile-responsive website at https://4mpadel.co.za.
Reference pages: `src/pages/Calendar.jsx`, `src/pages/EventDetails.jsx`,
`src/components/TournamentProgressBar.jsx`, `src/index.css`, and the user's screenshots.
Inspected the website at 402pt and the user's live browser at 464pt on 7 September.

Calendar uses the source hero asset, outlined tier pills, compact date/poster rows,
code badges, venue/city/entry metadata, and independent schedule buttons. At narrow
phone widths the date rail and arrow spacing compress to preserve the information column.
Event details use a full-width poster hero, stats, organisation/sponsors, countdown,
progress timeline, sticky white tabs, and light overview accordions.
Typography uses `ui-rounded`: verified in RN 0.86's RCTFontUtils.mm as the public
mapping to UIFontDescriptorSystemDesignRounded. Never use private SF font names;
`.SFUIRounded-Regular` caused the incorrect serif rendering and was removed.

Native clients preserve stack navigation, safe areas, pull-to-refresh, and accessible
controls. These are React Native views, not a WebView.

| Decision | Source | Purpose |
| --- | --- | --- |
| Palette, type and surfaces | website src/index.css and Calendar/EventDetails JSX | Match the website at phone width |
| Search, city, tier and timing filters | src/pages/Calendar.jsx | Match website discovery |
| Division fees and closing times | src/utils/eventEntryFee.js and registrationClose.js | Match website entry rules |
| Save/remove schedule | src/utils/playerSchedule.js | Same schedule on web and native |
| Event content and contact details | src/pages/EventDetails.jsx | Preserve published information |

Native clients use the existing Supabase project and RLS. Never infer payment success from
returning from a browser; refresh registrations from the backend.

## Verification on 7 September 2026

- Signed Debug build passed on the iPhone 17 Pro / iOS 26.5 simulator.
- Fixed the unsigned-build SecureStore entitlement failure; verified a clean sign-in screen.
- Metro is running on localhost:8081. Verified Calendar and native event details with public data.
- TypeScript and 13 mocked/pure tests pass.
- Android work paused at the user's request; its JS export passed but the native build has an unresolved resource-compilation failure.
- Checkout backend deployment and LAN Metro access were blocked by automatic approval review and await explicit user approval. No checkout was submitted.
- Physical iPhone is paired, but no new device build has been installed during this work.

## Event layout verification

- Corrected the website origin from `.com` to `.co.za`.
- Verified Calendar cards, opening the Breakfast Club event, stat/date wrapping,
  horizontal tabs, and expanding Event Information in the signed iOS simulator.
- Calendar manual-event counts now use the same public registration view as the website.
- Public event information, organisation logos, sponsor images, divisions and own entries
  are loaded from existing sources; no registrations or payments were submitted.
- Native UI currently links out for the full published draw viewer, imported player lists,
  galleries/videos and organisation profiles. Full feature parity outside the inspected event is not claimed.

## Cape Town Open parity pass

- SAPA tier context drives hero icons, overview accents, countdown, progress, selected
  controls and team badges. Super Gold resolves to the website’s `#F59E0B`.
- SAPA logo is copied from the website asset. Header typography remains native `ui-rounded`.
- Registration countdown fits the 402pt simulator in a single row with the correct Pay Now state.
- Sponsors show three at a time with a Next sponsors control.
- Overview uses the registered event panel with payment notices, avatar, division cards,
  payment badges and explicit review modals for switch/withdraw. These call the existing
  paystack-refund endpoint only after confirmation. No live mutations were submitted.
- Paid switches requiring a top-up continue on the website; native checkout still depends
  on the previously blocked backend deployment. Do not claim live payment verification.
- Player teams use the website’s partner deduplication and an unchanged copy of
  `src/utils/playerRankingSelection.js`, preserved under `src/lib/website/`.
- Simulator confirmed division team counts 10 / 6 / 4 / 2 / 1, leading totals 5,474 and
  4,295, and both men’s and women’s Top Seeds. Tests cover mirrored entries, withdrawn
  partners, division isolation, and missing ranking series.
- Draws, Results and Media tab selections were verified in the simulator against the
  website’s current empty-state headings and descriptions. No fabricated results/media.
- Simulator screenshots checked hero/countdown, overview panel, player rows and Top Seeds.

Typography preference: avoid unnecessary bold. Player names and point badges use regular
weight; section titles, totals and selected controls use medium. Inactive tabs use regular.
Reserve bold emphasis for the main event heading and concise hero statistics.

## Accordion content and embedded map

- Tournament Details preserves website HTML paragraphs and lists in full-width native
  text instead of flattening them into a narrow right-hand column. About, points,
  rules, sanctioning, and withdrawal content share the same native rich-text renderer.
- Restored conditional Points Breakdown, Rules & Regulations, Sanctioning Details,
  Weather Forecast and Withdrawal & Substitution sections from EventDetails.jsx.
  Prize Money now follows the website's total/breakdown visibility rules.
- Contact uses text links; sponsor tiles include the organisation and poster actions.
- Location uses a 220pt native Apple Maps view, with venue-address geocoding and marker.
  No user-location permission is requested; Directions retains the website's address query.
- Weather follows the website's Open-Meteo city lookup and forecast-day selection.
- Installed Expo SDK 57 maps/location modules, linked pods, built a signed simulator
  binary, and installed it without clearing the account or keychain.
- TypeScript and the existing 13 tests passed. Simulator confirmed formatted cut-off
  paragraphs and loaded weather data. Native-map visual verification is recorded below.

Accordion typography: headings, field labels, field values, entry cards, player rows
and published rich text all use regular 400 weight. Do not reintroduce medium/bold
for routine labels. Event Information tier/back-draw/scoring use award-outline icons.

Verified the rebuilt simulator's Location section exposes the Arturf Padel Arena marker
and renders native map tiles. Map appearance is light to match the website's content area.

## Event bottom navigation

- Calendar list and event details now share a nested native stack inside the Calendar tab.
  Public `/calendar` and `/events/:id` links are preserved; only the internal route group changed.
- Existing native bottom tabs stay visible on event details. Details use the shared drawer
  and tab-safe scroll padding. Registration/payment remains on the root stack without tabs.
- Verified the Legends JHB event deep link shows all five native tabs and Back returns to
  Calendar. TypeScript passes after updating internal calendar destinations.

### Native rankings — 7 September 2026
- Replaced the Rankings placeholder using website Rankings.jsx and RankingDetailsModal.jsx: hero asset, organisation/category filters, search, top-ten carousel, paginated standings, points overview and player details.
- Copied the website's five SAPA tier point structures into src/lib/website/ranking-tiers.ts. Regular font weights retained for routine text.
- Ranking details use current RankedIn counted/all points endpoints, tournament results and profile photos. Search preserves actual standings, including tied ranks.
- Empty cached standings now trigger a live read. Both website and app initially received an empty cache while the live SAPA API returned players. Verified Grand Tour ID 16482 (website selector's historical 11706 disagrees with its category configuration and sync).
- iOS simulator verified SAPA men and women, live player detail totals and Best 8, and overview content. Grand Tour public API verified. Typecheck and all 16 tests passed, including empty-cache and malformed-response regressions.
