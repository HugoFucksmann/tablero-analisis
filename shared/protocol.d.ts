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

export interface StatsFilters {
    username?: string;
    duration?: string; // 'all' | '1m' | '3m' | '5m' | '10m' | '15m' | '30m'
    time?: string;     // 'all' | número de días
    count?: string;    // 'all' | número de partidas
}

export type StatCategory = 'tilt' | 'comeback' | 'blown_advantage';

export interface GameInput {
    gameId: string;
    history?: unknown[];
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

// ─── Cliente → Servidor ───────────────────────────────────────────────────────

export type ClientMessage = RequestMeta & (
    | ({ type: 'analyze_position'; fen: string; moveIndex: number } & EngineConfig)
    | {
          type: 'analyze_game';
          history: unknown[];
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
    | { type: 'clear_cache'; gameId: string }
    | { type: 'extract_puzzles'; games: (GameInput & { pgn: string })[]; engineConfig?: EngineConfig }
    | { type: 'cancel_extraction' }
    | { type: 'get_puzzles' }
    | { type: 'delete_puzzle'; id: string }
    | { type: 'clear_puzzles' }
    | { type: 'puzzle_solved'; id: string }
    | { type: 'get_stats'; filters?: StatsFilters }
    | { type: 'get_stat_details'; category: StatCategory; filters?: StatsFilters }
    | { type: 'get_analyses'; offset?: number; limit?: number }
    | { type: 'get_analysed_ids' }
    | { type: 'delete_analyses'; ids: string | string[] }
    | { type: 'get_full_analysis'; gameId: string }
    | { type: 'get_move_explorer'; fen: string }
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
    | { type: 'move_result'; [key: string]: unknown }
    | { type: 'opening_detected'; openingName: string; ecoCode: string; openingPly: number; bookPlies: number[] }
    | { type: 'complete'; accuracy: { white: number; black: number }; accuracyByPhase?: unknown[]; win?: number | null }
    | { type: 'cancelled' }
    // Lote
    | { type: 'batch_analysis_started'; gameIndex: number; total: number; gameId: string }
    | { type: 'batch_analysis_progress'; gameIndex: number; pct: number; label: string }
    | { type: 'batch_analysis_game_complete'; gameIndex: number; accuracy: unknown }
    | { type: 'batch_analysis_complete'; total: number }
    | { type: 'batch_analysis_cancelled' }
    // Puzzles
    | { type: 'puzzle_extraction_started'; totalGames: number }
    | { type: 'puzzle_game_done'; [key: string]: unknown }
    | { type: 'puzzle_extraction_complete'; [key: string]: unknown }
    | { type: 'extraction_cancelled'; [key: string]: unknown }
    | { type: 'puzzle_list'; puzzles: unknown[] }
    | { type: 'puzzle_deleted'; id: string; success: boolean }
    | { type: 'puzzles_cleared' }
    // Estadísticas y consultas
    | { type: 'stats_data'; stats: unknown }
    | { type: 'stat_details_data'; category: StatCategory; details: unknown[] }
    | { type: 'analyses_list'; analyses: unknown[]; offset: number; limit: number; total: number }
    | { type: 'analysed_ids'; ids: string[] }
    | { type: 'analyses_deleted'; ids: string | string[] }
    | { type: 'full_analysis_data'; gameId: string; data: unknown }
    | { type: 'move_explorer_data'; fen: string; [key: string]: unknown }
    | { type: 'book_moves'; fen: string; moves: unknown[]; opening?: string; eco?: string; source: string; error?: string }
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
