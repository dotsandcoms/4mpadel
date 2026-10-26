const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const entry = { title: 'Growthpoint – Ages & Open', startDate: '2026-10-09', endDate: '2026-10-11', location: 'Court 1 & 2, Cape Town', url: 'https://4mpadel.co.za/calendar/growthpoint?tab=overview' };
const source = ts.transpileModule(fs.readFileSync('src/lib/device-calendar.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function calendar({ os = 'ios', version = 27, permission = true, openError = false, nativeResult } = {}) {
  const calls = { sheets: [], alerts: [], links: [], events: [], permissions: 0, nativeImports: 0 };
  const modules = {
    'react-native': {
      Platform: { OS: os, Version: version },
      ActionSheetIOS: { showActionSheetWithOptions: (options, choose) => calls.sheets.push({ options, choose }) },
      Alert: { alert: (title, message, buttons, options) => calls.alerts.push({ title, message, buttons, options }) },
      Linking: { openURL: async url => { calls.links.push(url); if (openError) throw new Error('No handler'); } },
    },
    'expo-calendar/legacy': {
      requestCalendarPermissionsAsync: async () => { calls.permissions++; return { granted: permission }; },
      createEventInCalendarAsync: async details => { calls.events.push(details); return nativeResult || { action: 'saved' }; },
    },
  };
  const exports = {};
  vm.runInNewContext(source, { exports, URL, Date, require: name => {
    assert.ok(name in modules, name);
    if (name === 'expo-calendar/legacy') calls.nativeImports++;
    return modules[name];
  } });
  return { ...exports, calls };
}

test('Google receives an encoded all-day tournament with the inclusive final day and event link', () => {
  const h = calendar();
  const url = new URL(h.googleCalendarUrl(entry));
  assert.equal(url.origin + url.pathname, 'https://calendar.google.com/calendar/r/eventedit');
  assert.equal(url.searchParams.get('action'), 'TEMPLATE');
  assert.equal(url.searchParams.get('text'), entry.title);
  assert.equal(url.searchParams.get('location'), entry.location);
  assert.equal(url.searchParams.get('dates'), '20261009/20261012');
  assert.ok(url.searchParams.get('details').includes(entry.url));
  assert.ok(url.searchParams.get('details').includes('Tournament dates may change.'));
});
test('date-only Google events keep their days across phone time zones, DST, leap days and year boundaries', () => {
  const previous = process.env.TZ;
  try {
    for (const zone of ['Africa/Johannesburg', 'America/Los_Angeles', 'America/New_York', 'Pacific/Auckland']) {
      process.env.TZ = zone;
      const h = calendar();
      for (const [start, end, expected] of [
        ['2026-10-09', null, '20261009/20261010'],
        ['2026-10-31', '2026-11-01', '20261031/20261102'],
        ['2028-02-28', '2028-02-29', '20280228/20280301'],
        ['2026-12-31', '2027-01-02', '20261231/20270103'],
      ]) assert.equal(new URL(h.googleCalendarUrl({ ...entry, startDate: start, endDate: end })).searchParams.get('dates'), expected);
    }
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});
test('an iPhone user chooses Google without opening Apple Calendar or requesting its permissions', async () => {
  const h = calendar({ version: 16 });
  const pending = h.addToCalendar(entry);
  assert.deepEqual(Array.from(h.calls.sheets[0].options.options), ['Apple Calendar', 'Google Calendar', 'Cancel']);
  assert.equal(h.calls.events.length, 0); assert.equal(h.calls.links.length, 0);
  h.calls.sheets[0].choose(1); await pending;
  assert.equal(h.calls.links.length, 1);
  assert.equal(h.calls.nativeImports, 0); assert.equal(h.calls.permissions, 0);
});
test('choosing Apple preserves the native review form, event details and local all-day dates', async () => {
  const h = calendar();
  const pending = h.addToCalendar(entry); h.calls.sheets[0].choose(0);
  assert.equal((await pending).action, 'saved');
  const event = h.calls.events[0];
  assert.equal(event.title, entry.title); assert.equal(event.location, entry.location); assert.equal(event.url, entry.url);
  assert.equal(event.allDay, true); assert.equal(event.startDate.getDate(), 9); assert.equal(event.endDate.getDate(), 12);
  assert.equal(h.calls.permissions, 0); assert.equal(h.calls.links.length, 0);
});
test('canceling the picker opens neither provider and permits another attempt', async () => {
  const h = calendar();
  const first = h.addToCalendar(entry); h.calls.sheets[0].choose(2); await first;
  assert.equal(h.calls.nativeImports, 0); assert.equal(h.calls.links.length, 0);
  const second = h.addToCalendar(entry); assert.equal(h.calls.sheets.length, 2);
  h.calls.sheets[1].choose(1); await second; assert.equal(h.calls.links.length, 1);
});
test('Android offers Google and the device calendar, with safe back-button dismissal', async () => {
  const h = calendar({ os: 'android' });
  const first = h.addToCalendar(entry);
  assert.deepEqual(Array.from(h.calls.alerts[0].buttons, b => b.text), ['Device calendar', 'Google Calendar', 'Cancel']);
  h.calls.alerts[0].options.onDismiss(); await first;
  assert.equal(h.calls.links.length, 0); assert.equal(h.calls.events.length, 0);
  const second = h.addToCalendar(entry); h.calls.alerts[1].buttons[0].onPress(); await second;
  assert.equal(h.calls.events[0].timeZone, 'UTC'); assert.equal(h.calls.events[0].startDate.toISOString(), '2026-10-09T00:00:00.000Z');
  assert.equal(h.calls.events[0].endDate.toISOString(), '2026-10-12T00:00:00.000Z');
  const third = h.addToCalendar(entry); h.calls.alerts[2].buttons[1].onPress(); await third;
  assert.equal(h.calls.links.length, 1);
});
test('repeated taps cannot present two pickers or native event forms', async () => {
  let finish;
  const h = calendar({ nativeResult: new Promise(resolve => { finish = resolve; }) });
  const first = h.addToCalendar(entry); await h.addToCalendar(entry);
  assert.equal(h.calls.sheets.length, 1);
  h.calls.sheets[0].choose(0); await new Promise(resolve => setImmediate(resolve));
  await h.addToCalendar(entry);
  assert.equal(h.calls.sheets.length, 1); assert.equal(h.calls.events.length, 1);
  finish({ action: 'canceled' }); await first;
  const next = h.addToCalendar(entry); h.calls.sheets[1].choose(2); await next;
});
test('invalid dates fail before a picker or external calendar opens', async () => {
  const h = calendar();
  for (const [startDate, endDate] of [['', null], ['2026-02-30', null], ['2026-13-01', null], ['2026-10-11', '2026-10-09']]) {
    await assert.rejects(h.addToCalendar({ ...entry, startDate, endDate }), /dates/);
  }
  assert.equal(h.calls.sheets.length, 0); assert.equal(h.calls.events.length, 0); assert.equal(h.calls.links.length, 0);
});
test('Google launch errors are reported and release the presentation lock', async () => {
  const h = calendar({ openError: true });
  const first = h.addToCalendar(entry); h.calls.sheets[0].choose(1);
  await assert.rejects(first, /Google Calendar could not open/);
  const second = h.addToCalendar(entry); h.calls.sheets[1].choose(2); await second;
});
test('older iOS permission denial remains limited to the Apple Calendar choice', async () => {
  const h = calendar({ version: 16, permission: false });
  const pending = h.addToCalendar(entry); h.calls.sheets[0].choose(0);
  await assert.rejects(pending, /Allow calendar access/);
  assert.equal(h.calls.permissions, 1); assert.equal(h.calls.events.length, 0);
});
test('web previews use Google Calendar without attempting unsupported native dialogs', async () => {
  const h = calendar({ os: 'web' }); await h.addToCalendar(entry);
  assert.equal(h.calls.links.length, 1); assert.equal(h.calls.sheets.length, 0); assert.equal(h.calls.nativeImports, 0);
});
