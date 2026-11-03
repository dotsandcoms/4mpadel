import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { buildLicenseSalesWorkbook, southAfricanExcelDate } from '../src/utils/licenseSalesExport.js';

function fixture() {
  const base = { player_id: 1, name: '=Not a formula', email: 'player@example.test', license_number: '4M-000001', license_year: 2027, renewed_from_year: null, starts_on: '2026-10-15', ends_on: '2027-12-31', event_name: null, coverage_status: 'active', price_basis: 'License payment', payment_method: 'eft', payment_reference: 'LIC-1', checkout_reference: 'PAY-1', has_refund: false, refund_amount: 0, review_note: '' };
  return { from: '2026-03-01', to: '2026-06-30', license_year: null, type: null, currency: 'ZAR', time_zone: 'Africa/Johannesburg', generated_at: '2026-11-03T09:00:00Z', total_sold: 4, priced_sales: 3, gross_amount: 1270, refund_amount: 60, net_amount: 1210, review_count: 1, rows: [
    { ...base, sale_key: 'full:new', kind: 'new_full', purchased_on: '2026-03-11', purchased_at: '2026-03-10T23:00:00Z', price: 650, net_amount: 650 },
    { ...base, sale_key: 'temporary:one', kind: 'temporary', license_year: 2026, purchased_on: '2026-03-15', purchased_at: '2026-03-15T08:30:00Z', price: 120, has_refund: true, refund_amount: 60, net_amount: 60 },
    { ...base, sale_key: 'full:renewal', kind: 'renewal', renewed_from_year: 2026, purchased_on: '2026-04-02', purchased_at: '2026-04-02T09:45:00Z', price: 500, net_amount: 500 },
    { ...base, sale_key: 'temporary:unknown', kind: 'temporary', license_year: 2026, purchased_on: '2026-05-20', purchased_at: '2026-05-20T08:00:00Z', price: null, has_refund: true, refund_amount: null, net_amount: null, price_basis: 'License price needs review', review_note: 'License price needs review; Refund amount needs review' },
  ] };
}

test('federation workbook reconciles monthly quantities and recorded prices, including empty months', async () => {
  const workbook = buildLicenseSalesWorkbook(fixture());
  assert.deepEqual(workbook.worksheets.map(sheet => sheet.name), ['Monthly summary', 'Price breakdown', 'License sales']);
  const monthly = workbook.getWorksheet('Monthly summary');
  assert.equal(monthly.getCell('E8').value.result, 2);
  assert.equal(monthly.getCell('F8').value.result, 770);
  assert.equal(monthly.getCell('G8').value.result, 60);
  assert.equal(monthly.getCell('H8').value.result, 710);
  assert.equal(monthly.getCell('I10').value.result, 1);
  assert.equal(monthly.getCell('J10').value.result, 1);
  assert.equal(monthly.getCell('E11').result, 0);
  assert.equal(monthly.getCell('E12').value.result, 4);
  assert.equal(monthly.getCell('F12').value.result, 1270);
  assert.equal(monthly.getCell('H12').value.result, 1210);
  assert.match(monthly.getCell('F8').value.formula, /SUMIFS\('License sales'/);
  const restored = new ExcelJS.Workbook(); await restored.xlsx.load(await workbook.xlsx.writeBuffer());
  const detail = restored.getWorksheet('License sales');
  assert.equal(detail.getCell('B8').value.toISOString(), '2026-03-11T01:00:00.000Z');
  assert.equal(detail.getCell('G8').value, 2027);
  assert.equal(detail.getCell('C8').value, '=Not a formula');
  assert.equal(detail.getCell('L11').value, null);
  assert.equal(detail.getCell('M11').value, null);
  assert.equal(detail.getCell('N11').value.result ?? '', '');
  assert.equal(detail.views[0].ySplit, 7);
  assert.match(detail.getCell('L8').numFmt, /#,##0.00/);
  assert.equal(detail.autoFilter, 'A7:W11');
});

test('export refuses duplicate units or unreconciled source totals', () => {
  const duplicate = fixture(); duplicate.rows[1].sale_key = duplicate.rows[0].sale_key;
  assert.throws(() => buildLicenseSalesWorkbook(duplicate), /Duplicate sales/);
  const wrongMoney = fixture(); wrongMoney.gross_amount = 1990;
  assert.throws(() => buildLicenseSalesWorkbook(wrongMoney), /amounts do not reconcile/);
  const wrongCount = fixture(); wrongCount.total_sold = 5;
  assert.throws(() => buildLicenseSalesWorkbook(wrongCount), /source totals/);
});

test('empty periods remain valid workbooks without fabricated sales', () => {
  const empty = { ...fixture(), rows: [], total_sold: 0, priced_sales: 0, gross_amount: 0, refund_amount: 0, net_amount: 0, review_count: 0 };
  const workbook = buildLicenseSalesWorkbook(empty);
  assert.equal(workbook.getWorksheet('Monthly summary').getCell('E12').result, 0);
  assert.equal(workbook.getWorksheet('License sales').getCell('A8').value, 'No paid license sales in this period');
});

test('purchase times use South African wall-clock dates across UTC month boundaries', () => {
  assert.equal(southAfricanExcelDate('2026-03-31T22:15:36Z', true).toISOString(), '2026-04-01T00:15:36.000Z');
});
