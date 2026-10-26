import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { clubsExcel } from '../../src/pages/admin-preview/clubsExport.js';
test('club workbook includes all supplied pages and literal text without contacts', async () => {
  const rows = Array.from({ length: 12 }, (_, id) => ({ id, name: '=HYPERLINK("bad")', verified: id === 0 ? null : false, sapa_registered: true, contact_email: 'private@example.invalid' }));
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await clubsExcel(rows, { query: 'Example' }));
  const sheet = workbook.getWorksheet('Clubs');
  assert.equal(sheet.rowCount, 13); assert.equal(sheet.getCell('B2').type, ExcelJS.ValueType.String);
  assert.equal(sheet.getCell('I2').value, 'Not recorded'); assert.equal(sheet.getCell('I3').value, 'Not verified');
  assert.ok(!JSON.stringify(workbook.model).includes('private@example.invalid'));
  await assert.rejects(clubsExcel([], {}), /No matching/);
});
