import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {recordedPaymentsExcel} from '../../src/pages/admin-preview/paymentsExport.js';
test('recorded payment export keeps all pages, literal names, numeric amounts and filter context',async()=>{
 const rows=Array.from({length:23},(_,id)=>({id,reference:'=1+1',amount:'650.12',status:'pending',is_test:false,created_at:'2026-09-07T23:00:00Z',player_id:123,event_id:463,players:{name:'=SUM(A1:A2)'},calendar:{event_name:'Coastal Open'}}));
 const wb=new ExcelJS.Workbook();await wb.xlsx.load(await recordedPaymentsExcel(rows,{query:'coastal',status:'pending',environment:'live',from:'2026-09-08',to:'2026-09-08'}));
 const sheet=wb.getWorksheet('Recorded payments');assert.equal(sheet.rowCount,24);assert.equal(sheet.getCell('K24').value,650.12);assert.equal(sheet.getCell('D2').value,'=SUM(A1:A2)');assert.equal(sheet.getCell('B2').type,ExcelJS.ValueType.String);assert.equal(sheet.getCell('A2').value,'2026-09-08');assert.equal(sheet.getCell('C2').value,'0');
 const context=wb.getWorksheet('Export details');assert.equal(context.getCell('B4').value,'pending');assert.equal(context.getCell('B5').value,'live');assert.equal(context.getCell('B6').value,'2026-09-08');
});
test('missing linked details and unspecified environments stay explicit',async()=>{
 const wb=new ExcelJS.Workbook();await wb.xlsx.load(await recordedPaymentsExcel([{id:1,amount:0,player_id:123,event_id:null,is_test:null}],{}));
 const sheet=wb.getWorksheet('Recorded payments');assert.equal(sheet.getCell('D2').value,'Player details unavailable');assert.equal(sheet.getCell('F2').value,'No linked event');assert.equal(sheet.getCell('I2').value,'Unspecified');assert.equal(sheet.getCell('K2').value,0);
});
test('empty exports and invalid monetary figures reject',async()=>{
 await assert.rejects(recordedPaymentsExcel([],{}),/No matching/);
 for(const amount of [null,'',NaN,Infinity,'invalid',Number.MAX_SAFE_INTEGER])await assert.rejects(recordedPaymentsExcel([{id:1,amount}],{}),/amount/);
});
