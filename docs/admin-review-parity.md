# New Admin action verification

The original New Admin pages, sidebars, dialogs and drawers are the visual baseline. Current Admin behavior is the functional reference. Review the original designs on the dedicated review build and compare live behavior through current Admin. Use synthetic accounts and records when a control changes money, access, published content or messages.

[Commit inventory and source comparison](admin-review-commit-audit.md) records all 103 commits from the original design base.

## How to verify each action

1. Identify the equivalent action and the role that can use it in current Admin.
2. In New Admin, open the same record through the workspace, a direct link and the workspace search where applicable. Check that navigation, back, close and cancel preserve the selected scope.
3. Open the control as an authorised user. Check the normal path, an invalid or missing value, server rejection and retries. Check that the visible outcome agrees with the saved record.
4. Repeat with an unrelated tenant, a missing permission, and access revoked while the record is open. Confirm that guarded actions make no unrelated record request or write.
5. Record the fixture or manual scenario and the commit that added it. Leave actions with unverified hosted dependencies open.

## Coverage and open checks

| Workspace | Covered actions and outcomes | Evidence and open work |
| --- | --- | --- |
| Dashboard and navigation | Sign in, permission verification, authorised sidebar and search, scope-bound links, reload, notifications and event creation choices | `tests/adminReviewAccess.test.mjs`. `tests/adminDesignShell.test.mjs` covers signed-in navigation, direct routes, scope change and logout |
| Event Manager | Event scoping, event and division navigation, staff pending registration, Paystack payment link, player replacement, group movement and qualification, Draw Generator and private draft save, Show Bronze events, and private draw rehearsal | `tests/adminDesignEvents*.test.mjs`. Current seeding and reciprocal team fixtures, single/bulk reviewed court setup and manual payment correction also pass on the branch. The branch also connects draw completion and ranking awards. Linked plates, play days, per-division rules and the reviewed automatic schedule are tested in the branch and need the hosted draw migrations. See the [event audit](admin-review-events-audit.md#specialist-draw-and-schedule-actions) |
| Registrations | Selection, CSV, add, open selected registration, real saved-payment link, scoped record lookup | `tests/adminDesignEvents*.test.mjs`. Audit every existing registration subpanel |
| Calendar | Org/club and explicit event assignments, full/quick creation through original editors, Bronze, visibility, Event Manager flag, event deletion, scoped refresh, bulk import and refresh of past public results | `tests/adminDesignEvents*.test.mjs`. Event duplication remains open |
| Tournament Manager | Existing dedicated draw, schedule, results and access panels, event and division linking, server scope verification | `tests/adminDesignEventsBrowser.test.mjs` verifies exact-event division links, publish and score actions |
| Messaging | Event and player conversations, list and channel selection, publish review, tenant denial, revocation | `tests/adminDesignCommunications.test.mjs`, current Messaging lifecycle tests |
| Help requests | Queue and thread, scoped event link, reply and ticket lifecycle, access rechecks | `tests/adminDesignCommunications.test.mjs`, current Help pagination tests |
| Integrations and Audit log | Service workspace links, event audit filtering, record details and permission-scoped reads | `tests/adminDesignAudit.test.mjs` |
| Account Security | Setup, verify, backup, remove, assisted recovery and history with separate role checks | `tests/accountSecurity.test.mjs`, `tests/adminDesignCommunications.test.mjs` |
| Finance reports | Event settlements, scoped finance read, Full Event and Organisers Consolidated Excel workbooks, reconciliation issues, user ledger and reviewed record deletion | `tests/adminDesignMoney*.test.mjs`. `tests/adminDesignEventIncome.test.mjs` and `tests/eventFinanceScreens.test.mjs` verify the shared settlement, both current workbooks, and failures when receipt or refund evidence is incomplete |
| Payments | Gateway history and filters, Excel, reviewed single and bulk verification of saved event checkouts, held access for tenants | `tests/adminDesignMoney*.test.mjs`. Exact saved legacy and event-named mobile Paystack receipts are reconciled in the branch. The branch adds reviewed single/page backfill of verified live receipts with exact allocations or an unallocated cash record. This requires the new backfill migration and Edge function. See the [finance audit](admin-review-money-audit.md#reviewed-paystack-recovery) |
| Payouts | Versioned organisation banking, masked destination, scoped event request with current settlement and limits, MFA, request alert, review, reveal/hide, mark paid/cancel, recorded interim history and direct event link | `tests/adminDesignMoney*.test.mjs`. Requests and processing use current hosted `organisation_banking`. The updated workspace preserves the selected event after banking, request-resolution and recorded-interim actions. Both Event Manager and the organisation profile link into the scoped request view. See the [payout commit trace](admin-review-money-audit.md#organisation-payouts-commit-trace) |
| Licences | Register and filters, temporary sales, sales/cohorts and export, grant/revoke/restore, price and year management | `tests/adminDesignMoney*.test.mjs` |
| Players | Directory and profile drawer, account actions gated by role, verified reset email and reviewed profile deletion | `tests/adminDesignPlayerActions.test.mjs`. Current browser email override for Test login needs a server-authorised replacement |
| Clubs | Own-club directory, drawer and exports, platform visibility, existing club profile and media tools, claims, memberships, invitations, organisation access links, venue group assignment, branding and team access, own-club profile, media and delegated staff/admin membership editing, reviewed club merge and deletion | `tests/adminDesignNetwork.test.mjs`, `tests/adminDesignClubOperations.test.mjs` `tests/adminDesignClubLifecycle.test.mjs` and `tests/adminDesignDelegatedClubMembers.test.mjs`. Merge, deletion and group-wide team changes use the hosted lifecycle and group team migrations |
| Organisations and Federations | Scoped profile and media, organisation application decisions, album and federation relationships, reviewed organisation creation, password-free owner invitation, approval email, member management and deletion, linked event sanction and field-only amendment review | `tests/adminDesignEntityDecisions.test.mjs`. Organisation records require the new migration. Multi-table federation amendments remain open |
| Coaches | Directory and filters, profile and media, status charts and reviewed deletion | `tests/adminDesignGalleryCoaches.test.mjs` |
| Gallery | Album and photo editing, upload, cover, publish, hide, bulk selection and removal | `tests/adminDesignGallery*.test.mjs`. Confirmed photo removal cleans up strictly owned files for verified platform admins after checking gallery, album and player references. Shared files and unverified storage remain retained |
| Push broadcast | Audience and destination, self-test, review, history, queued send and idempotent retry | `tests/adminDesignBroadcast.test.mjs` |
| Email broadcast | Audience, original review, scoped server capability, confirmed batches and retry | `tests/adminDesignBroadcast.test.mjs`, `tests/adminBroadcastAuthority.test.mjs`. Browser and request tests cover audience changes, preview, test send, interrupted batches and a revoked or tenant role. The dedicated review needs the shared Email release |
| Blog | Search, paging, public link, create/edit/publish, cover upload and verified delete/cancel | `tests/adminDesignSettingsAndBlog.test.mjs` |
| Settings | Site links and checkout fees, per-fee preview, save, reload and permission revocation | `tests/adminDesignSettingsAndBlog.test.mjs` |
| Access and permissions | Direct role/module and record access review, create/edit/revoke, stale record checks | `tests/adminDesignAccessWrites.test.mjs`. Individual event-action rules remain local proposals pending server support |

## Release evidence

The [New Admin review](https://4madmin.vercel.app/admin-preview/events) serves deployment `dpl_CS1hHXy4ux6z79JyUkv3QbjtGowm` from `21d12fd2bab7e6e6eb3ca0310f6d347ee90263ee`. The [repository gate](https://github.com/dotsandcoms/4mpadel/actions/runs/44510268450) passed for that exact revision.

The Event Manager, Payouts, Organisations and Push routes reference the same checked production bundle. The 46 combined shell, payout, income statement and current finance browser checks passed. The earlier review-only rollout `dpl_DsjmbvmxMzUfxfPywdzsEFy2ZUTh` restored Draw Generator, the Bronze switch and reviewed Push sending. The current rollout also includes current draw seeding and ranking operations, organisation banking and payout navigation, detailed income statements and saved native Paystack reconciliation. The public site continues to serve deployment `dpl_6CPfpCEkztw5HbUrjkSkNvnfmpeb` from `f17c90b6`.

Synthetic accounts and fixtures exercise the confirmed write paths. Hosted verification checked deployed services and metadata read-only. No real money movement, support email, account changes or audience sends were used for verification.
