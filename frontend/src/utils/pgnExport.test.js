import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateAnnotatedPgn } from './pgnExport.js';

const history = [{ san: 'e4' }, { san: 'e5' }, { san: 'Qh5' }];

test('generateAnnotatedPgn: incluye jugadas, evaluación, etiqueta y reloj', () => {
  const pgn = generateAnnotatedPgn(
    history,
    { 0: 'Mejor', 2: 'Error' },
    { 0: { score: 0.3 }, 2: { score: -1.2 } },
    { depth: 18 },
    { White: 'Ana', Black: 'Beto' },
    { 0: '[%clk 0:09:58]' },
  );
  assert.match(pgn, /\[White "Ana"\]/);
  assert.match(pgn, /\[Annotator "Tablero Análisis \(Stockfish Profundidad 18\)"\]/);
  assert.match(pgn, /1\. e4 \{\[%clk 0:09:58\] \[%eval 0\.3\] Mejor\}/);
  assert.match(pgn, /\[%eval -1\.2\] Error/);
  assert.match(pgn, /\[Result "\*"\]/);
});

test('generateAnnotatedPgn: corta en la primera jugada inválida y conserva encabezados', () => {
  const pgn = generateAnnotatedPgn(
    [{ san: 'e4' }, { san: 'Zz9' }],
    {}, {}, null, { Site: 'Lichess', Round: null },
  );
  assert.match(pgn, /\[Site "Lichess"\]/);
  assert.match(pgn, /1\. e4/);
  assert.doesNotMatch(pgn, /Zz9/);
});

test('generateAnnotatedPgn: exporta variantes entre paréntesis con la numeración correcta', () => {
  const four = [{ san: 'e4' }, { san: 'e5' }, { san: 'Nf3' }, { san: 'Nc6' }];
  const pgn = generateAnnotatedPgn(four, {}, {}, null, {}, {}, [
    { prefix: ['e4'], moves: ['c5', 'Nf3'], source: 'user' },        // sustituye a 1...e5
    { prefix: ['e4', 'e5', 'Nf3'], moves: ['Nf6'], source: 'engine' }, // sustituye a 2...Nc6
    { prefix: ['e4', 'e5', 'Nf3', 'Nc6'], moves: ['Bb5'], source: 'user' }, // continúa tras la última
  ]);
  assert.match(pgn, /1\. e4 e5 \(1\.\.\. c5 2\. Nf3\) 2\. Nf3 Nc6 \(2\.\.\. Nf6 \{Stockfish\}\) \(3\. Bb5\) \*/);
  assert.match(pgn, /\[White "\?"\]/); // las cabeceras se conservan
});

test('generateAnnotatedPgn: las variantes respetan un FEN inicial con turno de negras', () => {
  const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
  const pgn = generateAnnotatedPgn([{ san: 'e5' }, { san: 'Nf3' }], {}, {}, null, { FEN: fen }, {}, [
    { prefix: [], moves: ['c5', 'Nf3'], source: 'user' },
  ]);
  assert.match(pgn, /1\.\.\. e5 \(1\.\.\. c5 2\. Nf3\) 2\. Nf3/);
});
