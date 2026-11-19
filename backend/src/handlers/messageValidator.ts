import type { ClientMessage } from '../../../shared/protocol.js';

/**
 * Validación ligera (sin dependencias) de los mensajes entrantes del cliente.
 * Devuelve `null` si el mensaje es válido o un texto con el motivo del rechazo.
 * Solo comprueba forma y tipos de los campos que los handlers usan sin defensa propia.
 */

const MAX_FEN_LENGTH = 200;
const MAX_HISTORY_PLIES = 1000;
const MAX_GAMES_PER_REQUEST = 500;
const MAX_IDS_PER_REQUEST = 1000;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown, max = 512): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
const isId = (v: unknown): boolean => isStr(v, 128) || (typeof v === 'number' && Number.isFinite(v));
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isOptNonNegInt = (v: unknown): boolean => v === undefined || (isInt(v) && v >= 0);

const MAX_PGN_LENGTH = 2 * 1024 * 1024;
const MAX_SAN_LENGTH = 16;

/** Número opcional dentro de [min, max]. */
const inRange = (v: unknown, min: number, max: number): boolean =>
    v === undefined || v === null || (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max);

const isOptStr = (v: unknown, max: number): boolean => v === undefined || v === null || (typeof v === 'string' && v.length <= max);

/** Configuración del motor: valores numéricos dentro de rangos razonables (el resto de claves se ignora). */
function validEngineConfig(c: unknown): string | null {
    if (c === undefined || c === null) return null;
    if (!isObj(c)) return '"engineConfig" must be an object';
    if (!inRange(c.depth, 1, 40)) return 'engine "depth" out of range (1..40)';
    if (!inRange(c.multiPv, 1, 10)) return 'engine "multiPv" out of range (1..10)';
    if (!inRange(c.threads, 1, 256)) return 'engine "threads" out of range (1..256)';
    if (!inRange(c.hash, 1, 16384)) return 'engine "hash" out of range (1..16384)';
    return null;
}

/** Cada jugada del historial: SAN como texto o un objeto con `san`. */
function validHistory(history: unknown[]): boolean {
    return history.every((m) =>
        (typeof m === 'string' && m.length > 0 && m.length <= MAX_SAN_LENGTH)
        || (isObj(m) && typeof m.san === 'string' && m.san.length > 0 && m.san.length <= MAX_SAN_LENGTH));
}

/** Metadatos opcionales de una partida (comunes a analyze_game y a cada entrada de games[]). */
function validGameMeta(g: Record<string, unknown>): string | null {
    if (g.playerColor !== undefined && g.playerColor !== 'white' && g.playerColor !== 'black') return '"playerColor" must be "white" or "black"';
    if (g.win !== undefined && g.win !== null && typeof g.win !== 'number' && typeof g.win !== 'boolean') return '"win" must be a number or boolean';
    if (!isOptStr(g.timeControl, 32)) return '"timeControl" must be a short string';
    if (!isOptStr(g.startFen, MAX_FEN_LENGTH)) return '"startFen" must be a FEN string';
    if (!isOptStr(g.opponent, 128) || !isOptStr(g.playerWhite, 128) || !isOptStr(g.playerBlack, 128) || !isOptStr(g.username, 128)) {
        return 'player names must be short strings';
    }
    if (!isOptStr(g.gameDate, 64)) return '"gameDate" must be a date string';
    if (g.times !== undefined && g.times !== null
        && !(Array.isArray(g.times) && g.times.length <= MAX_HISTORY_PLIES && g.times.every(t => t === null || typeof t === 'number'))) {
        return '"times" must be an array of numbers';
    }
    return null;
}

const STAT_CATEGORIES = new Set(['tilt', 'comeback', 'blown_advantage']);
const NO_PAYLOAD = new Set([
    'cancel', 'cancel_live', 'cancel_extraction', 'get_puzzles', 'clear_puzzles',
    'get_analysed_ids', 'get_server_config', 'get_puzzle_game_ids',
]);

function validGames(games: unknown, requirePgn: boolean): string | null {
    if (!Array.isArray(games) || games.length === 0) return '"games" must be a non-empty array';
    if (games.length > MAX_GAMES_PER_REQUEST) return `"games" exceeds ${MAX_GAMES_PER_REQUEST} entries`;
    for (const g of games) {
        if (!isObj(g) || !isId(g.gameId)) return 'each game needs a "gameId"';
        if (g.pgn !== undefined && (typeof g.pgn !== 'string' || g.pgn.length > MAX_PGN_LENGTH)) return '"pgn" must be a string under 2 MB';
        if (requirePgn && typeof g.pgn !== 'string') return 'each game needs a "pgn" string';
        if (!requirePgn && !Array.isArray(g.history) && typeof g.pgn !== 'string') return 'each game needs "history" or "pgn"';
        if (g.history !== undefined && g.history !== null
            && !(Array.isArray(g.history) && g.history.length <= MAX_HISTORY_PLIES && validHistory(g.history))) {
            return `"history" must be an array of up to ${MAX_HISTORY_PLIES} valid moves`;
        }
        const meta = validGameMeta(g);
        if (meta) return meta;
    }
    return null;
}

function validFilters(f: unknown): boolean {
    if (f === undefined) return true;
    if (!isObj(f)) return false;
    return ['username', 'duration', 'time', 'count', 'increment', 'start'].every(k => isOptStr(f[k], 128));
}

export function validateClientMessage(msg: ClientMessage): string | null {
    const m = msg as unknown as Record<string, unknown>;
    const type = m.type as string;

    if (m.requestId !== undefined && !isStr(m.requestId, 64)) return '"requestId" must be a string';
    if (NO_PAYLOAD.has(type)) return null;

    switch (type) {
        case 'analyze_position':
            if (!isStr(m.fen, MAX_FEN_LENGTH)) return '"fen" is required';
            if (!isInt(m.moveIndex)) return '"moveIndex" must be an integer';
            return validEngineConfig(m);
        case 'engine_move':
            if (!isStr(m.fen, MAX_FEN_LENGTH)) return '"fen" is required';
            if (m.elo !== undefined && m.elo !== null && !isInt(m.elo)) return '"elo" must be an integer';
            if (m.movetime !== undefined && !isInt(m.movetime)) return '"movetime" must be an integer';
            if (!inRange(m.elo, 1, 4000)) return '"elo" out of range';
            if (m.skill !== undefined && m.skill !== null && !(isInt(m.skill) && m.skill >= 0 && m.skill <= 20)) return '"skill" must be 0..20';
            if (!inRange(m.movetime, 1, 60000)) return '"movetime" out of range (ms)';
            return inRange(m.threads, 1, 256) ? null : '"threads" out of range';
        case 'analyze_game':
            if (!Array.isArray(m.history) || m.history.length === 0 || m.history.length > MAX_HISTORY_PLIES) {
                return `"history" must be an array of 1..${MAX_HISTORY_PLIES} moves`;
            }
            if (!validHistory(m.history)) return '"history" contains invalid moves';
            if (!isInt(m.currentIndex)) return '"currentIndex" must be an integer';
            if (!isId(m.gameId)) return '"gameId" is required';
            return validEngineConfig(m.engineConfig) ?? validGameMeta(m);
        case 'analyze_games':
            return validGames(m.games, false) ?? validEngineConfig(m.engineConfig);
        case 'extract_puzzles':
            return validGames(m.games, true) ?? validEngineConfig(m.engineConfig);
        case 'extract_puzzles_from_analyses':
            if (!Array.isArray(m.gameIds) || m.gameIds.length === 0 || m.gameIds.length > MAX_GAMES_PER_REQUEST
                || !m.gameIds.every(isId)) {
                return '"gameIds" must be a non-empty array of ids';
            }
            return validEngineConfig(m.engineConfig);
        case 'clear_cache':
        case 'get_full_analysis':
            return isId(m.gameId) ? null : '"gameId" is required';
        case 'delete_puzzle':
        case 'puzzle_failed':
        case 'puzzle_solved':
            return isStr(m.id, 128) ? null : '"id" is required';
        case 'get_stats':
            return validFilters(m.filters) ? null : '"filters" must be an object';
        case 'get_stat_details':
            if (typeof m.category !== 'string' || !STAT_CATEGORIES.has(m.category)) return 'invalid "category"';
            return validFilters(m.filters) ? null : '"filters" must be an object';
        case 'get_analyses':
            return isOptNonNegInt(m.offset) && isOptNonNegInt(m.limit) ? null : '"offset"/"limit" must be non-negative integers';
        case 'delete_analyses': {
            const ids = m.ids;
            if (isStr(ids, 128)) return null;
            if (Array.isArray(ids) && ids.length <= MAX_IDS_PER_REQUEST && ids.every((i) => isStr(i, 128))) return null;
            return '"ids" must be a string or an array of strings';
        }
        case 'get_move_explorer':
        case 'get_games_at_position':
        case 'get_book_moves':
            return isStr(m.fen, MAX_FEN_LENGTH) ? null : '"fen" is required';
        default:
            return null; // tipo desconocido: lo rechaza handleClientMessage
    }
}
