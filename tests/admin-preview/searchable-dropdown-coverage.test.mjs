import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

test('new-admin dropdowns use the shared searchable control', () => {
  const files = ['src/pages/AdminPreview.jsx', ...readdirSync('src/pages/admin-preview').filter(file => file.endsWith('.jsx')).map(file => `src/pages/admin-preview/${file}`)];
  for (const file of files) assert.doesNotMatch(readFileSync(file, 'utf8'), /<select(?:\s|>)/, `${file}: use SearchableDropdown, not a native-only dropdown`);
});

test('shared event builders enable search in preview without changing legacy controls', () => {
  for (const file of ['EventBuilder.jsx', 'QuickEventBuilder.jsx']) {
    const source = readFileSync(`src/components/admin/${file}`, 'utf8');
    assert.doesNotMatch(source, /<select(?:\s|>)/);
    for (const tag of source.matchAll(/<SearchableDropdown\b[^>]*>/g)) {
      // EventBuilder's SelectMenu wrapper explicitly opts into searchable mode.
      if (tag[0].includes('value={value')) continue;
      assert.match(tag[0], /searchable=\{previewTheme\}/);
    }
    for (const tag of source.matchAll(/<SelectMenu\b[^>]*>/g)) assert.match(tag[0], /searchable=\{previewTheme\}/);
  }
});
