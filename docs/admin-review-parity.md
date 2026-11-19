# New Admin action verification

The original New Admin pages, sidebars, dialogs and drawers are the visual baseline. Current Admin behavior is the functional reference. Review the original designs on the dedicated review build and compare live behavior through current Admin. Use synthetic accounts and records when a control changes money, access, published content or messages.

## How to verify each action

1. Identify the equivalent action and the role that can use it in current Admin.
2. In New Admin, open the same record through the workspace, a direct link and the workspace search where applicable. Check that navigation, back, close and cancel preserve the selected scope.
3. Open the control as an authorised user. Check the normal path, an invalid or missing value, server rejection and retries. Check that the visible outcome agrees with the saved record.
4. Repeat with an unrelated tenant, a missing permission, and access revoked while the record is open. Confirm that guarded actions make no unrelated record request or write.
5. Record the fixture or manual scenario and the commit that added it. Leave actions with unverified hosted dependencies open.

## Coverage in the draft

| Workspace | Covered actions and outcomes | Evidence and open work |
| --- | --- | --- |
| Dashboard and navigation | Sign in, permission verification, authorised sidebar and search, scope-bound links, reload, notifications and event creation choices | `tests/adminReviewAccess.test.mjs`. Integrated shell click-through in progress |
| Event Manager | Event scoping, event and division navigation, staff pending registration, Paystack payment link, player replacement, group movement and qualification, private draw rehearsal | `tests/adminDesignEvents*.test.mjs`. Compare all native draw workflows and RankedIn bulk sync |
| Registrations | Selection, CSV, add, open selected registration, real saved-payment link, scoped record lookup | `tests/adminDesignEvents*.test.mjs`. Audit every existing registration subpanel |
| Calendar | Org/club and explicit event assignments, full/quick creation through original editors, Bronze, visibility, Event Manager flag, event deletion, scoped refresh, bulk import and refresh of past public results | `tests/adminDesignEvents*.test.mjs`. Event duplication remains open |
| Tournament Manager | Existing dedicated draw, schedule, results and access panels, event and division linking, server scope verification | `tests/adminDesignEventsBrowser.test.mjs` verifies exact-event division links, publish and score actions |
| Messaging | Event and player conversations, list and channel selection, publish review, tenant denial, revocation | `tests/adminDesignCommunications.test.mjs`, current Messaging lifecycle tests |
| Help requests | Queue and thread, scoped event link, reply and ticket lifecycle, access rechecks | `tests/adminDesignCommunications.test.mjs`, current Help pagination tests |
| Integrations and Audit log | Service workspace links, event audit filtering, record details and permission-scoped reads | `tests/adminDesignAudit.test.mjs` |
| Account Security | Setup, verify, backup, remove, assisted recovery and history with separate role checks | `tests/accountSecurity.test.mjs`, `tests/adminDesignCommunications.test.mjs` |
| Finance reports | Event settlements, scoped finance read, exports, user ledger and reviewed record deletion | `tests/adminDesignMoney*.test.mjs`. Per-event calculations use the current shared settlement logic |
| Payments | Gateway history and filters, Excel, reviewed single and bulk verification of saved event checkouts, held access for tenants | `tests/adminDesignMoney*.test.mjs`. Orphan backfill and direct metadata correction need a server workflow |
| Payouts | Scoped banking, request, review, verification, reveal/hide, mark paid, history and event deep link | `tests/adminDesignMoney*.test.mjs`. Existing server limits and role checks remain applicable |
| Licences | Register and filters, temporary sales, sales/cohorts and export, grant/revoke/restore, price and year management | `tests/adminDesignMoney*.test.mjs` |
| Players | Directory and profile drawer, account actions gated by role, verified reset email and reviewed profile deletion | `tests/adminDesignPlayerActions.test.mjs`. Current browser email override for Test login needs a server-authorised replacement |
| Clubs | Own-club directory, drawer and exports, platform visibility, existing club profile and media tools | `tests/adminDesignNetwork.test.mjs`. claims, member invites and club group administration under review |
| Organisations and Federations | Scoped profile, organisation application decisions, linked event sanction and field-only amendment review | `tests/adminDesignEntityDecisions.test.mjs`. Multi-table amendments and membership and relationship mutations remain open |
| Coaches | Directory and filters, profile and media, status charts and reviewed deletion | `tests/adminDesignGalleryCoaches.test.mjs` |
| Gallery | Album and photo editing, upload, cover, publish, hide, bulk selection and removal | `tests/adminDesignGallery*.test.mjs`. Album records and owned-file cleanup follow existing storage policy |
| Push broadcast | Audience and destination, self-test, review, history, queued send and idempotent retry | `tests/adminDesignBroadcast.test.mjs` |
| Email broadcast | Audience, original review, scoped server capability, confirmed batches and retry | `tests/adminDesignBroadcast.test.mjs`, `tests/adminBroadcastAuthority.test.mjs`. Requires checked deployment of the updated email function |
| Blog | Search, paging, public link, create/edit/publish, cover upload and verified delete/cancel | `tests/adminDesignSettingsAndBlog.test.mjs` |
| Settings | Site links and checkout fees, per-fee preview, save, reload and permission revocation | `tests/adminDesignSettingsAndBlog.test.mjs` |
| Access and permissions | Direct role/module and record access review, create/edit/revoke, stale record checks | `tests/adminDesignAccessWrites.test.mjs`. Individual event-action rules remain local proposals pending server support |

## Release evidence

The linked review URL continues to serve the restored original deployment during this draft. Promote a candidate only after checking its actual source revision, the repository gate, authenticated review navigation, and the remaining actions above. Record the deployed revision and any separate server dependencies. Keep real money movement, account changes and audience sends outside automated checks.
