import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractTimes, parseIncrement, computeMoveTime } from '../utils/analysisUtils.js';

test('extractTimes: formato Lichess y Chess.com (con décimas y sin espacios)', () => {
    assert.deepEqual(extractTimes('1. e4 { [%clk 0:05:00] } 1... e5 { [%clk 0:04:58] }'), [300, 298]);
    assert.deepEqual(extractTimes('1. e4 {[%clk 0:04:59.9]} e5 {[%clk 1:00:00.5]}'), [299.9, 3600.5]);
    assert.deepEqual(extractTimes('1. e4 e5'), []);
});

test('parseIncrement: incremento del control de tiempo', () => {
    assert.equal(parseIncrement('600+5'), 5);
    assert.equal(parseIncrement('180+0'), 0);
    assert.equal(parseIncrement('300'), 0);
    assert.equal(parseIncrement(null), 0);
    assert.equal(parseIncrement('blitz'), 0);
});

test('computeMoveTime: reloj propio previo menos actual más incremento', () => {
    const times = [300, 300, 295, 290, 290.5, 280];
    assert.equal(computeMoveTime(times, 0), undefined);          // primeras jugadas sin referencia
    assert.equal(computeMoveTime(times, 2), 5);                  // 300 - 295
    assert.equal(computeMoveTime(times, 2, 2), 7);               // con incremento de 2 s
    assert.equal(computeMoveTime(times, 4, 2), 6.5);             // 295 - 290.5 + 2 → tras sumar incremento
    assert.equal(computeMoveTime([300, 300, 305], 2), 0);        // nunca negativo
    assert.equal(computeMoveTime([300, null, null, 280], 3), undefined); // sin dato → undefined
});
