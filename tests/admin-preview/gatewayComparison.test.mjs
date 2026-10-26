import test from 'node:test';
import assert from 'node:assert/strict';
import { compareGatewayRecord, gatewayComparisonLabel } from '../../src/pages/admin-preview/gatewayComparison.js';
const gateway = { amountMinor: 65000, currency: 'ZAR', status: 'success' };
const payment = { amount: '650.00', currency: 'ZAR', status: 'success' };
test('same-reference record comparison checks actual amounts, currency and status', () => {
  assert.equal(compareGatewayRecord(gateway, payment).state, 'agree');
  const comparison = compareGatewayRecord(gateway, { ...payment, amount: '649.99', status: 'pending' });
  assert.deepEqual(comparison.differences, ['Amount differs', 'Status differs']);
  assert.match(gatewayComparisonLabel(compareGatewayRecord(gateway, payment)), /not settlement verification/);
});
test('missing, invalid or unsupported values never produce agreement', () => {
  for (const amount of [null, '', '650.001', true, Infinity, -1]) assert.notEqual(compareGatewayRecord(gateway, { ...payment, amount }).state, 'agree');
  assert.equal(compareGatewayRecord(gateway, { ...payment, currency: null }).state, 'incomplete');
  assert.equal(compareGatewayRecord(gateway, { ...payment, currency: 'USD' }).state, 'different');
  assert.equal(compareGatewayRecord({ ...gateway, currency: 'USD' }, { ...payment, currency: 'USD' }).state, 'incomplete');
  assert.equal(compareGatewayRecord(gateway, { ...payment, status: '' }).state, 'incomplete');
});
test('status aliases are not silently treated as the same gateway state', () => {
  assert.deepEqual(compareGatewayRecord(gateway, { ...payment, status: 'successful' }).differences, ['Status differs']);
});
