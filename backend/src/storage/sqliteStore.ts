import { AnalysisRepo } from './repositories/analysisRepo.js';
import { StatsRepo } from './repositories/statsRepo.js';
import { PuzzleRepo } from './repositories/puzzleRepo.js';

export const SqliteStore = {
    // ── Analysis ──────────────────────────────────────────────────────────────
    save: (entry: any) => AnalysisRepo.save(entry),
    getByGameId: (gameId: string) => AnalysisRepo.findByGameId(gameId),
    getAll: (offset?: number, limit?: number) => AnalysisRepo.findAll(offset, limit),
    getAllGameIds: () => AnalysisRepo.findAllGameIds(),
    getFull: (gameId: string) => AnalysisRepo.findFullData(gameId),
    delete: (ids: string | string[]) => AnalysisRepo.delete(ids),
    clear: () => AnalysisRepo.clear(),
    count: () => AnalysisRepo.count(),

    // ── Stats ─────────────────────────────────────────────────────────────────
    getStats: (filters?: any) => StatsRepo.getAggregatedStats(filters),
    getAggregatedStats: (filters?: any) => StatsRepo.getAggregatedStats(filters),
    getStatDetails: (category: string, filters?: any) => StatsRepo.getStatDetails(category, filters),
    getMoveExplorer: (fen: string) => StatsRepo.getMoveExplorer(fen),
    getGamesAtPosition: (fen: string) => StatsRepo.getGamesAtPosition(fen),

    // ── Puzzles ───────────────────────────────────────────────────────────────
    getPuzzles: () => PuzzleRepo.findAll(),
    getPuzzleGameIds: () => PuzzleRepo.findGameIds(),
    savePuzzle: (p: any) => PuzzleRepo.save(p),
    deletePuzzle: (id: string) => PuzzleRepo.delete(id),
    clearPuzzles: () => PuzzleRepo.clear(),
    recordPuzzleAttempt: (id: string, correct: boolean) => PuzzleRepo.recordAttempt(id, correct),
    incrementPuzzleSolved: (id: string) => PuzzleRepo.incrementSolved(id),
    isPuzzleDuplicate: (fen: string, seq: string[], gameId?: string | null, ply?: number | null) =>
        PuzzleRepo.isDuplicate(fen, seq, gameId, ply),
};
