import test from 'node:test';
import assert from 'node:assert/strict';
import { divisionColorMap } from '../src/utils/divisionColors.js';

test('named tournament divisions keep consistent semantic colours', () => {
    const colours = divisionColorMap([
        {id: 'mixed', name: 'Mixed Open'},
        {id: 'ladies', name: 'Ladies Open'},
        {id: 'men', name: 'Mens Open'},
    ]);
    assert.equal(colours.get('men').color, '#7dd3fc');
    assert.equal(colours.get('ladies').color, '#f9a8d4');
    assert.equal(colours.get('mixed').color, '#c4b5fd');
});

test('word matching does not mistake women for men', () => {
    const colours = divisionColorMap([{id: 'women', name: "Women's Open"}]);
    assert.equal(colours.get('women').color, '#f9a8d4');
});
