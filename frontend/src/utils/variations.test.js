import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitFromMainLine, addVariation, allVariations, replaySans, sansOf } from './variations.js';

const MAIN = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'];
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

test('splitFromMainLine: separa el prefijo común de las jugadas propias', () => {
  assert.deepEqual(splitFromMainLine(MAIN, ['e4', 'c5', 'Nf3']), { prefix: ['e4'], moves: ['c5', 'Nf3'] });
  assert.deepEqual(splitFromMainLine(MAIN, [...MAIN, 'a6']), { prefix: MAIN, moves: ['a6'] }); // extiende la principal
  assert.equal(splitFromMainLine(MAIN, ['e4', 'e5']), null); // contenida en la principal
  assert.equal(splitFromMainLine(MAIN, MAIN), null);
});

test('addVariation: no duplica, ignora contenidas y reemplaza cuando se extiende', () => {
  let vars = addVariation([], MAIN, ['e4', 'c5', 'Nf3'], 'user');
  assert.equal(vars.length, 1);
  assert.equal(vars[0].source, 'user');
  assert.match(vars[0].id, /^v/);

  // misma línea o prefijo de ella: sin cambios
  assert.equal(addVariation(vars, MAIN, ['e4', 'c5', 'Nf3'], 'user'), vars);
  assert.equal(addVariation(vars, MAIN, ['e4', 'c5'], 'user'), vars);
  // contenida en la principal: sin cambios
  assert.equal(addVariation(vars, MAIN, ['e4', 'e5'], 'user'), vars);

  // la extiende: sustituye a la anterior
  vars = addVariation(vars, MAIN, ['e4', 'c5', 'Nf3', 'd6'], 'user');
  assert.equal(vars.length, 1);
  assert.deepEqual(vars[0].moves, ['c5', 'Nf3', 'd6']);

  // otra bifurcación distinta: se añade
  vars = addVariation(vars, MAIN, ['e4', 'e6'], 'engine');
  assert.equal(vars.length, 2);
  assert.equal(vars[1].source, 'engine');
});

test('allVariations: incluye la línea actual solo al explorar', () => {
  const saved = [];
  assert.equal(allVariations(saved, MAIN, ['e4', 'c5'], false).length, 0);
  assert.equal(allVariations(saved, MAIN, ['e4', 'c5'], true).length, 1);
  assert.equal(allVariations(saved, MAIN, MAIN, true).length, 0);
});

test('replaySans: reproduce una línea o devuelve null si es ilegal', () => {
  const moves = replaySans(['e4', 'e5', 'Nf3']);
  assert.equal(moves.length, 3);
  assert.equal(moves[2].san, 'Nf3');
  assert.equal(replaySans(['e4', 'Qh5']), null);
  assert.deepEqual(sansOf(moves), ['e4', 'e5', 'Nf3']);
  assert.deepEqual(sansOf(['a', { san: 'b' }]), ['a', 'b']);
});
