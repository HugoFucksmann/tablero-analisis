import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { OpeningBook } from '../services/openings/openingBook.js';

before(() => OpeningBook.load());

const fenAfter = (sans: string[]) => {
    const c = new Chess();
    for (const s of sans) c.move(s);
    return c.fen();
};

test('OpeningBook: carga los TSV y conoce la posición inicial', () => {
    assert.ok(OpeningBook.size > 1000);
    const sans = OpeningBook.getMoves(new Chess().fen()).map(m => m.san);
    assert.ok(sans.includes('e4'));
    assert.ok(sans.includes('d4'));
});

test('OpeningBook: lookup de una apertura conocida (Ruy López)', () => {
    const info = OpeningBook.lookup(fenAfter(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']));
    assert.ok(info);
    assert.match(info.name, /Ruy Lopez/);
    assert.match(info.eco, /^C\d\d$/);
});

test('OpeningBook: getMoves ordena por frecuencia y sabe cuándo termina la teoría', () => {
    const moves = OpeningBook.getMoves(fenAfter(['e4', 'e5']));
    assert.ok(moves.length > 1);
    assert.ok(moves[0].count >= moves[moves.length - 1].count);
    // Posición absurda: no hay teoría
    assert.deepEqual(OpeningBook.getMoves(fenAfter(['a4', 'a5', 'h4', 'h5', 'Ra3', 'Ra6'])), []);
});

test('OpeningBook: findLastKnown devuelve la última posición de libro', () => {
    const c = new Chess();
    const positions = [c.fen()];
    for (const s of ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'h3', 'h6', 'a3']) {
        c.move(s);
        positions.push(c.fen());
    }
    const res = OpeningBook.findLastKnown(positions, positions.length - 1);
    assert.ok(res.entry, 'debe encontrar una posición conocida');
    assert.ok(res.ply >= 5 && res.ply < positions.length - 1);
    assert.equal(res.movesBack, positions.length - 1 - res.ply);
});
