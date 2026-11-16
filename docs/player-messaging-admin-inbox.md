# Admin player messages

Player messages opens on a Help-style conversation queue. Each row shows its latest visible message, participants, sender, private/group type, unread count or outstanding invitations, and last message date. New message opens the existing reviewed-send composer. Back to conversations retains the queue filters.

The server searches player/group names and filters sender, unread/awaiting acceptance, and private/group type. `public.messaging_admin_inbox(jsonb)` returns at most 50 rows plus an opaque timestamp/UUID cursor. Equal timestamps have a deterministic UUID tie-breaker. Search runs before pagination; the legacy mobile `messaging_api('admin_inbox')` array contract is preserved.

The queue requires a valid messaging account, accepted setup, AAL2, and current scope permissions. It includes only official conversations created by the caller and still allowed by `messaging.group_access`. An administrator cannot browse other players’ private conversations. Revoked organisation access immediately removes its rows. Ordinary organisation admins retain their organisation/event audience. A current Super Admin can send as any organisation to any otherwise eligible player, including a player outside that organisation. Account, age/consent, request preference and block rules still apply. The server records the acting admin and grants the invited player access to that specific conversation without granting organisation membership.

Conversation rows open from any non-interactive part of the row; text selection does not open a chat. The existing title button remains keyboard accessible. Private and Group have distinct blue and purple badges. Both Player messages and Help requests use fixed pages of at most 50 rows with Previous/Next controls; search/filter changes start at the first page and returning from a conversation retains the page.

Past-event sending is closed on the server as well as in the picker. Events remain open through the final South African calendar date, with no Super Admin bypass. Cancelled events are closed. Existing retained messages remain readable; an old open composer cannot bypass the sending cutoff.

Organisation search failed because hosted `calendar.address` collided with a PL/pgSQL variable named `address` in `messaging.scope_player`. The forward migration renames that variable (and the matching email variable in `event_access`) without changing eligibility rules. Failures now have a local retry action; the interface does not misreport a failed search as an empty result.

## Verification

- `node --test tests/playerMessagingInbox.test.mjs tests/eventMessagingLifecycle.test.mjs tests/accountSecurity.test.mjs tests/messagingAccountSwitch.test.mjs tests/messagingAuthenticator.test.mjs`: 37 browser/component checks passed. Fictional recipients only.
- `cd mobile && node scripts/test-messaging-db.cjs`: organisation search with hosted-style `calendar.address`, 121-row pagination with timestamp ties, participant search, unread replies/read state, MFA, ownership/tenant isolation, revoked permissions, plus the existing messaging suite and 71 table/4 sequence Data API contracts passed.
- `npm run test:data-api`, targeted ESLint and `git diff --check` passed.
- Desktop and 390px screenshots reviewed against the supplied Help request table; the table scrolls inside its region on narrow screens.

## Release

Hosted migration: `20261116083323_messaging_admin_inbox_and_org_search`. No new tables or table grants. The public RPC grants EXECUTE only to authenticated, validates the actor and AAL2 itself, uses an empty search path, and reads RPC-only private tables through SECURITY DEFINER. The generic authenticated SECURITY DEFINER advisory for this RPC is expected for this access pattern; its access controls were reviewed and verified. [Supabase advisory guidance](https://supabase.com/docs/guides/database/database-linter).

Read-only production checks confirm that the reported organisation search no longer throws, that private helpers cannot be called by clients, and that anonymous/service callers cannot execute the new queue RPC. The later `20261116090058_messaging_super_admin_org_outreach_and_event_cutoff` migration adds the explicit Super Admin outreach rule and event cutoff. Isolated tests cover cross-organisation invitations/replies, actor auditing, downgraded admins, the event date boundary and retained read access. No real messages were sent during verification.

The web package is based on event hotfix deployment `dpl_6KvkL9mjftW3FGvC6oYGjmUtKzpp`, preserving 807 of its 810 files byte for byte, changing three files and adding `PlayerMessageInbox.jsx`. Other dirty workspace changes are excluded. Deployment receipts and screenshot evidence are in `outputs/player-messaging-inbox-20261116`.

The list, row behaviour, Help pagination, Super Admin outreach and event filtering were verified live on https://4mpadel.co.za/admin in deployment `dpl_4kujtjo5UNDv9qrK56zQmTfH4v7p`. The public asset hashes matched the reviewed candidate. The original release receipts are in `outputs/admin-messaging-access-20261116`; the earlier queue deployment is `dpl_AEhd2GtCasxrvdn3kHVAytTxFTjo`. GitHub `main` is reconciled with these published sources before the next automatic production deployment.

Roll back the web to the event hotfix deployment if needed. The additive RPC and variable fix can remain because the old mobile/web action is unchanged. Preserve these exact source changes before a later Git-based deployment.
