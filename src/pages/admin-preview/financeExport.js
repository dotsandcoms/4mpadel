import {financeDate} from './financeOverviewData.js';
// Export only values already authorized and loaded by the preview.
export async function financeSummaryExcel(rows,{period,query='',kind='player',status=''}) {
  const label=kind==='event' ? 'Event' : 'Player';
  if(!rows?.length)throw new Error('No matching player payments to export.');
  const totals={count:0,gross:0,refunds:0,net:0};
  for(const row of rows) {
    for(const key of Object.keys(totals)) {
      if(!Number.isSafeInteger(row[key]))throw new Error('Cannot export an invalid figure.');
      totals[key]+=row[key];
      if(!Number.isSafeInteger(totals[key]))throw new Error('Cannot export an invalid total.');
    }
  }
  const {default:ExcelJS}=await import('exceljs');
  const workbook=new ExcelJS.Workbook();
  workbook.creator='4M Padel';workbook.created=new Date();
  const context=workbook.addWorksheet('Export details');
  context.columns=[{width:28},{width:105}];
  context.addRows([
    [`4M Padel — ${label} payments`],['Period',String(period.label)],['Workspace','All 4M Padel'],
    ['Search',String(query || 'No search filter')],['Date timezone','Africa/Johannesburg'],
    ['Generated at (UTC)',workbook.created],['Exported records',rows.length],
    ['Scope','All matching summary records across pages. Search and status limit the export. Includes only activity in the applied period.'],
    ['Basis','Successful non-test receipts less linked non-failed refunds, including pending refunds. All linked payment types. Not an outstanding balance, licence status or organiser settlement.'],
    ['Identity',`Grouped by linked ${kind} ID. Unlinked records remain separate per payment; no name or email matching.`],
    ['Privacy','Contains player names and identifiers. Share only with authorised recipients.'],
    ['Status filter',String(status || 'All statuses')],
  ]);
  context.getCell('B6').numFmt='dd mmm yyyy hh:mm';
  const sheet=workbook.addWorksheet(`${label} payments`);
  sheet.columns=[36,42,24,18,24,24,24].map(width=>({width}));
  sheet.addRow([label,`${label} / payment ID`,'Link status','Receipts','Gross (ZAR)','Refunds (ZAR)','Net (ZAR)']);
  for(const row of rows)sheet.addRow([
    String(row.name),String(row.profile?.id ?? [...row.paymentIds][0]),row.profile?.id!=null ? `Linked ${kind}`:'Unlinked payment',
    row.count,row.gross/100,row.refunds/100,row.net/100,
  ]);
  const total=sheet.addRow(['TOTAL','','',totals.count,totals.gross/100,totals.refunds/100,totals.net/100]);
  total.font={bold:true};
  sheet.autoFilter={from:'A1',to:`G${rows.length+1}`};
  sheet.views=[{state:'frozen',ySplit:1}];
  for(let col=5;col<=7;col++)sheet.getColumn(col).numFmt='"R" #,##0.00;[Red]("R" #,##0.00)';
  sheet.getColumn(4).numFmt='#,##0';
  for(const worksheet of [context,sheet]) {
    worksheet.properties.defaultRowHeight=32;
    worksheet.eachRow(row=>row.eachCell(cell=>{
      cell.font={name:'Aptos',size:11,...cell.font};cell.alignment={vertical:'top',wrapText:true};
    }));
    worksheet.getRow(1).eachCell(cell=>{
      cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF263329'}};
      cell.font={name:'Aptos',size:11,bold:true,color:{argb:'FFFFFFFF'}};
    });
  }
  return workbook.xlsx.writeBuffer();
}
export async function financeReportExcel(report, period, generatedAt = new Date().toISOString()) {
  if (!report?.totals || report.error) throw new Error('Load a complete report before exporting.');
  const amount = value => {
    if (!Number.isSafeInteger(value)) throw new Error('Cannot export an invalid figure.');
    return value / 100;
  };
  const {default: ExcelJS} = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '4M Padel';
  workbook.created = new Date(generatedAt);
  const summary = workbook.addWorksheet('Summary');
  const detail = workbook.addWorksheet('Payment types');
  const currency = '"R" #,##0.00;[Red]("R" #,##0.00)';
  summary.columns = [{width:34},{width:30},{width:26},{width:26}];
  summary.addRow(['4M Padel — Finance overview']);
  summary.mergeCells('A1:D1');
  summary.addRow(['Reporting period',period.label]);
  summary.addRow(['Workspace','All 4M Padel']);
  summary.addRow(['Generated at (UTC)',new Date(generatedAt)]);
  summary.getCell('B4').numFmt = 'dd mmm yyyy hh:mm';
  summary.addRow(['Date timezone','Africa/Johannesburg']);
  summary.addRow([]);
  summary.addRow(['Metric','Selected period (ZAR)',...(report.previous ? ['Previous month (ZAR)','Change (ZAR)'] : [])]);
  for (const [key,label] of [['gross','Gross receipts'],['refunds','Recorded refunds'],['net','Net receipts']]) {
    const row = summary.addRow([label,amount(report.totals[key]),...(report.previous ? [amount(report.previous[key]),amount(report.totals[key]-report.previous[key])] : [])]);
    for(let col=2;col<=4;col++) row.getCell(col).numFmt=currency;
  }
  summary.addRow(['Successful payments',report.totals.count]);
  if(period.previous) summary.addRow(['Previous calendar month',`${period.previous.from} to ${period.previous.to}`]);
  summary.addRow([]);
  for(const note of [
    'Successful non-test receipts less linked non-failed refunds, including pending refunds.',
    'Payment date and refund processed date (or recorded date). Date range endpoints are inclusive.',
    'Includes all payment types in the applied period, regardless of table search or pagination.',
    'Payment-ledger snapshot. Not Paystack balance, profit or organiser settlement.',
  ]) {const row=summary.addRow([note]);summary.mergeCells(row.number,1,row.number,4);row.height=32;row.alignment={wrapText:true,vertical:'middle'};}
  detail.columns=[{width:36},{width:16},{width:24},{width:24},{width:24}];
  detail.addRow(['Payment type','Payments','Gross (ZAR)','Refunds (ZAR)','Net (ZAR)']);
  report.rows.forEach(row=>detail.addRow([String(row.type),row.count,amount(row.gross),amount(row.refunds),amount(row.net)]));
  const total=detail.addRow(['TOTAL',report.totals.count,amount(report.totals.gross),amount(report.totals.refunds),amount(report.totals.net)]);
  total.font={bold:true};
  detail.autoFilter={from:'A1',to:`E${Math.max(1,report.rows.length+1)}`};
  detail.views=[{state:'frozen',ySplit:1}];
  for(let col=3;col<=5;col++) detail.getColumn(col).numFmt=currency;
  detail.getColumn(2).numFmt='#,##0';
  for(const sheet of [summary,detail]) {
    sheet.properties.defaultRowHeight=24;
    sheet.eachRow(row=>row.eachCell(cell=>{cell.font={name:'Aptos',size:11,...cell.font};cell.alignment={vertical:'middle',...cell.alignment};}));
  }
  for(const row of [summary.getRow(1),summary.getRow(7),detail.getRow(1)]) {
    row.height=30;
    row.eachCell(cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF263329'}};cell.font={name:'Aptos',size:11,bold:true,color:{argb:'FFFFFFFF'}};});
  }
  // Strings remain text cells: never convert database labels to Excel formulas.
  return workbook.xlsx.writeBuffer();
}

export async function financeLedgerExcel(entries, links, {type,period,query='',status='',player,scopeLabel='Player scope'}) {
  if (!(links instanceof Map)) throw new Error('Load linked details before exporting.');
  if (!entries.length) throw new Error('No matching ledger entries to export.');
  let net=0;
  for (const entry of entries) {
    if (!Number.isSafeInteger(entry.amount)) throw new Error('Cannot export an invalid figure.');
    net+=entry.amount;
    if (!Number.isSafeInteger(net)) throw new Error('Cannot export an invalid total.');
  }
  const {default: ExcelJS}=await import('exceljs');
  const workbook=new ExcelJS.Workbook();
  workbook.creator='4M Padel';
  workbook.created=new Date();
  const summary=workbook.addWorksheet('Export details');
  summary.columns=[{width:28},{width:100}];
  summary.addRows([
    ['4M Padel — Ledger export'],['Payment type',String(type)],['Period',String(period.label)],
    ['Workspace','All 4M Padel'],['Search',query || 'No search filter'],
    ['Export scope','All matching ledger rows across all pages; not the complete report if search is applied.'],
    ['Date timezone','Africa/Johannesburg'],['Generated at (UTC)',workbook.created],
    ['Entries',entries.length],['Net (ZAR)',net/100],
    ['Basis','Successful non-test receipts and linked non-failed refunds, including pending refunds. Refunds use their own period date.'],
    ['Privacy','Contains linked player names. Share only with authorised recipients.'],
  ]);
  summary.getCell('B8').numFmt='dd mmm yyyy hh:mm';
  if(player)summary.addRow([scopeLabel,String(player)]);
  summary.addRow(['Status filter',String(status || 'All statuses')]);
  const ledger=workbook.addWorksheet('Ledger');
  ledger.columns=[18,32,52,16,20,40,22,24,26].map(width=>({width}));
  ledger.addRow(['Date (SA)','Player','Event','Entry','Status','Reference / payment ID','Method','Amount (ZAR)','Payment type']);
  for (const entry of entries) {
    const link=links.get(String(entry.paymentId));
    // Explicit strings keep database text literal, never spreadsheet formulas.
    ledger.addRow([financeDate(entry.date) || 'Not recorded',
      String(link?.players?.name || (link ? 'No linked player' : 'Payment link unavailable')),
      String(link?.calendar?.event_name || 'No linked event'),String(entry.kind),String(entry.status),
      String(link?.reference || entry.paymentId),String(link?.payment_method || 'Method not recorded'),entry.amount/100,String(entry.paymentType || type)]);
  }
  ledger.autoFilter={from:'A1',to:`I${entries.length+1}`};
  ledger.views=[{state:'frozen',ySplit:1}];
  const total=ledger.addRow(['TOTAL','','','','','','',net/100]);
  total.font={bold:true};
  const currency='"R" #,##0.00;[Red]("R" #,##0.00)';
  ledger.getColumn(8).numFmt=currency;
  summary.getCell('B10').numFmt=currency;
  for (const sheet of [summary,ledger]) {
    sheet.properties.defaultRowHeight=32;
    sheet.eachRow(row=>row.eachCell(cell=>{
      cell.font={name:'Aptos',size:11,...cell.font};
      cell.alignment={vertical:'top',wrapText:true};
    }));
    sheet.getRow(1).eachCell(cell=>{
      cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF263329'}};
      cell.font={name:'Aptos',size:11,bold:true,color:{argb:'FFFFFFFF'}};
    });
  }
  return workbook.xlsx.writeBuffer();
}
