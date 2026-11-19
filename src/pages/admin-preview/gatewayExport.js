import { financeDate } from './financeOverviewData.js';
import { gatewayLinkLabel } from './gatewayLinks.js';
import { gatewayComparisonLabel } from './gatewayComparison.js';

export async function gatewayPageExcel(data, filters) {
  const rows = data?.transactions;
  if (!rows?.length) throw new Error('No gateway transactions to export.');
  if (data.environment !== 'test' || !Number.isSafeInteger(data.pagination?.page) || data.pagination.page < 1
    || rows.some(row => row.environment !== 'test' || !Number.isSafeInteger(row.amountMinor) || row.amountMinor < 0)) {
    throw new Error('Invalid gateway export data.');
  }
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '4M Padel';
  const context = workbook.addWorksheet('Export details');
  context.columns = [{ width: 28 }, { width: 105 }];
  context.addRows([
    ['4M Padel — Paystack gateway page'],
    ['Scope', 'Current page only. Not the full gateway history.'],
    ['Environment', 'Test'], ['Page', data.pagination.page],
    ['Records exported', rows.length], ['Matching records reported by gateway', data.pagination.total],
    ['Start date (SA)', String(filters.from || 'Unbounded')], ['End date (SA)', String(filters.to || 'Unbounded')],
    ['Status', String(filters.status || 'All statuses')],
    ['Basis', 'Gateway transaction amounts, not confirmed income, balances, settlements or refund-adjusted totals. No combined total is inferred.'],
    ['Generated at (UTC)', new Date().toISOString()],
    ['Date boundaries', 'Africa/Johannesburg, inclusive selected days'],
  ]);
  const sheet = workbook.addWorksheet('Gateway page');
  sheet.columns = [18, 44, 22, 20, 24, 16, 24, 32, 44, 44, 65].map(width => ({ width }));
  sheet.addRow(['Date (SA)', 'Reference', 'Status', 'Channel', 'Amount', 'Currency', 'Amount (minor units)', 'Player', 'Event', '4M reference match', 'Record comparison — not settlement verification']);
  rows.forEach(row => sheet.addRow([financeDate(row.createdAt) || 'Not provided', String(row.reference ?? ''),
    String(row.status ?? ''), String(row.channel || 'Not provided'), row.amountMinor / 100, String(row.currency ?? ''), row.amountMinor,
    row.link?.state === 'matched' ? String(row.link.playerName || 'Unavailable') : '',
    row.link?.state === 'matched' ? String(row.link.eventName || 'Unavailable') : '', gatewayLinkLabel(row.link),
    gatewayComparisonLabel(row.link?.state === 'matched' ? row.link.comparison : null)]));
  sheet.getColumn(5).numFmt = '#,##0.00';
  sheet.getColumn(7).numFmt = '0';
  sheet.autoFilter = { from: 'A1', to: `K${rows.length + 1}` };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  for (const page of [context, sheet]) {
    page.properties.defaultRowHeight = 32;
    page.eachRow(row => row.eachCell(cell => {
      cell.font = { name: 'Aptos', size: 11 };
      cell.alignment = { vertical: 'top', wrapText: true };
    }));
    page.getRow(1).eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF263329' } };
      cell.font = { name: 'Aptos', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    });
  }
  return workbook.xlsx.writeBuffer();
}
