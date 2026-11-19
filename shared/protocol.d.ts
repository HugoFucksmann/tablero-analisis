/**
 * Contrato WebSocket entre frontend y backend (fuente única de verdad).
 *
 * - El backend lo importa como tipos (`import type ... from '../../shared/protocol'`).
 * - El frontend (JavaScript) lo referencia con JSDoc: `@type {import('../../../shared/protocol').ClientMessage}`.
 *
 * Todos los mensajes viajan como JSON con un campo `type`. Cualquier mensaje puede llevar
 * `requestId`: el servidor lo devuelve en la respuesta para correlacionar pedido y respuesta.
 */

// ─── Tipos comunes ────────────────────────────────────────────────────────────

export interface RequestMeta {
    requestId?: string;
}

export interface EngineConfig {
    depth?: number;
    multiPv?: number;
    threads?: number;
    hash?: number;
}

export interface EngineLine {
    multipv: number;
    score: number;
    mate: number | null;
    pv: string;
    move: string;
    depth: number;
}

/** Jugada serializada de chess.js (solo los campos que usa el backend). */
export interface ChessMove {
    from: string;
    to: string;
    san: string;
    lan?: string;
    color?: 'w' | 'b';
    promotion?: string;
    [key: string]: unknown;
}

export interface PhaseAccuracy {
    phase: string;
    accuracy: number;
}

export interface Accuracy {
    white: number;
    black: number;
}

export interface StatsFilters {
    username?: string;
    duration?: string; // 'all' | '1m' | '3m' | '5m' | '10m' | '15m' | '30m'
    time?: string;     // 'all' | número de días
    count?: string;    // 'all' | número de partidas
    increment?: string; // 'all' | 'none' | 'inc'
    start?: string;     // 'all' | 'standard' | 'custom'
}

export type StatCategory = 'tilt' | 'comeback' | 'blown_advantage';

export interface GameInput {
    gameId: string;
    history?: ChessMove[];
    pgn?: string;
    startFen?: string | null;
    playerColor?: 'white' | 'black';
    win?: boolean | number | null;
    timeControl?: string | null;
    opponent?: string | null;
    gameDate?: string | null;
    username?: string | null;
    playerWhite?: string | null;
    playerBlack?: string | null;
    times?: number[] | null;
}

// ─── Payloads de datos (servidor → cliente) ───────────────────────────────────

export type ErrorTimeClass = 'time_pressure' | 'precipitation' | 'overthinking';

/** Resultado por jugada durante el análisis de una partida (clasificación y/o evaluación). */
export interface MoveResultPayload {
    index: number;
    label?: string;
    isBook?: boolean;
    errorTimeClass?: ErrorTimeClass | null;
    moveTime?: number | null;
    remainingTime?: number | null;
    // Evaluación en vivo del motor (cuando viene del progreso por posición)
    score?: number | string;
    mate?: number | null;
    bestMove?: string;
    lines?: EngineLine[];
}

export interface PuzzleSummary {
    id: string;
    createdAt: string;
    solvedCount: number;
    fen: string;
    solutionSequence: string[];
    baseFen?: string | null;
    contextMoves?: unknown[] | null;
    originalContinuation?: unknown[] | null;
    preBlunderFen?: string | null;
    playedMove?: string | null;
    label?: string | null;
    puzzleType?: 'mate' | 'tactical_blunder' | string | null;
    mateIn?: number | null;
    wpLoss?: number | null;
    preBlunderWp?: number | null;
    playerColor?: 'white' | 'black' | null;
    gameId?: string | null;
    ply?: number | null;
    blunderSeverity?: number | null;
    tensionIndex?: number | null;
    attackedSquares?: number | null;
    isOnlyMove?: boolean;
    criticalityGap?: number | null;
    tacticalMotifs?: string[] | null;
    // Repetición espaciada
    attempts?: number;
    failures?: number;
    streak?: number;
    nextReviewAt?: string | null;
    // Campos unidos desde la partida analizada
    opponent?: string | null;
    win?: number | null;
    gameDate?: string | null;
}

export interface AnalysisSummary {
    id: string;
    gameId: string;
    username?: string | null;
    createdAt: string;
    date: string;
    gameDate?: string | null;
    opening: string;
    eco?: string | null;
    moveCount: number;
    color: 'white' | 'black' | string;
    win: 1 | 0 | -1;
    timeControl?: string | null;
    opponent?: string | null;
    white: { accuracy: number | null };
    black: { accuracy: number | null };
    accuracyByPhase: PhaseAccuracy[];
    labelCounts: Record<string, number>;
    advancedMetrics: Record<string, unknown>;
}

/** Análisis completo persistido de una partida (fullData). */
export interface FullAnalysisData {
    accuracy: Accuracy;
    accuracyByPhase: PhaseAccuracy[];
    win: number | null;
    playerColor: 'white' | 'black';
    opening: { name: string; eco: string };
    players: { white: string | null; black: string | null };
    startFen: string | null;
    historySan: string[];
    history: string[];
    positions: string[];
    evaluations: Array<{ wp: number; score: number | string; mate: number | null; bestMove: string; lines: EngineLine[] } | null | undefined>;
    moveEvaluations: Record<string, string>;
    errorTimeClasses: Record<string, ErrorTimeClass>;
    moveTimes?: Record<string, number>;
    remainingTimes?: Record<string, number>;
    movePhases: Record<string, string>;
    bestMoves: Record<string, string>;
    alternativeLines: Record<string, EngineLine[]>;
}

export interface StatsData {
    empty?: boolean;
    total?: number;
    winRate?: number;
    drawRate?: number;
    avgAcc?: number;
    white?: { count: number; acc: number; wr: number };
    black?: { count: number; acc: number; wr: number };
    openingStats?: Array<{ [key: string]: unknown }>;
    trend?: Array<{ date: string; accuracy: number }>;
    accuracyByPhase?: Array<PhaseAccuracy & { color: string }>;
    moveQuality?: Array<{ label: string; count: number; pct: number; color: string }>;
    blundersByTime?: Array<{ label: string; color: string; count: number }>;
    dangerousOpenings?: Array<{ eco: string | null; name: string; errorsPerGame: number; gameCount: number }>;
    openingDeviations?: {
        gamesWithDeviation: number;
        avgMoveNumber: number;
        commonMoveNumber: number | null;
        openings: Array<{
            opening: string;
            games: number;
            avgMoveNumber: number;
            errorRate: number;
            top: Array<{ moveNumber: number; san: string; bookMoves: string[]; count: number; errorRate: number }>;
        }>;
    };
    advancedStats?: { [key: string]: number };
}

export interface StatDetail {
    gameId: string;
    analysisId: string;
    fen: string;
    ply: number | null;
    type: StatCategory;
    win: number;
    color: string;
    opponent: string;
    date: string;
    opening: string;
    eco: string | null;
}

export interface ExplorerMoveStat {
    san: string;
    count: number;
    winRate: number;
    drawRate: number;
    lossRate: number;
    avgEval: string | null;
    labels: Record<string, number>;
}

export interface ExplorerPerspective {
    userMoves: ExplorerMoveStat[];
    opponentMoves: ExplorerMoveStat[];
}

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

export interface BookMoveInfo {
    uci: string;
    san: string;
    weight: number;
    freq: number;
}

// ─── Cliente → Servidor ───────────────────────────────────────────────────────

export type ClientMessage = RequestMeta & (
    | ({ type: 'analyze_position'; fen: string; moveIndex: number } & EngineConfig)
    | {
          type: 'analyze_game';
          history: ChessMove[];
          currentIndex: number;
          gameId: string;
          engineConfig?: EngineConfig;
          startFen?: string | null;
          playerColor?: 'white' | 'black';
          win?: boolean | number | null;
          timeControl?: string | null;
          playerWhite?: string | null;
          playerBlack?: string | null;
          opponent?: string | null;
          gameDate?: string | null;
          times?: number[] | null;
      }
    | { type: 'analyze_games'; games: GameInput[]; engineConfig?: EngineConfig }
    | { type: 'cancel' }
    | { type: 'cancel_live' }
    | { type: 'engine_move'; fen: string; elo?: number | null; skill?: number | null; movetime?: number; threads?: number }
    | { type: 'clear_cache'; gameId: string }
    | { type: 'extract_puzzles'; games: (GameInput & { pgn: string })[]; engineConfig?: EngineConfig }
    | { type: 'extract_puzzles_from_analyses'; gameIds: string[]; engineConfig?: EngineConfig }
    | { type: 'get_puzzle_game_ids' }
    | { type: 'cancel_extraction' }
    | { type: 'get_puzzles' }
    | { type: 'delete_puzzle'; id: string }
    | { type: 'clear_puzzles' }
    | { type: 'puzzle_solved'; id: string }
    | { type: 'puzzle_failed'; id: string }
    | { type: 'get_stats'; filters?: StatsFilters }
    | { type: 'get_stat_details'; category: StatCategory; filters?: StatsFilters }
    | { type: 'get_analyses'; offset?: number; limit?: number }
    | { type: 'get_analysed_ids' }
    | { type: 'delete_analyses'; ids: string | string[] }
    | { type: 'get_full_analysis'; gameId: string }
    | { type: 'get_move_explorer'; fen: string }
    | { type: 'get_games_at_position'; fen: string }
    | { type: 'get_book_moves'; fen: string }
    | { type: 'get_server_config' }
);

export type ClientMessageType = ClientMessage['type'];

// ─── Servidor → Cliente ───────────────────────────────────────────────────────

export interface PositionEvaluation {
    score: number;
    mate: number | null;
    bestMove: string;
    moveIndex: number;
    lines: EngineLine[];
}

export type ServerMessage = RequestMeta & (
    // Análisis en vivo
    | ({ type: 'position_progress' } & PositionEvaluation)
    | ({ type: 'position_result' } & PositionEvaluation)
    // Partida completa
    | { type: 'status'; running: boolean }
    | { type: 'progress'; pct: number; label: string }
    | ({ type: 'move_result' } & MoveResultPayload)
    | { type: 'opening_detected'; openingName: string; ecoCode: string; openingPly: number; bookPlies: number[] }
    | { type: 'complete'; accuracy: { white: number; black: number }; accuracyByPhase?: PhaseAccuracy[]; win?: number | null }
    | { type: 'cancelled' }
    | { type: 'engine_move_result'; fen: string; move: string; score: number; mate: number | null }
    // Lote
    | { type: 'batch_analysis_started'; gameIndex: number; total: number; gameId: string }
    | { type: 'batch_analysis_progress'; gameIndex: number; pct: number; label: string }
    | { type: 'batch_analysis_game_complete'; gameIndex: number; accuracy: Accuracy }
    | { type: 'batch_analysis_complete'; total: number }
    | { type: 'batch_analysis_cancelled' }
    // Puzzles
    | { type: 'puzzle_extraction_started'; totalGames: number }
    | { type: 'puzzle_game_done'; gameIndex: number; total: number; extractedCount: number; totalExtracted: number }
    | { type: 'puzzle_extraction_complete'; totalExtracted: number }
    | { type: 'extraction_cancelled'; totalExtracted: number }
    | { type: 'puzzle_list'; puzzles: PuzzleSummary[] }
    | { type: 'puzzle_game_ids'; ids: string[] }
    | { type: 'puzzle_deleted'; id: string; success: boolean }
    | { type: 'puzzles_cleared' }
    // Estadísticas y consultas
    | { type: 'stats_data'; stats: StatsData }
    | { type: 'stat_details_data'; category: StatCategory; details: StatDetail[] }
    | { type: 'analyses_list'; analyses: AnalysisSummary[]; offset: number; limit: number; total: number }
    | { type: 'analysed_ids'; ids: string[] }
    | { type: 'analyses_deleted'; ids: string | string[] }
    | { type: 'full_analysis_data'; gameId: string; data: FullAnalysisData }
    | { type: 'move_explorer_data'; fen: string; whitePerspective: ExplorerPerspective; blackPerspective: ExplorerPerspective }
    | { type: 'games_at_position'; fen: string; games: GameAtPosition[] }
    | { type: 'book_moves'; fen: string; moves: BookMoveInfo[]; opening?: string; eco?: string; source: string; error?: string }
    | {
          type: 'server_config';
          openingSource: string;
          bookSize: number;
          /** Núcleos lógicos de la máquina del servidor. */
          cpuCount: number;
          totalMemMB: number;
          freeMemMB: number;
      }
    // Error (con `requestId` si respondía a un pedido)
    | { type: 'error'; message: string }
);

export type ServerMessageType = ServerMessage['type'];

/** Mensaje sintético que el frontend emite localmente al abrir/cerrar el socket. */
export interface ConnectionStatusEvent {
    type: 'connection_status';
    connected: boolean;
}
