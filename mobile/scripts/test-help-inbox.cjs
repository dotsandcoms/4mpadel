const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const inboxExports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/help-inbox.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: inboxExports });
const request = { id: 'ticket-id', isOwner: true, eventId: 553, eventName: 'Brad Test', recipient: 'Event team', requester: { name: 'Alex Player', email: 'alex@example.test' }, unread: 2, preview: 'Your entry is confirmed', updatedAt: '2026-11-13T09:00:00Z', lastMessageId: 'reply-id', lastSeq: 3, reference: '4M-123ABC', canManage: false };

test('a help Messages row retains the ticket identity and latest reply without creating a direct chat', () => {
  const row = inboxExports.helpConversation(request);
  assert.equal(row.kind, 'help'); assert.equal(row.id, request.id); assert.equal(row.helpRequest, request);
  assert.equal(row.title, 'Brad Test'); assert.equal(row.preview, request.preview); assert.equal(row.unread, 2);
  assert.equal(row.lastMessageId, 'reply-id'); assert.equal(row.state, 'accepted');
});
test('Help is present in All and its own filter while player, group and event filters remain distinct', () => {
  const help = inboxExports.helpConversation(request);
  for (const filter of ['All', 'Help']) assert.equal(inboxExports.conversationFilter(help, filter, ''), true);
  for (const filter of ['Players', 'Groups', 'Events', 'Requests', 'Archived']) assert.equal(inboxExports.conversationFilter(help, filter, ''), false);
  assert.equal(inboxExports.conversationFilter({ ...help, kind: 'direct' }, 'Players', ''), true);
  assert.equal(inboxExports.conversationFilter({ ...help, kind: 'event_discussion' }, 'Events', ''), true);
});
test('organiser help rows identify the requester and search matches ticket, event and player', () => {
  const row = inboxExports.helpConversation({ ...request, isOwner: false, canManage: true });
  assert.equal(row.title, 'Alex Player');
  for (const query of ['4m-123abc', 'brad test', 'ALEX PLAYER', 'event team']) assert.equal(inboxExports.conversationFilter(row, 'Help', query), true);
  assert.equal(inboxExports.conversationFilter(row, 'Help', 'different event'), false);
});
test('personal Help archives move between the inbox and Archived without changing the ticket', () => {
  const archived = inboxExports.helpConversation({ ...request, archived: true });
  assert.equal(archived.archived, true);
  assert.equal(archived.helpRequest.id, request.id);
  for (const filter of ['All', 'Help', 'Players', 'Groups', 'Events']) assert.equal(inboxExports.conversationFilter(archived, filter, ''), false);
  assert.equal(inboxExports.conversationFilter(archived, 'Archived', ''), true);
  const restored = inboxExports.helpConversation({ ...request, archived: false });
  assert.equal(inboxExports.conversationFilter(restored, 'Archived', ''), false);
  assert.equal(inboxExports.conversationFilter(restored, 'Help', ''), true);
});
