import test from 'node:test';
import assert from 'node:assert/strict';
import { publishedNativeDrawUrl } from '../src/pages/admin-preview/publicNativeDrawLink.js';

const event = { id: 11, slug: 'own-event', is_manual: true };

test('published native draws link directly to the canonical public origin', () => {
  for (const status of ['published', 'in_progress', 'completed']) {
    assert.equal(publishedNativeDrawUrl(event, [{ event_id: '11', status }]), 'https://4mpadel.co.za/native-draws/own-event');
  }
  assert.equal(publishedNativeDrawUrl({ ...event, slug: 'event/one' }, [{ event_id:11, status:'published' }]), 'https://4mpadel.co.za/native-draws/event%2Fone');
});

test('drafts, archived draws, imported records and a different event do not expose a public draw link', () => {
  assert.equal(publishedNativeDrawUrl(event, [
    { event_id:11, status:'draft' }, { event_id:11, status:'archived' }, { event_id:12, status:'published' },
  ]), null);
  assert.equal(publishedNativeDrawUrl({ ...event, is_manual:false }, [{ event_id:11, status:'published' }]), null);
  assert.equal(publishedNativeDrawUrl({ is_manual:true, slug:'fixture' }, [{ status:'published' }]), null);
});
