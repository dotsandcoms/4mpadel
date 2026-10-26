# Native player directory

Design target: the existing 4M native light theme and the website Players directory's search → filter → profile flow. Refero tools were unavailable; the existing product screens, website source, and bundled craft reference supplied the design target.

| Decision | Reference | Purpose |
| --- | --- | --- |
| Light canvas, white bordered rows, dark green text | Native profile and event screenshots; lightBrand | Preserve the app's visual language and readable contrast |
| Search, category and club filters | Website Players page | Keep the directory's discovery tools |
| Native action sheets / searchable club sheet | Existing SelectField | Large touch targets and consistent selection behavior |
| Virtualized list, fixed-size portraits | Refero craft-details performance/image guidance | Support a full directory without rendering thousands of rows |
| Profile overview, rankings/results, matches and gallery | Website PlayerModal | Keep player exploration in the app |
| Only published ranks; missing rank says Unranked | Public player data | Avoid presenting alphabetical position as sporting rank |

Routes: `/players` and `/players/[id]`. The drawer and `openSitePath('/players?id=…')` use native navigation. Public website URLs remain the share destination. No backend schema change is required.

Data comes from explicit columns on `players_public`, with stable name/id pagination beyond the 1,000-row cap. Private email, contact number and identity fields are not requested. Public detail loading uses one player ID. Optional published matches reuse the existing RankedIn reader; no player follows or messaging are introduced.

Verification: `scripts/test-players.cjs` tests combined filters, published-rank formatting, legacy sponsor/gallery data, pagination, fetch errors and native link routing. Rendered directory/profile screenshots are checked against the existing light app.

## Validation

The full 94-test suite passed, followed by an additional passing selected-profile regression (95 total tests available). TypeScript passed after final native header styling. The simulator loaded 1,605 public directory records and Warren Kuhn's profile. Screenshots verified directory rows, profile overview and expanded SAPA ranking results with readable light-theme contrast. The temporary ranking preview was restored after capture and was not part of the uploaded build. Native touch gestures/share-sheet presentation still need a physical-device check.

Build 7 (`25cefbec-dfce-4ddc-9d8d-c7da4c9ebd88`) completed successfully. IPA downloaded to `/tmp/4m-ui-build7.ipa`. Installation attempted but CoreDevice reported the registered iPhone unavailable; physical installation is pending reconnection.

### Profile polish (awaiting next app build)
Reference lock: the website PlayerModal and supplied score/points/Instagram screenshots define the content and match-card hierarchy. Preserve the app's light palette, readable dark-green accents, 44pt controls, and native navigation. The Refero typography reference informs distinct labels, values, and body text; no live Refero tools were available.

- Overview uses icon-led club, region, nationality and racket tiles, a separate bio and sponsor chips.
- Form shows public `skill_rating` and `match_form` (up to five validated W/L values), matching the website's source. Missing data gets an explicit empty state.
- Ranking result gains use +234 PTS, while totals remain unsigned; negative and missing values retain their meaning.
- Match cards use two teams around VS, highlight published winners, and show a separate score row without inferring a winner from a partial score.
- Instagram is shown only for a valid Instagram handle/profile URL, using the public `instagram_link` field.

Validation: TypeScript and all nine player tests passed. The existing simulator rendered the new Form tab. Automated native tab interaction was unavailable (Device Hub accessibility timeout), so complete Overview/Matches visual checks on device remain outstanding. No EAS build was started.

The skill ring now uses two clipped native semicircles animated with Reanimated on the UI thread. It fills clockwise from zero over 1.1 seconds on Form mount, eases to the published rating, and keeps the numeric label steady. Reduce Motion displays the final fill immediately. This replaces the SVG image to avoid image-load flashing. TypeScript passed; no EAS build started.
