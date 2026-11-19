import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isBrilliantMove, materialBalance } from '../services/analysis/brilliantDetector.js';
import { MoveClassifier } from '../services/analysis/moveClassifier.js';

// Las blancas entregan la torre (Ra5) a una dama negra que la captura: sacrificio de 5 puntos.
const BEFORE = '4k3/8/8/3q4/8/8/8/R3K3 w - - 0 1';
const AFTER = '4k3/8/8/R2q4/8/8/8/4K3 b - - 1 1';
const SAC_PV = 'd5a5 e1d1 a5a1 d1d2';

const base = { fenBefore: BEFORE, fenAfter: AFTER, pv: SAC_PV, moverIsWhite: true, wpBefore: 0.5, wpAfter: 0.5 };

test('materialBalance: valores 1/3/3/5/9 e ignora los reyes', () => {
    assert.equal(materialBalance('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'), 0);
    assert.equal(materialBalance(BEFORE), 5 - 9);
    assert.equal(materialBalance('4k3/8/8/8/8/8/8/4K3 w - - 0 1'), 0);
});

test('isBrilliantMove: detecta un sacrificio con compensación', () => {
    assert.equal(isBrilliantMove(base), true);
    // Jugando con negras la perspectiva se invierte
    assert.equal(isBrilliantMove({
        fenBefore: '4k3/8/8/8/3Q4/8/8/r3K3 b - - 0 1', fenAfter: '4k3/8/8/8/r2Q4/8/8/4K3 w - - 1 1',
        pv: 'd4a4 e8d8 a4a1 d8d7', moverIsWhite: false, wpBefore: 0.5, wpAfter: 0.5,
    }), true);
});

const QUIET = {
    fenBefore: '4k3/8/8/8/8/8/8/R3K3 w - - 0 1', fenAfter: '4k3/8/8/8/8/8/R7/4K3 b - - 1 1',
    moverIsWhite: true, wpBefore: 0.5, wpAfter: 0.5,
};

test('isBrilliantMove: el sacrificio se detecta aunque el motor no lo capture en su variante', () => {
    assert.equal(isBrilliantMove({ ...base, pv: undefined }), true);
    assert.equal(isBrilliantMove({ ...base, pv: 'e1d1 d5d1' }), true); // el motor ignora la torre y aun así está en prise
});

test('isBrilliantMove: un intercambio parejo (con recaptura) no es un sacrificio', () => {
    // Torre captura un caballo (+3) y un peón recaptura la torre (−5): pierde 2 puntos netos (< 3)
    assert.equal(isBrilliantMove({
        fenBefore: '4k3/8/3p4/4n3/8/8/8/4RK2 w - - 0 1', fenAfter: '4k3/8/3p4/4R3/8/8/8/5K2 b - - 0 1',
        pv: undefined, moverIsWhite: true, wpBefore: 0.5, wpAfter: 0.5,
    }), false);
});

test('isBrilliantMove: lo que ya estaba en prise antes de mover no cuenta como sacrificio', () => {
    // La torre de a1 ya estaba atacada por la dama negra (a5) antes de la jugada; mover el rey no es un sacrificio
    assert.equal(isBrilliantMove({
        fenBefore: '4k3/8/8/q7/8/8/8/R3K3 w - - 0 1', fenAfter: '4k3/8/8/q7/8/8/8/R4K2 b - - 1 1',
        pv: undefined, moverIsWhite: true, wpBefore: 0.5, wpAfter: 0.5,
    }), false);
});

test('isBrilliantMove: no es brillante sin sacrificio, sin compensación o si ya ganaba', () => {
    assert.equal(isBrilliantMove({ ...QUIET, pv: 'e8d8 a2a3' }), false);   // jugada tranquila
    assert.equal(isBrilliantMove({ ...QUIET, pv: undefined }), false);
    assert.equal(isBrilliantMove({ ...QUIET, pv: 'zz yy' }), false);       // variante ilegal
    assert.equal(isBrilliantMove({ ...base, wpBefore: 0.92 }), false);     // ya ganaba de sobra
    assert.equal(isBrilliantMove({ ...base, wpAfter: 0.3 }), false);       // el sacrificio no compensa
});

test('MoveClassifier: el sacrificio se etiqueta Brillante; sin sacrificio, Mejor', () => {
    const input = (before: string, after: string, move: string, pv: string) => ({
        ply: 0,
        history: [move],
        positions: [before, after],
        evalResults: [
            { wp: 0.5, score: 0, mate: null, bestMove: move, lines: [] },
            { wp: 0.5, score: 0, mate: null, bestMove: 'e8d8', lines: [{ pv, score: 0, depth: 20, multipv: 1, move: pv.split(' ')[0] }] },
        ] as any,
        bookStatus: [false],
        openingDone: true,
    });
    assert.equal(MoveClassifier.classify(input(BEFORE, AFTER, 'a1a5', SAC_PV))?.label, 'Brillante');
    assert.equal(MoveClassifier.classify(input(QUIET.fenBefore, QUIET.fenAfter, 'a1a2', 'e8d8 a2a3'))?.label, 'Mejor');
});
