# Messages refresh regression — 13 November 2026

Build 43 introduced a shared messaging regression on iOS and Android. Adding Help to the Messages provider changed its previously stable `refresh` callback to an inline wrapper. Both the Help wrapper and combined callback were recreated on provider renders. A chat's `fetchPage` callback depends on that function; the identity change restarted the chat lifecycle, clearing messages and the draft. Loading the chat marked messages read and refreshed the inbox, repeating the cycle.

The two providers now expose stable callbacks through `useCallback`. Inbox rows, badges, authentication changes and private-screen protection still update normally. The fix does not hide data changes or relax privacy/session checks.

The regression escaped the previous tests because they covered messaging rules and source helpers without mounting the provider/chat lifecycle. The new React-version-matched renderer test mounts the actual providers and conversation screen. Before the fix, its bounded reproduction observed 10 chat reads and failed the callback identity test. After the fix, the chat settles; manual chat/Help inbox refreshes preserve the visible message and typed draft and do not repeat read acknowledgements. The test is included in `npm test`.

Both local native Release builds passed. The fixed iPhone simulator chat stayed open for several minutes with an unsent draft, which was then cleared without sending. Android startup is checked through ADB build/install/log tooling; the user chose to perform Android visual testing. No ADB screen taps or screenshots were used after that choice.

Build 43 contains the regression and should be superseded by the replacement test build. This fix needs a new app binary; publishing Admin does not replace installed mobile code.

## Personal Help archives

Messages now offers conversation options for Help rows, including Archive conversation and Move to inbox. Archives are per account, retain the transcript and ticket status, and are omitted from inbox unread badges. New replies restore archived conversations to the participants' inboxes. Resolved tickets can be archived without reopening them.

Migration `20261113101314_help_conversation_archive.sql` is deployed. It adds a preference to the existing RPC-only read-state table, preserves RLS and direct-access revokes, and checks ticket scope/MFA before archive changes. Local PostgreSQL tests pass account separation, restore/unread behaviour, new-reply restoration, resolved status preservation and denied direct access. The existing 70 table access contracts and four sequences remain valid.
