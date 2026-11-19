import test from 'node:test';
import assert from 'node:assert/strict';
import { eventPaymentReference } from '../src/utils/eventPaymentReference.js';
import { classifyPaystackTransaction } from '../src/utils/paystackClassification.js';
import { legacyEventCheckout } from '../src/utils/legacyEventCheckout.js';

const timestamp = 1794987859681;

test('new checkout references include a Paystack-safe event name after the existing event ID and timestamp', () => {
    const event = { id: 517, event_name: 'Café Padel — Cape Town Open (2026)' };
    const reference = eventPaymentReference(event, timestamp);
    assert.equal(reference, 'REGEV-517-1794987859681-CAFE-PADEL-CAPE-TOWN-OPEN-2026');
    assert.match(reference, /^[a-z0-9.=\-]+$/i);
    assert.equal(reference.split('-')[1], '517');
    assert.notEqual(eventPaymentReference(event, timestamp + 1), reference);
});

test('the event label has a fixed maximum length and a blank label keeps the numeric reference', () => {
    assert.equal(eventPaymentReference({ id: 517, title: `${'A'.repeat(35)} + National Open` }, timestamp), `REGEV-517-${timestamp}-${'A'.repeat(35)}`);
    assert.equal(eventPaymentReference({ id: 517, event_name: ' ! 💚 ' }, timestamp), `REGEV-517-${timestamp}`);
});

test('named references remain event payments and are stored verbatim for verification', () => {
    const event = { id: 517, event_name: 'Cape Town Open' };
    const numericReference = `REGEV-517-${timestamp}`;
    const namedReference = eventPaymentReference(event, timestamp);
    for (const reference of [numericReference, namedReference]) {
        assert.equal(classifyPaystackTransaction({ reference }).paymentType, 'event_entry_fee');
        const payment = legacyEventCheckout({ event, profile: { id: 1 }, email: 'player@fixture.invalid', name: 'Fixture Player', phone: '', divisions: ['Open'], partners: {}, feeFor: () => 300, reference, isTest: true, commerce: { event_fee_percent: 0 } });
        assert.equal(payment.reference, reference);
        assert.equal(payment.event_id, 517);
        assert.equal(payment.metadata.event_name, 'Cape Town Open');
    }
});
