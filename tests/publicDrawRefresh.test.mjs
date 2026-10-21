import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('public draws refresh from database changes instead of a polling timer', async () => {
    const source = await readFile(new URL('../src/pages/NativeTournamentDraw.jsx', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /setInterval\s*\(/);
    assert.match(source, /supabase\.channel\(`public-draw-/);
    assert.match(source, /document\.visibilityState === 'visible'/);
});

test('round selection resets only when the selected draw changes', async () => {
    const source = await readFile(new URL('../src/pages/NativeTournamentDraw.jsx', import.meta.url), 'utf8');
    assert.match(source, /setActiveRoundIndex\(0\);\n\s*}, \[selectedDrawId\]\);/);
});
