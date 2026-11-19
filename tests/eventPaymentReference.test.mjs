import test from 'node:test';
import assert from 'node:assert/strict';
import { eventPaymentReference, isEventCheckoutReference, legacyEventIdFromPaymentReference } from '../src/utils/eventPaymentReference.js';
import { classifyPaystackTransaction } from '../src/utils/paystackClassification.js';
import { legacyEventCheckout } from '../src/utils/legacyEventCheckout.js';

const timestamp = 1794987859681;

test('new checkout starts with EVREG, followed by the Paystack-safe name and timestamp', () => {
    const event = { id: 517, event_name: 'Rockets Cup SAPA Gold 1000' };
    const reference = eventPaymentReference(event, timestamp);
    assert.equal(reference, 'EVREG-ROCKETS-CUP-SAPA-GOLD-1000-1794987859681');
    assert.match(reference, /^[a-z0-9.=\-]+$/i);
    assert.equal(legacyEventIdFromPaymentReference(reference), null);
    assert.equal(eventPaymentReference({ id: 517, event_name: 'Café Padel — Open (2026)' }, timestamp), `EVREG-CAFE-PADEL-OPEN-2026-${timestamp}`);
    assert.notEqual(eventPaymentReference(event, timestamp + 1), reference);
});

test('the event label has a fixed maximum length and a blank label falls back to its event ID', () => {
    assert.equal(eventPaymentReference({ id: 517, title: `${'A'.repeat(35)} + National Open` }, timestamp), `EVREG-${'A'.repeat(35)}-${timestamp}`);
    assert.equal(eventPaymentReference({ id: 517, event_name: ' ! 💚 ' }, timestamp), `EVREG-EVENT-517-${timestamp}`);
});

test('named references remain event payments and are stored verbatim for verification', () => {
    const event = { id: 517, event_name: 'Cape Town Open' };
    const numericReference = `REGEV-517-${timestamp}`;
    const namedReference = eventPaymentReference(event, timestamp);
    for (const reference of [numericReference, `${numericReference}-CAPE-TOWN-OPEN`, namedReference]) {
        assert.equal(isEventCheckoutReference(reference), true);
        assert.equal(classifyPaystackTransaction({ reference }).paymentType, 'event_entry_fee');
        const payment = legacyEventCheckout({ event, profile: { id: 1 }, email: 'player@fixture.invalid', name: 'Fixture Player', phone: '', divisions: ['Open'], partners: {}, feeFor: () => 300, reference, isTest: true, commerce: { event_fee_percent: 0 } });
        assert.equal(payment.reference, reference);
        assert.equal(payment.event_id, 517);
        assert.equal(payment.metadata.event_name, 'Cape Town Open');
    }
});

test('legacy IDs do not get inferred from event-name numbers or non-event payments', () => {
    assert.equal(legacyEventIdFromPaymentReference(`REGEV-517-${timestamp}`), 517);
    assert.equal(legacyEventIdFromPaymentReference(`MANUAL-517-${timestamp}`), 517);
    assert.equal(legacyEventIdFromPaymentReference(`EVREG-2026-OPEN-${timestamp}`), null);
    assert.equal(legacyEventIdFromPaymentReference(`MANUAL-ADMIN-${timestamp}`), null);
    assert.equal(isEventCheckoutReference(`MANUAL-ADMIN-${timestamp}`), false);
});
