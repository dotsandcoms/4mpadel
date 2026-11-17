import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { calculateEventSettlement, eventPayoutRequestLimit } from '../src/utils/eventSettlement.js';
import { registrationFinanceAmounts } from '../src/utils/registrationFinance.js';
import { buildEventFinanceWorkbook } from '../src/utils/eventFinanceExport.js';
import { buildFinanceOverviewSummaries } from '../src/utils/eventFinanceSummary.js';

const registration = id => ({ id, event_id: 479, full_name: id, email: `${id}@example.com`, division: 'Open', status: 'registered', payment_status: 'paid' });
const payment = (id, recipient = '4m') => ({ id, event_id: 479, reference: `receipt-${id}`, amount: 600,
    status: 'success', payment_type: 'event_entry_fee', payment_method: recipient === '4m' ? 'paystack' : 'eft',
    metadata: { registration_id: id, collection_recipient: recipient } });
const metric = (sheet, label) => {
    let result;
    sheet.eachRow(row => { if (row.getCell(1).value === label) result = row.getCell(3); });
    assert.ok(result, `Missing ${label}`);
    return result;
};

test('200 current entries reconcile to the supplied R111,720 across payouts, overview and both Excel reports', async () => {
    const registrations = Array.from({ length: 200 }, (_, i) => registration(String(i)));
    const payments = registrations.map((r, i) => payment(r.id, i < 4 ? 'organiser' : '4m'));
    // Historical withdrawals, completed refunds and unused cash must not alter
    // the agreed 196 current 4M entries or their fee.
    registrations.push({ ...registration('old'), status: 'withdrawn' });
    payments.push(payment('old'), payment('credit'));
    const refunds = [{ id: 'refund-old', payment_id: 'old', event_registration_id: 'old', amount: 600, status: 'processed' }];
    const event = { id: 479, is_manual: true, entry_fee: 600, end_date: '2026-10-18' };
    const input = { event, registrations, payments, refunds };
    const s = calculateEventSettlement(input);
    assert.deepEqual([s.activeEntries, s.totalAmountBilled, s.collectedOrganiser, s.collected4M, s.commission, s.dueToOrg],
        [200, 120000, 2400, 117600, 5880, 111720]);
    assert.equal(s.cashHistory.grossEntryFees, 121200);
    assert.equal(s.unallocatedCash4M, 600);
    assert.equal(eventPayoutRequestLimit(event, s).maxRequestable, 111720);
    const overview = buildFinanceOverviewSummaries({ events: [event], registrations, payments, refunds })[0];
    assert.equal(overview.settlement.dueToOrg, 111720);
    assert.equal(overview.stats.collected, 120000);

    const amounts = new Map(s.allocations.map(a => [a.registration.id, registrationFinanceAmounts(a)]));
    for (const reportType of ['organiser', 'full']) {
        const wb = buildEventFinanceWorkbook({ eventName: 'Nationals example', reportType,
            registrations: registrations.map(r => ({ registrationId: r.id, name: r.full_name,
                registrationStatus: r.status, ...amounts.get(r.id) })), activeRegistrationIds: [...amounts.keys()],
            interimPaid: s.interimPaid, refundFundingAdjustment: s.refundFundingAdjustment });
        const reopened = new ExcelJS.Workbook(); await reopened.xlsx.load(await wb.xlsx.writeBuffer());
        const summary = reopened.getWorksheet('Summary');
        assert.equal(metric(summary, 'Total entry fees').result, 120000);
        assert.equal(metric(summary, 'Paid direct to organiser').result, 2400);
        assert.equal(metric(summary, 'Paid to 4M').result, 117600);
        assert.equal(metric(summary, '4M fee').result, -5880);
        assert.equal(metric(summary, 'Amount due to organiser').result, 111720);
        assert.match(metric(summary, 'Total entry fees').formula, /'Registrations'!M/);
        assert.match(metric(summary, 'Amount due to organiser').formula, /SUM/);
    }
});

test('empty exports have numeric zero totals and never reference their own footer', () => {
    const wb = buildEventFinanceWorkbook({ registrations: [], activeRegistrationIds: [] });
    assert.equal(wb.getWorksheet('Registrations').getCell('R2').formula, '0');
    assert.equal(wb.getWorksheet('Registrations').getCell('R2').result, 0);
    assert.equal(metric(wb.getWorksheet('Summary'), 'Amount due to organiser').result, 0);
});

test('an unconfirmed withdrawn receipt stays visible in history without blocking funded current entries', () => {
    const s = calculateEventSettlement({ event: { entry_fee: 600 }, registrations: [registration('a'), { ...registration('old'), status: 'withdrawn' }],
        payments: [payment('a'), { ...payment('old'), payment_method: 'manual', metadata: { registration_id: 'old' } }] });
    assert.deepEqual(s.issues, []);
    assert.equal(s.cashHistory.issues.length, 1);
    assert.equal(s.dueToOrg, 570);
    assert.equal(eventPayoutRequestLimit({ end_date: '2026-10-01' }, s).maxRequestable, 570);
});

test('a refund funded by the other holder adjusts the transfer once', () => {
    const input = { event: { entry_fee: 600 }, registrations: [registration('a'), registration('club')],
        payments: [payment('a'), payment('club', 'organiser')] };
    const s = calculateEventSettlement({ ...input, refunds: [{ id: 'cross', payment_id: 'club', event_registration_id: 'club',
        amount: 100, status: 'processed', metadata: { refund_funded_by: '4m' } }] });
    assert.equal(s.collected4M, 600);
    assert.equal(s.collectedOrganiser, 500);
    assert.equal(s.refundFundingAdjustment, -100);
    assert.equal(s.dueToOrg, 470);
    const reserved = calculateEventSettlement({ ...input, refunds: [{ id: 'cross', payment_id: 'a', event_registration_id: 'a',
        amount: 100, status: 'pending', metadata: { refund_funded_by: 'organiser' } }] });
    assert.equal(reserved.collected4M, 500);
    assert.equal(reserved.refundFundingAdjustment, 100);
    assert.equal(reserved.dueToOrg, 575);
});
