# Player result freshness

## Confirmed cause on 21 October 2026

Adam Van Harte (public player 293, RankedIn R000258011) had 14,320 headline
points but a saved SAPA Main breakdown totalling 12,620. The latest confirmed
[interday run](https://github.com/dotsandcoms/4mpadel/actions/runs/39534233872)
updated the flat player points without updating `players.rankings[].details`.
The [profile scraper](https://github.com/dotsandcoms/4mpadel/actions/runs/39392523262)
had successfully processed Adam on 20 October at 14:12 UTC, using the previous
ranking edition. The separate
[daily repair](https://github.com/dotsandcoms/4mpadel/actions/runs/39401560033)
could also overwrite ranking rows without their participant IDs; its run was
green despite one recorded per-player failure.

The six-hour points cache was timestamped 21 October 05:39 UTC, before the
provider's current edition was modified at 05:57 UTC. A fresh cache timestamp
therefore did not mean the latest provider results. Both its counted list and
the saved profile list omitted the Nationals from counted points, while All
already included the event.

The trophy cabinet read saved counted results, so wins could disappear when
they fell outside Best 8. Calendar rows 469 and 550 also represented the same
Cape Town Open (RankedIn 74466), with `Super Gold` and `None` classifications;
the first duplicate selected by the client could incorrectly produce Other.

## Local changes

- Native Best 8 and All request current provider results, paginate full history
  and share concurrent requests without reusing the six-hour results cache.
- Best 8 retains RankedIn's newest-first display order. It does not reorder the
  counted results by points: Adam's 20 September Cape Town Open appears second,
  after Nationals and before the 16 August Pretoria Major.
- The profile summary and SAPA ranking expansion use the provider's total/rank
  from that counted edition. Totals are not inferred by adding event values.
- Result views refresh when opened, when returning to the foreground and every
  five minutes while visible. They stop polling when inactive. A failed fetch
  explicitly identifies saved data or offers a retry.
- Trophies use full published histories, deduplicate provider tournament IDs
  across organisations, exclude team leagues and prefer a known calendar tier
  over an unclassified duplicate. Missing participant IDs are recovered only by
  exact public RankedIn identity within the same organisation/category.
- The interday script now updates preferred headline points and their saved
  results in one player write. Changed points, ranking edition or participant
  identity trigger a refresh; unchanged snapshots expire after six hours.
  Both counted/All cache URLs are invalidated on that refresh. Provider failures
  preserve the previous player snapshot and make the job fail visibly.
- The workflow adds hourly SAPA Men/Women Main refreshes while retaining broader
  category discovery every six hours. GitHub scheduled runs can start late;
  the native client refresh is independent of that schedule.
- The daily repair retains participant IDs, preserves existing results when
  explicitly run with `--skip-details`, and reports partial failures with a
  failing exit code instead of silently replacing failed lookups with empty lists.

These changes do not alter RankedIn's publishing schedule. Other organisation
snapshots still use the existing broader/daily jobs; the native trophy cabinet
reads their current published results directly.

## Verification and release status

Read-only execution of the actual native data functions returned eight counted
results totalling 14,320, eighteen All results and five distinct tournament wins:
3 Major, 1 Super Gold and 1 Gold. The Nationals is included in Best 8 and Major.
Evidence: `release/rankings-freshness-2026-10-21/live-adam-verification.json`.

Run `npm run check` in mobile and
`node --test tests/rankedinResultsSync.test.mjs` from the repository root.
The sync regression tests exercise the real script functions with mocked
provider/database adapters; they do not mutate production data.

Background scripts/workflow are changed locally. No production repair was run,
no GitHub push was made and no store build was uploaded. The user must finish
the Android/iPhone simulator walkthroughs before publishing. After the approved
GitHub push, verify the first workflow run and the saved primary breakdowns.
