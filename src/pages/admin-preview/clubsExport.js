import { clubStatusLabel } from './clubsData.js';
import { clubFlag } from './clubDetailsData.js';
export async function clubsExcel(rows, filters) {
  if (!rows.length) throw new Error('No matching clubs to export.');
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '4M Padel';
  const context = workbook.addWorksheet('Export details');
  context.columns = [{ width: 28 }, { width: 90 }];
  context.addRows([['4M Padel — Club directory'], ['Scope', 'All matching directory records across all pages. Read-only snapshot.'], ...Object.entries(filters).map(([key, value]) => [key, String(value || 'All / none')]), ['Matching clubs', rows.length], ['Generated (UTC)', new Date().toISOString()], ['Basis', 'Status, verification and SAPA registration are separate records. Missing values are not treated as false.'], ['Privacy', 'Directory fields only. Club contacts and membership records are not exported.']]);
  const sheet = workbook.addWorksheet('Clubs');
  sheet.columns = [38, 40, 26, 24, 24, 22, 24, 22, 24, 24].map(width => ({ width }));
  sheet.addRow(['Club ID', 'Club', 'Short name', 'City', 'Province', 'Country', 'Club type', 'Club status', 'Verification', 'SAPA registration']);
  rows.forEach(row => sheet.addRow([row.id, row.name, row.short_name, row.city, row.province, row.country, row.club_type, clubStatusLabel(row.status), clubFlag(row.verified, 'Verified', 'Not verified'), clubFlag(row.sapa_registered, 'Registered', 'Not registered')].map(value => value == null ? 'Not recorded' : String(value))));
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: 'A1', to: `J${rows.length + 1}` };
  workbook.worksheets.forEach(page => {
    page.properties.defaultRowHeight = 30;
    page.eachRow(row => row.eachCell(cell => { cell.font = { name: 'Aptos', size: 11 }; cell.alignment = { vertical: 'top', wrapText: true }; }));
    page.getRow(1).eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF263329' } }; cell.font = { name: 'Aptos', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }; });
  });
  return workbook.xlsx.writeBuffer();
}
