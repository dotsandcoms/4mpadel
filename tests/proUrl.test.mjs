import test from 'node:test';
import assert from 'node:assert/strict';
import { proSection, proUrl, playerProfileUrl } from '../src/utils/proUrl.js';
test('legacy rankings URL becomes readable and drops stale comparison', () => {
 const params = new URLSearchParams('category=men&view=rankings&compare=434&rankingPage=2');
 assert.equal(proUrl(proSection('/pro',params),params), '/pro/rankings?page=2');
});
test('preserves relevant filters and modal player', () => {
 assert.equal(proUrl('rankings','category=women&q=Ruiz&page=2&player=111'), '/pro/rankings?category=women&q=Ruiz&player=111&page=2');
 assert.equal(proUrl('compare','compare=66&against=65&page=2&q=Ruiz'), '/pro/compare?compare=66&against=65');
});
test('defaults and malformed page numbers are omitted', () => {
 for(const page of ['1','-2','NaN','2.5']) assert.equal(proUrl('rankings',`page=${page}`),'/pro/rankings');
 assert.equal(proSection('/pro/calendar',new URLSearchParams()), 'calendar');
 assert.equal(proUrl('calendar','tourSearch=Milan&tourLevel=p1&country=ES'),'/pro/calendar?tourSearch=Milan&tourLevel=p1');
});

test('shared profiles use readable names and stable IDs', () => {
 assert.equal(playerProfileUrl({ id: 66, name: 'Agustín Tapia' }), '/pro/players/66/agustin-tapia');
 assert.equal(playerProfileUrl({ id: 465, name: 'Aimar Goñi' }), '/pro/players/465/aimar-goni');
});

test('readable pro routes retain public access', async () => {
 const { requiresAuth } = await import('../src/utils/routeAccess.js');
 for (const path of ['/pro/rankings', '/pro/calendar', '/pro/compare', '/pro/players/66/agustin-tapia']) assert.equal(requiresAuth(path), false);
 assert.equal(requiresAuth('/profile'), true);
});
