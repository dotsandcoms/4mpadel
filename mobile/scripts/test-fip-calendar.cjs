const test=require('node:test'),assert=require('node:assert/strict');let fip;
test.before(async()=>{fip=await import('../supabase/functions/_shared/fip-calendar.mjs');});
const fixture=Array.from({length:6},(_,i)=>`<article><div class="event-title"><a href="https://www.padelfip.com/events/fip-${i}/">FIP ${i<4?'PROMISES':'BRONZE'} EVENT ${i}</a></div><div>From 08/10/2026 to 11/10/2026</div><div class="event-location">Cape Town - South Africa</div><div class="live event-status"></div><img src="https://www.padelfip.com/poster.jpg" class="cover-category-event" /></article>`).join('');
test('official FIP parsing covers Promises and Bronze without inventing API matches',()=>{
 const events=fip.parseFipCalendar(fixture,2026);assert.equal(events.length,6);assert.equal(events.filter(e=>e.level==='fip_promises').length,4);assert.ok(events.every(e=>e.matchesAvailable===false));assert.ok(events.every(e=>Number.isSafeInteger(e.id)&&e.id<0));assert.equal(new Set(events.map(e=>e.id)).size,6);assert.equal(events[0].status,'live');assert.equal(events[0].startDate,'2026-10-08');assert.equal(events[0].location,'Cape Town - South Africa');
 assert.deepEqual(fip.parseFipCalendar(fixture,2026).map(e=>e.id),events.map(e=>e.id));
});
test('changed official markup, wrong year or unexpected hosts preserve the previous calendar',()=>{
 assert.throws(()=>fip.parseFipCalendar('no calendar',2026),/preserved/);assert.throws(()=>fip.parseFipCalendar(fixture,2027),/preserved/);assert.throws(()=>fip.parseFipCalendar(fixture.replaceAll('www.padelfip.com','evil.test'),2026),/preserved/);
});
test('official calendar sync makes ONE non-quota read for all viewers',async()=>{
 let calls=0;const value=await fip.buildFipCalendar({fetchImpl:async()=>{calls++;return new Response(fixture);},now:()=>new Date('2026-10-08T06:00:00Z')});assert.equal(calls,1);assert.equal(value.tournaments.length,6);assert.match(value.sourceUrl,/padelfip.com/);
});
