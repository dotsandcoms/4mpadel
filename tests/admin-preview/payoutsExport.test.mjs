import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { recordedPayoutsExcel } from '../../src/pages/admin-preview/payoutsExport.js';
const rows = Array.from({ length: 23 }, (_, id) => ({ eventId: id, eventName: '=1+1', organiserName: 'Synthetic organiser', recordId: `record-${id}`, paidAt: '2026-09-08', amountCents: id ? 125050 : null, note: '=SUM(A1:A2)', warnings: id ? [] : ['Invalid recorded amount'] }));
test('payout Excel exports all matching pages, literal names and blank invalid amounts', async () => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await recordedPayoutsExcel(rows, [{ eventId: 50, eventName: 'Broken event', message: 'Unreadable list' }], { query: 'synthetic' }));
  const sheet = workbook.getWorksheet('Recorded payouts');
  assert.equal(sheet.rowCount, 24);
  assert.equal(sheet.getCell('F2').value, null);
  assert.equal(sheet.getCell('F24').value, 1250.5);
  assert.equal(sheet.getCell('B2').type, ExcelJS.ValueType.String);
  assert.equal(sheet.getCell('G2').value, '=SUM(A1:A2)');
  assert.equal(workbook.getWorksheet('Unreadable event records').getCell('A2').value, '50');
  assert.match(workbook.getWorksheet('Export details').getCell('B2').value, /All matching/);
});
test('issue-only workbook is supported; empty and unsafe exports reject', async () => {
  await recordedPayoutsExcel([], [{ eventId: 1, message: 'Bad list' }], {});
  await assert.rejects(recordedPayoutsExcel([], [], {}));
  await assert.rejects(recordedPayoutsExcel([{ ...rows[1], amountCents: Infinity }], [], {}));
});
