# SAPA summary identity — 9 November 2026

All national player summary ranks/points resolve together from SAPA ranking 15809,
Men-Main (ranking type 3, age group 82) or Women-Main (type 4, age group 83), doubles.
`src/lib/sapa-main-ranking.ts` is the shared read projection. A player's editable
active/preferred ranking and bare `players.points` / `rank_label` are not national
summary evidence.

- Explicit profile gender takes precedence over category. With no explicit gender,
  a single unambiguous national main row can resolve the category; two categories
  remain unavailable rather than defaulting to men.
- Conflicting organisation/category/type identifiers, singles, mixed and age groups
  cannot be relabelled as a main doubles row. Legacy JSON and Doubles are supported.
- Unknown/non-finite/negative points remain unavailable. Valid zero stays zero.
- Different duplicate main records remain unavailable. Ambiguous public player names
  supply neither a photo nor another person's rank/points.
- Home, the signed-in profile, public profile summary and registration project the
  same rank/points pair. Home's memory cache uses a new key for this projection.
- Discovery uses its verified national standings and no longer falls back to a
  profile's unrelated points when that player has no matching standing.
- Event player badges and visible team totals use main points. A total with an
  unresolved team member is unavailable, rather than a misleading partial sum.
- Default event team ordering uses main totals. A division's deliberately configured
  seeding ranking still controls its seed order independently of the visible SAPA
  figures. Published draws, registrations and database rankings are not rewritten.
- Explicitly labelled ranking histories, event points awards, league table scores,
  live-match scores and FIP statistics retain their own source and meaning.

The projection reads ranking records already stored in the same player request;
it adds no per-player RankedIn calls. The large player directory continues to use
its existing shared SAPA standings rather than downloading every ranking history.

Validation includes the SA Grand Tour / SAPA main points mix-up, women listed in
both main tables, numeric/string/legacy rows, malformed and contradictory records,
missing/ambiguous team members, default ordering, configured seeding, Home and public
profile reads. Run `npm run check` (includes `scripts/test-sapa-main-ranking.cjs`).
