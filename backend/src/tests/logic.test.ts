import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChessMath } from '../utils/chessMath.js';
import { EvaluationEngine } from '../services/analysis/evaluationRules.js';
import { parseInfoLine, parseBestmoveLine } from '../core/uciParser.js';
import { MoveClassifier } from '../services/analysis/moveClassifier.js';
import {
    allowsMate, lineValue, hasClearSolution, isBalancedPosition, isTacticalMove, extractForcedSequence,
} from '../services/puzzles/puzzleFilters.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

test('ChessMath: probabilidad de victoria y puntuación visual', () => {
    assert.equal(ChessMath.cpToWhiteWinProb(0, null, false), 0.5);
    assert.ok(ChessMath.cpToWhiteWinProb(300, null, false) > 0.7);
    // mate a favor del bando que mueve
    assert.equal(ChessMath.cpToWhiteWinProb(0, 3, false), 1);
    assert.equal(ChessMath.cpToWhiteWinProb(0, 3, true), 0);
    // la puntuación visual se acota a ±10 y se invierte con turno negro
    assert.equal(ChessMath.cpToVisualScore(5000, null, false), 10);
    assert.equal(ChessMath.cpToVisualScore(100, null, true), -1);
    assert.equal(ChessMath.cpToVisualScore(0, -2, false), -10);
});

test('EvaluationEngine.classifyMove: umbrales de pérdida de probabilidad', () => {
    assert.equal(EvaluationEngine.classifyMove(0.5, 0.5, true, true), 'Mejor');
    // una mejora grande sin sacrificio es solo 'Mejor': el '!!' exige detectar el sacrificio
    assert.equal(EvaluationEngine.classifyMove(0.5, 0.6, true, true), 'Mejor');
    assert.equal(EvaluationEngine.classifyMove(0.5, 0.49, true, false), 'Excelente');
    assert.equal(EvaluationEngine.classifyMove(0.5, 0.46, true, false), 'Bueno');
    assert.equal(EvaluationEngine.classifyMove(0.5, 0.41, true, false), 'Imprecisión');
    assert.equal(EvaluationEngine.classifyMove(0.5, 0.35, true, false), 'Error');
    assert.equal(EvaluationEngine.classifyMove(0.5, 0.1, true, false), 'Error grave');
    // para negras la pérdida se mide al revés
    assert.equal(EvaluationEngine.classifyMove(0.5, 0.9, false, false), 'Error grave');
});

test('EvaluationEngine.calculateAccuracy: jugadas perfectas = 100 y excluye libro', () => {
    const perfect = { wpLoss: 0, isWhiteMove: true, isBook: false };
    const blunder = { wpLoss: 0.5, isWhiteMove: false, isBook: false };
    const book = { wpLoss: 0.9, isWhiteMove: true, isBook: true };
    const acc = EvaluationEngine.calculateAccuracy([perfect, blunder, book, null]);
    assert.equal(acc.white, 100);
    assert.ok(acc.black < 50);
    assert.deepEqual(EvaluationEngine.calculateAccuracy([]), { white: 100, black: 100 });
});

test('uciParser: líneas info y bestmove', () => {
    const info = parseInfoLine('info depth 12 multipv 2 score cp -35 nodes 1 pv e7e5 g1f3');
    assert.deepEqual(info, { multipv: 2, depth: 12, score: -35, mate: null, pv: 'e7e5 g1f3', move: 'e7e5' });
    assert.equal(parseInfoLine('info depth 3 score mate 4 pv h5f7')?.mate, 4);
    assert.equal(parseInfoLine('info string hola'), null);
    assert.deepEqual(parseBestmoveLine('bestmove e2e4 ponder e7e5'), { bestMove: 'e2e4' });
    assert.deepEqual(parseBestmoveLine('bestmove (none)'), { bestMove: '' });
    assert.equal(parseBestmoveLine('readyok'), null);
});

test('puzzleFilters: utilidades puras', () => {
    assert.equal(allowsMate(2), true);
    assert.equal(allowsMate(-2), false);
    assert.equal(allowsMate(null), false);
    assert.ok((lineValue({ score: 0, mate: 2 }) ?? 0) > (lineValue({ score: 900, mate: null }) ?? 0));
    assert.equal(lineValue(null), null);
    assert.equal(hasClearSolution({ line1Score: 300, line2Score: 100 }), true);
    assert.equal(hasClearSolution({ line1Score: 300, line2Score: 280 }), false);
    assert.equal(hasClearSolution({ line1Score: 300, line2Score: null }), true);
    assert.equal(isBalancedPosition(0.5, true), true);
    assert.equal(isBalancedPosition(0.95, true), false);
    assert.equal(isTacticalMove(START, 'e2e4'), false);
    assert.equal(isTacticalMove('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', 'e4d5'), true);
    assert.deepEqual(extractForcedSequence('', START), []);
});

test('MoveClassifier: el tiempo NO sobreescribe la etiqueta ajedrecística', () => {
    const base = {
        ply: 0,
        history: ['e2e4'],
        positions: [START],
        evalResults: [
            { wp: 0.5, score: 0, mate: null, bestMove: 'd2d4', lines: [] },
            { wp: 0.2, score: -300, mate: null, bestMove: '', lines: [] },
        ],
        bookStatus: [false],
        openingDone: true,
    };

    const fast = MoveClassifier.classify({ ...base, moveTime: 1, remainingTime: 300 });
    assert.equal(fast?.label, 'Error grave');
    assert.equal(fast?.errorTimeClass, 'precipitation');

    const slow = MoveClassifier.classify({ ...base, moveTime: 45, remainingTime: 300 });
    assert.equal(slow?.label, 'Error grave');
    assert.equal(slow?.errorTimeClass, 'overthinking');

    const pressure = MoveClassifier.classify({ ...base, moveTime: 5, remainingTime: 8 });
    assert.equal(pressure?.label, 'Error grave');
    assert.equal(pressure?.errorTimeClass, 'time_pressure');

    const noClock = MoveClassifier.classify(base);
    assert.equal(noClock?.errorTimeClass, null);
});
