import test from 'node:test';
import assert from 'node:assert/strict';
import {divisionOpeningWorkspace,drawSetupGuide} from '../src/utils/drawSetupGuide.js';
const base={division:{name:'Men Open'},workspace:'setup',format:'group_knockout',playerCount:32};
test('switching to a saved draw opens its preview without player review',()=>{
 assert.equal(divisionOpeningWorkspace({hasDraw:true,reviewValid:true}),'review');
 assert.equal(divisionOpeningWorkspace({hasDraw:true,reviewValid:false}),'review');
});
test('approved divisions without a draw open setup; unapproved divisions still need review',()=>{
 assert.equal(divisionOpeningWorkspace({reviewValid:true}),'setup');
 assert.equal(divisionOpeningWorkspace({reviewValid:false}),'players');
});
test('explicit player and checklist actions still open the requested step',()=>{
 for(const requestedStep of ['players','setup','review','schedule','run']) assert.equal(divisionOpeningWorkspace({requestedStep,hasDraw:true,reviewValid:true}),requestedStep);
});
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
