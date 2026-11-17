const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function screen(options = {}) {
  const hooks = [], effects = [], used = [], reads = [], busy = [], timers = new Map();
  let cursor = 0, upload = 0, finishUpload;
  const react = {
    useState(value) { const slot = cursor++; hooks[slot] ??= { value }; return [hooks[slot].value, next => { hooks[slot].value = typeof next === 'function' ? next(hooks[slot].value) : next; }]; },
    useRef(value) { return hooks[cursor++] ??= { current: value }; },
    useEffect(fn, deps) {
      const slot = cursor++, old = hooks[slot];
      if (!old || deps.some((v, i) => v !== old.deps[i])) {
        old?.cleanup?.(); hooks[slot] = { deps };
        effects.push(() => { hooks[slot].cleanup = fn(); });
      }
    },
  };
  const jsx = (type, props) => typeof type === 'function' ? type(props) : ({ type, props });
  const modules = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { ActivityIndicator: 'Spinner', Linking: {}, Modal: 'Modal', Pressable: 'Button', Text: 'Text', View: 'View' },
    'expo-image': { Image: 'Image' },
    '@/lib/playtomic-proof': { choosePlaytomicProof: async () => { if(options.holdUpload) await new Promise(resolve => { finishUpload = resolve; }); return `1/upload-${++upload}.png`; } },
    '@/lib/profile-details': { PROOF_BUCKET: 'playtomic-proofs', extractPlaytomicProfile: path => new Promise((resolve, reject) => reads.push({ path, resolve, reject })) },
    '@/lib/supabase': { supabase: { storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'https://example.test/image' } }) }) } } },
    '@/theme/tokens': { lightBrand: {} },
  };
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/playtomic-proof-field.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { module: mod, exports: mod.exports, require: name => modules[name], setTimeout:(fn,delay)=>{const id=Symbol();timers.set(id,{fn,delay});return id},clearTimeout:id=>timers.delete(id) });
  const props = { noProfile:false, extraction:null, onExtractionDetected:value=>{props.extraction=value}, onNoProfileChange:value=>{props.noProfile=value;if(value){props.path='';props.level='';}}, playerId: 1, path: '1/saved.png', level: '3.25', disabled: false, onBusyChange: value => busy.push(value), onChange: path => { props.path = path; }, onLevelDetected: level => { used.push(level); props.level = level; } };
  function render() {
    let tree;
    for (let pass = 0; pass < 8; pass++) {
      cursor = 0; tree = mod.exports.PlaytomicProofField(props);
      if (!effects.length) return tree;
      effects.splice(0).forEach(fn => fn());
    }
    throw new Error('Effects did not settle');
  }
  function text(tree) {
    if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
    if (tree?.type === 'Modal' && !tree.props.visible) return '';
    return [tree?.props?.children].flat(Infinity).map(child => child && typeof child === 'object' ? text(child) : typeof child === 'string' || typeof child === 'number' ? String(child) : '').join('');
  }
  function find(tree, label) {
    if (!tree || typeof tree !== 'object' || (tree.type === 'Modal' && !tree.props.visible)) return null;
    if (tree.type === 'Button' && text(tree) === label) return tree;
    for (const child of [tree.props?.children].flat(Infinity)) { const match = find(child, label); if (match) return match; }
    return null;
  }
  const press = label => { const node = find(render(), label); assert.ok(node, label); return node.props.onPress(); };
  return { finishSuccess:()=>{for(const [id,timer] of timers){assert.equal(timer.delay,2000);timers.delete(id);timer.fn();}render();}, props, used, reads, busy, render, modal: () => [render().props.children].flat(Infinity).find(node => node?.type === 'Modal')?.props, finishUpload: () => finishUpload(), text: () => text(render()), press, upload: async () => { await press(props.path ? 'Replace screenshot' : 'Choose screenshot'); await new Promise(resolve => setImmediate(resolve)); render(); } };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('native automatically fills a new upload and leaves saved screenshots untouched', async () => {
  const h = screen(); h.render(); assert.equal(h.reads.length, 0);
  await h.upload();
  assert.equal(h.reads.length, 1);
  assert.equal(h.modal().visible, true);
  assert.match(h.text(), /4M is processing the screenshot\. Check the suggested level before saving\./);
  assert.equal(h.busy.at(-1), true);
  h.reads[0].resolve({level:5.17,matches:660,reliability_percent:93}); await tick(); h.render();
  assert.deepEqual(h.used, ['5.17']);
  assert.equal(h.props.level, '5.17');
  assert.equal(h.busy.at(-1), false);
  assert.equal(h.modal().visible, true);
  assert.match(h.text(),/Extraction complete|✓/);
  assert.match(h.text(),/5.17.*660.*93%/);
  h.finishSuccess();
  assert.equal(h.modal().visible,false);
  assert.match(h.text(),/660.*93%/);
  assert.doesNotMatch(h.text(), /Read level from screenshot|Use 5.17|Dismiss/);
});

test('native keeps manual edits made while reading', async () => {
  const h = screen(); await h.upload();
  h.props.level = '4.75'; h.render();
  h.reads[0].resolve({level:5.17,matches:660,reliability_percent:93}); await tick();
  assert.deepEqual(h.used, []);
  assert.match(h.text(), /Your edited level was kept/);
  assert.equal(h.props.level, '4.75');
});

test('native ignores removed or replaced screenshot responses', async () => {
  for (const replace of [false, true]) {
    const h = screen(); await h.upload();
    if (replace) await h.upload();
    else { await h.press('Remove screenshot'); h.render(); }
    h.reads[0].resolve({level:5.17,matches:660,reliability_percent:93}); await tick(); h.render();
    assert.deepEqual(h.used, []);
    if (replace) {
      h.reads[1].resolve({level:0,matches:0,reliability_percent:0}); await tick(); h.render();
      assert.deepEqual(h.used, ['0']);
    }
  }
});

test('native no-result or failed reading keeps manual entry and can retry', async () => {
  for (const failed of [false, true]) {
    const h = screen(); await h.upload();
    if (failed) h.reads[0].reject(new Error('Temporary failure'));
    else h.reads[0].resolve(null);
    await tick(); h.render();
    assert.deepEqual(h.used, []);
    assert.equal(h.props.level, '3.25');
    assert.match(h.text(), /Retry reading screenshot/);
    await h.press('Retry reading screenshot'); h.render();
    h.reads[1].resolve({level:0,matches:0,reliability_percent:0}); await tick(); h.render();
    assert.deepEqual(h.used, ['0']);
  }
});


test('native keeps a manual level edited during image upload', async () => {
  const h = screen({ holdUpload: true });
  await h.upload();
  assert.equal(h.reads.length, 0);
  h.props.level = '4.75'; h.render();
  h.finishUpload(); await tick(); h.render();
  h.reads[0].resolve({level:5.17,matches:660,reliability_percent:93}); await tick(); h.render();
  assert.deepEqual(h.used, []);
  assert.equal(h.props.level, '4.75');
});


test('native processing modal can be dismissed while extraction continues', async () => {
  const h = screen(); await h.upload();
  assert.equal(h.modal().visible, true);
  await h.press('Keep editing'); h.render();
  assert.equal(h.modal().visible, false);
  assert.match(h.text(), /4M is processing the screenshot/);
  h.reads[0].resolve({level:5.17,matches:660,reliability_percent:93}); await tick(); h.render();
  assert.deepEqual(h.used, ['5.17']);
  assert.equal(h.modal().visible, false);
});

test('native processing modal closes on failure and returns on retry', async () => {
  const h = screen(); await h.upload();
  assert.equal(h.modal().visible, true);
  h.reads[0].reject(new Error('Temporary failure')); await tick(); h.render();
  assert.equal(h.modal().visible, false);
  await h.press('Retry reading screenshot'); h.render();
  assert.equal(h.modal().visible, true);
  h.reads[1].resolve({level:0,matches:0,reliability_percent:0}); await tick(); h.render();
  assert.equal(h.modal().visible, true);
  h.finishSuccess();
  assert.equal(h.modal().visible,false);
  assert.deepEqual(h.used, ['0']);
});

test('native no-profile confirmation bypasses screenshot and discards pending results',async()=>{
 const h=screen(); await h.upload(); await h.press('Keep editing');
 await h.press('☐I don’t have a Playtomic profile or level');h.render();
 assert.equal(h.props.noProfile,true);assert.equal(h.props.path,'');
 h.reads[0].resolve({level:5.17,matches:660,reliability_percent:93});await tick();h.render();
 assert.deepEqual(h.used,[]);assert.equal(h.props.extraction,null);assert.equal(h.modal().visible,false);
});
