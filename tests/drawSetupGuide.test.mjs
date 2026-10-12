import test from 'node:test';
import assert from 'node:assert/strict';
import {drawSetupGuide} from '../src/utils/drawSetupGuide.js';
const base={division:{name:'Men Open'},workspace:'setup',format:'group_knockout',playerCount:32};
test('starts with division selection, not unavailable actions',()=>assert.equal(drawSetupGuide({...base,division:null}).target,undefined));
test('unsaved preview goes to review and saved draft goes to schedule',()=>{
 assert.equal(drawSetupGuide({...base,previewReady:true}).target,'review');
 assert.equal(drawSetupGuide({...base,workspace:'review',savedDraw:{id:'d',status:'draft'}}).target,'schedule');
});
test('scheduling requires saving before publication and keeps unfinished matches visible',()=>{
 const savedDraw={id:'d',status:'draft'};
 assert.match(drawSetupGuide({...base,workspace:'schedule',savedDraw,matches:[{entry_one_id:'a',entry_two_id:'b'}]}).title,/Assign times for 1 match/);
 assert.equal(drawSetupGuide({...base,workspace:'schedule',savedDraw,matches:[{entry_one_id:'a',entry_two_id:'b',scheduled_start:'2026-09-20',court_name:'Court 1'}]}).action,'Review and publish');
});
test('Americano guidance uses persisted fixtures and individual scoring',()=>{
 const savedDraw={id:'d',status:'published',scoring_rules:{americano:{fixtures:[{id:'m'}]}}};
 assert.match(drawSetupGuide({...base,format:'americano',workspace:'schedule',savedDraw}).title,/1 match/);
 assert.match(drawSetupGuide({...base,format:'americano',workspace:'run',savedDraw}).body,/Individual standings/);
});
