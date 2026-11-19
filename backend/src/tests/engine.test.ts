import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StockfishProcess } from '../core/stockfishProcess.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

test('StockfishProcess: tras destroy() no se puede volver a lanzar (evita procesos huérfanos)', async () => {
    const sf = new StockfishProcess();
    sf.destroy();
    await assert.rejects(() => sf.init({}), { name: 'AbortError' });
    await assert.rejects(() => sf.analyzePosition(START, 5), { name: 'AbortError' });
});
