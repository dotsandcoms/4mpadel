import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source=readFileSync(new URL('../../src/pages/AdminPreview.jsx',import.meta.url),'utf8');
test('network routes use authorised modules before the disconnected landing',()=>{
  const landing=source.indexOf("else if (activeWorkspace !== 'operate') content");
  for(const [page,component] of [['organisations','OrganisationsWorkspace'],['federations','FederationsWorkspace']]){
    const index=source.indexOf(`else if (page === '${page}') content = <${component}`);
    assert(index>0&&index<landing);assert(source.includes(`import ${component} from './admin-preview/${component}.jsx'`));
    const call=source.slice(index,source.indexOf(';',index));
    for(const prop of ['client={supabase}','session={session}','scopeId={scope.id}','refreshRevision={playerRefresh}'])assert(call.includes(prop));
  }
});
test('record workspaces refresh their records rather than the event loader',()=>{
  const records=source.match(/const RECORD_WORKSPACE_PAGES = \[(.*?)\];/)[1];
  for(const page of ['clubs','organisations','federations','reports','payments','payouts','coaches','team-access'])assert(records.includes(`'${page}'`));
  assert.match(source,/const REFRESH_WORKSPACE_PAGES = RECORD_WORKSPACE_PAGES;/);
  assert.match(source,/onReload=\{REFRESH_WORKSPACE_PAGES.includes\(page\) \? \(\) => setPlayerRefresh/);
  for(const component of ['FinanceOverview','PaymentsWorkspace','PayoutsWorkspace','ClubsWorkspace']){
    const start=source.indexOf(`content = <${component}`);
    assert.match(source.slice(start,source.indexOf(';',start)),/refreshRevision=\{playerRefresh\}/);
  }
  assert.match(source,/AccessWorkspace key=\{`\$\{session\?\.user\?\.id \|\| 'signed-out'\}-\$\{playerRefresh\}`\}/);
});
test('leaving event records clears the old event query for connected modules',()=>{
  assert.match(source,/\['events', 'home', \.\.\.RECORD_WORKSPACE_PAGES\].includes\(target\)/);
  assert(source.indexOf("nextQuery.delete('event')")<source.indexOf("if (['event', 'tournaments'].includes(target) && payload.event?.id)"));
});
