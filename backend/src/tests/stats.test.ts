import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Chess } from 'chess.js';

// Base nueva y aislada (cada archivo de test corre en su propio proceso)
const dir = mkdtempSync(join(tmpdir(), 'chess-stats-test-'));
process.env.DB_PATH = join(dir, 'stats.sqlite');

type Mods = {
    db: any; AnalysisRepo: any; StatsRepo: any; PuzzleRepo: any; OpeningBook: any;
    createBackup: () => Promise<{ path: string; cleanup: () => void }>;
    restoreFromFile: (p: string) => { analyses: number; puzzles: number };
};
let m: Mods;

before(async () => {
    const [db, ar, sr, pr, ob, bk] = await Promise.all([
        import('../storage/db.js'),
        import('../storage/repositories/analysisRepo.js'),
        import('../storage/repositories/statsRepo.js'),
        import('../storage/repositories/puzzleRepo.js'),
        import('../services/openings/openingBook.js'),
        import('../storage/backup.js'),
    ]);
    m = {
        db: db.default, AnalysisRepo: ar.AnalysisRepo, StatsRepo: sr.StatsRepo, PuzzleRepo: pr.PuzzleRepo,
        OpeningBook: ob.OpeningBook, createBackup: bk.createBackup, restoreFromFile: bk.restoreFromFile,
    };
    m.OpeningBook.load();
});

after(() => {
    try { m.db.close(); } catch { /* ya cerrada */ }
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* temp */ }
});

/** Arma una partida analizada (usuario = blancas) a partir de una lista de SAN. */
function gameEntry(id: string, sans: string[], opts: { win?: number; timeControl?: string; customStart?: boolean; labels?: Record<number, string>; errorClass?: Record<number, string> } = {}) {
    const chess = new Chess();
    const moves = sans.map((san, ply) => {
        const mv = chess.move(san);
        return {
            ply, san, evaluation: 0.2,
            label: opts.labels?.[ply] ?? 'Bueno',
            fen: mv.after, start_fen: mv.before,
            error_time_class: opts.errorClass?.[ply] ?? null,
        };
    });
    return {
        id, gameId: `g-${id}`, username: 'yo', createdAt: '2024-03-01T00:00:00Z', date: '2024-03-01T00:00:00Z',
        opening: 'Ruy Lopez', eco: 'C60', moveCount: sans.length, color: 'white', win: opts.win ?? 1,
        timeControl: opts.timeControl ?? '600+0', customStart: opts.customStart ?? false,
        white: { accuracy: 90 }, black: { accuracy: 80 },
        accuracyByPhase: [{ phase: 'Apertura', accuracy: 90 }], labelCounts: { Bueno: sans.length },
        advancedMetrics: {}, moves, fullData: { historySan: sans },
    };
}

// Posición de libro (Ruy López abierta): 1.e4 e5 2.Nf3 Nc6 y las blancas salen de teoría con 3.h3
const DEVIATING = ['e4', 'e5', 'Nf3', 'Nc6', 'h3', 'Nf6'];
const IN_BOOK = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'];

test('estadísticas: agregados, filtros de incremento y de posición inicial', () => {
    m.AnalysisRepo.save(gameEntry('a', DEVIATING, { timeControl: '600+5', labels: { 4: 'Error' }, errorClass: { 4: 'precipitation' } }));
    m.AnalysisRepo.save(gameEntry('b', DEVIATING, { timeControl: '600+0', win: 0, labels: { 4: 'Bueno' } }));
    m.AnalysisRepo.save(gameEntry('c', IN_BOOK, { timeControl: '180+2', customStart: true, win: -1 }));

    const all = m.StatsRepo.getAggregatedStats({});
    assert.equal(all.total, 3);
    assert.equal(all.winRate, 33);

    assert.equal(m.StatsRepo.getAggregatedStats({ increment: 'inc' }).total, 2);   // 600+5 y 180+2
    assert.equal(m.StatsRepo.getAggregatedStats({ increment: 'none' }).total, 1);  // 600+0
    assert.equal(m.StatsRepo.getAggregatedStats({ start: 'custom' }).total, 1);
    assert.equal(m.StatsRepo.getAggregatedStats({ start: 'standard' }).total, 2);
    assert.equal(m.StatsRepo.getAggregatedStats({ duration: '3m' }).total, 1);     // 180s
    assert.equal(m.StatsRepo.getAggregatedStats({ duration: '10m', increment: 'none', start: 'standard' }).total, 1);
    assert.equal(m.StatsRepo.getAggregatedStats({ duration: '1m' }).empty, true);

    // El conjunto temporal queda vacío tras cada consulta (aislamiento entre peticiones)
    assert.equal((m.db.prepare('SELECT COUNT(*) AS n FROM scope_ids').get() as any).n, 0);
});

test('estadísticas: errores por tiempo de reflexión usan error_time_class', () => {
    const stats = m.StatsRepo.getAggregatedStats({});
    const insta = stats.blundersByTime.find((b: any) => b.label === 'Insta-move');
    assert.equal(insta?.count, 1);
});

test('estadísticas personales: calidad y errores por tiempo cuentan solo las jugadas del usuario', () => {
    // Cada partida tiene 6 jugadas (3 del usuario). El rival nunca comete 'Error' aquí.
    const stats = m.StatsRepo.getAggregatedStats({});
    const bueno = stats.moveQuality.find((q: any) => q.label === 'Bueno');
    const error = stats.moveQuality.find((q: any) => q.label === 'Error');
    assert.equal(bueno.count, 8); // 3+3+3 jugadas del usuario menos la que es 'Error'
    assert.equal(error.count, 1);
    assert.equal(bueno.pct + error.pct, 100);

    // Un error del RIVAL con clase de tiempo no debe contarse
    const opp = gameEntry('opp', DEVIATING, { labels: { 5: 'Error' }, errorClass: { 5: 'time_pressure' } });
    m.AnalysisRepo.save(opp);
    const after = m.StatsRepo.getAggregatedStats({});
    assert.equal(after.moveQuality.find((q: any) => q.label === 'Error').count, 1);
    assert.equal(after.blundersByTime.find((b: any) => b.label === 'Time Pressure'), undefined);
    m.AnalysisRepo.delete('opp');
});

test('desviación de teoría: detecta la jugada, el rival y la tasa de error', () => {
    const dev = m.StatsRepo.getAggregatedStats({ start: 'all', increment: 'all', duration: '10m' }).openingDeviations;
    assert.equal(dev.gamesWithDeviation, 2);
    assert.equal(dev.avgMoveNumber, 3);
    assert.equal(dev.commonMoveNumber, 3);
    const top = dev.openings[0].top[0];
    assert.equal(top.san, 'h3');
    assert.equal(top.moveNumber, 3);
    assert.equal(top.count, 2);
    assert.equal(top.errorRate, 50); // una de las dos salidas fue 'Error'
    assert.ok(top.bookMoves.length > 0 && !top.bookMoves.includes('h3'));
});

test('partidas en una posición y explorador', () => {
    const fen = new Chess();
    for (const s of ['e4', 'e5', 'Nf3', 'Nc6']) fen.move(s);
    const games = m.StatsRepo.getGamesAtPosition(fen.fen());
    assert.equal(games.length, 3);
    const dev = games.find((g: any) => g.gameId === 'g-a');
    assert.equal(dev.ply, 4);
    assert.equal(dev.moveSan, 'h3');
    assert.deepEqual(m.StatsRepo.getGamesAtPosition('8/8/8/8/8/8/8/K6k w - - 0 1'), []);

    const explorer = m.StatsRepo.getMoveExplorer(fen.fen());
    const h3 = explorer.whitePerspective.userMoves.find((x: any) => x.san === 'h3');
    assert.equal(h3.count, 2);
});

test('detalles de estadística: categoría inválida y conjunto vacío', () => {
    assert.deepEqual(m.StatsRepo.getStatDetails('nada', {}), []);
    assert.deepEqual(m.StatsRepo.getStatDetails('tilt', {}), []);
    assert.equal((m.db.prepare('SELECT COUNT(*) AS n FROM scope_ids').get() as any).n, 0);
});

const puzzle = (id: string, gameId: string | null) => ({
    id, createdAt: new Date().toISOString(), solvedCount: 0, fen: `fen-${id}`, solutionSequence: ['e2e4'],
    playerColor: 'white', gameId, ply: 3, puzzleType: 'tactical_blunder', tacticalMotifs: ['fork'], isOnlyMove: true,
});

test('puzzles: repetición espaciada (aciertos alejan el repaso, un fallo lo reinicia)', () => {
    m.PuzzleRepo.save(puzzle('p1', 'g-a'));
    const day = 86400000;
    const get = () => m.PuzzleRepo.findAll().find((p: any) => p.id === 'p1');

    assert.equal(get().attempts, 0);
    assert.equal(get().nextReviewAt, null);

    m.PuzzleRepo.recordAttempt('p1', true);
    let p = get();
    assert.equal(p.streak, 1);
    assert.equal(p.attempts, 1);
    let days = (new Date(p.nextReviewAt).getTime() - Date.now()) / day;
    assert.ok(days > 0.9 && days < 1.1, `1 día, fue ${days}`);

    m.PuzzleRepo.recordAttempt('p1', true);
    p = get();
    days = (new Date(p.nextReviewAt).getTime() - Date.now()) / day;
    assert.equal(p.streak, 2);
    assert.ok(days > 2.9 && days < 3.1, `3 días, fue ${days}`);

    m.PuzzleRepo.recordAttempt('p1', false);
    p = get();
    assert.equal(p.streak, 0);
    assert.equal(p.failures, 1);
    assert.equal(p.attempts, 3);
    assert.ok(new Date(p.nextReviewAt).getTime() <= Date.now() + 1000, 'tras fallar queda pendiente ya');

    m.PuzzleRepo.recordAttempt('no-existe', true); // no debe lanzar
});

test('puzzles: IDs de partida y supervivencia al borrar el análisis (sin FK a propósito)', () => {
    m.PuzzleRepo.save(puzzle('p2', 'g-b'));
    m.PuzzleRepo.save(puzzle('p3', null));
    assert.deepEqual(m.PuzzleRepo.findGameIds().sort(), ['g-a', 'g-b']);

    m.AnalysisRepo.delete('b');
    assert.equal(m.AnalysisRepo.findByGameId('g-b'), null);
    assert.ok(m.PuzzleRepo.findAll().some((p: any) => p.id === 'p2'), 'el puzzle sobrevive al borrado del análisis');
});

test('respaldo: crea una copia, y al restaurar fusiona sin pisar el progreso de puzzles', async () => {
    const backup = await m.createBackup();
    try {
        // Estado posterior a la copia: se borra un análisis y se avanza en un puzzle
        m.AnalysisRepo.delete('a');
        assert.equal(m.AnalysisRepo.findFullData('g-a'), null);
        m.PuzzleRepo.recordAttempt('p1', true); // streak 1 en la base actual

        const res = m.restoreFromFile(backup.path);
        assert.ok(res.analyses >= 2);

        // El análisis borrado vuelve, con sus jugadas y datos completos
        assert.deepEqual(m.AnalysisRepo.findFullData('g-a'), { historySan: DEVIATING });
        const moves = m.db.prepare('SELECT COUNT(*) AS n FROM game_moves WHERE game_id = ?').get('a') as any;
        assert.equal(moves.n, DEVIATING.length);

        // Los puzzles existentes se conservan con su progreso actual (la copia tenía streak 0)
        assert.equal(m.PuzzleRepo.findAll().find((p: any) => p.id === 'p1').streak, 1);
    } finally {
        backup.cleanup();
    }
});

test('restauración: rechaza archivos que no son un respaldo válido', async () => {
    const { writeFileSync } = await import('fs');
    const bad = join(dir, 'bad.sqlite');
    writeFileSync(bad, 'esto no es sqlite');
    assert.throws(() => m.restoreFromFile(bad));

    const Database = (await import('better-sqlite3')).default;
    const empty = join(dir, 'empty.sqlite');
    const e = new Database(empty);
    e.exec('CREATE TABLE otra (x INTEGER)');
    e.close();
    assert.throws(() => m.restoreFromFile(empty), /faltan tablas/);
});
