import ExcelJS from 'exceljs';

const types = { new_full: 'New Full', renewal: 'Full renewal', temporary: 'Temporary' };
const moneyFormat = '"R" #,##0.00;[Red]("R" #,##0.00);"R" 0.00';
const cents = value => Math.round(Number(value) * 100);
const known = value => value !== null && value !== undefined && value !== '';
const sumMoney = (rows, key) => rows.reduce((total, row) => total + (known(row[key]) ? cents(row[key]) : 0), 0) / 100;

export function southAfricanExcelDate(value, withTime = false) {
  if (!value) return null;
  if (!withTime) return new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('A sale has an invalid purchase timestamp. Please review its payment record.');
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(date).map(part => [part.type, part.value]));
  return new Date(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.000Z`);
}

function validate(report) {
  if (!report || report.currency !== 'ZAR' || !Array.isArray(report.rows)) throw new Error('The sales report is incomplete. Please try again.');
  const keys = new Set();
  for (const row of report.rows) {
    if (!row.sale_key || keys.has(row.sale_key)) throw new Error('Duplicate sales were returned. Export stopped to protect the billing totals.');
    keys.add(row.sale_key);
    if (!types[row.kind] || !row.purchased_on || !row.purchased_at) throw new Error('A sale is missing its type or purchase date. Please review the record.');
    for (const key of ['price', 'refund_amount', 'net_amount']) if (known(row[key]) && (!Number.isFinite(Number(row[key])) || Number(row[key]) < 0)) throw new Error('A sale has an invalid amount. Please review the record.');
  }
  const checks = { total_sold: report.rows.length, priced_sales: report.rows.filter(row => known(row.price)).length, review_count: report.rows.filter(row => row.review_note).length };
  for (const [key, actual] of Object.entries(checks)) if (Number(report[key]) !== actual) throw new Error('The export does not reconcile to its source totals. Please try again.');
  for (const [source, detail] of [['gross_amount', 'price'], ['refund_amount', 'refund_amount'], ['net_amount', 'net_amount']]) if (cents(report[source]) !== cents(sumMoney(report.rows, detail))) throw new Error('The export amounts do not reconcile. Please try again.');
}

function setupSheet(workbook, name, title, columns, report) {
  const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 7, xSplit: name === 'License sales' ? 3 : 1, showGridLines: false }], properties: { defaultRowHeight: 20 }, pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  sheet.columns = columns.map(([header, width]) => ({ header, width }));
  sheet.getRow(1).values = [];
  sheet.getCell('A2').value = title;
  sheet.getCell('A2').font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FF19191B' } };
  sheet.getCell('A3').value = 'Bought from / through'; sheet.getCell('B3').value = `${report.from} to ${report.to}`;
  sheet.getCell('D3').value = 'License year'; sheet.getCell('E3').value = report.license_year || 'All years';
  sheet.getCell('G3').value = 'Type'; sheet.getCell('H3').value = types[report.type] || (report.type === 'full' ? 'All Full' : 'All paid licenses');
  sheet.getCell('A4').value = 'Generated (SAST)'; sheet.getCell('B4').value = southAfricanExcelDate(report.generated_at, true); sheet.getCell('B4').numFmt = 'dd mmm yyyy'; sheet.getCell('C4').value = southAfricanExcelDate(report.generated_at, true); sheet.getCell('C4').numFmt = 'hh:mm:ss';
  sheet.getCell('A5').value = 'Verified prices in ZAR. Refunds are assigned to the original sale month. Review flagged records before billing.';
  sheet.getCell('A5').font = { name: 'Arial', size: 10, color: { argb: 'FF66666B' } };
  sheet.getRow(7).values = columns.map(column => column[0]);
  sheet.getRow(7).height = 32;
  sheet.getRow(7).eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF252528' } };
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = { right: { style: 'thin', color: { argb: 'FFFFFFFF' } } };
  });
  sheet.eachRow(row => { if (row.number !== 2 && row.number !== 7 && row.number !== 5) row.font = { name: 'Arial', size: 10 }; });
  sheet.headerFooter.oddFooter = '4M Padel | License sales | Page &P of &N';
  sheet.pageSetup.printTitlesRow = '7:7';
  return sheet;
}

function finishTable(sheet, lastRow, numericColumns = [], moneyColumns = [], dateColumns = []) {
  sheet.autoFilter = { from: { row: 7, column: 1 }, to: { row: Math.max(7, lastRow), column: sheet.columnCount } };
  for (let index = 8; index <= lastRow; index++) {
    const row = sheet.getRow(index);
    row.font = { name: 'Arial', size: 10, color: { argb: 'FF252528' } };
    row.alignment = { vertical: 'middle', horizontal: 'left' };
    if (index % 2 === 0) row.eachCell({ includeEmpty: true }, cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F4' } }; });
    for (const column of numericColumns) sheet.getCell(`${column}${index}`).alignment = { vertical: 'middle', horizontal: 'right' };
    for (const column of moneyColumns) sheet.getCell(`${column}${index}`).numFmt = moneyFormat;
    for (const column of dateColumns) sheet.getCell(`${column}${index}`).numFmt = 'dd mmm yyyy';
  }
}

export function buildLicenseSalesWorkbook(report) {
  validate(report);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '4M Padel'; workbook.created = new Date(report.generated_at); workbook.modified = workbook.created;
  workbook.calcProperties.fullCalcOnLoad = true;
  const monthly = setupSheet(workbook, 'Monthly summary', '4M Padel license sales', [['Month', 17], ['New Full', 14], ['Full renewals', 17], ['Temporary', 14], ['Total sold', 14], ['Sales value (ZAR)', 21], ['Refunds (ZAR)', 21], ['Net verified (ZAR)', 22], ['Prices to review', 18], ['Refunds to review', 19], ['Records to review', 19]], report);
  const prices = setupSheet(workbook, 'Price breakdown', 'License sales by month and price', [['Month', 17], ['License year', 15], ['License type', 19], ['Price paid (ZAR)', 21], ['Licenses sold', 18], ['Sales value (ZAR)', 21], ['Refunds (ZAR)', 21], ['Net verified (ZAR)', 22], ['Records to review', 20]], report);
  const detail = setupSheet(workbook, 'License sales', 'Individual license sales', [['Purchase month', 18], ['Date and time bought (SAST)', 27], ['Player', 29], ['Email', 34], ['License number', 19], ['License type', 19], ['License year', 15], ['Renewed from', 16], ['Valid from', 18], ['Valid until', 18], ['Event', 48], ['Price paid (ZAR)', 21], ['Refunds (ZAR)', 21], ['Net verified (ZAR)', 22], ['Refund status', 24], ['Payment method', 19], ['License payment reference', 37], ['Checkout reference', 37], ['Coverage status', 19], ['Price source', 32], ['Review notes', 45], ['Record check', 18], ['Sale ID', 46]], report);
  const records = [...report.rows].sort((a, b) => a.purchased_at.localeCompare(b.purchased_at) || a.sale_key.localeCompare(b.sale_key));
  for (const sale of records) {
    const row = detail.addRow([southAfricanExcelDate(`${sale.purchased_on.slice(0, 7)}-01`), southAfricanExcelDate(sale.purchased_at, true), sale.name, sale.email, sale.license_number, types[sale.kind], sale.license_year || 'Not recorded', sale.renewed_from_year, southAfricanExcelDate(sale.starts_on), southAfricanExcelDate(sale.ends_on), sale.event_name, known(sale.price) ? Number(sale.price) : null, known(sale.refund_amount) ? Number(sale.refund_amount) : null, null, sale.has_refund ? known(sale.refund_amount) ? 'Refund recorded' : 'Refund needs review' : 'No refund', sale.payment_method, sale.payment_reference, sale.checkout_reference, sale.coverage_status, sale.price_basis, sale.review_note || '', sale.review_note ? 'Review' : 'Ready', sale.sale_key]);
    row.getCell('N').value = { formula: `IF(COUNT(L${row.number}:M${row.number})<2,"",L${row.number}-M${row.number})`, result: known(sale.net_amount) ? Number(sale.net_amount) : '' };
  }
  const lastDetail = Math.max(8, detail.rowCount);
  const range = column => `'License sales'!$${column}$8:$${column}$${lastDetail}`;
  const formula = (sheet, cell, text, result) => { sheet.getCell(cell).value = { formula: text, result }; };
  const monthKeys = [];
  for (let year = Number(report.from.slice(0, 4)), month = Number(report.from.slice(5, 7)); `${year}-${String(month).padStart(2, '0')}` <= report.to.slice(0, 7); month === 12 ? (year++, month = 1) : month++) monthKeys.push(`${year}-${String(month).padStart(2, '0')}`);
  for (const key of monthKeys) {
    const sales = records.filter(sale => sale.purchased_on.startsWith(key));
    const row = monthly.addRow([southAfricanExcelDate(`${key}-01`)]).number;
    for (const [column, kind] of [['B', 'new_full'], ['C', 'renewal'], ['D', 'temporary']]) formula(monthly, `${column}${row}`, `COUNTIFS(${range('A')},$A${row},${range('F')},"${types[kind]}")`, sales.filter(sale => sale.kind === kind).length);
    formula(monthly, `E${row}`, `SUM(B${row}:D${row})`, sales.length);
    for (const [column, source, field] of [['F', 'L', 'price'], ['G', 'M', 'refund_amount'], ['H', 'N', 'net_amount']]) formula(monthly, `${column}${row}`, `SUMIFS(${range(source)},${range('A')},$A${row})`, sumMoney(sales, field));
    formula(monthly, `I${row}`, `COUNTIFS(${range('A')},$A${row},${range('T')},"License price needs review")`, sales.filter(sale => !known(sale.price)).length);
    formula(monthly, `J${row}`, `COUNTIFS(${range('A')},$A${row},${range('O')},"Refund needs review")`, sales.filter(sale => sale.has_refund && !known(sale.refund_amount)).length);
    formula(monthly, `K${row}`, `COUNTIFS(${range('A')},$A${row},${range('V')},"Review")`, sales.filter(sale => sale.review_note).length);
    monthly.getCell(`A${row}`).numFmt = 'mmm yyyy';
  }
  const totalRow = monthly.addRow(['Total']).number;
  for (const column of ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K']) {
    const result = Array.from({ length: totalRow - 8 }, (_, index) => Number(monthly.getCell(`${column}${index + 8}`).value?.result || 0)).reduce((total, value) => total + value, 0);
    formula(monthly, `${column}${totalRow}`, `SUM(${column}8:${column}${totalRow - 1})`, Math.round(result * 100) / 100);
  }
  const groups = new Map();
  for (const sale of records) {
    const key = JSON.stringify([sale.purchased_on.slice(0, 7), sale.license_year, sale.kind, known(sale.price) ? Number(sale.price) : null]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(sale);
  }
  for (const [key, sales] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const [month, year, kind, price] = JSON.parse(key);
    const row = prices.addRow([southAfricanExcelDate(`${month}-01`), year || 'Not recorded', types[kind], price]).number;
    const criteria = `${range('A')},$A${row},${range('G')},$B${row},${range('F')},$C${row},${price === null ? `${range('T')},"License price needs review"` : `${range('L')},$D${row}`}`;
    formula(prices, `E${row}`, `COUNTIFS(${criteria})`, sales.length);
    formula(prices, `F${row}`, `IF(D${row}="","",D${row}*E${row})`, price === null ? '' : sumMoney(sales, 'price'));
    formula(prices, `G${row}`, `SUMIFS(${range('M')},${criteria})`, sumMoney(sales, 'refund_amount'));
    formula(prices, `H${row}`, `SUMIFS(${range('N')},${criteria})`, sumMoney(sales, 'net_amount'));
    formula(prices, `I${row}`, `COUNTIFS(${criteria},${range('V')},"Review")`, sales.filter(sale => sale.review_note).length);
    prices.getCell(`A${row}`).numFmt = 'mmm yyyy';
  }
  finishTable(monthly, totalRow - 1, ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'], ['F', 'G', 'H']);
  monthly.getRow(totalRow).font = { name: 'Arial', size: 10, bold: true };
  monthly.getRow(totalRow).border = { top: { style: 'thin', color: { argb: 'FF252528' } } };
  for (const column of ['F', 'G', 'H']) monthly.getCell(`${column}${totalRow}`).numFmt = moneyFormat;
  finishTable(prices, prices.rowCount, ['B', 'D', 'E', 'F', 'G', 'H', 'I'], ['D', 'F', 'G', 'H']);
  finishTable(detail, detail.rowCount, ['G', 'H', 'L', 'M', 'N'], ['L', 'M', 'N'], ['I', 'J']);
  for (let row = 8; row <= detail.rowCount; row++) { detail.getCell(`A${row}`).numFmt = 'mmm yyyy'; detail.getCell(`B${row}`).numFmt = 'dd mmm yyyy hh:mm:ss'; }
  if (records.length) detail.addConditionalFormatting({ ref: `U8:V${detail.rowCount}`, rules: [{ type: 'expression', formulae: ['$V8="Review"'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFE8B0' } }, font: { color: { argb: 'FF7C4A03' } } } }] });
  if (!records.length) { detail.getCell('A8').value = 'No paid license sales in this period'; prices.getCell('A8').value = 'No paid license sales in this period'; }
  return workbook;
}

export async function downloadLicenseSalesWorkbook(report) {
  const workbook = buildLicenseSalesWorkbook(report);
  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a'); link.href = url; link.download = `4M-federation-license-sales-${report.from}-to-${report.to}${report.license_year ? `-licenses-${report.license_year}` : ''}.xlsx`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
