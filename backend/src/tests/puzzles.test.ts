import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import {
    evaluatePuzzleCandidate, extractForcedSequence, trimAmbiguousTail, MIN_SOLUTION_GAP_CP,
} from '../services/puzzles/puzzleFilters.js';
import { PuzzleExtractor } from '../services/puzzles/puzzleExtractor.js';

// 1.f3 e5 2.g4: las negras tienen Qh4# (mate en 1)
const FOOLS = 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq g3 0 2';
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const ctx = (over: Record<string, any> = {}) => ({
    beforeEval: { wp: 0.5 },
    afterEval: { mate: null, pv: '', line1Score: 300, line2Score: 0 },
    isWhiteMove: true,
    isEngineBest: false,
    wpLoss: 0.3,
    puzzleFen: FOOLS,
    preBlunderFen: START,
    label: 'Error grave',
    ...over,
    ...(over.afterEval ? { afterEval: { mate: null, pv: '', line1Score: 300, line2Score: 0, ...over.afterEval } } : {}),
});

test('extractForcedSequence: se detiene en el mate y respeta el máximo', () => {
    assert.deepEqual(extractForcedSequence('d8h4', FOOLS, 7, true), ['d8h4']);
    assert.deepEqual(extractForcedSequence('d8h4 e1e2', FOOLS), ['d8h4']); // acaba en mate
    assert.deepEqual(extractForcedSequence('', FOOLS), []);
    assert.deepEqual(extractForcedSequence('a1a2', FOOLS), []); // jugada ilegal
});

test('evaluatePuzzleCandidate: descarta mates triviales y pérdidas pequeñas', () => {
    assert.equal(evaluatePuzzleCandidate(ctx({ wpLoss: 0.05 })).accept, false);
    const trivial = evaluatePuzzleCandidate(ctx({ afterEval: { mate: 1, pv: 'd8h4' } }));
    assert.equal(trivial.accept, false);
    assert.match(trivial.reason ?? '', /trivial/);
});

test('evaluatePuzzleCandidate: acepta un mate forzado de más de 1 jugada', () => {
    const r = evaluatePuzzleCandidate(ctx({ afterEval: { mate: 2, pv: 'd8h4' } }));
    assert.equal(r.accept, true);
    assert.equal(r.puzzleType, 'mate');
    assert.equal(r.mateIn, 2);
    assert.deepEqual(r.solutionSequence, ['d8h4']);
});

test('evaluatePuzzleCandidate: sin secuencia válida o con solución ambigua se rechaza', () => {
    assert.equal(evaluatePuzzleCandidate(ctx({ afterEval: { pv: '' } })).accept, false);
    const ambiguous = evaluatePuzzleCandidate(ctx({
        afterEval: { pv: 'd8h4', line1Score: 300, line2Score: 300 - (MIN_SOLUTION_GAP_CP - 10) },
    }));
    assert.equal(ambiguous.accept, false);
});

test('trimAmbiguousTail: corta antes de la primera jugada del solucionador con alternativa igual de buena', async () => {
    const c = new Chess();
    const seq: string[] = [];
    for (const s of ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']) seq.push(c.move(s).lan);
    let calls = 0;
    // Siempre ambiguo → se corta en la primera comprobación (índice 2)
    const trimmed = await trimAmbiguousTail(START, seq, async () => { calls++; return [{ score: 100, mate: null }, { score: 95, mate: null }]; });
    assert.deepEqual(trimmed, seq.slice(0, 1));
    assert.equal(calls, 1);
    // Siempre claro → se conserva todo
    const full = await trimAmbiguousTail(START, seq, async () => [{ score: 300, mate: null }, { score: 0, mate: null }]);
    assert.deepEqual(full, seq);
});

test('PuzzleExtractor._identifyCandidates: solo errores graves con castigo táctico', () => {
    const extractor = new PuzzleExtractor() as any;
    const c = new Chess();
    const positions = [c.fen()];
    const history: any[] = [];
    for (const s of ['f3', 'e5', 'g4']) { history.push(c.move(s)); positions.push(c.fen()); }
    // Evaluaciones (vista blancas): equilibrio, equilibrio, blancas flojas, y tras g4 las negras tienen mate
    const evals = [
        { wp: 0.5, bestMove: 'e2e4', mate: null },
        { wp: 0.45, bestMove: 'e7e5', mate: null },
        { wp: 0.5, bestMove: 'e2e4', mate: null },
        { wp: 0.0, bestMove: 'd8h4', mate: -1 }, // tras 2.g4: mate para las negras
    ];
    const cands = extractor._identifyCandidates(history, positions, evals);
    assert.equal(cands.length, 1);
    assert.equal(cands[0].ply, 2);
    assert.equal(cands[0].movePlayed, 'g2g4');
    assert.equal(cands[0].puzzleFen, positions[3]);
});
