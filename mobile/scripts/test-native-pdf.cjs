const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/native-pdf.ts','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module: mod, exports: mod.exports });
const { loadNativePdf } = mod.exports;
test('old app binaries never import a PDF library whose native module is missing', () => {
  let calls = 0;
  assert.equal(loadNativePdf(() => null, () => { calls++; throw new Error('Missing native view'); }).state, 'update-required');
  assert.equal(calls, 0);
});
test('native module lookup and library import failures remain local to the PDF screen', () => {
  assert.equal(loadNativePdf(() => { throw new Error('Native lookup failed'); }, () => ({})).state, 'unavailable');
  assert.equal(loadNativePdf(() => ({}), () => { throw new Error('Missing RNPDFPdfView'); }).state, 'unavailable');
  assert.equal(loadNativePdf(() => ({}), () => ({})).state, 'unavailable');
});
test('new builds use the bundled native viewer once availability is confirmed', () => {
  function Pdf() {} let calls = 0;
  const value = loadNativePdf(() => ({}), () => { calls++; return { default: Pdf }; });
  assert.equal(value.state, 'ready'); assert.equal(value.component, Pdf); assert.equal(calls, 1);
});
