import test from 'node:test';
import assert from 'node:assert/strict';
import { helpTicketFromSearch } from '../src/utils/helpLinks.js';
const id='20000000-0000-0000-0000-000000000001';
test('Admin email links select exactly one valid ticket after sign-in',()=>{assert.equal(helpTicketFromSearch(`?tab=event-mgmt&section=help&ticket=${id}`),id);});
test('malformed, duplicate and URL-shaped ticket parameters cannot select a request',()=>{for(const query of ['', '?ticket=invalid', '?ticket=https://elsewhere.test', `?ticket=${id}&ticket=${id}`, '?ticket=%2Fadmin%3Foverride%3D1'])assert.equal(helpTicketFromSearch(query),null);});
