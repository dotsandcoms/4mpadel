import test from 'node:test';
import assert from 'node:assert/strict';
import { venueNames, addEventVenue, eventPlacePatch } from '../../src/pages/admin-preview/eventLocationData.js';

test('venues preserve order and source spelling while removing case-insensitive duplicates', () => {
  assert.deepEqual(venueNames(' Club A \nclub a\nClub B\n'), ['Club A', 'Club B']);
});
test('club selection fills empty location fields but preserves existing manual values', () => {
  const club = { name: 'Club', address: '1 Street', city: 'Cape Town' };
  assert.deepEqual(addEventVenue({ venues: '' }, club), { venues: 'Club', address: '1 Street', city: 'Cape Town' });
  assert.deepEqual(addEventVenue({ venues: 'First', address: 'Manual', city: 'Durban' }, club), { venues: 'First\nClub', address: 'Manual', city: 'Durban' });
});
test('custom venue does not fabricate address or city', () => {
  assert.deepEqual(addEventVenue({ venues: '', address: '', city: '' }, ' Custom '), { venues: 'Custom', address: '', city: '' });
});
test('Google selection updates address/city and only seeds an empty venue list', () => {
  const place = { name: 'Google Venue', formatted_address: '23 Road', address_components: [{ types: ['administrative_area_level_2'], long_name: 'District' }, { types: ['locality'], long_name: 'Local City' }] };
  assert.deepEqual(eventPlacePatch({ venues: '' }, place), { venues: 'Google Venue', address: '23 Road', city: 'Local City' });
  assert.equal(eventPlacePatch({ venues: 'Selected Club' }, place).venues, 'Selected Club');
});
test('incomplete Google result preserves manual fields and uses source fallback city hierarchy', () => {
  assert.deepEqual(eventPlacePatch({ venues: 'Club', address: 'Address', city: 'City' }, {}), { venues: 'Club', address: 'Address', city: 'City' });
  assert.equal(eventPlacePatch({}, { address_components: [{ types: ['administrative_area_level_1'], long_name: 'Province' }] }).city, 'Province');
});
