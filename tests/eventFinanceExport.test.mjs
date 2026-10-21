import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { buildEventFinanceWorkbook } from '../src/utils/eventFinanceExport.js';

const payload = {
    eventName: 'Example', reportType: 'organiser', activeRegistrationIds: ['active'],
    summary: [{ section: 'Settlement', label: 'Balance due from 4M', value: 112200, money: true }],
    registrations: [{ registrationId: 'active', name: 'Current player', registrationStatus: 'registered' }, { registrationId: 'old', name: 'Withdrawn player', registrationStatus: 'withdrawn' }],
    receiptReport: {
        withdrawals: [{ name: 'Withdrawn player', payerEmail: 'partner@example.com', amount: 600, refunded: 200, reserved: 100, retained: 300, applied: 0, reference: 'T123', status: 'Refund pending' }],
        receipts: [{ payerEmail: 'partner@example.com', amount: 1200, refunded: 200, reserved: 100, retained: 900, reference: 'T123' }],
    },
};
test('organiser XLSX separates current entries, withdrawals and canonical receipts and preserves settlement', async () => {
    const buffer = await buildEventFinanceWorkbook(payload).xlsx.writeBuffer();
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buffer);
    assert.deepEqual(wb.worksheets.map(s => s.name), ['Summary', 'Registrations', 'Withdrawals', '4M receipts']);
    assert.equal(wb.getWorksheet('Registrations').rowCount, 2);
    const summary = wb.getWorksheet('Summary');
    assert.equal(summary.getRow(summary.rowCount).getCell(2).value, 112200);
    const withdrawals = wb.getWorksheet('Withdrawals');
    assert.equal(withdrawals.getCell('F2').value, 'partner@example.com');
    assert.deepEqual(withdrawals.getCell('L2').value, { formula: 'I2-J2-K2', result: 300 });
    assert.deepEqual(withdrawals.getCell('I3').value, { formula: 'SUM(I2:I2)', result: 600 });
    assert.equal(withdrawals.autoFilter, 'A1:S2');
    assert.deepEqual(wb.getWorksheet('4M receipts').getCell('I2').value, { formula: 'F2-G2-H2', result: 900 });
});
test('full export retains the raw registration, payment and refund ledgers', () => {
    const wb = buildEventFinanceWorkbook({ ...payload, reportType: 'full', payments: [{ amount: 1200, reference: 'T123' }], refunds: [{ amount: 200, status: 'processed' }] });
    assert.equal(wb.getWorksheet('Registrations').rowCount, 3);
    assert.equal(wb.getWorksheet('Payments ledger').getCell('E2').value, 1200);
    assert.equal(wb.getWorksheet('Refunds ledger').getCell('D2').value, -200);
});
