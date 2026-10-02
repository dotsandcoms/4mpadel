# Account and help

Design target: the user's grouped account/settings reference, with existing 4M typography, page background and royal-blue controls. White rounded groups contain compact icon/title/detail rows. Profile completeness moves from the drawer into the account header; the Profile gear and drawer Account & settings row open `/settings`. Administrative access remains in the drawer.

Settings links to existing profile editing, entries, payments, licence, notification and legal screens. The Profile route accepts `section=events` or `section=payments`. Password reset sends the existing recovery link after an explicit tap/confirmation. Account deletion is a request via support, not an immediate deletion action.

`/help` offers topic-specific guidance, then an optional enquiry. Entry and payment options load from the signed-in user's existing data. Users choose which reference to include. Enquiries open the user's email composer addressed to info@4mpadel.co.za (confirmed by the user). Name/account email, the selected reference and the user's message are visible before handoff. The app never reports that an email was sent; the user sends in their mail app. Missing mail apps show a fallback address and retain the message. No support backend/ticket dashboard is implied.

The website Contact form currently simulates submission; this feature does not use it. No enquiries were sent during validation.

Validation: `npm run check`, including support URL recipient/encoding tests. Interactive mail sending requires a configured email app.
