import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareEventDates } from '../../src/pages/admin-preview/eventManagerData.js';
const dates = ['2027-01-10', '2026-12-12', '2026-09-19', '2026-09-18'];
test('upcoming is nearest first across year boundaries', () => {
  assert.deepEqual(dates.map(start_date=>({start_date})).sort((a,b)=>compareEventDates(a,b,'Upcoming')).map(row=>row.start_date), [...dates].reverse());
});
test('all filters and initial load use ascending dates with missing dates last', () => {
  for (const phase of ['Upcoming','In progress','Past','Cancelled','Unscheduled','']) {
    assert(compareEventDates({start_date:'2026-09-19'},{start_date:'2026-09-18'},phase) > 0);
    assert(compareEventDates({}, {start_date:'2026-09-18'}, phase) > 0);
  }
});
