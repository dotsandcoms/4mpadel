import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { gatewayPageExcel } from '../../src/pages/admin-preview/gatewayExport.js';
const data = { environment: 'test', pagination: { page: 2, total: 201 }, transactions: [
  { environment: 'test', reference: '=1+1', status: 'success', amountMinor: 12345, currency: 'ZAR', createdAt: '2026-09-07T23:00:00Z' },
] };
test('gateway workbook labels partial scope, preserves literal references and numeric money', async () => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await gatewayPageExcel(data, { from: '2026-09-08', status: 'success' }));
  const sheet = workbook.getWorksheet('Gateway page');
  assert.equal(sheet.getCell('A2').value, '2026-09-08');
  assert.equal(sheet.getCell('B2').value, '=1+1');
  assert.equal(sheet.getCell('B2').type, ExcelJS.ValueType.String);
  assert.equal(sheet.getCell('E2').value, 123.45);
  assert.equal(sheet.getCell('G2').value, 12345);
  const context = workbook.getWorksheet('Export details');
  assert.match(context.getCell('B2').value, /Current page only/);
  assert.equal(context.getCell('B4').value, 2);
  assert.equal(context.getCell('B6').value, 201);
});
test('gateway export rejects empty, live and unsafe monetary data', async () => {
  await assert.rejects(gatewayPageExcel({ ...data, transactions: [] }, {}));
  await assert.rejects(gatewayPageExcel({ ...data, environment: 'live' }, {}));
  await assert.rejects(gatewayPageExcel({ ...data, transactions: [{ ...data.transactions[0], amountMinor: NaN }] }, {}));
});
test('linked export names remain literal, while ambiguous links never expose guessed names', async () => {
  const workbook = new ExcelJS.Workbook();
  const transactions = [
    { ...data.transactions[0], link: { state: 'matched', playerName: '=SUM(A1:A2)', eventName: 'Synthetic Open' } },
    { ...data.transactions[0], reference: 'duplicate', link: { state: 'ambiguous', playerName: 'Must not export' } },
  ];
  await workbook.xlsx.load(await gatewayPageExcel({ ...data, transactions }, {}));
  const sheet = workbook.getWorksheet('Gateway page');
  assert.equal(sheet.getCell('H2').value, '=SUM(A1:A2)');
  assert.equal(sheet.getCell('H2').type, ExcelJS.ValueType.String);
  assert.equal(sheet.getCell('I2').value, 'Synthetic Open');
  assert.equal(sheet.getCell('H3').value, '');
  assert.match(sheet.getCell('J3').value, /Multiple 4M records/);
});
