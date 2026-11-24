import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { buildEventFinanceWorkbook } from '../src/utils/eventFinanceExport.js';

const payload = {
    eventName: 'Example', reportType: 'organiser', activeRegistrationIds: ['active'],
    summary: [{ section: 'Settlement', label: 'Balance due from 4M', value: 112200, money: true }],
    registrations: [{ registrationId: 'active', name: 'Current player', registrationStatus: 'registered', entryAmount: 600, paidTo4M: 600 }, { registrationId: 'old', name: 'Withdrawn player', registrationStatus: 'withdrawn', entryAmount: 600 }],
    receiptReport: {
        withdrawals: [{ name: 'Withdrawn player', payerEmail: 'partner@example.com', amount: 600, refunded: 200, reserved: 100, retained: 300, applied: 0, reference: 'T123', status: 'Refund pending' }],
        receipts: [{ payerEmail: 'partner@example.com', amount: 1200, refunded: 200, reserved: 100, retained: 900, reference: 'T123' }],
    },
};
test('organiser XLSX separates current entries, withdrawals and canonical receipts and preserves settlement', async () => {
    const buffer = await buildEventFinanceWorkbook(payload).xlsx.writeBuffer();
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buffer);
    assert.deepEqual(wb.worksheets.map(s => s.name), ['Summary', 'Registrations', 'Withdrawals', '4M receipts']);
    assert.equal(wb.getWorksheet('Registrations').rowCount, 3);
    const summary = wb.getWorksheet('Summary');
    assert.equal(summary.getRow(summary.rowCount).getCell(1).value, 'Amount due to organiser');
    assert.equal(summary.getRow(summary.rowCount).getCell(3).result, 570);
    assert.equal(summary.rowCount, 10);
    const withdrawals = wb.getWorksheet('Withdrawals');
    assert.equal(withdrawals.getCell('F2').value, 'partner@example.com');
    assert.deepEqual(withdrawals.getCell('L2').value, { formula: 'I2-J2-K2', result: 300 });
    assert.deepEqual(withdrawals.getCell('I3').value, { formula: 'SUM(I2:I2)', result: 600 });
    assert.equal(withdrawals.autoFilter, 'A1:S2');
    assert.deepEqual(wb.getWorksheet('4M receipts').getCell('I2').value, { formula: 'F2-G2-H2', result: 900 });
});
test('full export retains the raw registration, payment and refund ledgers', () => {
    const wb = buildEventFinanceWorkbook({ ...payload, reportType: 'full', payments: [{ amount: 1200, reference: 'T123' }], refunds: [{ amount: 200, status: 'processed' }] });
    assert.equal(wb.getWorksheet('Registrations').rowCount, 4);
    assert.equal(wb.getWorksheet('Payments ledger').getCell('E2').value, 1200);
    assert.equal(wb.getWorksheet('Refunds ledger').getCell('D2').value, -200);
});

test('registration exports preserve partner payer, club recipient, paid amounts and the 4M-only fee explanation', async () => {
    const wb = buildEventFinanceWorkbook({ ...payload, reportType: 'full', activeRegistrationIds: ['partner'], registrations: [{
        registrationId: 'partner', name: 'Jason', paymentStatus: 'Paid by Partner Faiyaad', channel: 'Partner (Faiyaad)',
        entryAmount: 800, paidTo4M: 0, paidDirectToOrganiser: 800, recipientUnconfirmed: 0, outstanding: 0,
        collectionRecipient: 'VAPC', note: 'Paid In-store 24/10',
    }] });
    const output = new ExcelJS.Workbook(); await output.xlsx.load(await wb.xlsx.writeBuffer());
    const sheet = output.getWorksheet('Registrations');
    assert.equal(sheet.getCell('K2').value, 'Paid by Partner Faiyaad');
    assert.deepEqual(['R2', 'S2', 'T2', 'U2', 'V2'].map(cell => sheet.getCell(cell).value), [0, 800, 0, 0, 'VAPC']);
    assert.equal(output.getWorksheet('Summary').getCell('A7').value, 'Paid direct to organiser');
    assert.equal(output.getWorksheet('Summary').getCell('C7').result, 800);
    assert.equal(output.getWorksheet('Summary').getCell('C9').result, 0);
});

test('the receipts sheet shows the held unallocated credit separately from retained cash', async () => {
    const wb = buildEventFinanceWorkbook({ ...payload, receiptReport: { ...payload.receiptReport,
        receipts: [{ ...payload.receiptReport.receipts[0], unallocatedCredit: 800 }],
    } });
    const output = new ExcelJS.Workbook(); await output.xlsx.load(await wb.xlsx.writeBuffer());
    const sheet = output.getWorksheet('4M receipts');
    assert.equal(sheet.getCell('Q1').value, 'Unallocated credit reserved (ZAR)');
    assert.equal(sheet.getCell('Q2').value, 800);
    assert.equal(sheet.getCell('Q3').value.result, 800);
});

test('the short summary includes outstanding amounts and prior payouts when needed', () => {
    const wb = buildEventFinanceWorkbook({ ...payload, interimPaid: 100, refundFundingAdjustment: -20,
        registrations: [{ ...payload.registrations[0], entryAmount: 900, paidTo4M: 600, recipientUnconfirmed: 200, outstanding: 100 }],
    });
    const rows = new Map();
    wb.getWorksheet('Summary').eachRow(row => rows.set(row.getCell(1).value, row));
    assert.equal(rows.get('Recipient unconfirmed').getCell(3).result, 200);
    assert.equal(rows.get('Outstanding entry fees (excluded)').getCell(3).result, 100);
    assert.equal(rows.get('Already paid to organiser').getCell(3).value, -100);
    assert.equal(rows.get('Refund funding adjustment').getCell(3).value, -20);
    assert.equal(rows.get('Amount due to organiser').getCell(3).result, 450);
    assert.ok(!rows.has('Cash history'));
    assert.ok(!rows.has('Available for payout'));
});
