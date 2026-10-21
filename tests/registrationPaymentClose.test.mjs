import test from 'node:test';
import assert from 'node:assert/strict';
import { isRegistrationPaymentClosed } from '../src/utils/registrationClose.js';

const now = Date.parse('2026-10-19T10:00:00Z');
const closed = { registration_closes_at: '2026-10-18T19:00:00Z' };

test('existing events retain late payments until explicitly switched off', () => {
    for (const setting of [undefined, true]) {
        assert.equal(isRegistrationPaymentClosed(null, { ...closed, allow_payments_after_close: setting }, now), false);
    }
    assert.equal(isRegistrationPaymentClosed(null, { ...closed, allow_payments_after_close: false }, now), true);
});

test('turning late payments off respects the exact closing time and division override', () => {
    const event = { ...closed, allow_payments_after_close: false };
    assert.equal(isRegistrationPaymentClosed({ entries_close_at: '2026-10-20T10:00:00Z' }, event, now), false);
    assert.equal(isRegistrationPaymentClosed({ entries_close_at: new Date(now).toISOString() }, event, now), true);
    assert.equal(isRegistrationPaymentClosed({ entries_close_at: '2026-10-18T10:00:00Z' }, { ...event, registration_closes_at: '2026-10-20' }, now), true);
    assert.equal(isRegistrationPaymentClosed(null, { allow_payments_after_close: false }, now), false);
});
