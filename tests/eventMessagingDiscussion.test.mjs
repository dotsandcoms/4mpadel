import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { transformSync } from 'esbuild';
import React from 'react';
import { eventProfileImage } from '../src/utils/messagingImage.js';
import { renderToStaticMarkup } from 'react-dom/server';
const file = new URL('../src/components/admin/EventDiscussion.jsx', import.meta.url);
const module = { exports: {} };
vm.runInNewContext(transformSync(fs.readFileSync(file, 'utf8'), { loader: 'jsx', format: 'cjs', target: 'es2022' }).code, { module, exports: module.exports, URL, require: createRequire(file) });
const { default: Discussion, EventReplyPreview, EventPlayerAvatar } = module.exports;
const row = (id,role,mine=false) => ({ id, mine, body:'Hello', sender:{name:'Brad Elin',role},createdAt:'2026-11-05T10:00:00Z' });
test('same-name senders remain distinct by role, direction and accessible message labels', () => {
  const html = renderToStaticMarkup(React.createElement(Discussion, { messages:[row('a','admin',true),row('b','player'),row('c','organiser')], canSend:true }));
  assert.match(html, /is-mine/);assert.match(html, /is-incoming/);assert.match(html, /Your message · Admin/);assert.match(html, /Brad Elin’s message · Player/);assert.match(html, /em-role-organiser/);assert.match(html, />You<\/strong>/);assert.match(html, /Reply to Brad Elin/);
});
test('quoted replies show their own sender role and escape message content', () => {
  const message={...row('a','admin',true),reply:{name:'Brad Elin',role:'player',body:'<script>alert(1)</script>'}};
  const html = renderToStaticMarkup(React.createElement(Discussion, { messages:[message] }));
  assert.match(html, /em-chat-quote/);assert.match(html,/Reply to Brad Elin/);assert.match(html,/em-role-player/);assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);
  const draft=renderToStaticMarkup(React.createElement(EventReplyPreview,{message:row('b','player')}));
  assert.match(draft,/Replying to Brad Elin/);assert.match(draft,/Cancel reply/);
});
test('removed messages expose neither quoted bodies nor reply/remove actions', () => {
  const html=renderToStaticMarkup(React.createElement(Discussion,{messages:[{...row('a','player'),deleted:true,reply:{name:'Other',body:'secret quote'}}],canSend:true}));
  assert.match(html,/Message removed/);assert.doesNotMatch(html,/secret quote|Reply to Brad Elin|Remove message from/);
});

test('chat profile photos accept only owned public profile images and retain initials', () => {
  const origin='https://fixture.supabase.co', image=origin+'/storage/v1/object/public/profile-pics/1/avatar.jpg';
  assert.equal(eventProfileImage(image+'?t=10',origin),image);
  for(const src of ['https://tracker.test/a.png',origin+'/storage/v1/object/sign/private/a.png?token=secret','https://user:secret@fixture.supabase.co/storage/v1/object/public/profile-pics/a.png']) assert.equal(eventProfileImage(src,origin),null);
  const html=renderToStaticMarkup(React.createElement(EventPlayerAvatar,{sender:{name:'Brad Elin',image,role:'player'},storageOrigin:origin}));
  assert.match(html,/>BE<img/);assert.match(html,/profile-pics/);assert.match(html,/referrerPolicy="no-referrer"/i);
  const fallback=renderToStaticMarkup(React.createElement(EventPlayerAvatar,{sender:{name:'Brad Elin'},storageOrigin:origin}));
  assert.match(fallback,/>BE<\/span>/);assert.doesNotMatch(fallback,/<img/);
});
