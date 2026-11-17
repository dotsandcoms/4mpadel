const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,modules={}){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module:m,exports:m.exports,require:id=>modules[id]||{},URL,process:{env:{}}});return m.exports;}
test('gallery IDs, gallery slugs and media links all open the native library rather than a browser',async()=>{
 const routes=[],browsers=[];const site=load('src/lib/site.ts',{'expo-router':{router:{push:r=>routes.push(r)}},'expo-web-browser':{openBrowserAsync:async url=>browsers.push(url),WebBrowserPresentationStyle:{AUTOMATIC:0}}});
 for(const url of ['/gallery/adidas-padel-tour','/gallery/00000000-0000-4000-8000-000000000001','/media/adidas-padel-tour?photo=1','/gallery','/media'])await site.openSitePath(url);
 assert.equal(browsers.length,0);assert.equal(routes[0].pathname,'/media/[id]');assert.equal(routes[0].params.id,'adidas-padel-tour');assert.equal(routes[1].params.id,'00000000-0000-4000-8000-000000000001');assert.equal(routes[2].pathname,'/media/[id]');assert.equal(routes[3],'/media');assert.equal(routes[4],'/media');
});
function media(){const calls=[],id='00000000-0000-4000-8000-000000000001',album={id,title:'Adidas Padel Tour',youtube_playlist_url:'https://example.test/highlights'};const api=load('src/lib/media.ts',{'@/lib/supabase':{supabase:{from(table){const filters=[];const q={select(){return q},eq(k,v){filters.push([k,v]);return q},is(k,v){filters.push([k,v]);return q},order(){return q},limit(){return q},single:async()=>{calls.push({table,filters});return {data:album}},range:async(from,to)=>{calls.push({table,filters,from,to});return {data:[{id:'photo1',image_url:'https://example.test/a.jpg'}]}},then(resolve){calls.push({table,filters});return Promise.resolve({data:[]}).then(resolve)}};return q}}}});return{api,calls,id};}
test('a website slug resolves an active album before child albums and photos use its UUID',async()=>{
 const h=media();const data=await h.api.fetchMediaContent('adidas-padel-tour');assert.equal(data.album.id,h.id);assert.equal(data.photos.length,1);
 assert.deepEqual(h.calls[0].filters,[['slug','adidas-padel-tour'],['is_active',true]]);
 assert.ok(h.calls.some(c=>c.table==='albums'&&c.filters.some(([k,v])=>k==='parent_album_id'&&v===h.id)));
 assert.ok(h.calls.some(c=>c.table==='gallery_images'&&c.filters.some(([k,v])=>k==='album_id'&&v===h.id)));
});
test('a native UUID retains direct album lookup and the first photo page is bounded',async()=>{
 const h=media();await h.api.fetchMediaContent(h.id);assert.ok(h.calls.some(c=>c.table==='albums'&&c.filters.some(([k,v])=>k==='id'&&v===h.id)));const photos=h.calls.find(c=>c.table==='gallery_images');assert.equal(photos.from,0);assert.equal(photos.to,59);
});
test('invalid album links are rejected before database access',async()=>{const h=media();for(const id of ['https://evil.test/album','../secret','a/b',''])await assert.rejects(h.api.fetchMediaAlbum(id),/unavailable/);assert.equal(h.calls.length,0);});
test('an event gallery button opens the actual native album by ID',async()=>{
 let cursor=0,mounted=false;const values=[],effects=[],routes=[];
 const hooks={useState(initial){const i=cursor++;if(!(i in values))values[i]=initial;return[values[i],v=>values[i]=typeof v==='function'?v(values[i]):v]},useMemo:fn=>fn(),useEffect:fn=>{if(!mounted)effects.push(fn)}};
 const q={select(){return q},eq(){return q},is(){return q},limit:async()=>({data:[{id:'album-uuid',slug:'adidas',title:'Adidas Padel Tour'}]})};
 const runtime={jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'Fragment'};
 const native=Object.fromEntries(['ActivityIndicator','Modal','Pressable','Text','View'].map(n=>[n,n]));
 const component=load('src/components/events/event-media.tsx',{react:hooks,'react/jsx-runtime':runtime,'react-native':native,'expo-router':{useRouter:()=>({push:r=>routes.push(r)})},'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:0,bottom:0})},'@/lib/supabase':{supabase:{from:()=>q}},'./website-ui':{EventIcon:'Icon'},'./event-ui':{Notice:'Notice'},'@/components/home-action':{HomeAction:'HomeAction'},'@/theme/tokens':{lightBrand:{}},'expo-image':{Image:'Image'},'@expo/vector-icons':{Ionicons:'Icon'}}).EventMedia;
 const render=()=>{cursor=0;return component({event:{id:1,media_gallery_urls:[]},onAction:()=>assert.fail('gallery attempted browser action')})};render();mounted=true;effects.forEach(fn=>fn());for(let i=0;i<8;i++)await Promise.resolve();
 const buttons=[];function walk(n){if(!n||typeof n!=='object')return;if(n.type==='HomeAction')buttons.push(n);const c=n.props?.children;for(const child of Array.isArray(c)?c:[c])walk(child)}walk(render());const button=buttons.find(b=>b.props.label==='Open gallery');assert.ok(button);button.props.onPress();assert.equal(routes[0].pathname,'/media/[id]');assert.equal(routes[0].params.id,'album-uuid');
});
