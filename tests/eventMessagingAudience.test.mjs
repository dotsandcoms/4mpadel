import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { transformSync } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const file = new URL('../src/components/admin/EventAudience.jsx', import.meta.url), module = { exports: {} };
vm.runInNewContext(transformSync(fs.readFileSync(file, 'utf8'), { loader: 'jsx', format: 'cjs', target: 'es2022' }).code, { module, exports: module.exports, require: createRequire(file) });
const Audience=module.exports.default;
const audience={allCount:120,selectedCount:48,unassignedCount:2,divisions:[{id:'open',name:"Men's Open",count:40},{id:'mixed',name:'Mixed <Open>',count:24}]};
const render=(props={})=>renderToStaticMarkup(React.createElement(Audience,{audience,selected:null,onChange:()=>{},...props}));
test('default audience is event-wide and accurately describes eligible app accounts',()=>{
 const html=render();assert.match(html,/All registered players/);assert.match(html,/120 eligible app accounts/);assert.match(html,/each player receives one copy/);assert.doesNotMatch(html,/type="checkbox"/);
});
test('multiple divisions use checkboxes and a server-deduplicated total',()=>{
 const html=render({selected:['open','mixed']});assert.equal((html.match(/type="checkbox"/g)||[]).length,2);assert.match(html,/48 eligible app accounts/);assert.match(html,/Mixed &lt;Open&gt;/);assert.match(html,/no verified division link/);assert.doesNotMatch(html,/64 eligible app accounts/);
});
test('empty selection and loading states never suggest event-wide sending',()=>{
 assert.match(render({selected:[]}),/Select at least one division/);assert.match(render({selected:['open'],loading:true}),/Updating audience/);assert.match(render({selected:['open'],disabled:true}),/fieldset[^>]*disabled/);
});
