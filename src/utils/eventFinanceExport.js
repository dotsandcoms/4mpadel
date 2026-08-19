import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

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

const addMetric = (sheet, label, value, { money = false, note = '' } = {}) => {
    const row = sheet.addRow([label, value, note]);
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
 *   summary: Array<{ section?: string, label: string, value: string|number, money?: boolean, note?: string }>,
 *   lineItems: Array<object>,
 *   registrations: Array<object>,
 *   payments: Array<object>,
 *   refunds: Array<object>,
 *   reportType?: 'full'|'organiser',
 * }} payload
 */
export async function downloadEventFinanceWorkbook(payload) {
    const {
        eventName,
        eventDate,
        summary = [],
        lineItems = [],
        registrations = [],
        payments = [],
        refunds = [],
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
            ? 'This report contains the event settlement summary and registration list. Registration payment-status cells are colour coded: green = paid, amber = pending, red = refunded, grey = withdrawn, blue = comped.'
            : 'How to read this file: Summary totals must match the Line items sheet. '
                + 'The balance due from 4M is final entry sales less the 5% platform fee and interim payments. '
                + 'License fees stay with 4M.',
    ]);
    wsSummary.mergeCells(`A${wsSummary.rowCount}:C${wsSummary.rowCount}`);
    wsSummary.getRow(wsSummary.rowCount).alignment = { wrapText: true };
    wsSummary.getRow(wsSummary.rowCount).height = 42;
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
        addMetric(wsSummary, row.label, row.value, { money: row.money, note: row.note || '' });
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
        'License', 'Payment Status', 'Payment Channel', 'Entry Amount (ZAR)',
        'Comped', 'Registration Status', 'Registered At', 'Payment Note',
    ];
    styleHeader(wsRegs.addRow(regHeaders));
    registrations.forEach((r) => {
        const row = wsRegs.addRow([
            r.name || '',
            r.email || '',
            r.phone || '',
            r.division || '',
            r.partner || '',
            r.partnerEmail || '',
            r.license || '',
            r.paymentStatus || '',
            r.channel || '',
            Number(r.entryAmount || 0),
            r.comped ? 'Yes' : 'No',
            r.registrationStatus || '',
            r.registeredAt ? new Date(r.registeredAt) : '',
            r.note || '',
        ]);
        row.getCell(10).numFmt = MONEY_FMT;
        row.getCell(13).numFmt = 'dd mmm yyyy hh:mm';
        styleStatusRow(row, r.paymentStatus);
        styleStatus(row.getCell(8), r.paymentStatus);
    });
    wsRegs.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: Math.max(1, registrations.length + 1), column: regHeaders.length },
    };
    wsRegs.views = [{ state: 'frozen', ySplit: 1 }];
    autosize(wsRegs, 12, 36);

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

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const reportSuffix = isOrganiserReport ? 'organiser-consolidated' : 'full-event-report';
    saveAs(blob, `${slugify(eventName)}-${reportSuffix}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
