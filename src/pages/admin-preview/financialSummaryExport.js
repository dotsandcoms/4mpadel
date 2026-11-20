export const eventColumns = ['Player', 'Email', 'Event', 'Division', 'Licence', 'Entry status', 'Billed (ZAR)', 'Net entry funds (ZAR)', 'Refunded (ZAR)', 'Refund reserve (ZAR)', 'Outstanding (ZAR)'];
export const playerColumns = ['Player', 'Email', 'Licence', 'Registration status', 'Account setup', 'Gross receipts (ZAR)', 'Refunds and reserves (ZAR)', 'Net receipts (ZAR)'];
const transactionColumns = ['Date', 'Entry', 'Reference', 'Player', 'Event', 'Type', 'Method', 'Amount (ZAR)', 'Status', 'Included in receipts basis'];
const rands = cents => Number(cents || 0) / 100;
const amountFormat = '"R"#,##0.00;[Red]-"R"#,##0.00';
export const eventReportRow = row => [row.name, row.email, row.event, row.division, row.licence, row.status, row.billed, row.net, row.refunded, row.reserve, row.outstanding];
export const playerReportRow = row => [row.name, row.email, row.licence, row.status, row.setup, rands(row.gross), rands(row.refunds), rands(row.net)];

function csvCell(value) {
  const text = String(value ?? '');
  const safe = typeof value === 'string' && /^[=+@-]/.test(text.replace(/\p{Cc}/gu, '').trimStart()) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function financialSummaryCsv(view, rows) {
  const player = view === 'players';
  return '\uFEFF' + [player ? playerColumns : eventColumns, ...rows.map(player ? playerReportRow : eventReportRow)]
    .map(row => row.map(csvCell).join(',')).join('\r\n');
}

export function downloadFinancialSummary(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function addTable(sheet, headers, rows, widths, firstMoneyColumn, lastMoneyColumn = headers.length) {
  const header = sheet.addRow(headers);
  header.font = { bold: true };
  for (const row of rows) sheet.addRow(row);
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  for (let column = firstMoneyColumn; column <= lastMoneyColumn; column++) sheet.getColumn(column).numFmt = amountFormat;
  sheet.autoFilter = { from: { row: header.number, column: 1 }, to: { row: header.number, column: headers.length } };
  sheet.views = [{ state: 'frozen', ySplit: header.number }];
}

function eventSheetName(workbook, event) {
  const base = [...String(event.event_name || '')].filter(character => !'\\/*?:[]'.includes(character)).join('').replace(/\s+/g, ' ').trim().replace(/^'+|'+$/g, '').trim();
  const title = base && base.toLowerCase() !== 'history' ? base : `Event ${event.id}`;
  const used = new Set(workbook.worksheets.map(sheet => sheet.name.toLowerCase()));
  let name = title.slice(0, 31).replace(/'+$/g, '');
  for (let count = 2; used.has(name.toLowerCase()); count++) {
    const suffix = ` (${count})`;
    name = title.slice(0, 31 - suffix.length) + suffix;
  }
  return name;
}

export async function buildFinancialSummaryWorkbook(data) {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const platform = data.scope.mode === 'platform';
  workbook.creator = '4M Padel';
  const summary = workbook.addWorksheet(platform ? 'Global Summary' : 'Scoped Summary');
  summary.addRow(['4M Padel consolidated financial report']).font = { size: 16, bold: true };
  summary.addRow(['Scope', data.scope.label]);
  summary.addRow(['Gross receipts', rands(data.overview.totals.gross)]).getCell(2).numFmt = amountFormat;
  summary.addRow(['Recorded refunds and reserves', rands(data.overview.totals.refunds)]).getCell(2).numFmt = amountFormat;
  summary.addRow(['Net receipts', rands(data.overview.totals.net)]).getCell(2).numFmt = amountFormat;
  summary.addRow(['Player accounts', data.players.length]);
  summary.addRow(['Full licence accounts', data.players.filter(row => row.licence === 'Full licence').length]);
  summary.addRow(['Temporary licence accounts', data.players.filter(row => row.licence === 'Temporary licence').length]);
  summary.addRow(['Reported event entries', data.entries.length]);
  summary.addRow([]);
  addTable(summary, ['Payment type', 'Receipts', 'Gross (ZAR)', 'Refunds and reserves (ZAR)', 'Net (ZAR)'],
    data.overview.rows.map(row => [row.type, row.count, rands(row.gross), rands(row.refunds), rands(row.net)]), [38, 18, 20, 29, 20], 3);

  const ledger = workbook.addWorksheet(platform ? 'Global Player Ledger' : 'Event Player Ledger');
  addTable(ledger, playerColumns, data.players.map(playerReportRow), [25, 34, 20, 22, 16, 23, 27, 22], 6);
  const transactions = workbook.addWorksheet('Transactions History');
  addTable(transactions, transactionColumns, data.transactions.map(row => [
    row.date, row.kind, row.reference, row.player, row.event, row.type, row.method, (row.amount != null && Number.isFinite(Number(row.amount)) ? Number(row.amount) : null), row.status, row.included ? 'Yes' : 'No',
  ]), [15, 13, 30, 25, 26, 21, 17, 19, 18, 23], 8, 8);

  for (const { event, rows, settlement } of data.reports) {
    if (!rows.length && !settlement.cashHistory.grossEntryFees && !settlement.entryFeesRefunded) continue;
    const sheet = workbook.addWorksheet(eventSheetName(workbook, event));
    sheet.addRow([event.event_name || `Event ${event.id}`]).font = { bold: true, size: 14 };
    for (const [label, amount] of [
      ['Current entry funds', settlement.grossEntryFees], ['Recorded entry refunds', settlement.entryFeesRefunded],
      ['Entry funds held for refunds', settlement.refundReserve], ['Platform fees', settlement.commission],
      ['Interim payments', settlement.interimPaid], ['Balance due to organiser', settlement.dueToOrg],
    ]) sheet.addRow([label, amount]).getCell(2).numFmt = amountFormat;
    for (const issue of settlement.issues) sheet.addRow([issue]);
    sheet.addRow([]);
    addTable(sheet, eventColumns, rows.map(eventReportRow), [30, 34, 28, 22, 20, 23, 20, 23, 20, 22, 21], 7);
  }
  return workbook;
}
