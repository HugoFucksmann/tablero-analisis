import type { Statement } from 'better-sqlite3';
import db from '../db.js';
import { OpeningBook } from '../../services/openings/openingBook.js';

// ─── Constants & Colors ───────────────────────────────────────────────────────

export const PHASE_ORDER: Record<string, number> = { 'Apertura': 1, 'Medio Juego': 2, 'Final': 3 };

export const PHASE_COLORS: Record<string, string> = {
    'Apertura': '#4caf50',
    'Medio Juego': '#ff9800',
    'Final': '#2196f3',
};

export const LABEL_COLORS: Record<string, string> = {
    'Brillante': '#7c4dff',
    'Mejor': '#4caf50',
    'Excelente': '#8bc34a',
    'Bueno': '#cddc39',
    'Imprecisión': '#ff9800',
    'Error': '#f44336',
    'Error grave': '#b71c1c',
};

export const MOVE_QUALITY_ORDER = [
    'Brillante', 'Mejor', 'Excelente', 'Bueno',
    'Imprecisión', 'Error', 'Error grave',
];

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface GameAtPosition {
    gameId: string;
    opponent: string | null;
    opening: string | null;
    color: string;
    win: number;
    date: string;
    ply: number;
    moveSan: string;
}

export interface StatsFilters {
    username?: string;
    duration?: string;
    time?: string;
    count?: string;
    increment?: string; // 'all' | 'none' | 'inc'
    start?: string;     // 'all' | 'standard' | 'custom'
}

export interface OpeningStat {
    name: string;
    count: number;
    wr: number;
    acc: number;
}

export interface AccuracyTrendPoint {
    date: string;
    accuracy: number;
}

export interface PhaseAccuracy {
    phase: string;
    accuracy: number;
    color: string;
}

export interface MoveQualityStat {
    label: string;
    count: number;
    pct: number;
    color: string;
}

export interface BlunderTimeStat {
    label: string;
    color: string;
    count: number;
}

export interface DangerousOpening {
    eco: string | null;
    name: string;
    errorsPerGame: number;
    gameCount: number;
}

export interface AdvancedMetricsSummary {
    convertedAdvantages: number;
    blownAdvantages: number;
    comebackWins: number;
    savedDraws: number;
    failedComebacks: number;
    tiltEvents: number;
    totalMidgameTime: number;
    totalBlunderTime: number;
    gamesWithTime: number;
    avgMidgameTime: number;
    avgBlunderTime: number;
}

export interface OpeningDeviationEntry {
    moveNumber: number;
    san: string;
    bookMoves: string[];
    count: number;
    errorRate: number; // % de veces que la jugada de desviación fue Imprecisión/Error/Error grave
}

export interface OpeningDeviation {
    opening: string;
    games: number;          // partidas con salida de teoría detectada
    avgMoveNumber: number;  // jugada media en la que el usuario abandona la teoría
    errorRate: number;      // % de salidas que fueron imprecisas o peores
    top: OpeningDeviationEntry[];
}

export interface OpeningDeviationSummary {
    gamesWithDeviation: number;
    avgMoveNumber: number;
    commonMoveNumber: number | null;
    openings: OpeningDeviation[];
}

export interface AggregatedStatsResult {
    empty?: boolean;
    total?: number;
    winRate?: number;
    drawRate?: number;
    avgAcc?: number;
    white?: { count: number; acc: number; wr: number };
    black?: { count: number; acc: number; wr: number };
    openingStats?: OpeningStat[];
    trend?: AccuracyTrendPoint[];
    accuracyByPhase?: PhaseAccuracy[];
    moveQuality?: MoveQualityStat[];
    blundersByTime?: BlunderTimeStat[];
    dangerousOpenings?: DangerousOpening[];
    openingDeviations?: OpeningDeviationSummary;
    advancedStats?: AdvancedMetricsSummary;
}

export interface StatDetailResult {
    gameId: string;
    analysisId: string;
    fen: string;
    ply: number | null;
    type: 'tilt' | 'comeback' | 'blown_advantage';
    win: number;
    color: string;
    opponent: string;
    date: string;
    opening: string;
    eco: string | null;
}

export interface ExplorerMove {
    san: string;
    count: number;
    winRate: number;
    drawRate: number;
    lossRate: number;
    avgEval: string | null;
    labels: Record<string, number>;
}

export interface MoveExplorerPerspective {
    userMoves: ExplorerMove[];
    opponentMoves: ExplorerMove[];
}

export interface MoveExplorerResult {
    whitePerspective: MoveExplorerPerspective;
    blackPerspective: MoveExplorerPerspective;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Builds a WHERE clause and its parameter list from a filters object.
 */
function buildWhereClause(filters: StatsFilters = {}): { clause: string; params: any[] } {
    let clause = 'WHERE 1=1';
    const params: any[] = [];

    if (filters.username) {
        clause += ' AND (username = ? OR username IS NULL)';
        params.push(filters.username);
    }
    if (filters.duration && filters.duration !== 'all') {
        const durationMap: Record<string, [number, number]> = {
            '1m':  [0,    90],
            '3m':  [90,   240],
            '5m':  [240,  420],
            '10m': [420,  900],
            '15m': [900,  1200],
            '30m': [1200, 99999],
        };
        const range = durationMap[filters.duration];
        if (range) {
            clause += ` AND CAST(SUBSTR(COALESCE(timeControl,'0'), 1,
                MAX(1, INSTR(COALESCE(timeControl,'0')||'+', '+') - 1)) AS INTEGER) BETWEEN ? AND ?`;
            params.push(range[0], range[1]);
        }
    }
    if (filters.increment === 'none' || filters.increment === 'inc') {
        // timeControl = "<base>+<incremento>" en segundos; sin '+' se considera sin incremento
        const incExpr = `CAST(SUBSTR(timeControl, INSTR(timeControl, '+') + 1) AS INTEGER)`;
        const hasInc = `(timeControl LIKE '%+%' AND ${incExpr} > 0)`;
        clause += filters.increment === 'inc'
            ? ` AND ${hasInc}`
            : ` AND timeControl IS NOT NULL AND NOT ${hasInc}`;
    }
    if (filters.start === 'standard') {
        clause += ' AND COALESCE(customStart, 0) = 0';
    } else if (filters.start === 'custom') {
        clause += ' AND customStart = 1';
    }
    if (filters.time && filters.time !== 'all') {
        const days = parseInt(filters.time) || 30;
        const limitDate = new Date(Date.now() - days * 86400000).toISOString();
        clause += ' AND COALESCE(gameDate, date) >= ?';
        params.push(limitDate);
    }

    return { clause, params };
}

/**
 * Normaliza el parámetro `count` (puede venir como "all", "50", basura...).
 */
function parseLimit(count?: string): number | null {
    if (!count || count === 'all') return null;
    const n = parseInt(count, 10);
    return Number.isInteger(n) && n > 0 ? n : null;
}

// Tabla temporal con los ids del conjunto filtrado: se calcula una sola vez por
// consulta y todas las agregaciones la reutilizan (antes cada una re-ejecutaba
// el subquery con filtros y ordenamiento).
db.exec('CREATE TEMP TABLE IF NOT EXISTS scope_ids (id TEXT PRIMARY KEY)');

const IN_SCOPE = 'IN (SELECT id FROM scope_ids)';

/**
 * Jugada hecha por el usuario (alias `m` = game_moves, `a` = analyses). El bando se deduce del turno
 * de la posición previa, así que también vale para partidas que parten de un FEN con turno de negras.
 * Las estadísticas personales (calidad, errores por tiempo, aperturas críticas) deben usar solo estas.
 */
const USER_MOVE = `(a.color = CASE WHEN instr(m.start_fen, ' w ') > 0 THEN 'white' ELSE 'black' END)`;

/**
 * Ejecuta `fn` con `scope_ids` cargada para `filters` y la vacía al terminar (también si falla).
 * `fn` es síncrona: better-sqlite3 no cede el control entre consultas, así que ninguna otra
 * petición puede ver ni pisar este conjunto. El tipo `T extends Promise` prohíbe romper esa regla.
 */
function withScope<T>(filters: StatsFilters, fn: () => T extends Promise<unknown> ? never : T): T {
    loadScope(filters);
    try {
        return fn();
    } finally {
        db.exec('DELETE FROM scope_ids');
    }
}

function loadScope(filters: StatsFilters): void {
    const { clause, params } = buildWhereClause(filters);
    const limit = parseLimit(filters.count);
    db.exec('DELETE FROM scope_ids');
    prep(`
        INSERT INTO scope_ids
        SELECT id FROM analyses ${clause}
        ORDER BY COALESCE(gameDate, date) DESC
        ${limit ? `LIMIT ${limit}` : ''}
    `).run(...params);
}

const statementCache = new Map<string, Statement<any[]>>();

/** db.prepare con caché: el SQL de las agregaciones es estático. */
function prep(sql: string): Statement<any[]> {
    let stmt = statementCache.get(sql);
    if (!stmt) {
        stmt = db.prepare<any[]>(sql);
        statementCache.set(sql, stmt);
    }
    return stmt;
}

// ─── Desviación de teoría ─────────────────────────────────────────────────────

const DEVIATION_MAX_PLY = 30;        // solo se mira la fase de apertura
const DEVIATION_MIN_GAMES = 2;       // aperturas con menos salidas son ruido
const DEVIATION_TOP_OPENINGS = 5;
const ERROR_LABELS = new Set(['Imprecisión', 'Error', 'Error grave']);

/**
 * Cruza `game_moves.start_fen` con el libro de aperturas (conjunto filtrado en `scope_ids`):
 * para cada partida busca la primera jugada del usuario que sale de teoría estando la posición
 * aún en el libro, y agrupa por apertura. Si el libro no conoce la posición, la salida la
 * provocó el rival y la partida se ignora.
 */
function computeOpeningDeviations(): OpeningDeviationSummary {
    const rows = prep(`
        SELECT m.game_id, m.ply, m.move_san, m.start_fen, m.label, a.opening
        FROM game_moves m
        JOIN analyses a ON a.id = m.game_id
        WHERE m.game_id ${IN_SCOPE}
          AND m.ply < ${DEVIATION_MAX_PLY}
          AND ${USER_MOVE}
        ORDER BY m.game_id, m.ply
    `).all() as { game_id: string; ply: number; move_san: string; start_fen: string; label: string | null; opening: string | null }[];

    type Acc = { games: number; plySum: number; errors: number; byMove: Map<string, OpeningDeviationEntry & { errs: number }> };
    const byOpening = new Map<string, Acc>();
    const moveNumberCounts = new Map<number, number>();
    let total = 0;
    let plySum = 0;

    let currentGame: string | null = null;
    let finished = false; // la partida actual ya se resolvió (desviación o salida del rival)

    for (const r of rows) {
        if (r.game_id !== currentGame) {
            currentGame = r.game_id;
            finished = false;
        }
        if (finished) continue;

        const bookMoves = OpeningBook.getMoves(r.start_fen);
        if (bookMoves.length === 0) { finished = true; continue; } // fuera de libro por el rival
        if (bookMoves.some(b => b.san === r.move_san)) continue;   // sigue en teoría

        finished = true;
        const moveNumber = Math.floor(r.ply / 2) + 1;
        const info = OpeningBook.lookup(r.start_fen);
        const rawName = info?.rootName || (r.opening ? r.opening.split(/[:,]| - /)[0].trim() : '') || 'Desconocida';

        let acc = byOpening.get(rawName);
        if (!acc) { acc = { games: 0, plySum: 0, errors: 0, byMove: new Map() }; byOpening.set(rawName, acc); }
        const isErr = !!r.label && ERROR_LABELS.has(r.label);
        acc.games++;
        acc.plySum += moveNumber;
        if (isErr) acc.errors++;

        const key = `${moveNumber}|${r.move_san}`;
        let entry = acc.byMove.get(key);
        if (!entry) {
            entry = { moveNumber, san: r.move_san, bookMoves: bookMoves.slice(0, 3).map(b => b.san), count: 0, errorRate: 0, errs: 0 };
            acc.byMove.set(key, entry);
        }
        entry.count++;
        if (isErr) entry.errs++;

        total++;
        plySum += moveNumber;
        moveNumberCounts.set(moveNumber, (moveNumberCounts.get(moveNumber) ?? 0) + 1);
    }

    const minGames = byOpening.size > 0 && [...byOpening.values()].every(a => a.games < DEVIATION_MIN_GAMES) ? 1 : DEVIATION_MIN_GAMES;
    const openings: OpeningDeviation[] = [...byOpening.entries()]
        .filter(([, a]) => a.games >= minGames)
        .sort((a, b) => b[1].games - a[1].games)
        .slice(0, DEVIATION_TOP_OPENINGS)
        .map(([opening, a]) => ({
            opening,
            games: a.games,
            avgMoveNumber: Math.round((a.plySum / a.games) * 10) / 10,
            errorRate: Math.round((a.errors / a.games) * 100),
            top: [...a.byMove.values()]
                .sort((x, y) => y.count - x.count)
                .slice(0, 3)
                .map(({ errs, ...e }) => ({ ...e, errorRate: Math.round((errs / e.count) * 100) })),
        }));

    let commonMoveNumber: number | null = null;
    let best = 0;
    for (const [n, c] of moveNumberCounts) if (c > best) { best = c; commonMoveNumber = n; }

    return {
        gamesWithDeviation: total,
        avgMoveNumber: total > 0 ? Math.round((plySum / total) * 10) / 10 : 0,
        commonMoveNumber,
        openings,
    };
}

// ─── Repository ───────────────────────────────────────────────────────────────

function computeAggregatedStats(): AggregatedStatsResult {
    // ── 1. General ────────────────────────────────────────────────────────

    const general = prep(`
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN win = 1  THEN 1 ELSE 0 END) as wins,
            SUM(CASE WHEN win = 0  THEN 1 ELSE 0 END) as draws,
            AVG(CASE
                WHEN color = 'white' THEN COALESCE(whiteAccuracy, blackAccuracy)
                ELSE COALESCE(blackAccuracy, whiteAccuracy)
            END) as avgAcc
        FROM analyses
        WHERE id ${IN_SCOPE}
    `).get() as { total: number; wins: number; draws: number; avgAcc: number } | undefined;

    if (!general || general.total === 0) {
        return { empty: true };
    }

    // ── 2. By color ───────────────────────────────────────────────────────

    const colorRows = prep(`
        SELECT
            color,
            COUNT(*) as count,
            AVG(CASE
                WHEN color = 'white' THEN COALESCE(whiteAccuracy, blackAccuracy)
                ELSE COALESCE(blackAccuracy, whiteAccuracy)
            END) as acc,
            AVG(CASE WHEN win = 1  THEN 100.0 ELSE 0.0 END) as wr,
            AVG(CASE WHEN win = 0  THEN 100.0 ELSE 0.0 END) as dr
        FROM analyses
        WHERE id ${IN_SCOPE}
        GROUP BY color
    `).all() as { color: string; count: number; acc: number; wr: number; dr: number }[];

    const white = colorRows.find(c => c.color === 'white') || { count: 0, acc: 0, wr: 0 };
    const black = colorRows.find(c => c.color === 'black') || { count: 0, acc: 0, wr: 0 };

    // ── 3. Openings ───────────────────────────────────────────────────────

    const openingStats = prep(`
        SELECT
            TRIM(CASE
                WHEN instr(opening, ':')   > 0 THEN substr(opening, 1, instr(opening, ':')   - 1)
                WHEN instr(opening, ' - ') > 0 THEN substr(opening, 1, instr(opening, ' - ') - 1)
                WHEN instr(opening, ', ')  > 0 THEN substr(opening, 1, instr(opening, ', ')  - 1)
                ELSE opening
            END) as name,
            COUNT(*) as count,
            AVG(CASE WHEN win = 1 THEN 100.0 ELSE 0.0 END) as wr,
            AVG(CASE
                WHEN color = 'white' THEN COALESCE(whiteAccuracy, blackAccuracy)
                ELSE COALESCE(blackAccuracy, whiteAccuracy)
            END) as acc
        FROM analyses
        WHERE id ${IN_SCOPE}
        GROUP BY name
        ORDER BY count DESC
        LIMIT 10
    `).all() as { name: string; count: number; wr: number; acc: number }[];

    // ── 4. Accuracy trend ─────────────────────────────────────────────────

    const trend = prep(`
        SELECT
            COALESCE(gameDate, date) as date,
            (CASE WHEN color = 'white' THEN COALESCE(whiteAccuracy, blackAccuracy)
                  ELSE COALESCE(blackAccuracy, whiteAccuracy) END) as accuracy
        FROM analyses
        WHERE id ${IN_SCOPE}
        AND COALESCE(whiteAccuracy, blackAccuracy) IS NOT NULL
        ORDER BY COALESCE(gameDate, date) ASC
    `).all() as { date: string; accuracy: number }[];

    // ── 5. Phase accuracy ─────────────────────────────────────────────────

    const phaseRows = prep(`
        SELECT
            phase,
            ROUND(AVG(accuracy)) as accuracy
        FROM phase_accuracy
        WHERE game_id ${IN_SCOPE}
        GROUP BY phase
        ORDER BY CASE phase
            WHEN 'Apertura'    THEN 1
            WHEN 'Medio Juego' THEN 2
            WHEN 'Final'       THEN 3
        END
    `).all() as { phase: string; accuracy: number }[];

    const accuracyByPhase = phaseRows.map(p => ({
        phase: p.phase,
        accuracy: p.accuracy,
        color: PHASE_COLORS[p.phase] || '#9e9e9e',
    }));

    // ── 6. Move quality ───────────────────────────────────────────────────

    // Solo las jugadas del usuario (labelCounts / move_quality incluyen también las del rival)
    const qualityRows = prep(`
        SELECT m.label as label, COUNT(*) as totalCount
        FROM game_moves m
        JOIN analyses a ON a.id = m.game_id
        WHERE m.game_id ${IN_SCOPE}
        AND ${USER_MOVE}
        AND m.label IN (${MOVE_QUALITY_ORDER.map(l => `'${l}'`).join(', ')})
        GROUP BY m.label
    `).all() as { label: string; totalCount: number }[];

    const totalMoves = qualityRows.reduce((sum, q) => sum + q.totalCount, 0);

    const moveQuality = MOVE_QUALITY_ORDER
        .map(label => {
            const stat = qualityRows.find(q => q.label === label);
            if (!stat) return null;
            return {
                label,
                count: stat.totalCount,
                pct: Math.round((stat.totalCount / (totalMoves || 1)) * 100),
                color: LABEL_COLORS[label] || '#9e9e9e',
            };
        })
        .filter((x): x is MoveQualityStat => x !== null);

    // ── 7. Blunders by think time ─────────────────────────────────────────

    const blunderRows = prep(`
        SELECT m.error_time_class as cls, COUNT(*) as count
        FROM game_moves m
        JOIN analyses a ON a.id = m.game_id
        WHERE m.game_id ${IN_SCOPE}
        AND ${USER_MOVE}
        AND m.error_time_class IS NOT NULL
        AND m.label IN ('Error', 'Error grave', 'Imprecisión')
        GROUP BY m.error_time_class
    `).all() as { cls: string; count: number }[];

    const blundersByTime = [
        { label: 'Insta-move', cls: 'precipitation', color: '#f44336' },
        { label: 'Deep-think', cls: 'overthinking', color: '#b71c1c' },
        { label: 'Time Pressure', cls: 'time_pressure', color: '#ff5722' },
    ]
        .map(b => ({
            label: b.label,
            color: b.color,
            count: blunderRows.find(r => r.cls === b.cls)?.count || 0
        }))
        .filter(b => b.count > 0);

    // ── 8. Dangerous openings ─────────────────────────────────────────────

    const dangerousQuery = prep(`
        SELECT
            a.eco,
            TRIM(CASE
                WHEN instr(a.opening, ':')   > 0 THEN substr(a.opening, 1, instr(a.opening, ':')   - 1)
                WHEN instr(a.opening, ' - ') > 0 THEN substr(a.opening, 1, instr(a.opening, ' - ') - 1)
                WHEN instr(a.opening, ', ')  > 0 THEN substr(a.opening, 1, instr(a.opening, ', ')  - 1)
                ELSE a.opening
            END) as name,
            COUNT(m.game_id) * 1.0 / COUNT(DISTINCT a.id) as errorsPerGame,
            COUNT(DISTINCT a.id) as gameCount
        FROM analyses a
        LEFT JOIN game_moves m
            ON  a.id = m.game_id
            AND m.label IN ('Error grave', 'Error')
            AND ${USER_MOVE}
        WHERE a.id ${IN_SCOPE}
        GROUP BY name
        HAVING gameCount >= ?
        ORDER BY errorsPerGame DESC
        LIMIT 3
    `);
    // Con muestras de 1-2 partidas el ranking es ruido: se exige un mínimo de 3 y, si ninguna
    // apertura llega, se relaja a 1 para no dejar la tarjeta vacía.
    type DangerousRow = { eco: string | null; name: string; errorsPerGame: number; gameCount: number };
    let dangerousOpenings = dangerousQuery.all(3) as DangerousRow[];
    if (dangerousOpenings.length === 0) dangerousOpenings = dangerousQuery.all(1) as DangerousRow[];

    // ── 9. Advanced metrics ───────────────────────────────────────────────

    const metricsRows = prep(`
        SELECT advancedMetrics
        FROM analyses
        WHERE id ${IN_SCOPE}
        AND advancedMetrics IS NOT NULL AND advancedMetrics != '{}'
    `).all() as { advancedMetrics: string }[];

    const acc = {
        convertedAdvantages: 0, blownAdvantages: 0,
        comebackWins: 0, savedDraws: 0, failedComebacks: 0,
        tiltEvents: 0,
        totalMidgameTime: 0, totalBlunderTime: 0, gamesWithTime: 0, gamesWithBlunderTime: 0,
    };

    for (const row of metricsRows) {
        try {
            const am = JSON.parse(row.advancedMetrics);

            if (am.advantageStatus === 'CONVERTED') acc.convertedAdvantages++;
            if (am.advantageStatus === 'BLOWN_ADVANTAGE') acc.blownAdvantages++;
            if (am.comebackStatus === 'COMEBACK_WIN') acc.comebackWins++;
            if (am.comebackStatus === 'SAVED_DRAW') acc.savedDraws++;
            if (am.comebackStatus === 'FAILED') acc.failedComebacks++;
            if (am.tiltEvents) acc.tiltEvents += am.tiltEvents;

            if (am.timeManagement) {
                acc.totalMidgameTime += am.timeManagement.avgMidgameTime || 0;
                acc.totalBlunderTime += am.timeManagement.avgBlunderTime || 0;
                if (am.timeManagement.avgMidgameTime > 0) acc.gamesWithTime++;
                // El promedio en errores solo cuenta partidas donde hubo errores con reloj
                if (am.timeManagement.avgBlunderTime > 0) acc.gamesWithBlunderTime++;
            }
        } catch (_) { /* malformed row — skip */ }
    }

    return {
        total: general.total,
        winRate: Math.round((general.wins / general.total) * 100),
        drawRate: Math.round((general.draws / general.total) * 100),
        avgAcc: Math.round(general.avgAcc || 0),

        white: { count: white.count, acc: Math.round(white.acc || 0), wr: Math.round(white.wr || 0) },
        black: { count: black.count, acc: Math.round(black.acc || 0), wr: Math.round(black.wr || 0) },

        openingStats: openingStats.map(o => ({ ...o, wr: Math.round(o.wr), acc: Math.round(o.acc) })),
        trend,
        accuracyByPhase,
        moveQuality,
        blundersByTime,
        dangerousOpenings,
        openingDeviations: computeOpeningDeviations(),

        advancedStats: {
            ...acc,
            avgMidgameTime: acc.gamesWithTime > 0 ? acc.totalMidgameTime / acc.gamesWithTime : 0,
            avgBlunderTime: acc.gamesWithBlunderTime > 0 ? acc.totalBlunderTime / acc.gamesWithBlunderTime : 0,
        },
    };
}

function computeStatDetails(category: string): StatDetailResult[] {
    // No se trae full_json: pesa ~30 KB por partida. El rival solo se busca (y se
    // guarda en `analyses.opponent`) cuando falta.
    const rows = prep(`
        SELECT a.id, a.gameId, a.win, a.color, a.advancedMetrics, a.date, a.gameDate, a.opening, a.eco, a.opponent
        FROM analyses a
        WHERE a.id ${IN_SCOPE}
        AND a.advancedMetrics IS NOT NULL
    `).all() as {
        id: string; gameId: string; win: number; color: string;
        advancedMetrics: string; date: string; gameDate: string | null;
        opening: string; eco: string | null; opponent: string | null;
    }[];

    // Looks up the FEN stored after a move
    const fenByPly = prep(`SELECT fen FROM game_moves WHERE game_id = ? AND ply = ?`);

    const resolveOpponent = (row: { id: string; gameId: string; color: string; opponent: string | null }): string => {
        if (row.opponent) return row.opponent;
        const names = prep(`
            SELECT json_extract(full_json, '$.players.white')     AS pw,
                   json_extract(full_json, '$.players.black')     AS pb,
                   json_extract(full_json, '$.gameHeaders.White') AS hw,
                   json_extract(full_json, '$.gameHeaders.Black') AS hb
            FROM analysis_full_data WHERE analysis_id = ?
        `).get(row.id) as { pw: string | null; pb: string | null; hw: string | null; hb: string | null } | undefined;
        const found = row.color === 'white' ? (names?.pb ?? names?.hb) : (names?.pw ?? names?.hw);
        if (found) {
            prep(`UPDATE analyses SET opponent = ? WHERE id = ?`).run(found, row.id);
            row.opponent = found;
            return found;
        }
        return 'Desconocido';
    };

    const CATEGORY_FEN_KEY: Record<string, string> = {
        tilt: 'tiltFens',
        comeback: 'comebackFens',
        blown_advantage: 'blownAdvantageFens',
    };

    const results: StatDetailResult[] = [];

    for (const row of rows) {
        try {
            const am = JSON.parse(row.advancedMetrics);
            const items = am[CATEGORY_FEN_KEY[category]];
            if (!items) continue;

            for (const item of items) {
                const ply = typeof item === 'string' ? null : (item.ply ?? null);

                let fen = typeof item === 'string' ? item : item.fen;
                if (ply !== null) {
                    const fenRow = fenByPly.get(row.id, ply) as { fen: string } | undefined;
                    if (fenRow?.fen) fen = fenRow.fen;
                }

                if (fen && typeof fen === 'string' && fen.trim()) {
                    const opponent = resolveOpponent(row);

                    results.push({
                        gameId: row.gameId,
                        analysisId: row.id,
                        fen: fen.trim(),
                        ply,
                        type: category as any,
                        win: row.win,
                        color: row.color,
                        opponent,
                        date: row.gameDate || row.date,
                        opening: row.opening,
                        eco: row.eco
                    });
                }
            }
        } catch (_) { /* malformed advancedMetrics — skip */ }
    }

    return results;
}

export const StatsRepo = {
    /**
     * Returns a comprehensive aggregated statistics object for a filtered set of games.
     */
    getAggregatedStats(filters: StatsFilters = {}): AggregatedStatsResult {
        return withScope(filters, () => computeAggregatedStats());
    },

    /**
     * Returns individual FEN positions for a given metric category (tilt, comeback, blown_advantage).
     */
    getStatDetails(category: 'tilt' | 'comeback' | 'blown_advantage' | string, filters: StatsFilters = {}): StatDetailResult[] {
        const VALID_CATEGORIES = ['tilt', 'comeback', 'blown_advantage'];
        if (!VALID_CATEGORIES.includes(category)) return [];
        return withScope(filters, () => computeStatDetails(category));
    },

    /**
     * Partidas propias analizadas que pasaron por una posición (antes de jugar una jugada).
     * `ply` es el índice de la jugada que se jugó desde esa posición.
     */
    getGamesAtPosition(fen: string, limit = 30): GameAtPosition[] {
        const normalizedFen = fen.split(' ').slice(0, 3).join(' ');
        const lo = `${normalizedFen} `;
        const hi = `${normalizedFen}!`;
        return prep(`
            SELECT a.gameId, a.opponent, a.opening, a.color, a.win,
                   COALESCE(a.gameDate, a.date) AS date,
                   MIN(m.ply) AS ply, m.move_san AS moveSan
            FROM game_moves m
            JOIN analyses a ON a.id = m.game_id
            WHERE m.start_fen >= ? AND m.start_fen < ?
            GROUP BY a.id
            ORDER BY date DESC
            LIMIT ?
        `).all(lo, hi, Math.max(1, Math.min(100, limit))) as GameAtPosition[];
    },

    /**
     * Returns move frequency and outcome statistics for a given board position.
     */
    getMoveExplorer(fen: string): MoveExplorerResult {
        const normalizedFen = fen.split(' ').slice(0, 3).join(' ');
        // El turno forma parte del FEN normalizado: es el mismo para todas las filas.
        const isWhiteMove = normalizedFen.split(' ')[1] === 'w';
        // Rango sobre el índice de start_fen (prefijo "<fen> "); ' ' (0x20) < '!' (0x21).
        const lo = `${normalizedFen} `;
        const hi = `${normalizedFen}!`;

        type AggRow = {
            move_san: string; userColor: string; count: number;
            wins: number; draws: number; losses: number;
            totalEval: number | null; evalCount: number;
        };
        const rows = prep(`
            SELECT
                m.move_san,
                a.color AS userColor,
                COUNT(*) AS count,
                SUM(a.win = 1)  AS wins,
                SUM(a.win = 0)  AS draws,
                SUM(a.win = -1) AS losses,
                SUM(m.evaluation)   AS totalEval,
                COUNT(m.evaluation) AS evalCount
            FROM game_moves m
            JOIN analyses a ON m.game_id = a.id
            WHERE m.start_fen >= ? AND m.start_fen < ?
            GROUP BY m.move_san, a.color
        `).all(lo, hi) as AggRow[];

        const labelRows = prep(`
            SELECT m.move_san, a.color AS userColor, m.label, COUNT(*) AS count
            FROM game_moves m
            JOIN analyses a ON m.game_id = a.id
            WHERE m.start_fen >= ? AND m.start_fen < ? AND m.label IS NOT NULL
            GROUP BY m.move_san, a.color, m.label
        `).all(lo, hi) as { move_san: string; userColor: string; label: string; count: number }[];

        const stats = {
            whitePerspective: { user: {} as Record<string, any>, opponent: {} as Record<string, any> },
            blackPerspective: { user: {} as Record<string, any>, opponent: {} as Record<string, any> },
        };

        const targetFor = (userColor: string) => {
            const perspective = userColor === 'white' ? stats.whitePerspective : stats.blackPerspective;
            const isUserMove = (userColor === 'white') === isWhiteMove;
            return isUserMove ? perspective.user : perspective.opponent;
        };

        for (const row of rows) {
            const target = targetFor(row.userColor);
            target[row.move_san] = {
                san: row.move_san, count: row.count,
                wins: row.wins, draws: row.draws, losses: row.losses,
                totalEval: row.totalEval ?? 0, evalCount: row.evalCount,
                labels: {} as Record<string, number>,
            };
        }
        for (const lr of labelRows) {
            const s = targetFor(lr.userColor)[lr.move_san];
            if (s) s.labels[lr.label] = lr.count;
        }

        const formatSide = (sideData: Record<string, any>): ExplorerMove[] =>
            Object.values(sideData)
                .map(s => ({
                    san: s.san,
                    count: s.count,
                    winRate: Math.round((s.wins / s.count) * 100),
                    drawRate: Math.round((s.draws / s.count) * 100),
                    lossRate: Math.round((s.losses / s.count) * 100),
                    avgEval: s.evalCount > 0 ? (s.totalEval / s.evalCount).toFixed(2) : null,
                    labels: s.labels,
                }))
                .sort((a, b) => b.count - a.count);

        return {
            whitePerspective: {
                userMoves: formatSide(stats.whitePerspective.user),
                opponentMoves: formatSide(stats.whitePerspective.opponent),
            },
            blackPerspective: {
                userMoves: formatSide(stats.blackPerspective.user),
                opponentMoves: formatSide(stats.blackPerspective.opponent),
            },
        };
    },
};
