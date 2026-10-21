import ExcelJS from 'exceljs';
import FileSaver from 'file-saver';

const { saveAs } = FileSaver;

const MONEY_FMT = '"R"#,##0.00';

const STATUS_STYLES = {
    paid: { fill: 'FFE8F5E9', font: 'FF166534' },
    success: { fill: 'FFE8F5E9', font: 'FF166534' },
    processed: { fill: 'FFE8F5E9', font: 'FF166534' },
    pending: { fill: 'FFFEF3C7', font: 'FF92400E' },
    processing: { fill: 'FFFEF3C7', font: 'FF92400E' },
    refunded: { fill: 'FFFEE2E2', font: 'FFB91C1C' },
    withdrawn: { fill: 'FFF3F4F6', font: 'FF4B5563' },
    cancelled: { fill: 'FFFEE2E2', font: 'FFB91C1C' },
    failed: { fill: 'FFFEE2E2', font: 'FFB91C1C' },
    comped: { fill: 'FFE0F2FE', font: 'FF0369A1' },
};

const styleStatus = (cell, status) => {
    const style = STATUS_STYLES[String(status || '').toLowerCase()];
    if (!style) return;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: style.fill } };
    cell.font = { name: 'Arial', bold: true, color: { argb: style.font } };
};

const styleStatusRow = (row, status) => {
    const style = STATUS_STYLES[String(status || '').toLowerCase()];
    if (!style) return;
    row.eachCell({ includeEmpty: false }, (cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: style.fill } };
    });
};

const slugify = (value) => String(value || 'event')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'event';

/**
 * Autosize worksheet columns from cell text.
 * @param {ExcelJS.Worksheet} sheet
 * @param {number} [min]
 * @param {number} [max]
 */
const autosize = (sheet, min = 12, max = 46) => {
    sheet.columns.forEach((column) => {
        let widest = min;
        column.eachCell({ includeEmpty: true }, (cell) => {
            const text = cell.value == null ? '' : String(cell.value);
            widest = Math.max(widest, Math.min(max, text.length + 2));
        });
        column.width = widest;
    });
};

const styleHeader = (row) => {
    row.font = { bold: true, color: { argb: 'FF111111' } };
    row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFBEFF00' },
    };
    row.alignment = { vertical: 'middle', wrapText: true };
};

const addSectionTitle = (sheet, text) => {
    const row = sheet.addRow([text]);
    row.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
    row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1A1A1A' },
    };
    return row;
};

const addMetric = (sheet, label, value, { money = false, note = '', bold = false } = {}) => {
    const row = sheet.addRow([label, value, note]);
    if (bold) row.font = { bold: true };
    if (money && typeof value === 'number') {
        row.getCell(2).numFmt = MONEY_FMT;
    }
    return row;
};

/**
 * Download a multi-sheet Excel workbook for one event's finances.
 * @param {{
 *   eventName: string,
 *   eventDate?: string|null,
 *   summary: Array<{ section?: string, label: string, value: string|number, money?: boolean, bold?: boolean, note?: string }>,
 *   lineItems: Array<object>,
 *   registrations: Array<object>,
 *   payments: Array<object>,
 *   refunds: Array<object>,
 *   reportType?: 'full'|'organiser',
 *   activeRegistrationIds?: string[],
 *   receiptReport?: { withdrawals: Array<object>, receipts: Array<object> },
 * }} payload
 */
export function buildEventFinanceWorkbook(payload) {
    const {
        eventName,
        eventDate,
        summary = [],
        lineItems = [],
        registrations = [],
        payments = [],
        refunds = [],
        receiptReport = null,
        activeRegistrationIds = null,
        reportType = 'full',
    } = payload;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = '4M Padel';
    workbook.created = new Date();

    const isOrganiserReport = reportType === 'organiser';
    const wsSummary = workbook.addWorksheet('Summary');
    wsSummary.addRow([isOrganiserReport ? '4M Padel — Organiser Consolidated Event Report' : '4M Padel — Event Finance Export']).font = { bold: true, size: 16 };
    wsSummary.addRow(['Event', eventName || '—']);
    if (eventDate) wsSummary.addRow(['Event date', eventDate]);
    wsSummary.addRow(['Generated', new Date().toLocaleString('en-ZA')]);
    wsSummary.addRow([]);
    wsSummary.addRow([
        isOrganiserReport
            ? 'Registrations lists current entries. Withdrawals shows previous payments and refunds separately. 4M receipts lists each Paystack entry receipt once, including external links. Withdrawal amounts are a breakdown of those receipts, not extra income. Club collections and licence fees are excluded from 4M receipts.'
            : 'How to read this file: Summary totals must match the Line items sheet. '
                + 'The balance due from 4M is Paystack entry funds after refunds, plus any explicit confirmed settlement adjustment, less 5% of active entry fees and interim payments. Club / organiser collections are excluded. '
                + 'License fees stay with 4M.',
    ]);
    wsSummary.mergeCells(`A${wsSummary.rowCount}:C${wsSummary.rowCount}`);
    wsSummary.getRow(wsSummary.rowCount).alignment = { wrapText: true };
    wsSummary.getRow(wsSummary.rowCount).height = isOrganiserReport ? 66 : 42;
    wsSummary.addRow([]);

    let currentSection = '';
    summary.forEach((row) => {
        if (row.section && row.section !== currentSection) {
            currentSection = row.section;
            wsSummary.addRow([]);
            addSectionTitle(wsSummary, row.section);
            const header = wsSummary.addRow(['Metric', 'Value', 'Notes']);
            styleHeader(header);
        }
        addMetric(wsSummary, row.label, row.value, { money: row.money, bold: row.bold, note: row.note || '' });
    });
    autosize(wsSummary, 18, 70);
    wsSummary.getColumn(2).width = 22;

    if (reportType === 'full') {
    const wsLines = workbook.addWorksheet('Line items');
    const lineHeaders = [
        'Date', 'Category', 'Bucket', 'Description', 'Player / Team', 'Email', 'Division',
        'Amount (ZAR)', 'Status', 'Method', 'Reference', 'Note',
    ];
    styleHeader(wsLines.addRow(lineHeaders));
    lineItems.forEach((item) => {
        const row = wsLines.addRow([
            item.date ? new Date(item.date) : '',
            item.category || '',
            item.bucket || '',
            item.description || '',
            item.player || '',
            item.email || '',
            item.division || '',
            Number(item.amount || 0),
            item.status || '',
            item.method || '',
            item.reference || '',
            item.note || '',
        ]);
        row.getCell(1).numFmt = 'dd mmm yyyy hh:mm';
        row.getCell(8).numFmt = MONEY_FMT;
        styleStatusRow(row, item.status);
        if (Number(item.amount) < 0) {
            row.getCell(8).font = { color: { argb: 'FFDC2626' } };
        }
        styleStatus(row.getCell(9), item.status);
    });
    wsLines.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: Math.max(1, lineItems.length + 1), column: lineHeaders.length },
    };
    wsLines.views = [{ state: 'frozen', ySplit: 1 }];
    autosize(wsLines, 12, 42);
    wsLines.getColumn(8).width = 16;
    }

    const wsRegs = workbook.addWorksheet('Registrations');
    const regHeaders = [
        'Name', 'Email', 'Phone', 'Division', 'Partner', 'Partner Email',
        'T-shirt Size', 'T-shirt Sponsor', 'T-shirt Logo', 'License',
        'Payment Status', 'Payment Channel', 'Entry Amount (ZAR)', 'Comped',
        'Registration Status', 'Registered At', 'Payment Note',
    ];
    styleHeader(wsRegs.addRow(regHeaders));
    const exportedRegistrations = isOrganiserReport && activeRegistrationIds
        ? registrations.filter(r => activeRegistrationIds.includes(r.registrationId)) : registrations;
    exportedRegistrations.forEach((r) => {
        const row = wsRegs.addRow([
            r.name || '',
            r.email || '',
            r.phone || '',
            r.division || '',
            r.partner || '',
            r.partnerEmail || '',
            r.tshirtSize || '',
            r.tshirtSponsorName || '',
            r.tshirtLogoUrl ? { text: 'View logo', hyperlink: r.tshirtLogoUrl, tooltip: 'Open uploaded T-shirt logo' } : '',
            r.license || '',
            r.paymentStatus || '',
            r.channel || '',
            Number(r.entryAmount || 0),
            r.comped ? 'Yes' : 'No',
            r.registrationStatus || '',
            r.registeredAt ? new Date(r.registeredAt) : '',
            r.note || '',
        ]);
        row.getCell(13).numFmt = MONEY_FMT;
        row.getCell(16).numFmt = 'dd mmm yyyy hh:mm';
        styleStatusRow(row, r.paymentStatus);
        styleStatus(row.getCell(11), r.paymentStatus);
        if (r.tshirtLogoUrl) {
            row.getCell(9).font = { name: 'Arial', color: { argb: 'FF2563EB' }, underline: true };
        }
    });
    wsRegs.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: Math.max(1, exportedRegistrations.length + 1), column: regHeaders.length },
    };
    wsRegs.views = [{ state: 'frozen', ySplit: 1 }];
    autosize(wsRegs, 12, 36);
    wsRegs.getColumn(9).width = 15;

    if (receiptReport) {
        const addHistorySheet = (name, columns, rows) => {
            const sheet = workbook.addWorksheet(name);
            styleHeader(sheet.addRow(columns.map(c => c.label)));
            sheet.getRow(1).height = 60;
            rows.forEach(item => {
                const row = sheet.addRow(columns.map(c => {
                    if (c.date) return item[c.key] ? new Date(item[c.key]) : '';
                    if (c.money) return item[c.key] === null ? '' : Number(item[c.key] || 0);
                    return item[c.key] || '';
                }));
                columns.forEach((c, index) => {
                    if (c.money) row.getCell(index + 1).numFmt = MONEY_FMT;
                    if (c.date) row.getCell(index + 1).numFmt = 'dd mmm yyyy hh:mm';
                    if (c.key === 'status') styleStatus(row.getCell(index + 1), item.status);
                    if (c.key === 'retained' && item.retained !== null) {
                        const col = key => row.getCell(columns.findIndex(column => column.key === key) + 1).address;
                        row.getCell(index + 1).value = { formula: `${col('amount')}-${col('refunded')}-${col('reserved')}`, result: Number(item.retained || 0) };
                    }
                });
            });
            sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, rows.length + 1), column: columns.length } };
            sheet.views = [{ state: 'frozen', ySplit: 1, xSplit: 1 }];
            autosize(sheet, 14, 46);
            columns.forEach((c, index) => {
                if (c.money) sheet.getColumn(index + 1).width = 18;
                if (c.date) sheet.getColumn(index + 1).width = 22;
            });
            if (rows.length) {
                const totals = sheet.addRow(['Totals (detail)']);
                styleHeader(totals);
                columns.forEach((c, index) => {
                    if (!c.money) return;
                    const letter = sheet.getColumn(index + 1).letter;
                    totals.getCell(index + 1).value = { formula: `SUM(${letter}2:${letter}${rows.length + 1})`, result: rows.reduce((s, r) => s + Number(r[c.key] || 0), 0) };
                    totals.getCell(index + 1).numFmt = MONEY_FMT;
                });
            }
        };
        addHistorySheet('Withdrawals', [
            { key: 'name', label: 'Withdrawn player' }, { key: 'email', label: 'Player email' },
            { key: 'division', label: 'Withdrawn division' }, { key: 'status', label: 'Payment outcome' },
            { key: 'payerName', label: 'Payer name (recorded)' }, { key: 'payerEmail', label: 'Payer email' },
            { key: 'paidAt', label: 'Paid at', date: true }, { key: 'withdrawnAt', label: 'Withdrawn at', date: true },
            { key: 'amount', label: 'Entry share received (ZAR)', money: true },
            { key: 'refunded', label: 'Entry share refunded (ZAR)', money: true },
            { key: 'reserved', label: 'Refund pending (ZAR)', money: true },
            { key: 'retained', label: 'After refunds / reserve (ZAR)', money: true },
            { key: 'applied', label: 'Of which reused for current entry (ZAR)', money: true },
            { key: 'holder', label: 'Funds holder' }, { key: 'method', label: 'Payment method' },
            { key: 'reference', label: 'Original receipt / confirmation' },
            { key: 'refundedAt', label: 'Last refund date', date: true }, { key: 'refundReferences', label: 'Refund references' },
            { key: 'note', label: 'Notes' },
        ], receiptReport.withdrawals || []);
        addHistorySheet('4M receipts', [
            { key: 'payerName', label: 'Payer name (recorded)' }, { key: 'payerEmail', label: 'Payer email' },
            { key: 'paidAt', label: 'Paid at', date: true }, { key: 'players', label: 'Players covered' },
            { key: 'divisions', label: 'Original divisions' },
            { key: 'amount', label: 'Entry fees received (ZAR)', money: true },
            { key: 'refunded', label: 'Entry fees refunded (ZAR)', money: true },
            { key: 'reserved', label: 'Refund pending (ZAR)', money: true },
            { key: 'retained', label: 'Held after refunds / reserve (ZAR)', money: true },
            { key: 'holder', label: 'Funds holder' }, { key: 'method', label: 'Payment method' },
            { key: 'reference', label: 'Paystack receipt reference' },
            { key: 'refundedAt', label: 'Last refund date', date: true }, { key: 'refundReferences', label: 'Refund references' },
            { key: 'status', label: 'Receipt evidence' }, { key: 'note', label: 'Notes' },
        ], receiptReport.receipts || []);
    }

    if (reportType === 'full') {
    const wsPay = workbook.addWorksheet('Payments ledger');
    const payHeaders = [
        'Date', 'Status', 'Payment Type', 'Method', 'Amount (ZAR)', 'Player / Email',
        'Reference', 'Paystack Ref', 'Note',
    ];
    styleHeader(wsPay.addRow(payHeaders));
    payments.forEach((p) => {
        const row = wsPay.addRow([
            p.created_at ? new Date(p.created_at) : '',
            p.status || '',
            p.payment_type || '',
            p.payment_method || '',
            Number(p.amount || 0),
            p.player_email || p.email || p.metadata?.email || '',
            p.reference || '',
            p.paystack_reference || p.metadata?.paystack_reference || '',
            p.metadata?.note || p.metadata?.payment_note || '',
        ]);
        row.getCell(1).numFmt = 'dd mmm yyyy hh:mm';
        row.getCell(5).numFmt = MONEY_FMT;
        styleStatusRow(row, p.status);
        styleStatus(row.getCell(2), p.status);
    });
    wsPay.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: Math.max(1, payments.length + 1), column: payHeaders.length },
    };
    wsPay.views = [{ state: 'frozen', ySplit: 1 }];
    autosize(wsPay, 12, 40);

    const wsRefunds = workbook.addWorksheet('Refunds ledger');
    const refundHeaders = [
        'Date', 'Status', 'Cover', 'Amount (ZAR)', 'Registration ID', 'Payment ID',
        'Paystack Refund Ref', 'Note',
    ];
    styleHeader(wsRefunds.addRow(refundHeaders));
    refunds.forEach((rf) => {
        const row = wsRefunds.addRow([
            (rf.processed_at || rf.created_at) ? new Date(rf.processed_at || rf.created_at) : '',
            rf.status || '',
            rf.cover || rf.metadata?.cover_type || '',
            -Math.abs(Number(rf.amount || 0)),
            rf.event_registration_id || '',
            rf.payment_id || '',
            rf.paystack_refund_id || rf.provider_refund_id || '',
            rf.failure_reason || rf.metadata?.note || '',
        ]);
        row.getCell(1).numFmt = 'dd mmm yyyy hh:mm';
        row.getCell(4).numFmt = MONEY_FMT;
        styleStatusRow(row, rf.status);
        row.getCell(4).font = { color: { argb: 'FFDC2626' } };
        styleStatus(row.getCell(2), rf.status);
    });
    wsRefunds.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: Math.max(1, refunds.length + 1), column: refundHeaders.length },
    };
    wsRefunds.views = [{ state: 'frozen', ySplit: 1 }];
    autosize(wsRefunds, 12, 36);
    }

    workbook.eachSheet((sheet) => {
        sheet.eachRow({ includeEmpty: false }, (row) => {
            row.eachCell({ includeEmpty: false }, (cell) => {
                cell.font = { name: 'Arial', ...(cell.font || {}) };
            });
        });
    });

    return workbook;
}

export async function downloadEventFinanceWorkbook(payload) {
    const workbook = buildEventFinanceWorkbook(payload);
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const reportSuffix = payload.reportType === 'organiser' ? 'organiser-consolidated' : 'full-event-report';
    saveAs(blob, `${slugify(payload.eventName)}-${reportSuffix}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
