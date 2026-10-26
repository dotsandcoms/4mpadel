import test from 'node:test';
import assert from 'node:assert/strict';
import {galleryAlbumDraft,galleryAlbumPayload,gallerySlug,galleryFolder,galleryImageUrl,filterGallery,permittedAlbumIds,prepareGalleryFiles,loadGalleryPhotos,loadGallery} from '../../src/pages/admin-preview/galleryData.js';
test('album draft has all source fields and exact nullable foreign keys',()=>{
 const draft=galleryAlbumDraft({title:'Summer',album_date:'2026-12-01T00:00:00Z'}),payload=galleryAlbumPayload(draft);
 assert.equal(Object.keys(payload).length,13);assert.equal(payload.album_date,'2026-12-01');assert.equal(payload.event_id,null);assert.equal(payload.is_active,true);assert.equal(payload.parent_album_id,null);
 assert.throws(()=>galleryAlbumPayload(galleryAlbumDraft()),/title/);
});
test('source slug and folder algorithms retained',()=>{assert.equal(gallerySlug(' Cape  Open! '),'cape-open');assert.equal(galleryFolder('Cape & Open!'),'cape-open');});
test('album restriction and featured-first search',()=>{
 assert.deepEqual(permittedAlbumIds({role:'custom',module_permissions:{gallery:{allowedAlbums:['a']}}}),['a']);assert.equal(permittedAlbumIds({role:'super_admin',module_permissions:{gallery:{allowedAlbums:['a']}}}),null);
 assert.deepEqual(filterGallery([{id:'b',title:'Summer',created_at:'2026-02-01'},{id:'a',title:'Summer',is_featured:true,created_at:'2026-01-01'}],{query:'summer'}).map(r=>r.id),['a','b']);
});
test('image sources reject unsafe schemes and only accept explicitly local blob',()=>{assert.equal(galleryImageUrl('javascript:alert(1)'),'');assert.equal(galleryImageUrl('blob:test'),'');assert.equal(galleryImageUrl('blob:test',true),'blob:test');});
test('local image selection validates all before creating previews; source sort order',()=>{
 let calls=0;assert.throws(()=>prepareGalleryFiles([{type:'image/png'},{type:'text/plain'}],{id:'a'},[],()=>{calls++;return 'blob:x';}),/image/);assert.equal(calls,0);
 const photos=prepareGalleryFiles([{type:'image/png'}],{id:'a'},[{sort_order:7}],()=> 'blob:x');assert.equal(photos[0].sort_order,8);assert.equal(photos[0].local,true);
});
function mock(ids=['a']) {
 const calls=[];return {calls,auth:{getUser:async()=>({data:{user:{id:'u',email:'gallery@example.invalid'}}})},from(table){let start=0,where;const q=new Proxy({}, {get(_,key){if(key==='then')return resolve=>{calls.push({table,where});return resolve({data:start?[]:table==='admin_sidebar_permissions'?[{email:'gallery@example.invalid',role:'custom',allowed_tabs:['gallery'],module_permissions:{gallery:{allowedAlbums:ids}}}]:table==='albums'?[{id:'a',title:'Allowed'},{id:'b',title:'Denied'}]:[]});};return(...args)=>{if(key==='range')start=args[0];if(key==='in'||key==='eq')where=args;return q;};}});return q;}};
}
test('denied album checked before photo SELECT and allowed albums query filtered',async()=>{const client=mock();await assert.rejects(loadGalleryPhotos(client,{user:{id:'u'}},'all','b'),/access/);assert(!client.calls.some(c=>c.table==='gallery_images'));const result=await loadGallery(client,{user:{id:'u'}},'all');assert.deepEqual(result.albums.map(a=>a.id),['a']);assert(client.calls.some(c=>c.table==='albums'&&c.where?.[0]==='id'));});
