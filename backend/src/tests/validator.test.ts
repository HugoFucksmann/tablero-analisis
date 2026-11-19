import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateClientMessage } from '../handlers/messageValidator.js';

const v = (m: unknown) => validateClientMessage(m as any);

test('messageValidator: acepta mensajes bien formados', () => {
    assert.equal(v({ type: 'cancel' }), null);
    assert.equal(v({ type: 'cancel_live' }), null);
    assert.equal(v({ type: 'analyze_position', fen: 'x', moveIndex: 3, depth: 10 }), null);
    assert.equal(v({ type: 'analyze_game', history: [{ san: 'e4' }, 'e5'], currentIndex: 0, gameId: 123, playerColor: 'white', win: 1, times: [10, null], engineConfig: { depth: 18, multiPv: 3 } }), null);
    assert.equal(v({ type: 'analyze_games', games: [{ gameId: 'a', pgn: '1. e4' }] }), null);
    assert.equal(v({ type: 'extract_puzzles', games: [{ gameId: 'a', pgn: '1. e4' }] }), null);
    assert.equal(v({ type: 'delete_analyses', ids: ['a', 'b'], requestId: 'r1' }), null);
    assert.equal(v({ type: 'get_analyses', offset: 0, limit: 50 }), null);
    assert.equal(v({ type: 'get_stat_details', category: 'tilt', filters: {} }), null);
});

test('messageValidator: mensajes de las funcionalidades nuevas', () => {
    assert.equal(v({ type: 'engine_move', fen: 'x', elo: 1500, movetime: 500 }), null);
    assert.equal(v({ type: 'engine_move', fen: 'x', elo: null }), null);
    assert.equal(v({ type: 'engine_move', fen: 'x', skill: 3, movetime: 100 }), null);
    assert.ok(v({ type: 'engine_move', fen: 'x', skill: 21 }));
    assert.ok(v({ type: 'engine_move', fen: 'x', skill: 1.5 }));
    assert.equal(v({ type: 'get_games_at_position', fen: 'x' }), null);
    assert.equal(v({ type: 'get_puzzle_game_ids' }), null);
    assert.equal(v({ type: 'puzzle_failed', id: 'p1' }), null);
    assert.equal(v({ type: 'extract_puzzles_from_analyses', gameIds: ['a', 7] }), null);
    assert.ok(v({ type: 'extract_puzzles_from_analyses', gameIds: [] }));
    assert.equal(v({ type: 'get_stats', filters: { increment: 'inc', start: 'standard', username: 'x' } }), null);
});

test('messageValidator: rechaza mensajes mal formados', () => {
    assert.ok(v({ type: 'analyze_position', fen: '', moveIndex: 0 }));
    assert.ok(v({ type: 'analyze_position', fen: 'x', moveIndex: 'a' }));
    assert.ok(v({ type: 'analyze_game', history: [], currentIndex: 0, gameId: 'x' }));
    assert.ok(v({ type: 'analyze_games', games: [] }));
    assert.ok(v({ type: 'analyze_games', games: [{ pgn: 'x' }] }));
    assert.ok(v({ type: 'extract_puzzles', games: [{ gameId: 'a' }] }));
    assert.ok(v({ type: 'delete_analyses', ids: [1, 2] }));
    assert.ok(v({ type: 'get_analyses', offset: -1 }));
    assert.ok(v({ type: 'get_stat_details', category: 'otra' }));
    assert.ok(v({ type: 'get_stats', filters: 'x' }));
    assert.ok(v({ type: 'cancel', requestId: 5 }));
    // contenido interno
    assert.ok(v({ type: 'analyze_game', history: [{}], currentIndex: 0, gameId: 'x' }));
    assert.ok(v({ type: 'analyze_game', history: [{ san: 'e4' }], currentIndex: 0, gameId: 'x', playerColor: 'green' }));
    assert.ok(v({ type: 'analyze_game', history: [{ san: 'e4' }], currentIndex: 0, gameId: 'x', times: ['a'] }));
    assert.ok(v({ type: 'analyze_game', history: [{ san: 'e4' }], currentIndex: 0, gameId: 'x', engineConfig: { depth: 500 } }));
    assert.ok(v({ type: 'analyze_games', games: [{ gameId: 'a', pgn: 'x', playerColor: 'x' }] }));
    assert.ok(v({ type: 'analyze_games', games: [{ gameId: 'a', history: ['e4', 5] }] }));
    assert.ok(v({ type: 'analyze_games', games: [{ gameId: 'a', pgn: 'x' }], engineConfig: { threads: 0 } }));
    assert.ok(v({ type: 'extract_puzzles', games: [{ gameId: 'a', pgn: 'x'.repeat(2 * 1024 * 1024 + 1) }] }));
    assert.ok(v({ type: 'get_stats', filters: { username: 5 } }));
    assert.ok(v({ type: 'engine_move', fen: 'x', elo: 99999 }));
    assert.ok(v({ type: 'engine_move', fen: 'x', movetime: 0 }));
});
