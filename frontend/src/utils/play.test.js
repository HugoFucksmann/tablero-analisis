import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import {
  BOT_LEVELS, TIME_CONTROLS, getLevel, getTimeControl, strengthOf, botMoveTime, formatClock,
} from './botLevels.js';
import { describeResult, pgnResult, detectGameEnd, isCustomStart, buildPlayPgn, START_FEN } from './playUtils.js';

test('niveles del bot: orden creciente, ids únicos y fuerza coherente', () => {
  const elos = BOT_LEVELS.map(l => l.elo);
  assert.deepEqual([...elos].sort((a, b) => a - b), elos);
  assert.equal(new Set(BOT_LEVELS.map(l => l.id)).size, BOT_LEVELS.length);
  assert.equal(getLevel('no-existe').id, 'club'); // valor por defecto
  // Por debajo de 1320 se usa Skill Level; con Elo, UCI_Elo; el máximo no limita
  assert.deepEqual(strengthOf(getLevel('beginner')), { elo: null, skill: 0 });
  assert.deepEqual(strengthOf(getLevel('club')), { elo: 1600, skill: null });
  assert.deepEqual(strengthOf(getLevel('max')), { elo: null, skill: null });
  for (const l of BOT_LEVELS.filter(l => l.uciElo)) assert.ok(l.uciElo >= 1320 && l.uciElo <= 3190);
});

test('controles de tiempo y tiempo de búsqueda del bot', () => {
  assert.equal(getTimeControl('3+2').base, 180);
  assert.equal(getTimeControl('nada').id, 'none');
  assert.equal(TIME_CONTROLS[0].base, null);

  const club = getLevel('club');
  assert.equal(botMoveTime(club, null), club.movetime);          // sin reloj: el del nivel
  assert.equal(botMoveTime(club, 600, 0), club.movetime);        // mucho tiempo: tope del nivel
  assert.ok(botMoveTime(club, 8, 0) < club.movetime);            // poco tiempo: piensa menos
  assert.ok(botMoveTime(club, 0.5, 0) >= 60);                    // nunca por debajo del mínimo
});

test('formatClock: m:ss y h:mm:ss (el formato de PlayerArea)', () => {
  assert.equal(formatClock(null), null);
  assert.equal(formatClock(180), '03:00');
  assert.equal(formatClock(59.2), '01:00'); // redondea hacia arriba, como un reloj real
  assert.equal(formatClock(0), '00:00');
  assert.equal(formatClock(-3), '00:00');
  assert.equal(formatClock(3725), '1:02:05');
});

test('describeResult / pgnResult desde el punto de vista del usuario', () => {
  assert.equal(describeResult({ winner: 'w', reason: 'checkmate' }, 'w').outcome, 'win');
  assert.equal(describeResult({ winner: 'w', reason: 'checkmate' }, 'b').outcome, 'loss');
  assert.equal(describeResult({ winner: null, reason: 'stalemate' }, 'w').outcome, 'draw');
  assert.equal(describeResult({ winner: 'b', reason: 'timeout' }, 'w').detail, 'Tiempo agotado');
  assert.equal(describeResult(null, 'w'), null);
  assert.equal(pgnResult({ winner: 'w' }), '1-0');
  assert.equal(pgnResult({ winner: 'b' }), '0-1');
  assert.equal(pgnResult({ winner: null }), '1/2-1/2');
});

test('detectGameEnd: mate, ahogado, material insuficiente y repetición', () => {
  const play = (sans, fen) => { const g = fen ? new Chess(fen) : new Chess(); sans.forEach(m => g.move(m)); return g; };

  assert.equal(detectGameEnd(new Chess()), null);
  assert.deepEqual(detectGameEnd(play(['f3', 'e5', 'g4', 'Qh4#'])), { winner: 'b', reason: 'checkmate' });
  assert.deepEqual(detectGameEnd(new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')), { winner: null, reason: 'stalemate' });
  assert.deepEqual(detectGameEnd(new Chess('8/8/8/4k3/8/3K4/8/8 w - - 0 1')), { winner: null, reason: 'insufficient' });
  assert.deepEqual(
    detectGameEnd(play(['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8'])),
    { winner: null, reason: 'repetition' },
  );
});

test('isCustomStart y buildPlayPgn (con y sin FEN personalizado)', () => {
  assert.equal(isCustomStart(null), false);
  assert.equal(isCustomStart(START_FEN), false);
  assert.equal(isCustomStart('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3'), true);

  const std = buildPlayPgn({
    history: [{ san: 'e4' }, { san: 'e5' }, { san: 'Qh5' }, { san: 'Nc6' }],
    startFen: null, userColor: 'w', userName: 'Ana', botLabel: 'Stockfish (Club)', botElo: 1600,
    result: { winner: 'w', reason: 'resign' }, timeControl: { base: 180, inc: 2 },
  });
  assert.match(std, /\[White "Ana"\]/);
  assert.match(std, /\[Black "Stockfish \(Club\)"\]/);
  assert.match(std, /\[BlackElo "1600"\]/);
  assert.match(std, /\[Result "1-0"\]/);
  assert.match(std, /\[TimeControl "180\+2"\]/);
  assert.match(std, /1\. e4 e5 2\. Qh5 Nc6/);
  assert.doesNotMatch(std, /\[FEN /);

  // Partida desde una posición con turno de negras: lleva SetUp/FEN y el usuario juega con negras
  const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
  const custom = buildPlayPgn({
    history: ['e5', 'Nf3'], startFen: fen, userColor: 'b', userName: 'Beto', botLabel: 'Stockfish (Fácil)', botElo: 1150,
    result: { winner: null, reason: 'agreement' }, timeControl: null,
  });
  assert.match(custom, /\[SetUp "1"\]/);
  assert.match(custom, /\[FEN "rnbqkbnr/);
  assert.match(custom, /\[Black "Beto"\]/);
  assert.match(custom, /\[WhiteElo "1150"\]/);
  assert.match(custom, /\[TimeControl "-"\]/);
  assert.match(custom, /\[Result "1\/2-1\/2"\]/);
  assert.match(custom, /1\. \.\.\. e5 2\. Nf3/); // chess.js escribe "1. ..." para la jugada inicial de negras
});
