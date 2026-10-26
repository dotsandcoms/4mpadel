const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function harness(platform, application = {}, config = { version: '9.9.9' }) {
  const calls = [];
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/signup-source.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    module: mod, exports: mod.exports, console,
    require(name) {
      if (name === 'expo-application') return application;
      // SDK 57 no longer provides native version/build on the Constants object.
      if (name === 'expo-constants') return { __esModule: true, default: { expoConfig: config } };
      if (name === 'expo-device') return {
        brand: platform === 'ios' ? 'Apple' : 'Google', modelName: 'Test phone',
        manufacturer: 'Test manufacturer', modelId: 'test-model', osName: platform,
        osVersion: 'test-os', deviceType: 1, isDevice: true,
      };
      if (name === 'react-native') return { Platform: { OS: platform } };
      if (name === './supabase') return { supabase: { rpc: async (name, args) => {
        calls.push([name, JSON.parse(JSON.stringify(args))]);
        return { error: null };
      } } };
      throw new Error('Unexpected dependency: ' + name);
    },
  });
  return { ...mod.exports, calls };
}

test('iOS and Android report installed native versions and builds rather than config versions', async () => {
  for (const platform of ['ios', 'android']) {
    const app = harness(platform, { nativeApplicationVersion: '1.0.1', nativeBuildVersion: '8' });
    await app.recordAppDevice();
    const [name, { p_device: device }] = app.calls[0];
    assert.equal(name, 'record_player_device');
    assert.equal(device.source, platform);
    assert.equal(device.appVersion, '1.0.1');
    assert.equal(device.build, '8');
    assert.equal(device.model, 'Test phone');
    assert.equal(device.isDevice, true);
    assert.ok(Number.isFinite(Date.parse(device.recordedAt)));
  }
});

test('missing native metadata falls back to the config version without inventing a build', () => {
  const app = harness('ios', { nativeApplicationVersion: null, nativeBuildVersion: null });
  assert.equal(app.collectSignupDevice().appVersion, '9.9.9');
  assert.equal(app.collectSignupDevice().build, null);
});

test('unavailable native and config metadata remains unknown', () => {
  const app = harness('android', {}, null);
  assert.equal(app.collectSignupDevice().appVersion, null);
  assert.equal(app.collectSignupDevice().build, null);
});
