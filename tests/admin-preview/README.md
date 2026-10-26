# Players review checkpoint

## Scope and reference lock

First module in the requested Players → Calendar → Event Manager → Finance sequence.
The existing `PlayerManager.jsx` and `AdminPlayerProfileModal.jsx` define the field,
licence, visibility and relationship requirements. The user's screenshots define
event-team presentation. Preserve the preview's light surfaces, dark navigation,
compact tables and side drawers; use lime for full-membership metrics, cyan for
temporary licences, emerald for paid/valid event status, amber for unpaid states,
and red for destructive actions. Real `image_url` assets are used without inventing
player photos. This is an existing-product reference lock, not a new visual theme.

## Implemented

- Players dashboard: total/full/temporary/unpaid, region, category, gender,
  registration-month breakdowns, visibility and successful full-licence purchases.
- Directory: search, licence/visibility/region/category filters, sorting, 50-row
  pagination, persistent URL state, real photo slots and broken-image fallbacks.
- Drawer: all profile/contact/on-court fields from the reference, event entries,
  both team members, payment source, event-specific licences and linked payments.
- Existing registration “view player” actions now route into the Players workspace.
- Filtered Excel workbook with Players and Temporary licences sheets.
- Demo-only add/edit, photo preview, licence assignment, invite and delete dialogs.
  Password reset and impersonation explain that they are disabled; they do not
  collect credentials or change the current session.
- Sidebar routes now derive their workspace from the URL, including after reload.

## Data safety

`playersData.js` is a SELECT-only boundary. No inserts, updates, deletes, RPCs,
edge-function calls, email sends, impersonation or storage uploads are used.
Private data requires a real session and Players admin permission. No service key
or authentication bypass is used to retrieve private records. The directory reads
all accessible pages, respecting row-level permissions. Read errors are not
converted into sample data or zero balances. Duplicate partner identities are not
guessed. The separate QA page injects an in-memory read client; it is not linked
from the app and is not a production build entry.

## Verification

Run `node --test tests/admin-preview/playersData.test.mjs` (10 tests).
Run ESLint on `src/pages/AdminPreview.jsx`, `src/pages/admin-preview/`, and the QA entry.
Run `npm run build`.

Synthetic browser harness: `/tests/admin-preview/players-qa.html`.
Browser-checked: dashboard; directory search; 50/50/5 pagination; filtered export;
profile → team → partner drill-through; temporary licence details; nested assignment
confirmation; Escape/focus restoration; desktop and 390px responsive drawer.
Corrected the native dialog's default max-width that left a mobile gutter.

## Required before real-data sign-off

The local `/admin` is signed out in the in-app browser. Sign in there, then review
`/admin-preview/players?preview-live=1`. Authenticated field/schema/row-count parity,
real player photos, and the shared-payment matches still need live verification.
Do not describe this checkpoint as fully verified against private records yet.

Calendar, Event Manager and Finance have not been completed in this checkpoint.
Existing event-preview finance snapshots still need their own data-parity audit;
fabricated per-player licence/payment-source assignments were removed, and
unavailable public payment amounts now say “Not available”.
