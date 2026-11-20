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
| Event Manager | Event scoping, event and division navigation, staff pending registration, Paystack payment link, player replacement, group movement and qualification, Draw Generator and private draft save, Show Bronze events, and private draw rehearsal | `tests/adminDesignEvents*.test.mjs`. Current seeding and reciprocal team fixtures, single/bulk reviewed court setup and manual payment correction also pass on the branch. The branch also connects draw completion and ranking awards. Linked plates, play days, per-division rules and the reviewed automatic schedule are tested in the branch and use the deployed draw migrations. See the [event audit](admin-review-events-audit.md#specialist-draw-and-schedule-actions) |
| Registrations | Exact permitted event, search, player/team and payment filters, selection, CSV, add, player and partner details, group checklist, replacement, linked receipts, refund review, same-email profile names, historical payment classification and existing Event Manager actions | See the [registration action inventory](admin-review-registrations-audit.md) for fixtures and permission coverage. The follow-up branch contains these workspace changes |
| Calendar | Org/club and explicit event assignments, full/quick creation through original editors, Bronze, visibility, Event Manager flag, event deletion, scoped refresh, bulk import, past public results, canonical public links, reviewed hidden duplication and weekly-series review, edit and visibility | `tests/adminDesignEvents*.test.mjs`, `tests/adminDesignCalendarDuplicate*.test.mjs` and `tests/adminCalendarWeeklySeries.sql`. Duplication and weekly group visibility on the follow-up branch require their hosted migrations |
| Tournament Manager | Existing dedicated draw, schedule, results and access panels, event and division linking, server scope verification | `tests/adminDesignEventsBrowser.test.mjs` verifies exact-event division links, publish and score actions |
| Imported RankedIn events | Dashboard and table switch, public event link, five roster filters, profile and group links, verified scoped Excel, single and filtered bulk complete-source roster review, manual payment mark and exact correction | `tests/adminDesignRankedinRoster.test.mjs`, `tests/adminDesignImportedRosterBulk.test.mjs`, `tests/adminDesignImportedPayments.test.mjs`, `tests/adminDesignImportedParticipantFinance.test.mjs` and database fixtures cover source failures, scopes, concurrency, linked records, and atomic ledger writes. Roster and payment changes require their hosted migrations |
| Messaging | Event and player conversations, list and channel selection, publish review, tenant denial, revocation | `tests/adminDesignCommunications.test.mjs`, current Messaging lifecycle tests |
| Help requests | Queue and thread, scoped event link, reply and ticket lifecycle, access rechecks | `tests/adminDesignCommunications.test.mjs`, current Help pagination tests |
| Integrations and Audit log | Service workspace links, event audit filtering, record details and permission-scoped reads | `tests/adminDesignAudit.test.mjs` |
| Account Security | Setup, verify, backup, remove, assisted recovery and history with separate role checks | `tests/accountSecurity.test.mjs`, `tests/adminDesignCommunications.test.mjs` |
| Finance reports | Event settlements, scoped finance read, Full Event and Organisers Consolidated Excel workbooks, reconciliation issues, user ledger, reviewed record deletion, platform Collections, and a Summary report with Events, Players, filtered CSV and consolidated Excel | `tests/adminDesignMoney*.test.mjs`, `tests/adminDesignEventIncome.test.mjs`, `tests/eventFinanceScreens.test.mjs` and `tests/adminDesignFinancialSummary.test.mjs` verify settlement and workbooks. The browser opens a linked event statement and verifies scoped downloads, including revoked access and events that moved between organisations |
| Payments | Gateway history and filters, Excel, reviewed single and bulk verification of saved event checkouts, held access for tenants | `tests/adminDesignMoney*.test.mjs`. Exact saved legacy and event-named mobile Paystack receipts are reconciled in the branch. The branch adds reviewed single/page backfill of verified live receipts with exact allocations or an unallocated cash record. The deployed backfill database operation and Edge Function enforce the reviewed write. See the [finance audit](admin-review-money-audit.md#reviewed-paystack-recovery) |
| Payouts | Versioned organisation banking, masked destination, scoped event request with current settlement and limits, MFA, request alert, review, reveal/hide, mark paid/cancel, recorded interim history and direct event link | `tests/adminDesignMoney*.test.mjs`. Requests and processing use current hosted `organisation_banking`. The updated workspace preserves the selected event after banking, request-resolution and recorded-interim actions. Both Event Manager and the organisation profile link into the scoped request view. See the [payout commit trace](admin-review-money-audit.md#organisation-payouts-commit-trace) |
| Licences | Register and filters, temporary sales, sales/cohorts and export, grant/revoke/restore, price and year management | `tests/adminDesignMoney*.test.mjs` |
| Players | Directory and profile drawer, player edit, add, verified invite and recovery links, account preview, reviewed delete and licence links | `tests/adminDesignPlayerActions.test.mjs` and `tests/adminDesignShell.test.mjs` cover verified platform access, standalone editor access and tenant denial. The follow-up branch uses a read-only account preview of the selected 4M profile, registered events and recorded licences, using the operator’s own session |
| Clubs | Own-club directory, drawer and exports, platform visibility, existing club profile and media tools, claims, memberships, invitations, organisation access links, venue group assignment, branding and team access, own-club profile, media and delegated staff/admin membership editing, reviewed club merge and deletion | `tests/adminDesignNetwork.test.mjs`, `tests/adminDesignClubOperations.test.mjs` `tests/adminDesignClubLifecycle.test.mjs` and `tests/adminDesignDelegatedClubMembers.test.mjs`. Merge, deletion and group-wide team changes use the hosted lifecycle and group team migrations |
| Organisations and Federations | Scoped profile and media, organisation application decisions, album and federation relationships, reviewed organisation creation, password-free owner invitation, approval email, member management and deletion, linked event sanction and event/division amendment review, host event creation and editing with scoped attachment uploads | `tests/adminDesignEntityDecisions.test.mjs`, `tests/adminReviewedEventAmendments.sql`, `tests/adminOrganisationHostBuilder.sql` and `tests/adminDesignOrganisationAttachmentsBrowser.test.mjs` cover exact scope, protected history, full and quick draft saves, and attachment unlinking. The amendment and host actions require their shared services |
| Coaches | Directory and filters, profile and media, status charts and reviewed deletion | `tests/adminDesignGalleryCoaches.test.mjs` |
| Gallery | Album and photo editing, upload, cover, publish, hide, bulk selection and removal | `tests/adminDesignGallery*.test.mjs`. Confirmed photo removal cleans up strictly owned files for verified platform admins after checking gallery, album and player references. Shared files and unverified storage remain retained |
| Push broadcast | Audience and destination, self-test, review, history, queued send and idempotent retry | `tests/adminDesignBroadcast.test.mjs` |
| Email broadcast | Audience, original review, scoped server capability, confirmed batches and retry | `tests/adminDesignBroadcast.test.mjs`, `tests/adminBroadcastAuthority.test.mjs`. Browser and request tests cover audience changes, preview, test send, interrupted batches and a revoked or tenant role. The dedicated review uses the verified shared Email release |
| Blog | Search, paging, public link, create/edit/publish, cover upload and verified delete/cancel | `tests/adminDesignSettingsAndBlog.test.mjs` |
| Settings | Site links and checkout fees, per-fee preview, save, reload and permission revocation | `tests/adminDesignSettingsAndBlog.test.mjs` |
| Access and permissions | Direct role/module and record access review, create/edit/revoke, stale record checks | `tests/adminDesignAccessWrites.test.mjs`. Individual event-action rules remain local proposals pending server support |

## Release evidence

The [New Admin review](https://4madmin.vercel.app/admin-preview/events) serves `dpl_AFGX5cJsgKYNotjdNfyxRy39XvGT` from `4e08ac8dfe59c387c85e30b8159f0733dee3e0c4`. The [repository gate](https://github.com/dotsandcoms/4mpadel/actions/runs/44519231037) passed for that exact revision. Nine hosted routes served the checked bundle, and 92 focused browser and server checks passed. The current [public Admin](https://4mpadel.co.za/admin) remains on deployment `dpl_6CPfpCEkztw5HbUrjkSkNvnfmpeb` from `f17c90b6`.

The approved shared backend package comes from checked revision `3b48e2d2b766253adde96e11b9575a1b790560bc`. The hosted source files matched the committed Edge Function files for `send-email` v79 and `admin-paystack-backfill` v1. Both rejected signed-out requests. Hosted metadata confirmed seven new operations, anonymous denial and service-only Paystack recording.

| Database release | Hosted migration |
| --- | --- |
| Linked Silver/Bronze plates and play days | `20261119115452` |
| Reviewed Paystack receipt recovery | `20261119115500` |
| Reviewed club merge and deletion | `20261119115517` |
| Organisation records and team | `20261119115523` |
| Atomic automatic court scheduling | `20261119115530` |
| Club group team access | `20261119115541` |

Synthetic accounts and fixtures exercise the confirmed write paths. Hosted verification checked deployed services and metadata read-only. No real money movement, support email, account changes or audience sends were used for verification.

## Follow-up release order

The previous approval covers the deployed package above. The shared changes below require a separate release approval and the repository gate for the exact candidate. The existing public website deployment is outside the release scope.

| Local migration | Purpose |
| --- | --- |
| `20261119120821` | Reviewed Calendar duplication |
| `20261119120936` | Reviewed federation and organisation event amendments |
| `20261120023944` | Exact manual payments and corrections for imported participants |
| `20261120052642` | Reviewed weekly Calendar visibility changes |
| `20261120053234` | Registration name and withdrawn receipt corrections |
| `20261120054121` | Scoped organisation host event builder |
| `20261120054159` | Trusted receipt metadata for verified paid replacements, with transfer activation disabled |
| `20261120055927` | Scoped organisation event media storage |
| `20261120061610` | Exact case-insensitive organisation and club membership checks |
| `20261120111700` | Complete RankedIn roster reviews and imports |
| `20261120112000` | Reviewed refund reservations and provider status reconciliation |

Install the compatible migrations before releasing the shared `paystack-webhook` and then `paystack-refund` bundles. The refund package uses the existing gateway settings and exact event authority. Install `organisation-event-attachments` after the host capability and storage migrations. Verify the service versions, signed-out responses, database function signatures and grants, and the source and assets of the separate review deployment. Payments, payouts and audience sends use synthetic fixtures for write verification. Keep verified paid-player transfers disabled while the current public Admin is on its existing reader version.
