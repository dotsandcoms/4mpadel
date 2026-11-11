const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
function load(file, modules = {}, expose = '') {
  const m = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText + expose,
    { module: m, exports: m.exports, require: id => modules[id] || {}, URL, Error });
  return m.exports;
}
const albumId = '15a8af38-39d0-4e4d-a10d-3ddc2f64c125', photoId = '00000000-0000-4000-8000-000000000002';
const photoUrl = 'https://photos.example/album/original.jpg', email = 'owner@example.test';
const LIMIT = load('src/lib/profile-photos.ts').MAX_PLAYER_GALLERY_PHOTOS;
function harness({ gallery = [], active = true, photoAlbum = albumId, imageUrl = photoUrl, user = { id: 'owner', email }, authError, updateError, beforeUpdate = () => {}, missingPlayer = false } = {}) {
  let stored = gallery, authCalls = 0;
  const queries = [], writes = [];
  const supabase = {
    auth: { getUser: async () => ({ data: { user: typeof user === 'function' ? user(++authCalls) : user }, error: authError }) },
    from(table) {
      const row = { table, filters: [], patch: null }; queries.push(row);
      const q = { select() { return q; }, eq(k,v) { row.filters.push([k,v]); return q; }, or(v) { row.or = v; return q; },
        update(patch) { row.patch = patch; return q; }, maybeSingle: async () => {
          const value = key => row.filters.find(([k]) => k === key)?.[1];
          if (table === 'albums') return { data: active && value('id') === albumId && value('is_active') === true ? { id: albumId } : null };
          if (table === 'gallery_images') return { data: value('id') === photoId && value('album_id') === photoAlbum ? { id: photoId, image_url: imageUrl } : null };
          assert.equal(table, 'players'); assert.equal(value('email'), email, 'every player query stays on the authenticated owner');
          if (!row.patch) return { data: missingPlayer ? null : { id: 42, additional_images: stored } };
          assert.equal(value('id'), 42); writes.push(row); stored = beforeUpdate(writes.length, stored) ?? stored;
          if (updateError) return { data: null, error: updateError };
          const matches = stored == null ? row.or === 'additional_images.is.null,additional_images.eq.null' : value('additional_images') === JSON.stringify(stored);
          if (!matches) return { data: null };
          assert.deepEqual(Object.keys(row.patch), ['additional_images']);
          stored = row.patch.additional_images;
          return { data: { id: 42 } };
        } };
      return q;
    },
  };
  const profile = load('src/lib/profile.ts');
  const api = load('src/lib/album-profile.ts', { './supabase': { supabase }, './profile': profile, './profile-photos': { MAX_PLAYER_GALLERY_PHOTOS: LIMIT } });
  return { api, queries, writes, get stored() { return stored; } };
}
test('an album photo appends to the current player gallery without uploading or altering the profile picture', async () => {
  for (const gallery of [null, ['existing'], JSON.stringify(['existing'])]) {
    const h = harness({ gallery }); const result = await h.api.saveAlbumPhotoToProfile(albumId, photoId, { playerId: 999, imageUrl: 'https://evil.test' });
    assert.equal(result.added, true); assert.deepEqual(JSON.parse(h.stored), gallery === null ? [photoUrl] : ['existing', photoUrl]);
    assert.equal(h.writes.length, 1); assert.ok(h.queries.some(q => q.table === 'gallery_images' && q.filters.some(([k,v]) => k === 'album_id' && v === albumId)));
  }
});
test('gallery state is read for the authenticated owner only and supports historical JSON strings', async () => {
  const h = harness({ gallery: JSON.stringify(['one','two']) }); assert.deepEqual(Array.from(await h.api.fetchMyPlayerGallery()), ['one','two']); assert.equal(h.writes.length, 0);
});
test('a duplicate remains a no-op even when all fifteen gallery slots are occupied', async () => {
  const h = harness({ gallery: [photoUrl,...Array.from({length:14},(_,i)=>`photo-${i}`)] }); const result = await h.api.saveAlbumPhotoToProfile(albumId, photoId);
  assert.equal(result.added, false); assert.equal(result.gallery.length, 15); assert.equal(h.writes.length, 0);
});
test('a full gallery keeps every existing photo and does not issue an update', async () => {
  const h = harness({ gallery: Array.from({length:15},(_,i)=>`photo-${i}`) }); await assert.rejects(h.api.saveAlbumPhotoToProfile(albumId, photoId), /Gallery is full/); assert.equal(h.writes.length, 0);
});
test('an album save fills the fifteenth slot and the next distinct photo is rejected', async()=>{
  const h = harness({gallery:Array.from({length:14},(_,i)=>`photo-${i}`)}); const saved = await h.api.saveAlbumPhotoToProfile(albumId, photoId); assert.equal(saved.gallery.length,15);
  const full = harness({gallery:Array.from({length:15},(_,i)=>`photo-${i}`)}); await assert.rejects(full.api.saveAlbumPhotoToProfile(albumId,photoId),/Gallery is full/);
});
test('inactive albums, mismatched album photos and non-HTTPS source images cannot be saved', async () => {
  for (const options of [{active:false}, {photoAlbum:'different'}, {imageUrl:'javascript:alert(1)'}, {imageUrl:'http://insecure.test/a.jpg'}]) {
    const h = harness(options); await assert.rejects(h.api.saveAlbumPhotoToProfile(albumId, photoId), /unavailable/); assert.equal(h.writes.length, 0);
  }
});
test('invalid IDs and signed-out sessions stop before any database query', async () => {
  const h = harness(); await assert.rejects(h.api.saveAlbumPhotoToProfile('bad', photoId), /unavailable/); assert.equal(h.queries.length, 0);
  for (const options of [{user:null}, {authError:{message:'expired'}}]) {
    const h = harness(options); await assert.rejects(h.api.saveAlbumPhotoToProfile(albumId, photoId), /Sign in/); assert.equal(h.queries.length, 0);
  }
});
test('an account switch between reading and saving prevents the write', async () => {
  const h = harness({ user: n => n === 1 ? {id:'owner',email} : {id:'different',email:'other@example.test'} });
  await assert.rejects(h.api.saveAlbumPhotoToProfile(albumId, photoId), /account changed/); assert.equal(h.writes.length, 0);
});
test('a concurrent gallery edit is re-read and preserved rather than overwritten', async () => {
  const h = harness({ gallery:['one'], beforeUpdate:n => n === 1 ? ['one','other-device-photo'] : undefined });
  await h.api.saveAlbumPhotoToProfile(albumId, photoId); assert.equal(h.writes.length, 2); assert.deepEqual(JSON.parse(h.stored), ['one','other-device-photo',photoUrl]);
});
test('another device taking the last slot never becomes a sixteenth photo', async () => {
  const existing = Array.from({length:14},(_,i)=>`photo-${i}`);
  const h = harness({ gallery:existing, beforeUpdate:n => n === 1 ? [...existing,'other-device-photo'] : undefined });
  await assert.rejects(h.api.saveAlbumPhotoToProfile(albumId, photoId), /Gallery is full/); assert.equal(h.writes.length, 1); assert.equal(h.stored.length, 15); assert.ok(!h.stored.includes(photoUrl));
});
test('permission failures are not success and contention retries are bounded', async () => {
  const denied = harness({updateError:{message:'private provider detail'}}); await assert.rejects(denied.api.saveAlbumPhotoToProfile(albumId, photoId), /could not be added/); assert.deepEqual(denied.stored, []);
  const busy = harness({beforeUpdate:n => [`change-${n}`]}); await assert.rejects(busy.api.saveAlbumPhotoToProfile(albumId, photoId), /changed while saving/); assert.equal(busy.writes.length, 3);
  const missing = harness({missingPlayer:true}); await assert.rejects(missing.api.saveAlbumPhotoToProfile(albumId, photoId), /could not load/); assert.equal(missing.writes.length, 0);
});
test('photographer handles and official profile URLs resolve to a clean Instagram profile only', () => {
  const {photographerInstagramUrl: url} = load('src/lib/media.ts');
  for (const value of ['retruventmedia','@retruventmedia','https://www.instagram.com/retruventmedia/?utm_source=4m','instagram.com/retruventmedia']) assert.equal(url(value), 'https://www.instagram.com/retruventmedia/');
  for (const value of ['',null,'https://evil.test/retruventmedia','https://instagram.com.evil.test/user','https://instagram.com/p/post','javascript:alert(1)','https://someone@instagram.com/user','http://instagram.com/user','../../secret','https://instagram.com/direct']) assert.equal(url(value), null);
});
const jsx = { jsx:(type,props)=>({type,props}), jsxs:(type,props)=>({type,props}), Fragment:'Fragment' };
function nodes(tree) { if (!tree || typeof tree !== 'object') return []; const children=tree.props?.children; return [tree,...(Array.isArray(children)?children:[children]).flatMap(nodes)]; }
const tick = async () => { for (let n=0;n<12;n++) await Promise.resolve(); };
function actionHarness({ read = async()=>[], save = async()=>({gallery:[photoUrl],added:true}) }={}) {
  let index=0,mounted=false;const state=[],refs=[],effects=[],errors=[],calls=[];
  const react = { useState(initial) { const i=index++; if(!(i in state))state[i]=initial; return [state[i],v=>state[i]=typeof v==='function'?v(state[i]):v]; }, useRef(initial) {const i=index++; return refs[i] ||= {current:initial};}, useEffect(fn) {index++; if(!mounted)effects.push(fn);} };
  const Component=load('src/components/album-photo-profile-action.tsx',{react,'react/jsx-runtime':jsx,'react-native':{Text:'Text',View:'View'},'./home-action':{HomeAction:'HomeAction'},'@/lib/album-profile':{fetchMyPlayerGallery:read,saveAlbumPhotoToProfile:async(...args)=>{calls.push(args);return save(...args);}},'@/lib/profile-photos':{MAX_PLAYER_GALLERY_PHOTOS:LIMIT},'@/lib/haptics':{hapticLight(){}},'@/theme/tokens':{lightBrand:{messagingAction:'#27517B'}}}).AlbumPhotoProfileAction;
  const render=()=>{index=0;return Component({albumId,photo:{id:photoId,image_url:photoUrl},onError:message=>errors.push(message)})};
  render();mounted=true;effects.forEach(fn=>fn());
  return {render,errors,calls,button:()=>nodes(render()).find(n=>n.type==='HomeAction').props};
}
test('photo action blocks repeated taps and a late initial read cannot erase the saved state',async()=>{
  let finishRead,finishSave;const h=actionHarness({read:()=>new Promise(r=>finishRead=r),save:()=>new Promise(r=>finishSave=r)});
  h.button().onPress();h.button().onPress();assert.equal(h.calls.length,1);assert.equal(h.button().disabled,true);
  finishSave({gallery:[photoUrl],added:true});await tick();finishRead([]);await tick();assert.equal(h.button().label,'On my profile');assert.equal(h.button().disabled,true);
});
test('photo save errors reach the banner and leave the action available to retry',async()=>{
  const h=actionHarness({save:async()=>{throw Error('Save failed');}});await tick();h.button().onPress();await tick();assert.equal(h.errors.at(-1),'Save failed');assert.equal(h.button().disabled,false);assert.equal(h.button().label,'Add to my profile');
});
test('the photographer credit is an accessible link to the saved account; missing accounts stay plain',()=>{
  const media=load('src/lib/media.ts'),opened=[];
  const {AlbumHeader}=load('src/components/media-screen.tsx',{'react/jsx-runtime':jsx,'react-native':{View:'View',Text:'Text',TouchableOpacity:'TouchableOpacity',StyleSheet:{create:s=>s}},'@expo/vector-icons':{Ionicons:'Icon'},'@/lib/media':media,'@/theme/tokens':{lightBrand:{}}},'\nexports.AlbumHeader=AlbumHeader;');
  const album={title:'Adidas',created_at:'2026-10-25',photographer_name:'Retruvent Media',photographer_instagram:'retruventmedia'};
  const link=nodes(AlbumHeader({album,onInstagram:url=>opened.push(url)})).find(n=>n.props?.accessibilityRole==='link');assert.ok(link);assert.equal(link.props.accessibilityLabel,'Retruvent Media on Instagram');link.props.onPress();assert.deepEqual(opened,['https://www.instagram.com/retruventmedia/']);
  assert.ok(!nodes(AlbumHeader({album:{...album,photographer_instagram:null},onInstagram:()=>assert.fail('no saved account')})).some(n=>n.props?.accessibilityRole==='link'));
});
