import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import Database from 'better-sqlite3';

const dir = mkdtempSync(join(tmpdir(), 'chess-db-test-'));
const dbPath = join(dir, 'test.sqlite');

// Base creada con el esquema ANTERIOR (FK de analysis_full_data hacia analyses.gameId)
before(() => {
    const old = new Database(dbPath);
    old.exec(`
        CREATE TABLE analyses (id TEXT PRIMARY KEY, gameId TEXT UNIQUE, username TEXT, createdAt TEXT, date TEXT,
            gameDate TEXT, opponent TEXT, opening TEXT, eco TEXT, moveCount INTEGER, color TEXT, win INTEGER,
            timeControl TEXT, whiteAccuracy INTEGER, blackAccuracy INTEGER, accuracyByPhase TEXT, labelCounts TEXT,
            advancedMetrics TEXT);
        CREATE TABLE analysis_full_data (game_id TEXT PRIMARY KEY, full_json TEXT,
            FOREIGN KEY(game_id) REFERENCES analyses(gameId) ON DELETE CASCADE);
        INSERT INTO analyses (id, gameId, createdAt, date, opening, moveCount, color, win)
            VALUES ('uuid-1', 'plat-1', '2024-01-01', '2024-01-01', 'Italiana', 2, 'white', 1);
        INSERT INTO analysis_full_data VALUES ('plat-1', '{"ok":true}');
    `);
    old.close();
    process.env.DB_PATH = dbPath;
});

after(async () => {
    // Cerrar la conexión antes de borrar (en Windows el archivo queda bloqueado); limpieza best-effort.
    try { (await import('../storage/db.js')).default.close(); } catch { /* ya cerrada */ }
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* temp: lo limpia el SO */ }
});

test('migración v2: analysis_full_data pasa a analysis_id → analyses(id) conservando datos', async () => {
    const { AnalysisRepo } = await import('../storage/repositories/analysisRepo.js');
    const { default: db } = await import('../storage/db.js');

    const cols = (db.prepare('PRAGMA table_info(analysis_full_data)').all() as { name: string }[]).map(c => c.name);
    assert.deepEqual(cols.sort(), ['analysis_id', 'full_json']);
    assert.deepEqual(AnalysisRepo.findFullData('plat-1'), { ok: true });

    // El borrado en cascada sigue funcionando
    AnalysisRepo.delete('uuid-1');
    assert.equal(AnalysisRepo.findFullData('plat-1'), null);
});

test('guardar y leer análisis completo + getMoveExplorer agregado en SQL', async () => {
    const { AnalysisRepo } = await import('../storage/repositories/analysisRepo.js');
    const { StatsRepo } = await import('../storage/repositories/statsRepo.js');

    const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const mk = (id: string, win: number, san: string, label: string) => ({
        id, gameId: `g-${id}`, createdAt: '2024-02-01', date: '2024-02-01', opening: 'X', moveCount: 1,
        color: 'white', win, timeControl: '600', accuracyByPhase: [], labelCounts: {}, advancedMetrics: {},
        moves: [{ ply: 0, san, evaluation: 0.3, label, fen: 'f', start_fen: startFen }],
        fullData: { id },
    });
    AnalysisRepo.save(mk('a', 1, 'e4', 'Mejor') as any);
    AnalysisRepo.save(mk('b', -1, 'e4', 'Error') as any);
    AnalysisRepo.save(mk('c', 0, 'd4', 'Bueno') as any);

    assert.deepEqual(AnalysisRepo.findFullData('g-a'), { id: 'a' });

    const res: any = StatsRepo.getMoveExplorer(startFen);
    const e4 = res.whitePerspective.userMoves.find((m: any) => m.san === 'e4');
    assert.equal(e4.count, 2);
    assert.equal(e4.winRate, 50);
    assert.equal(e4.lossRate, 50);
    assert.deepEqual(e4.labels, { Mejor: 1, Error: 1 });
    assert.equal(res.whitePerspective.userMoves[0].san, 'e4'); // ordenado por frecuencia
    assert.equal(res.whitePerspective.opponentMoves.length, 0);

    // otra posición: sin resultados
    const other: any = StatsRepo.getMoveExplorer('8/8/8/8/8/8/8/K6k b - - 0 1');
    assert.equal(other.blackPerspective.userMoves.length + other.blackPerspective.opponentMoves.length, 0);
});
