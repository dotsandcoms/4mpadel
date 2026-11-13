const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { create, act } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;

function load(file, dependencies) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    module, exports: module.exports,
    require: id => id === 'react' ? React : id === 'react/jsx-runtime' ? require(id) : dependencies[id] || {},
    console, Date, Map, Set, Promise, URL,
    setTimeout: (fn, ms) => ms === 0 ? setTimeout(fn, 0) : { fn },
    clearTimeout: handle => { if (handle && !handle.fn) clearTimeout(handle); },
    setInterval: fn => ({ fn }), clearInterval: () => {},
  });
  return module.exports;
}
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setTimeout(resolve, 0)); };
function fixture() {
  const snapshot = { status: { enabled: false }, rows: [] };
  const native = { AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } };
  const supabase = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'owner' }, access_token: 'test-token' } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    rpc: async () => ({ data: snapshot, error: null }), realtime: { setAuth: async () => {} },
    channel: () => { const channel = { on: () => channel, subscribe: () => channel }; return channel; }, removeChannel: async () => {},
  };
  const router = { push() {}, back() {}, replace() {} };
  const route = { usePathname: () => '/messages/chat', useRouter: () => router, useLocalSearchParams: () => ({ id: 'chat' }), Stack: { Screen: 'Screen' } };
  const help = load('src/components/help-inbox-provider.tsx', {
    'react-native': native, 'expo-router': route, '@/lib/supabase': { supabase },
    '@/lib/help-requests': { helpApi: async () => ({ rows: [], unread: 0, next: null, topics: [], needsVerification: false }) },
  });
  const messagingLib = { messagingFailure: e => new Error(e.message), unreadMessages: () => 0, incomingChange: () => null };
  const inbox = load('src/components/messaging/messaging-provider.tsx', {
    'react-native': native, 'expo-router': route, 'expo-notifications': { setBadgeCountAsync: async () => {}, addNotificationReceivedListener: () => ({ remove() {} }) },
    '@/lib/supabase': { supabase }, '@/components/help-inbox-provider': help,
    '@/lib/help-inbox': { helpConversation: value => value }, '@/lib/messaging': messagingLib,
    '@/lib/messaging-drafts': { activateMessageDrafts() {}, clearMessageDrafts: async () => {} },
  });
  let context, helpContext;
  function Observer() { context = inbox.useMessagingInbox(); helpContext = help.useHelpInbox(); return null; }
  const wrap = child => React.createElement(inbox.MessagingProvider, null, React.createElement(Observer), child);
  return { inbox, help, route, wrap, messagingLib, context: () => context, helpContext: () => helpContext };
}

test('inbox refresh callbacks stay stable across chat and Help data updates', async () => {
  const f = fixture(); let renderer;
  try {
    await act(async () => { renderer = create(f.wrap(null)); await settle(); });
    const refresh = f.context().refresh, refreshHelp = f.helpContext().refresh, loadMore = f.helpContext().loadMore;
    for (let i = 0; i < 3; i++) {
      await act(async () => { await refresh(); await settle(); });
      assert.equal(f.context().refresh, refresh, 'a data refresh must not look like a new chat lifecycle');
      assert.equal(f.helpContext().refresh, refreshHelp);
      assert.equal(f.helpContext().loadMore, loadMore);
    }
  } finally { if (renderer) await act(async () => renderer.unmount()); }
});

test('an open conversation settles and keeps its draft when either inbox refreshes', async () => {
  const f = fixture(); let reads = 0, acknowledgements = 0, renderer;
  const conversation = { id: 'chat', kind: 'direct', title: 'Test player', state: 'accepted', canSend: true };
  const screen = load('src/app/messages/[id].tsx', {
    'react-native': Object.fromEntries(['ActivityIndicator', 'FlatList', 'KeyboardAvoidingView', 'Modal', 'Pressable', 'ScrollView', 'Text', 'TextInput', 'View'].map(name => [name, name]).concat([['Platform', { OS: 'ios' }], ['Alert', { alert() {} }]])),
    'expo-router': f.route, '@expo/vector-icons': { Ionicons: 'Icon' }, 'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '@/hooks/use-private-messaging-screen': { usePrivateMessagingScreen: () => true },
    '@/components/messaging/messaging-provider': f.inbox,
    '@/lib/messaging': {
      ...f.messagingLib, MessagingError: class extends Error {}, eventRoleLabel: () => '',
      readConversation: async () => {
        if (++reads > 8) throw new Error('Regression guard: repeated chat reads did not settle');
        return { conversation, messages: [{ id: 'message', seq: 1, mine: false, sender: { name: 'Test' }, body: 'Hello' }], next: null };
      },
      messaging: async action => { if (action === 'mark_read') acknowledgements++; },
    },
    '@/lib/messaging-drafts': { loadMessageDraft: async () => '', saveMessageDraft: async () => {} },
    '@/components/messaging/event-channels': { EventChannelIcon: 'ChannelIcon', eventChannelStyle: () => ({}) },
    '@/components/messaging/ui': { ChatButton: 'Button', ChatNotice: 'Notice' },
    '@/components/messaging/message-bubble': { MessageBubble: 'Bubble' }, '@/components/messaging/event-share-picker': { EventSharePicker: 'SharePicker' },
    '@/components/home-action': { HomeAction: 'Action' }, '@/components/error-banner': { ErrorBanner: 'Error' }, '@/theme/tokens': { lightBrand: {}, loadingBlue: '#27517B' },
  }).default;
  try {
    await act(async () => { renderer = create(f.wrap(React.createElement(screen))); await settle(); });
    assert.ok(reads <= 2, `opening a chat must settle; observed ${reads} reads`);
    const initialReads = reads, initialAcks = acknowledgements;
    await act(async () => renderer.root.findByType('TextInput').props.onChangeText('Keep this draft'));
    for (const refresh of [f.context().refresh, f.helpContext().refresh, f.context().refresh]) {
      await act(async () => { await refresh(); await settle(); });
      assert.equal(renderer.root.findByType('TextInput').props.value, 'Keep this draft');
      assert.equal(renderer.root.findByType('FlatList').props.data.length, 1);
    }
    assert.equal(reads, initialReads, 'badge updates must not reopen an already open chat');
    assert.equal(acknowledgements, initialAcks, 'inbox updates must not restart read acknowledgements');
  } finally { if (renderer) await act(async () => renderer.unmount()); }
});
