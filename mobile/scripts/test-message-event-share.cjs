const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function setup(response = { data: [], error: null }) {
  const calls = [], builder = {};
  for (const key of ['select','eq','or','order','range','abortSignal']) builder[key] = (...args) => { calls.push([key,...args]); return builder; };
  builder.then = (ok, fail) => Promise.resolve(response).then(ok, fail);
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/message-event-share.ts','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    module, exports: module.exports, require: () => ({ supabase: { from: name => { calls.push(['from',name]); return builder; } } }), Intl, Date,
  });
  return { ...module.exports, calls };
}
test('calendar sharing reads only public event fields, is bounded and abortable', async () => {
  const m=setup(), controller=new AbortController(); await m.findShareEvents('Durban',false,25,controller.signal);
  assert.equal(m.calls[0][1],'calendar');
  assert.equal(m.calls.find(x=>x[0]==='select')[1].includes('email'),false);
  assert.deepEqual(m.calls.find(x=>x[0]==='eq'),['eq','is_visible',true]);
  const filter=m.calls.find(x=>x[0]==='or')[1];
  assert.match(filter,/sanction_status.eq.approved/); assert.match(filter,/event_name.ilike."%Durban%"/);
  assert.deepEqual(m.calls.find(x=>x[0]==='range'),['range',25,49]);
  assert.equal(m.calls.find(x=>x[0]==='abortSignal')[1],controller.signal);
});
test('search punctuation stays inside quoted filter values', () => {
  const m=setup(), filter=m.shareEventFilter('A \\"),is_visible.eq.false,%_',true,'2026-11-10');
  assert.match(filter,/sanction_status.eq.approved/); assert.match(filter,/end_date.lt.2026-11-10/);
  // The quote and literal wildcard characters are escaped before interpolation.
  assert.ok(filter.includes('\\\\\\"')); assert.ok(filter.includes('\\%\\_'));
});
test('selected event becomes an Overview card without sending a message', () => {
  const m=setup(), card=m.shareEventCard({id:42,event_name:'4M Open',start_date:'2026-11-20',venue:'Test courts',city:'Durban',sapa_status:'Gold',poster_image_url:'https://example.test/poster.jpg'});
  assert.equal(card.eventId,42); assert.equal(card.tab,'Overview'); assert.equal(card.poster,'https://example.test/poster.jpg');
  assert.equal(card.venue,'Test courts'); assert.equal(m.calls.length,0);
  assert.equal(m.shareEventDate(null),'Date to be confirmed'); assert.match(m.shareEventDate('2026-11-20'),/20 Nov 2026/);
});
test('provider errors do not leak internal database information', async () => {
  const m=setup({data:null,error:{message:'private secret@example.test'}});
  await assert.rejects(m.findShareEvents('',false,0,new AbortController().signal),{message:'The event calendar could not load. Please try again.'});
});
