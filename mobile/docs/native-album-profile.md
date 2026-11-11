# Native event albums and Player Gallery — 9 November 2026

The event Media card follows the approved Home/Clubs direction: real album cover,
quiet white surface, system typography and a blue native Open gallery action.
The prior event-tier orange button and forced website navigation are removed.
Unslop by Damir Sokolovsky ([@heydamir](https://x.com/heydamir)), CC BY 4.0,
informs this continuation of the existing visual direction.

## Album navigation and credits

- Event Media opens `/media/[id]` directly with the canonical album UUID. Website
  `/gallery/:id-or-slug` and `/media/:id-or-slug` links also use the native library.
- Slugs resolve to an active album before querying child albums/photos. UUID loads
  remain parallel; photo pages remain bounded to sixty images.
- Existing subalbums, photo viewer, paging, captions and highlights are retained.
- A saved photographer Instagram handle or official HTTPS profile URL makes the
  credit an accessible Instagram link. Arbitrary hosts, credentials, non-HTTPS
  schemes and post/account-action paths are rejected. Missing accounts stay plain.
- Instagram failures use the app banner. The operating system opens the approved
  HTTPS profile URL in the installed app or its normal browser handler.

## Save an album photo to a profile

Open a photo and choose **Add to my profile**. The native SwiftUI/Compose action
shows saved/full/busy states and the current count. The destination is explicitly
the publicly visible Player Gallery, separate from the avatar.

The gallery limit is fifteen in mobile phone uploads, native album saves, the
website profile and the admin profile editor. All visible counters and controls
use the relevant shared app constant. Existing profile galleries remain intact.

Album saving:

1. Gets the authenticated account from Supabase Auth. No target player ID or
   arbitrary image URL is accepted from the UI.
2. Resolves the requested photo inside the requested active album, retaining the
   existing session/RLS and canonical original image URL. No extra upload/download
   or duplicate storage object is created.
3. Reads only this account's player ID and gallery. Duplicates are no-ops, including
   when full. A new photo cannot fill a sixteenth slot through this action.
4. Rechecks the account before writing only `additional_images`, with ID/email
   filters and the existing database policies.
5. Compares the saved JSONB gallery value to its read value. Concurrent edits are
   re-read up to three times rather than overwritten. Both legacy JSON arrays and
   JSON-encoded strings are supported.

The existing backend access contract is unchanged. Fifteen is the application
gallery rule; this change does not add a new database-level cardinality constraint.
Profile refresh-on-focus picks up newly saved gallery images. No new table, policy,
RPC, privileged client key or migration was introduced.

## Validation

- TypeScript and all 707 mobile tests pass, including duplicate/limit boundaries,
  concurrent last-slot edits, session changes, unpublished/foreign album rejection,
  canonical native navigation, failed saves and safe Instagram links.
- The website production build and four admin profile data tests pass.
- Read-only database checks confirmed player RLS, the original gallery formats,
  Adidas cover/subalbums and saved Instagram account.
- iOS simulator review confirmed native Adidas album navigation, subalbums/photos,
  and the native Add to my profile control with the actual account's gallery count.
  No test photo was published to the user's profile during verification.
- The final preview-card styling, inline Home flag/ranking row, real save and
  Instagram handoff need the user's visual review; concurrent simulator navigation
  prevented a stable final pass. Android device review is also outstanding.

Source changes are local; website/mobile distribution is not deployed by this work.
