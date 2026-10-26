import test from 'node:test';
import assert from 'node:assert/strict';
import {financeReportExcel,financeLedgerExcel,financeSummaryExcel} from '../../src/pages/admin-preview/financeExport.js';
import ExcelJS from 'exceljs';
const totals={count:1,gross:10050,refunds:12000,net:-1950};
const report={totals,rows:[{type:'entry',...totals}]};
test('summary workbook records its selected status and refund-only totals',async()=>{
 const wb=new ExcelJS.Workbook();
 await wb.xlsx.load(await financeSummaryExcel([{name:'Event',profile:{id:1},paymentIds:new Set(['1']),count:0,gross:0,refunds:60000,net:-60000}],{period:{label:'All time'},kind:'event',status:'pending'}));
 const metadata=[];wb.getWorksheet('Export details').eachRow(row=>metadata.push(row.values));
 assert.ok(metadata.some(row=>row[1]==='Status filter' && row[2]==='pending'));
 assert.equal(wb.getWorksheet('Event payments').getCell('G2').value,-600);
 assert.equal(wb.getWorksheet('Event payments').getCell('D2').value,0);
});
test('event summary Excel uses event labels and identity without implying settlement',async()=>{
 const wb=new ExcelJS.Workbook();
 await wb.xlsx.load(await financeSummaryExcel([{...totals,name:'Event',profile:{id:463},paymentIds:new Set(['1'])}],{period:{label:'2026'},kind:'event'}));
 const sheet=wb.getWorksheet('Event payments');
 assert.equal(sheet.getCell('A1').value,'Event');
 assert.equal(sheet.getCell('B2').value,'463');
 assert.equal(sheet.getCell('C2').value,'Linked event');
 assert.equal(sheet.getCell('G2').value,-19.5);
});
test('player summary Excel retains all pages, literal names, unlinked IDs and numeric totals',async()=>{
 const rows=Array.from({length:12},(_,i)=>({...totals,name:'=1+1',profile:i ? {id:`player-${i}`} : null,paymentIds:new Set(['payment-0'])}));
 const wb=new ExcelJS.Workbook();await wb.xlsx.load(await financeSummaryExcel(rows,{period:{label:'2026'},query:'=1+1'}));
 const sheet=wb.getWorksheet('Player payments');
 assert.equal(sheet.rowCount,14);
 assert.equal(sheet.getCell('A2').value,'=1+1');
 assert.equal(sheet.getCell('A2').type,ExcelJS.ValueType.String);
 assert.equal(sheet.getCell('B2').value,'payment-0');
 assert.equal(sheet.getCell('C2').value,'Unlinked payment');
 assert.equal(sheet.getCell('G14').value,-234);
 assert.equal(sheet.getCell('E14').value,1206);
 assert.equal(wb.getWorksheet('Export details').getCell('B4').value,'=1+1');
});
test('player summary Excel rejects empty and unsafe monetary totals',async()=>{
 const context={period:{label:'All time'}};
 await assert.rejects(financeSummaryExcel([],context));
 await assert.rejects(financeSummaryExcel([{...totals,net:NaN}],context));
 await assert.rejects(financeSummaryExcel([{...totals,gross:Number.MAX_SAFE_INTEGER},{...totals,gross:1}],context));
});
test('ledger Excel includes all supplied pages, literal identities, refunds and search context',async()=>{
 const entries=Array.from({length:12},(_,i)=>({paymentId:i,date:'2026-09-01',kind:i ? 'Receipt':'Refund',status:i ? 'success':'pending',amount:i ? 12000:-6000}));
 const links=new Map([['0',{players:{name:'=1+1'},calendar:{event_name:'Test event'},reference:'@reference',payment_method:'paystack'}]]);
 const wb=new ExcelJS.Workbook();await wb.xlsx.load(await financeLedgerExcel(entries,links,{type:'temp_license',period:{label:'September 2026'},query:'Test'}));
 const sheet=wb.getWorksheet('Ledger');
 assert.equal(sheet.rowCount,14);
 assert.equal(sheet.getCell('B2').value,'=1+1');
 assert.equal(sheet.getCell('B2').type,ExcelJS.ValueType.String);
 assert.equal(sheet.getCell('H2').value,-60);
 assert.equal(sheet.getCell('H14').value,1260);
 assert.equal(sheet.getCell('B3').value,'Payment link unavailable');
 assert.equal(wb.getWorksheet('Export details').getCell('B5').value,'Test');
});
test('ledger Excel rejects incomplete links, empty exports and invalid amounts',async()=>{
 const context={type:'entry',period:{label:'All time'}};
 await assert.rejects(financeLedgerExcel([],null,context));
 await assert.rejects(financeLedgerExcel([],new Map(),context));
 await assert.rejects(financeLedgerExcel([{amount:NaN}],new Map(),context));
});
test('Excel round-trip preserves numeric currency, text labels, totals and comparison',async()=>{
 const data=await financeReportExcel({...report,rows:[{type:'=1+1',...totals}],previous:totals},{label:'September 2026',previous:{from:'2026-08-01',to:'2026-08-31'}});
 const wb=new ExcelJS.Workbook();await wb.xlsx.load(data);
 assert.deepEqual(wb.worksheets.map(s=>s.name),['Summary','Payment types']);
 const detail=wb.getWorksheet('Payment types');
 assert.equal(detail.getCell('A2').value,'=1+1');
 assert.equal(detail.getCell('A2').type,ExcelJS.ValueType.String);
 assert.equal(detail.getCell('E2').value,-19.5);
 assert.ok(detail.getCell('E2').numFmt.includes('R'));
 assert.equal(detail.getCell('C3').value,100.5);
 assert.equal(wb.getWorksheet('Summary').getCell('D10').value,0);
});
test('Excel includes all supplied types and reporting context',async()=>{
 const wb=new ExcelJS.Workbook();
 await wb.xlsx.load(await financeReportExcel({...report,rows:Array.from({length:12},(_,i)=>({...totals,type:`type-${i}`}))},{label:'2026'}));
 assert.equal(wb.getWorksheet('Payment types').rowCount,14);
 assert.equal(wb.getWorksheet('Summary').getCell('B2').value,'2026');
 assert.equal(wb.getWorksheet('Summary').getCell('B5').value,'Africa/Johannesburg');
});
test('incomplete and invalid Excel reports cannot be exported',async()=>{
 await assert.rejects(financeReportExcel(null,{label:'All time'}));
 await assert.rejects(financeReportExcel({...report,totals:{...totals,gross:NaN}},{label:'All time'}));
});
