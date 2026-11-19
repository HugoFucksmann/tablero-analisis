import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitPgnGames, buildBatchGameFromPgn } from './pgnImport.js';
import { normalizeTimeControl } from './timeControl.js';

const GAME_A = `[Event "A"]
[White "yo"]
[Black "rival"]
[Result "1-0"]
[TimeControl "600+5"]
[Date "2024.05.01"]

1. e4 e5 2. Nf3 Nc6 1-0`;

const GAME_B = `[Event "B"]
[White "otro"]
[Black "yo"]
[Result "1-0"]
[TimeControl "180"]

1. d4 d5 2. c4 e6 1-0`;

test('splitPgnGames: separa varias partidas, con CRLF y líneas en blanco extra', () => {
  assert.equal(splitPgnGames('').length, 0);
  assert.equal(splitPgnGames(GAME_A).length, 1);
  const two = splitPgnGames(`${GAME_A}\n\n\n${GAME_B}\n`);
  assert.equal(two.length, 2);
  assert.match(two[1], /\[Event "B"\]/);
  assert.equal(splitPgnGames(`${GAME_A}\r\n\r\n${GAME_B}`.replace(/\n/g, '\r\n')).length, 2);
});

test('buildBatchGameFromPgn: color, resultado, control de tiempo, rival e id estable', () => {
  const a = buildBatchGameFromPgn(GAME_A, 'yo');
  assert.equal(a.playerColor, 'white');
  assert.equal(a.win, 1);
  assert.equal(a.timeControl, '600+5');
  assert.equal(a.opponent, 'rival');
  assert.equal(a.gameDate, '2024-05-01T00:00:00');
  assert.equal(buildBatchGameFromPgn(GAME_A, 'yo').gameId, a.gameId); // determinista
  assert.match(a.gameId, /^pgn-/);

  const b = buildBatchGameFromPgn(GAME_B, 'YO'); // sin distinguir mayúsculas
  assert.equal(b.playerColor, 'black');
  assert.equal(b.win, -1);
  assert.equal(b.timeControl, '180+0');
  assert.equal(b.opponent, 'otro');
  assert.notEqual(b.gameId, a.gameId);

  assert.equal(buildBatchGameFromPgn('esto no es un pgn', 'yo'), null);
  assert.equal(buildBatchGameFromPgn('[Event "x"]\n\n*', 'yo'), null); // sin jugadas
});

test('normalizeTimeControl: formatos de PGN → base+incremento en segundos', () => {
  assert.equal(normalizeTimeControl('600+5'), '600+5');
  assert.equal(normalizeTimeControl('600'), '600+0');
  assert.equal(normalizeTimeControl('0:10:00'), '600+0');
  assert.equal(normalizeTimeControl('5:00'), '300+0');
  assert.equal(normalizeTimeControl('-'), null);
  assert.equal(normalizeTimeControl('?'), null);
  assert.equal(normalizeTimeControl(''), null);
  assert.equal(normalizeTimeControl(undefined), null);
  assert.equal(normalizeTimeControl('blitz'), null);
});
