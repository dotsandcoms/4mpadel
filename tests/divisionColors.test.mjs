import test from 'node:test';
import assert from 'node:assert/strict';
import { divisionColorMap } from '../src/utils/divisionColors.js';

const divisions = [
    { id: 'men35', name: "Men's 35+" },
    { id: 'men45', name: "Men's 45+" },
    { id: 'men55', name: "Men's 55+" },
    { id: 'ladies50', name: 'Ladies 50+' },
];

test('every SA Nationals age division has a distinct colour, including all men’s divisions', () => {
    const colours = divisionColorMap(divisions);
    assert.equal(new Set([...colours.values()].map(division => division.color)).size, divisions.length);
    assert.notEqual(colours.get('men35').color, colours.get('men45').color);
    assert.notEqual(colours.get('men45').color, colours.get('men55').color);
});

test('changing display or scheduling priority order keeps each division’s colour', () => {
    const original = divisionColorMap(divisions);
    const reordered = divisionColorMap([...divisions].reverse());
    for (const division of divisions) assert.equal(original.get(division.id).color, reordered.get(division.id).color);
});

test('multiple women’s and mixed divisions also get distinct colours', () => {
    const names = ["Women's 35+", "Women's 45+", 'Ladies 50+', 'Mixed 35+', 'Mixed 45+', 'Mens Open'];
    const colours = divisionColorMap(names.map((name, id) => ({ id, name })));
    assert.equal(new Set([...colours.values()].map(division => division.color)).size, names.length);
});

test('colour assignment preserves caller order and supports more divisions than the base palette', () => {
    const input = Array.from({ length: 20 }, (_, i) => ({ id: `division-${20-i}`, name: `Division ${i + 1}` }));
    const before = structuredClone(input);
    const colours = divisionColorMap(input);
    assert.deepEqual(input, before);
    assert.equal(new Set([...colours.values()].map(division => division.color)).size, input.length);
});
