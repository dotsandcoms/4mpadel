import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../../src/pages/AdminPreview.jsx', import.meta.url), 'utf8');
test('Publish destinations render connected modules before the placeholder landing', () => {
  const landing = source.indexOf("else if (activeWorkspace !== 'operate') content");
  for (const [page, component] of [['gallery', 'GalleryWorkspace'], ['email', 'EmailBroadcastWorkspace']]) {
    const index = source.indexOf(`else if (page === '${page}') content = <${component}`);
    assert(index > 0 && index < landing); assert(source.includes(`import ${component} from './admin-preview/${component}.jsx'`));
    assert.match(source.slice(index, source.indexOf(';', index)), /refreshRevision=\{playerRefresh\}/);
  }
});
test('Publish modules have independent loading and non-remounting shell refresh', () => {
  const records = source.match(/const RECORD_WORKSPACE_PAGES = \[(.*?)\];/)[1];
  const refresh = source.match(/const REFRESH_WORKSPACE_PAGES = (.*?);/)[1];
  assert(records.includes("'gallery'")); assert(records.includes("'email'"));
  // All record workspaces now share the same refresh destination list.
  assert(refresh === 'RECORD_WORKSPACE_PAGES' || (refresh.includes("'gallery'") && refresh.includes("'email'")));
  for (const component of ['GalleryWorkspace', 'EmailBroadcastWorkspace']) {
    const call = source.slice(source.indexOf(`content = <${component}`)).split(';')[0];
    assert(!call.match(/key=\{[^}]*playerRefresh/));
  }
});
