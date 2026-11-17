const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const React = require('react'), { create, act } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
const deferred = () => { let resolve, reject; const promise = new Promise((yes,no) => { resolve=yes; reject=no; }); return { promise, resolve, reject }; };
const settle = async () => { for (let i=0;i<8;i++) await Promise.resolve(); };
function fixture() {
  let identity, current;
  const reads=[], writes=[], routes=[], mod={exports:{}};
  const modules = {
    react: React,
    'expo-router': { useFocusEffect: callback => React.useEffect(callback,[callback]), useRouter: () => ({push: route => routes.push(route)}) },
    '@/components/messaging/messaging-provider': {useMessagingInbox: () => ({owner:identity})},
    '@/lib/club-favourites': {
      fetchClubFavourites: owner => { const work=deferred(); reads.push({owner,...work}); return work.promise; },
      setClubFavourite: (owner,club,saved) => { const work=deferred(); writes.push({owner,club,saved,...work}); return work.promise; },
    },
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/hooks/use-club-favourites.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,
    {module:mod,exports:mod.exports,require:id=>modules[id],Set,Error});
  function Screen({owner}) { identity=owner; current=mod.exports.useClubFavourites(); return null; }
  return {Screen,reads,writes,routes,get:()=>current};
}
test('favourites mask the previous account immediately and reject its late load or save result', async () => {
  const f=fixture(); let renderer;
  try {
    await act(async()=>{renderer=create(React.createElement(f.Screen,{owner:'a'}));});
    await act(async()=>{f.reads[0].resolve(new Set(['club-a']));await settle();});
    let save;
    await act(async()=>{save=f.get().toggle('new-club-a');});
    assert.equal(f.writes.length,1);
    await act(async()=>{renderer.update(React.createElement(f.Screen,{owner:'b'}));});
    assert.equal(f.get().ids.size,0);
    await act(async()=>{f.reads[1].resolve(new Set(['club-b']));await settle();});
    await act(async()=>{f.writes[0].resolve();await save;});
    assert.deepEqual([...f.get().ids],['club-b']);
    await act(async()=>{f.get().retry();});
    await act(async()=>{renderer.update(React.createElement(f.Screen,{owner:'c'}));});
    await act(async()=>{f.reads[3].resolve(new Set(['club-c']));await settle();});
    await act(async()=>{f.reads[2].resolve(new Set(['late-club-b']));await settle();});
    assert.deepEqual([...f.get().ids],['club-c']);
  } finally {if(renderer) await act(async()=>renderer.unmount());}
});
test('failed saves keep the confirmed favourites, block duplicate taps and can be retried', async () => {
  const f=fixture(); let renderer;
  try {
    await act(async()=>{renderer=create(React.createElement(f.Screen,{owner:'a'}));});
    await act(async()=>{await f.get().toggle('club');}); assert.equal(f.writes.length,0);
    await act(async()=>{f.reads[0].resolve(new Set());await settle();});
    let save;
    await act(async()=>{save=f.get().toggle('club');await f.get().toggle('club');}); assert.equal(f.writes.length,1);
    await act(async()=>{f.writes[0].reject(Error('Save failed'));await save;});
    assert.equal(f.get().ids.size,0);assert.equal(f.get().pending,null);assert.match(f.get().error,/Save failed/);
    await act(async()=>{save=f.get().toggle('club');});
    await act(async()=>{f.writes[1].resolve();await save;});assert.ok(f.get().ids.has('club'));
    await act(async()=>{renderer.update(React.createElement(f.Screen,{owner:null}));});
    await act(async()=>{await f.get().toggle('other');});
    assert.equal(f.get().ids.size,0);assert.deepEqual(f.routes,['/(auth)/sign-in']);
  } finally {if(renderer) await act(async()=>renderer.unmount());}
});
