import db from '../db.js';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface AnalysisEntry {
    id: string;
    gameId: string;
    username?: string | null;
    createdAt: string;
    date: string;
    opening: string;
    eco?: string | null;
    moveCount: number;
    color: string;
    win: number;           // 1: Win | 0: Draw | -1: Loss
    timeControl: string;
    customStart?: boolean;
    white?: { accuracy: number | null } | null;
    black?: { accuracy: number | null } | null;
    accuracyByPhase: { phase: string; accuracy: number }[];
    labelCounts: Record<string, number>;
    advancedMetrics: any;
    opponent?: string | null;
    gameDate?: string | null;
    moves?: any[];
    fullData?: any;
}

interface AnalysisRow {
    id: string;
    gameId: string;
    username: string | null;
    createdAt: string;
    date: string;
    opening: string;
    eco: string | null;
    moveCount: number;
    color: string;
    win: number;
    timeControl: string;
    whiteAccuracy: number | null;
    blackAccuracy: number | null;
    accuracyByPhase: string;
    labelCounts: string;
    advancedMetrics: string;
    opponent: string | null;
    gameDate: string | null;
}

// ─── Prepared statements ──────────────────────────────────────────────────────

const stmts = {
    // UPSERT (no REPLACE): REPLACE borra y reinserta la fila, disparando el
    // ON DELETE CASCADE hacia analysis_full_data y las demás tablas hijas.
    insertAnalysis: db.prepare(`
        INSERT INTO analyses (
            id, gameId, username, createdAt, date, opening, eco, moveCount,
            color, win, timeControl, whiteAccuracy, blackAccuracy,
            accuracyByPhase, labelCounts, advancedMetrics, opponent, gameDate, customStart
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            gameId = excluded.gameId, username = excluded.username, createdAt = excluded.createdAt,
            date = excluded.date, opening = excluded.opening, eco = excluded.eco,
            moveCount = excluded.moveCount, color = excluded.color, win = excluded.win,
            timeControl = excluded.timeControl, whiteAccuracy = excluded.whiteAccuracy,
            blackAccuracy = excluded.blackAccuracy, accuracyByPhase = excluded.accuracyByPhase,
            labelCounts = excluded.labelCounts, advancedMetrics = excluded.advancedMetrics,
            opponent = excluded.opponent, gameDate = excluded.gameDate,
            customStart = excluded.customStart
    `),

    insertPhase: db.prepare(`INSERT INTO phase_accuracy (game_id, phase, accuracy) VALUES (?, ?, ?)`),
    insertQuality: db.prepare(`INSERT INTO move_quality (game_id, label, count) VALUES (?, ?, ?)`),
    insertMove: db.prepare(`
        INSERT OR REPLACE INTO game_moves (
            game_id, ply, move_san, evaluation, label, move_time,
            remaining_time, fen, start_fen, error_time_class
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    insertFullData: db.prepare(`INSERT OR REPLACE INTO analysis_full_data (analysis_id, full_json) VALUES (?, ?)`),

    deletePhases: db.prepare(`DELETE FROM phase_accuracy  WHERE game_id = ?`),
    deleteQuality: db.prepare(`DELETE FROM move_quality    WHERE game_id = ?`),
    deleteMoves: db.prepare(`DELETE FROM game_moves      WHERE game_id = ?`),
    deleteAnalysis: db.prepare(`DELETE FROM analyses        WHERE id = ?`),

    findByGameId: db.prepare(`SELECT * FROM analyses WHERE gameId = ?`),
    findById: db.prepare(`SELECT * FROM analyses WHERE id = ?`),
    // Order by gameDate (real match date) with fallback to date (analysis date) for old records
    findAll: db.prepare(`SELECT * FROM analyses ORDER BY COALESCE(gameDate, date) DESC LIMIT ? OFFSET ?`),
    findFullData: db.prepare(`
        SELECT f.full_json FROM analysis_full_data f
        JOIN analyses a ON a.id = f.analysis_id
        WHERE a.gameId = ?
    `),

    // Lightweight query — only gameIds, no LIMIT. Used for the "analyzed" badge in GameImport.
    findAllGameIds: db.prepare(`SELECT gameId FROM analyses`),

    count: db.prepare(`SELECT COUNT(*) as total FROM analyses`),

    clearAnalyses: db.prepare(`DELETE FROM analyses`),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Deserializes a raw SQLite row into a structured analysis object.
 */
function mapRow(row: any): AnalysisEntry {
    const r = row as AnalysisRow;
    return {
        id: r.id,
        gameId: r.gameId,
        username: r.username,
        createdAt: r.createdAt,
        date: r.date,
        opening: r.opening,
        eco: r.eco,
        moveCount: r.moveCount,
        color: r.color,
        win: r.win === 1 ? 1 : (r.win === 0 ? 0 : -1),
        timeControl: r.timeControl,
        opponent: r.opponent,
        gameDate: r.gameDate,
        white: { accuracy: r.whiteAccuracy },
        black: { accuracy: r.blackAccuracy },
        accuracyByPhase: JSON.parse(r.accuracyByPhase || '[]'),
        labelCounts: JSON.parse(r.labelCounts || '{}'),
        advancedMetrics: JSON.parse(r.advancedMetrics || '{}'),
    };
}

// ─── Repository ───────────────────────────────────────────────────────────────

export const AnalysisRepo = {
    /**
     * Persists a full analysis entry, replacing all related rows atomically.
     * @param entry  - Structured analysis object (must include `.id`).
     */
    save(entry: AnalysisEntry): void {
        const transaction = db.transaction((e: AnalysisEntry) => {
            stmts.insertAnalysis.run(
                e.id,
                e.gameId,
                e.username ?? null,
                e.createdAt,
                e.date,
                e.opening,
                e.eco ?? null,
                e.moveCount,
                e.color,
                e.win,           // 1: Win | 0: Draw | -1: Loss
                e.timeControl,
                e.white?.accuracy ?? null,
                e.black?.accuracy ?? null,
                JSON.stringify(e.accuracyByPhase || []),
                JSON.stringify(e.labelCounts || {}),
                JSON.stringify(e.advancedMetrics || {}),
                e.opponent ?? null,
                e.gameDate ?? null,
                e.customStart ? 1 : 0,
            );

            // Replace normalized sub-tables
            stmts.deletePhases.run(e.id);
            if (Array.isArray(e.accuracyByPhase)) {
                for (const { phase, accuracy } of e.accuracyByPhase) {
                    stmts.insertPhase.run(e.id, phase, accuracy);
                }
            }

            stmts.deleteQuality.run(e.id);
            if (e.labelCounts && typeof e.labelCounts === 'object') {
                for (const [label, count] of Object.entries(e.labelCounts)) {
                    stmts.insertQuality.run(e.id, label, count);
                }
            }

            stmts.deleteMoves.run(e.id);
            if (Array.isArray(e.moves)) {
                for (const move of e.moves) {
                    stmts.insertMove.run(
                        e.id,
                        move.ply,
                        move.san,
                        move.evaluation,
                        move.label,
                        move.moveTime ?? null,
                        move.remaining_time ?? null,
                        move.fen,
                        move.start_fen,
                        move.error_time_class ?? null,
                    );
                }
            }

            if (e.fullData) {
                stmts.insertFullData.run(e.id, JSON.stringify(e.fullData));
            }
        });

        transaction(entry);
    },

    /**
     * Returns a single analysis by its chess.com / lichess game ID.
     */
    findByGameId(gameId: string): AnalysisEntry | null {
        const row = stmts.findByGameId.get(gameId);
        return row ? mapRow(row) : null;
    },

    /**
     * Returns a paginated list of analyses ordered by date descending.
     */
    findAll(offset = 0, limit = 50): AnalysisEntry[] {
        return stmts.findAll.all(limit, offset).map(mapRow);
    },

    /**
     * Returns the full raw JSON blob stored for a game.
     */
    findFullData(gameId: string): any | null {
        const row = stmts.findFullData.get(gameId) as { full_json: string } | undefined;
        if (!row?.full_json) return null;

        try {
            return JSON.parse(row.full_json);
        } catch (e) {
            console.error('[AnalysisRepo] Failed to parse full_json for gameId:', gameId, e);
            return null;
        }
    },

    /**
     * Deletes one or more analyses by their internal UUID.
     * Cascades automatically to all related tables.
     */
    delete(ids: string | string[]): void {
        const idArray = Array.isArray(ids) ? ids : [ids];
        const transaction = db.transaction((arr: string[]) => {
            for (const id of arr) {
                stmts.deleteAnalysis.run(id);
            }
        });
        transaction(idArray);
    },

    /**
     * Deletes all analyses and their normalized sub-table data.
     */
    clear(): void {
        stmts.clearAnalyses.run(); // el CASCADE limpia las tablas hijas
    },

    /**
     * Returns all gameIds (platform IDs) of stored analyses — no LIMIT.
     * Much lighter than findAll; used solely to build the "analyzed" badge set.
     */
    findAllGameIds(): string[] {
        return stmts.findAllGameIds.all().map((r: any) => r.gameId);
    },

    /**
     * Returns the total number of stored analyses.
     */
    count(): number {
        return (stmts.count.get() as { total: number }).total;
    },
};
