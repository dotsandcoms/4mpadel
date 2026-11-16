import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { transformSync } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const file = new URL('../src/components/admin/MessagingAuthenticator.jsx', import.meta.url), module = { exports: {} };
vm.runInNewContext(transformSync(fs.readFileSync(file, 'utf8'), { loader: 'jsx', format: 'cjs', target: 'es2022' }).code, { module, exports: module.exports, encodeURIComponent, require: createRequire(file) });
const { default: Authenticator, authenticatorQrSource } = module.exports;
const defaults = { factor:'', secret:'', qrCode:'', code:'', busy:false, onSetup(){}, onCode(){}, onVerify(){}, buttonClass:'button', fieldClass:'field' };
const render = props => renderToStaticMarkup(React.createElement(Authenticator, {...defaults,...props}));
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8" fill="white"/></svg>';
test('first-time instructions show one setup action before revealing enrollment credentials', () => {
 const html=render();assert.match(html,/Set up your authenticator/);assert.match(html,/Google Authenticator/);assert.match(html,/Microsoft Authenticator/);assert.equal((html.match(/<li>/g)||[]).length,3);assert.match(html,/>Set up authenticator<\/button>/);assert.doesNotMatch(html,/<input|<img|<code/);
});
test('new enrollment offers the local QR, same-phone setup key and time-based instructions',()=>{
 const html=render({factor:'pending-factor',secret:'PREVIEW_ONLY_KEY',qrCode:svg});assert.match(html,/data:image\/svg\+xml/);assert.match(html,/Using this phone/);assert.match(html,/Enter a setup key/);assert.match(html,/Time based/);assert.match(html,/PREVIEW_ONLY_KEY/);assert.match(html,/name="messaging-authenticator-code"/);assert.match(html,/autocomplete="one-time-code"/i);assert.match(html,/aria-describedby=/);assert.match(html,/Keep the QR code and setup key private/);
});
test('returning verification explains the existing account and never starts another enrollment',()=>{
 const html=render({factor:'verified-factor'});assert.match(html,/previously set up/);assert.match(html,/4M Padel/);assert.match(html,/latest/);assert.match(html,/Can’t find your code/);assert.match(html,/href="\/contact"/);assert.doesNotMatch(html,/Set up authenticator<\/button>|<img|<code|Google Authenticator/);
});
test('QR images never fetch a remote URL and missing QR falls back to an open manual-key section',()=>{
 const encoded='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);assert.equal(authenticatorQrSource(encoded),encoded);assert.equal(authenticatorQrSource(svg),encoded);
 for(const url of ['https://qr-tracker.test/image?secret=private','javascript:alert(1)','data:text/html,<script>bad</script>'])assert.equal(authenticatorQrSource(url),null);
 const html=render({factor:'pending',secret:'PREVIEW_ONLY_KEY',qrCode:'https://qr-tracker.test/image'});assert.doesNotMatch(html,/<img|qr-tracker/);assert.match(html,/<details open=""/);
});
test('verification remains disabled for an incomplete code or while a request is running',()=>{
 const initial=render({factor:'verified-factor',code:'12345'});assert.match(initial,/<button type="submit"[^>]*disabled/);
 const ready=render({factor:'verified-factor',code:'123456'});assert.doesNotMatch(ready,/<button type="submit"[^>]*disabled/);
 const busy=render({factor:'verified-factor',code:'123456',busy:true});assert.match(busy,/<input[^>]*disabled/);assert.match(busy,/<button type="submit"[^>]*disabled/);assert.match(busy,/Verifying…/);
});


test('setup clearly belongs to the current email and supports multiple logins in one app',()=>{
 const html=render({accountEmail:'organiser@example.test'});assert.match(html,/Signed in as/);assert.match(html,/organiser@example.test/);assert.match(html,/Each login email needs its own setup/);assert.match(html,/same authenticator app/);
});
test('returning users see the exact account and first-time guidance without an MFA bypass',()=>{
 const html=render({factor:'verified-factor',accountEmail:'second@example.test'});assert.match(html,/second@example.test/);assert.match(html,/First time setting up this email/);assert.match(html,/another email will not work/);assert.match(html,/already has an authenticator connected/);assert.doesNotMatch(html,/>Set up authenticator<\/button>/);
});
