# Native club discovery

## Reference and direction

Product: help 4M players choose a club and get to its courts on iOS and Android.
Character: sporting, direct, grounded.
World: real courts, venue photography and the club community.
Moments: a swipeable venue gallery and current Google reviews with real author identities.
Signature: native actions alongside a compact, source-labelled club identity.

The dominant reference is the approved 4M Home design system. The user’s club screenshots identify the density problem; the live [KCC website page](https://4mpadel.co.za/clubs/10by20-kcc) supplies the content and flow. Refero’s bundled craft reference informs fixed image dimensions, touch targets and state handling; no live Refero tools were available. Unslop by Damir Sokolovsky ([heydamir](https://x.com/heydamir)), CC BY 4.0, supplies the audit and nine-pass process. No generated imagery is used.

## Audit and decisions

- Repeated large white panels gave address, rating and controls equal weight. Use a 208-point image rail, one club identity and a compact action row; lower details become quiet expandable rows.
- The standalone rating panel used an older database snapshot (KCC 5.0 / 8), while the website requested current Google details (4.8 / 12 during verification). Show current provider values when returned; do not present saved values as live after failure.
- Photos and reviews were missing even when the website had them. Fetch the linked Google listing on demand and display photos, full review text on expansion, author attribution and source links.
- Literal name matching treated “Netset” and “Net Set” differently and ignored the group. Reuse one normalized, group-aware search in Find clubs and global search. Both spellings return the six published Net Set branches.
- Oversized location introduction delayed results. Use a compact Near me action with optional native permission, radius controls after a successful fix, and manual search throughout.

Spacing uses 4-point steps and 12/16-point grouping; colour remains the existing light neutral/forest-green system. Platform symbols and native SwiftUI/Compose buttons carry actions. Copy names real actions and sources. Type uses system text at 12–24 points with limited weights. Layout leads with actual venue photography and keeps details expandable. Photo pages retain their aspect ratio in the full-screen viewer, with native previous/next buttons as well as horizontal paging. Motion is limited to navigation, paging and modal presentation.

## Data and navigation

- The public club catalog and groups use `published`, `4m_approved`, `4m_premium` filters, explicit projections, server pagination and five-minute memory caches. Pull to refresh bypasses both caches.
- Public group names and short names participate in venue search. Group-level logo/website inheritance respects the website’s sharing switches. Groups open native branch lists; branches open native club detail.
- Detail uses published business contacts, booking/social links, about text, gallery, courts, facilities/cafe, weekly hours and group links where populated. Empty court counts are not presented as a real zero-court venue.
- Related events use the same venue-name association and latest 200 public calendar rows as the website. The UI says “recent calendar,” not all-time history. Related content loads independently of the club identity.
- Community count reads `players_public` with a head/count query. Public team roles use `club_members_public` and only public player name/photo/id. Approved coaches use the website’s location match and explicit directory fields, without application or contact fields. Coach profile links are labelled; club navigation stays native.
- Stored club fields remain usable when optional Google or related content fails. Failures have a visible banner and retry action. No private registrations, player contacts, moderation data or service-role reads are added.

## Live Google connection

`native-club-places` v1 was deployed to project `uzglrpbixubfijvjbtgz` on 9 November 2026. It validates `Auth.getUser`, reads the selected public club through the caller’s existing RLS, and resolves the stored Place ID itself. The request accepts a club slug, never an arbitrary provider URL, place ID or field list. It uses the existing server-side `GOOGLE_MAPS_API_KEY`; there is no Google secret or service-role key in the app.

The gateway requests current rating/count, up to five relevant reviews, up to six photos, website/phone, opening hours/status and listing link. Photo redirects are resolved on the server and restricted to Google media hosts; key-bearing URLs and raw photo references never reach the app. Returned content has source/author links and is rendered as text, without executable HTML.

Requests use timeouts, bounded photo fanout and an isolate-local limit of eight requests per authenticated account per minute. Simultaneous requests for the same club share only the in-flight operation. **This is not a distributed quota or global spend cap.** Google project quotas remain the operational cost control. No background polling or Google fetches for every directory row are introduced.

Google content is requested per visit, returned with `Cache-Control: no-store`, held only for the current screen and never written to 4M tables/storage/analytics. Google photos and review avatars disable Expo Image caching. Google photo/review attributions stay visible and linkable. The UI labels the provider’s limited review selection “Most relevant reviews”; the full listing opens through View on Google.

References checked: [Google Place Details](https://developers.google.com/maps/documentation/places/web-service/legacy/details), [Place Photos](https://developers.google.com/maps/documentation/places/web-service/legacy/photos), [attribution/data handling](https://developers.google.com/maps/documentation/places/web-service/policies), [Supabase function authentication](https://supabase.com/docs/guides/functions/auth), [Expo SDK 57 location](https://docs.expo.dev/versions/v57.0.0/sdk/location/).

## Location

Near me requests foreground access only after a user tap, then takes one balanced-accuracy fix with a 12-second bound. Coordinates stay in screen state, are not uploaded and are not included in Google listing requests. No background tracking is enabled. Returning from phone Settings refreshes the action’s permission state without automatically taking a fix.

The simulator’s permission was reset to “Ask Next Time Or When I Share” after verification, so the next Near me tap can show the native dialog. The simulator did not provide a usable GPS fix in this session; manual browsing and the timeout outcome were verified. Real-device GPS and Android visual testing remain to be done.

## Validation

- TypeScript and all 660 mobile tests passed. New coverage includes group/name normalization, public projections, inherited identity, unsafe links, approved coaches/public team records, standalone temporary-licence rejection and preserved legacy verification.
- Google gateway tests cover authentication, private/missing clubs, server-derived Place ID, key/reference redaction, provider failures, redirect host restrictions, photo/review bounds, rate limiting, fresh sequential visits and in-flight sharing.
- Hosted unsigned POST returns HTTP 401. Signed-in simulator verification shows KCC’s five Google photos, current 4.8 rating / 12 reviews, review authors/text, Open now, four linked events and public community count. Full-screen Next changes image and attribution correctly.
- Simulator checks also covered nine native club groups, Net Set’s six venues, annual-only licence purchase UI and filled followed-player hearts. No payment or follow mutation was performed.
