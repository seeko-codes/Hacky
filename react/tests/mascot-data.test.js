import test from 'node:test';
import assert from 'node:assert/strict';
import { colors, recolorFilter, recolorMatrix } from '../src/mascot-data.js';

const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
const apply = (matrix, pixel) => {
  const m = matrix.split(' ').map(Number);
  return [0, 1, 2].map(row => Math.min(1, m[row * 5] * pixel[0] + m[row * 5 + 1] * pixel[1] + m[row * 5 + 2] * pixel[2]));
};

test('every color but original recolors the knit Hacky; unknown colors draw it as is', () => {
  assert.equal(recolorFilter('original'), 'none');
  assert.equal(recolorFilter('plaid'), 'none');
  assert.equal(recolorFilter(undefined), 'none');
  for (const [id] of colors.filter(([id]) => id !== 'original')) assert.equal(recolorFilter(id), `url(#hacky-color-${id})`);
});

test('the cream body lands on the swatch and the navy screen stays dark', () => {
  for (const [id, , hex] of colors.filter(([id]) => id !== 'original')) {
    const matrix = recolorMatrix(hex);
    apply(matrix, [0.87, 0.87, 0.87]).forEach((value, i) => assert.ok(Math.abs(value - rgb(hex)[i]) < 0.01, `${id} body`));
    assert.ok(Math.max(...apply(matrix, [0.144, 0.164, 0.259])) < 0.25, `${id} screen`);
  }
});
