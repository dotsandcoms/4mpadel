import test from 'node:test';
import assert from 'node:assert/strict';
import { shareHtml, loadShare } from '../server/pro-share.mjs';

test('crawler HTML contains absolute PNG metadata and escapes provider text', () => {
 const html = shareHtml({ kind:'player', player:{id:66},title:'Tapia " <test>',description:'A & B',path:'/pro/players/66/agustin-tapia' });
 assert.match(html,/https:\/\/4mpadel.co.za\/api\/pro-share-image\?kind=player&amp;id=66/);
 assert.match(html,/Tapia &quot; &lt;test&gt;/);
 assert.match(html,/image\/png/);
 assert.match(html,/summary_large_image/);
 assert.doesNotMatch(html,/<test>/);
});
test('invalid image identifiers cannot trigger upstream requests',async()=>{
 assert.equal(await loadShare('player','../../secret'),null);
 assert.equal(await loadShare('url','https://example.com'),null);
});

test('share renderer returns a 1200 by 630 PNG even without a portrait', async () => {
 const { renderShareImage } = await import('../server/pro-share-image.mjs');
 const sharp = (await import('sharp')).default;
 const png = await renderShareImage({kind:'player',player:{id:66,name:'Agustin Tapia',rank:1,points:20526,category:'men',photoUrl:null}});
 const info = await sharp(png).metadata();
 assert.equal(info.format,'png');
 assert.equal(info.width,1200);
 assert.equal(info.height,630);
});

test('Pro crawler handler serves player metadata before generic SEO routing',async(t)=>{
 t.mock.method(globalThis,'fetch',async()=>({ok:true,json:async()=>({categories:{men:{players:[{id:66,name:'Agustin Tapia',rank:1,points:20526,category:'men'}]},women:{players:[]}}})}));
 const handler=(await import('../api/seo-preview.js')).default;
 const response={setHeader(){},status(code){this.code=code;return this;},send(body){this.body=body;return this;}};
 await handler({query:{type:'pro',proPath:'players/66/agustin-tapia'}},response);
 assert.equal(response.code,200);
 assert.match(response.body,/og:image/);
 assert.match(response.body,/kind=player&amp;id=66/);
 assert.match(response.body,/Agustin Tapia/);
});
