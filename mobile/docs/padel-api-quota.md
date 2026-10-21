# Shared international data and quota controls

The app, website, scheduled snapshots and Following worker share a service-only Postgres cache and one upstream request budget. User devices never receive the provider credential. The website calls an authenticated private edge gateway with its existing server credential; a database admin key is not needed on Vercel.

The provider documents 60 requests/minute, 4,000/day and 50,000/month on Plus/Pro: https://padelapi.org/docs. The dashboard's Last 24h quota is rolling. Retry-After is the next permitted retry, not proof that all quotas reset to zero.

The configured internal caps are 45 requests in a rolling minute, 1,400 in a rolling 24h and 42,000 in a rolling 30 days. Every cache miss reserves a request atomically before contacting Padel API. The database also leases each resource, so concurrent cold requests from different functions share a single fetch. Request failures still count. Query order, live-list page 1 and name batch ordering are canonicalized. POST bodies are hashed; secrets are excluded from cache keys.

Every provider response records X-RateLimit-Limit and X-RateLimit-Remaining. At five or fewer remaining calls, new upstream traffic pauses. A 429 extends the shared Retry-After deadline. When the cache database is unavailable, callers cannot bypass the budget. There is no retry loop that floods the provider.

| Data | Shared expiry |
| --- | --- |
| Live list and match point feed | 2 minutes |
| Match details | 5 minutes |
| Tournament match pages | 10 minutes |
| Tournament/season directory | 6 hours |
| Player/pair match history | 6 hours |
| Player metadata | 24 hours |
| Completed match | 7 days |

Rendering a match in the app reads countries from the cached player index instead of querying /api/players for every card. Live checks run once per shared cache window, independently of the number of subscribers.

During refresh failures or budget pauses, existing dated data can be served for up to seven days. Responses include their original fetched time and an explicit stale marker. Updated clients display Saved update. Snapshot refreshes preserve the previous document and timestamp. Following collection and match-start pushes reject stale responses. A scheduled start time alone never generates a live alert.

Cold resources without saved data return an unavailable state when the budget is paused; the caps trade refresh frequency and new-resource availability for predictable cost. These controls cover calls made through this application. External scripts or other consumers of the same provider token can still consume its quota. Padel API's minute headers do not report daily/monthly totals; the app maintains its own ledger and the provider dashboard remains the account-wide usage source.

## Official FIP coverage

Padel API does not guarantee FIP Promises or Bronze live scores. One daily official FIP calendar fetch supplies event names, dates, locations, artwork and official links. A public Storage snapshot serves all viewers without spending provider quota. It currently contains 165 Promises and 138 Bronze events for 2026. No scores or match data are inferred.

Source: https://www.padelfip.com/calendar/?events-year=2026. The parser validates dates and official event links, rejects changed/empty markup and preserves the last good snapshot. The app exposes a FIP Promises season, Bronze events in the FIP Tour calendar and a Home rail. App cards open a native event centre; the website retains official event links.

The authenticated `fip-tournament` gateway resolves negative event IDs from that calendar, never from a client-supplied URL. A service-only shared cache stores whitelisted tournament facts, published draw documents, daily order-of-play PDFs and structured brackets when FIP supplies them. Current default HTML divisions are named explicitly (for example Men · Main draw); PDF-only divisions retain the official documents, without invented live scores or start times.

Event refreshes are leased across users and capped at 12 upstream page reads per minute. Expiry is 15 minutes during an event, six hours before it and seven days after it. Failed refreshes retain the previous payload and timestamp and back off for five minutes. Cold simultaneous readers see a refreshing state with three bounded retries, rather than false "not published" messaging. The concurrency test verifies 2,000 readers cause one FIP request. These official FIP reads do not use Padel API or its quota.

Published PDFs open in native PDFKit/Pdfium views inside the iOS/Android app, with pinch-to-zoom and a 15-minute local document cache. No FIP website or browser login is opened. The viewer adds native modules and requires a new signed build; it is unavailable in Expo Go and the currently installed preview. Source coverage was verified with Bandung Promises (ten draws, two schedules), Copenhagen Bronze (31 main-draw matches) and completed Agadir Bronze (31 results).

Deployed 8 October 2026: `fip-tournament` v2 and the shared cache migration. An authenticated temporary QA account successfully read four real events; the repeat used the original cache timestamp and total upstream budget remained four. Unsigned access returned 401. The QA account was deleted afterwards. All 303 mobile regression tests, type checking, Deno checking, native-module resolution for both platforms and iOS JavaScript export passed. Local browser preview was blocked by the in-app browser (`ERR_BLOCKED_BY_CLIENT`); no browser-layout screenshot was verified in that pass.

PDF follow-up, 8 October 2026: reproduced Expo Router's `ErrorBoundary` error when an older development binary evaluated a route that statically imported the missing native PDF library. The viewer now checks native availability before importing that library and contains render failures inside the document screen. Older binaries display **App update required** rather than crashing. The rebuilt iOS 27 simulator successfully rendered the actual Bandung Promises Boys U12 and Copenhagen Bronze main-draw PDFs, and returned to the document list successfully. Verification used a temporary public-document harness, removed before the signed build upload. All 306 regression tests and TypeScript passed. Physical-phone pinch gestures and Android native rendering remain to be checked.

Signed iPhone preview **1.0.0 (29)** completed successfully on 8 October 2026: https://expo.dev/accounts/fourm-padel/projects/4m-padel/builds/4865f4c1-97c2-4047-9ef2-f61024df918a. Includes the native FIP event centre, PDF viewer and crash guard. Install over the existing phone app for testing; physical installation is not verified here. Expo's npm 10.9.8 clean install passed after retaining the Apple-targets package's nested TypeScript 5.9.3 peer alongside the app's TypeScript 6.0.3.

## Verification and deployment

- The JavaScript concurrency test simulates 2,000 cold app/web viewers and observes one upstream fetch.
- The rolled-back database test checks 2,000 claims, request leases, all three budgets, cache expiry and private privileges.
- Gateway tests cover custom authentication, allowed provider resources, query/body limits and preservation of freshness metadata.
- Mobile type checking, focused website API tests and Deno checks pass.
- Live website/gateway reads of an existing player use the same cache timestamp without adding an upstream ledger entry.

Backend protection applies to installed clients immediately. New Home labels and official FIP UI require an updated app build. The website release is prepared from production commit 303cb2c4aa792d959617fa549d45a28fe734fb9e with the focused international-padel files overlaid, preserving unrelated in-progress workspace work.

Deployed 8 October 2026: private provider gateway v1, mobile explore v13, push worker v12 and snapshot refresh v7. The live website is deployment dpl_CFCTq69omjSDpQhPs7jJgASCaXmS at https://4mpadel.co.za/pro/calendar. Its Promises filter shows 34 upcoming events. Signed iPhone preview 1.0.0 (27) finished successfully: https://expo.dev/accounts/fourm-padel/projects/4m-padel/builds/65a459d7-1308-4431-85ef-13eca3a191ca. Device Hub runs the new JS bundle and is at sign-in; authenticated Home visual checks need an existing account session. Metro uses localhost:8082 with IPv4 DNS preference to match Expo's advertised simulator address.
