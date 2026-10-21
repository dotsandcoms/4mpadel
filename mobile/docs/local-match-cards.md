# Upcoming local match cards

The user's Live now screenshot is the build target for horizontal snapping, a preview of the next card, circular previous/next controls and a current/total counter. The existing 4M local-player cards supply the blue identity; player profiles supply real portraits and country flags. Refero's bundled image, typography and touch guidance informs reserved portrait dimensions, clear hierarchy and 44-point controls.

Cards use a blue tournament/date header, a white two-team matchup with a VS divider, a compact court/location block and followed-player links. The blue portrait ring and heart mark followed players. All named participants can link to a unique approved local profile. Missing or failed photos show initials; ambiguous names receive no borrowed portrait or profile link; country flags can still come from an explicit published country code. No nationality is inferred from the event location.

The Home player directory is reused for media, including opponents. No new Padel API call is needed for portraits or flags. Published upcoming matches keep their existing cache and concurrency limits; the carousel displays every merged fixture and hides controls for a single match. Collapsing the section and retry/partial-error states are preserved.

Validation includes the approved-name/media resolver, shared-fixture deduplication and concurrency checks in `scripts/test-followed-local-matches.cjs`, the mobile typecheck and rendered carousel checks at narrow/mobile widths.

The user explicitly designated Upcoming 4M matches as app-only on 8 October. The temporary website Home integration and its dedicated files were removed from both the working checkout and the production release. The mobile carousel is retained.

Rendered verification used an isolated fixture preview of the actual native JSX through React Native Web and the actual website carousel, with preview-only image/icon/router adapters. Checked 320px and 390px layouts, single/multiple fixtures, forward/back boundaries, counter updates on horizontal scroll, next-card peek, and the approved profile callback. This is component preview coverage; it does not claim a signed iPhone install was tested. Three of the four players in the supplied fixture have no approved photo; those keep initials.

Validation: eight native data/presentation tests, `npm run typecheck`, website cached-fixture checks (SAST date parsing, deduplication, chronological order, and stale exclusion), and the isolated website production build.

Website production: `dpl_3dS2LSWxwUL7MoBgT9eW1CMGaLPH` reached READY and was aliased to `https://4mpadel.co.za`. Public Home, JS and CSS returned HTTP 200; the served bundle includes the card, carousel controls, portraits and saved-fixture reads. No new signed iPhone build was started for this UI request.

App-only website removal: `dpl_9oHgSvpHn2wzDgKAJT8ucM2hewa9` is READY at `https://4mpadel.co.za`. The public Home and bundle returned HTTP 200, and the served bundle contains no Upcoming 4M matches label, local-match card class, or local carousel controls. The public Home layout was visually inspected.
