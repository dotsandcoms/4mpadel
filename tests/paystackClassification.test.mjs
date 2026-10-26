import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyPaystackTransaction, hasHostedPaystackReferrer } from '../src/utils/paystackClassification.js';

const eventLink = { referrer: 'https://paystack.shop/pay/is3zb-5tln', custom_fields: [{ variable_name: 'full_name', value: 'Event player' }] };

test('the reported R600 hosted event payments are not licence payments', () => {
    for (const reference of ['T005823606908036', 'T547540393011373']) {
        assert.deepEqual(classifyPaystackTransaction({ reference, metadata: eventLink }), { paymentType: 'other', licenseType: null });
    }
});

test('hosted event payments stay unclassified even at a known licence price', () => {
    for (const matchedLicenseType of ['full', 'temporary']) {
        for (const metadata of [eventLink, JSON.stringify(eventLink), { source: 'paystack_sync', original_trx: { metadata: eventLink } }]) {
            assert.deepEqual(classifyPaystackTransaction({ metadata, matchedLicenseType }), { paymentType: 'other', licenseType: null });
        }
    }
});

test('unknown amounts do not default to a full or temporary licence', () => {
    assert.deepEqual(classifyPaystackTransaction({ metadata: {} }), { paymentType: 'other', licenseType: null });
});

test('a reviewed event correction survives a resync with conflicting licence metadata', () => {
    assert.deepEqual(classifyPaystackTransaction({
        metadata: { license_type: 'full' }, matchedLicenseType: 'full',
        previousPayment: { metadata: { payment_classification: { payment_type: 'event_entry_fee' } } },
    }), { paymentType: 'event_entry_fee', licenseType: null });
});

test('event checkout evidence takes precedence over the total charge', () => {
    for (const transaction of [
        { reference: 'REGEV-479-123' },
        { reference: 'MANUAL-479-123' },
        { metadata: { source: 'manual_event' } },
        { metadata: { event_id: 479 } },
    ]) assert.deepEqual(classifyPaystackTransaction({ ...transaction, matchedLicenseType: 'full' }), { paymentType: 'event_entry_fee', licenseType: null });
});

test('explicit standalone licence purchases still classify correctly', () => {
    assert.deepEqual(classifyPaystackTransaction({ metadata: { source: 'web_license_modal', license_type: 'full' } }), { paymentType: 'membership', licenseType: 'full' });
    assert.deepEqual(classifyPaystackTransaction({ metadata: { license_type: 'temporary' } }), { paymentType: 'temp_license', licenseType: 'temporary' });
    assert.deepEqual(classifyPaystackTransaction({ metadata: { source: 'web_license_modal', license_type: 'temporary', event_id: 479 } }), { paymentType: 'temp_license', licenseType: 'temporary' });
    assert.deepEqual(classifyPaystackTransaction({ metadata: { referrer: 'https://www.4mpadel.co.za/' }, matchedLicenseType: 'full' }), { paymentType: 'membership', licenseType: 'full' });
});

test('hosted URL detection uses the actual hostname', () => {
    assert.equal(hasHostedPaystackReferrer(eventLink), true);
    assert.equal(hasHostedPaystackReferrer({ referrer: 'https://paystack.com/buy/temporary-license-vdwnhe' }), true);
    assert.equal(hasHostedPaystackReferrer({ referrer: 'https://paystack.shop.example.org/pay/event' }), false);
    assert.equal(hasHostedPaystackReferrer({ referrer: 'invalid' }), false);
});
