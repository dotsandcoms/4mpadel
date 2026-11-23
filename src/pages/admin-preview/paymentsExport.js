import {financeDate} from './financeOverviewData.js';

export async function recordedPaymentsExcel(rows,filters) {
  if(!rows.length)throw new Error('No matching payments to export.');
  const amounts=rows.map(row=>{
    if(row.amount==null || String(row.amount).trim()==='' || !Number.isFinite(Number(row.amount)))throw new Error('A payment amount is missing or invalid.');
    const cents=Math.round(Number(row.amount)*100);
    if(!Number.isSafeInteger(cents))throw new Error('A payment amount is too large to export safely.');
    return cents/100;
  });
  const {default:ExcelJS}=await import('exceljs');
  const workbook=new ExcelJS.Workbook();
  workbook.creator='4M Padel';workbook.created=new Date();
  const context=workbook.addWorksheet('Export details');
  context.columns=[{width:28},{width:105}];
  context.addRows([
    ['4M Padel — Recorded Paystack payments'],['Workspace','All 4M Padel'],
    ['Search',String(filters.query || 'No search filter')],['Status',String(filters.status || 'All statuses')],
    ['Environment',String(filters.environment || 'live')],['Start date',String(filters.from || 'Unbounded')],['End date',String(filters.to || 'Unbounded')],
    ['Date timezone','Africa/Johannesburg; inclusive date boundaries'],['Generated at (UTC)',workbook.created],['Records',rows.length],
    ['Scope','All matching recorded payments across pages. Only records explicitly marked with payment method paystack.'],
    ['Basis','Recorded transaction amounts, not confirmed receipts for unsuccessful payments. Not complete gateway history, a Paystack balance, payouts or refund-adjusted income. No combined amount total is inferred.'],
    ['Privacy','Contains player names and identifiers. Share only with authorised recipients.'],
    ['Sort order',String(filters.sort || 'date-desc')],
  ]);
  context.getCell('B9').numFmt='dd mmm yyyy hh:mm';
  const sheet=workbook.addWorksheet('Recorded payments');
  sheet.columns=[18,40,24,32,24,48,24,22,20,28,24].map(width=>({width}));
  sheet.addRow(['Date (SA)','Reference','Payment ID','Player','Player ID','Event','Event ID','Status','Environment','Payment type','Recorded amount (ZAR)']);
  rows.forEach((row,index)=>sheet.addRow([
    financeDate(row.created_at) || 'Not recorded',String(row.reference || 'No reference'),String(row.id),
    String(row.players?.name || (row.player_id!=null ? 'Player details unavailable':'No linked player')),String(row.player_id ?? ''),
    String(row.calendar?.event_name || (row.event_id!=null ? 'Event details unavailable':'No linked event')),String(row.event_id ?? ''),
    String(row.status || 'Not recorded'),row.is_test===true ? 'Test':row.is_test===false ? 'Live':'Unspecified',String(row.payment_type || 'Unspecified'),amounts[index],
  ]));
  sheet.autoFilter={from:'A1',to:`K${rows.length+1}`};sheet.views=[{state:'frozen',ySplit:1}];
  sheet.getColumn(11).numFmt='"R" #,##0.00;[Red]("R" #,##0.00)';
  for(const page of [context,sheet]) {
    page.properties.defaultRowHeight=32;
    page.eachRow(row=>row.eachCell(cell=>{cell.font={name:'Aptos',size:11};cell.alignment={vertical:'top',wrapText:true};}));
    page.getRow(1).eachCell(cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF263329'}};cell.font={name:'Aptos',size:11,bold:true,color:{argb:'FFFFFFFF'}};});
  }
  return workbook.xlsx.writeBuffer();
}
