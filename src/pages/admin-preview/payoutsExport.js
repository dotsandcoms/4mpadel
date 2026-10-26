export async function recordedPayoutsExcel(rows, issues, filters) {
  if (!rows.length && !issues.length) throw new Error('No payout records to export.');
  if (rows.some(row => row.amountCents != null && (!Number.isSafeInteger(row.amountCents) || row.amountCents <= 0))) throw new Error('Invalid payout amount.');
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '4M Padel';
  const context = workbook.addWorksheet('Export details');
  context.columns = [{ width: 30 }, { width: 105 }];
  context.addRows([
    ['4M Padel — Recorded organiser payouts'], ['Scope', 'All matching recorded payouts across pages. Not verified bank transfers or settlements.'],
    ['Search', String(filters.query || 'None')], ['Start date', String(filters.from || 'Unbounded')], ['End date', String(filters.to || 'Unbounded')],
    ['Record quality', filters.reviewOnly ? 'Needs review' : 'All records'], ['Matching rows', rows.length],
    ['Unreadable event lists', issues.length], ['Basis', 'No bank status, approval status or remaining balance is inferred. Invalid amounts are blank and flagged. No combined total is inferred.'],
    ['Issue sheet scope', 'All unreadable event lists in the loaded dataset, regardless of row filters.'],
    ['Date filters', 'Inclusive recorded payment dates. Undated records excluded when date filters are active.'],
    ['Generated (UTC)', new Date().toISOString()], ['Privacy', 'Contains organiser names and notes. Share only with authorised recipients.'],
  ]);
  const sheet = workbook.addWorksheet('Recorded payouts');
  sheet.columns = [18, 42, 22, 32, 40, 24, 55, 50].map(width => ({ width }));
  sheet.addRow(['Payment date', 'Event', 'Event ID', 'Organiser', 'Record ID', 'Recorded amount (ZAR)', 'Note', 'Record warnings']);
  for (const row of rows) sheet.addRow([String(row.paidAt || 'Unavailable'), String(row.eventName), String(row.eventId), String(row.organiserName),
    String(row.recordId || 'Unavailable'), row.amountCents == null ? null : row.amountCents / 100, String(row.note), row.warnings.join('; ') || 'Recorded — not bank verified']);
  sheet.getColumn(6).numFmt = '"R" #,##0.00';
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: 'A1', to: `H${Math.max(1, rows.length + 1)}` };
  const issueSheet = workbook.addWorksheet('Unreadable event records');
  issueSheet.columns = [22, 48, 80].map(width => ({ width }));
  issueSheet.addRow(['Event ID', 'Event', 'Issue']);
  issues.forEach(issue => issueSheet.addRow([String(issue.eventId), String(issue.eventName || 'Unavailable'), String(issue.message)]));
  for (const page of workbook.worksheets) {
    page.properties.defaultRowHeight = 32;
    page.eachRow(row => row.eachCell(cell => { cell.font = { name: 'Aptos', size: 11 }; cell.alignment = { vertical: 'top', wrapText: true }; }));
    page.getRow(1).eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF263329' } }; cell.font = { name: 'Aptos', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }; });
  }
  return workbook.xlsx.writeBuffer();
}
