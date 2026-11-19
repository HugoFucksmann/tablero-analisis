import { Chess } from 'chess.js';

const STANDARD_PLACEMENT = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** ¿La posición inicial es distinta a la estándar? */
export const isCustomStart = (fen) => !!fen && fen.split(' ')[0] !== STANDARD_PLACEMENT;

export const REASON_LABELS = {
  checkmate: 'Jaque mate',
  stalemate: 'Rey ahogado',
  insufficient: 'Material insuficiente',
  repetition: 'Triple repetición',
  fifty: 'Regla de los 50 movimientos',
  resign: 'Rendición',
  timeout: 'Tiempo agotado',
  agreement: 'Acuerdo de tablas',
};

/**
 * Resultado de la partida desde el punto de vista del usuario.
 * `result` = { winner: 'w' | 'b' | null, reason }.  Devuelve { outcome: 'win'|'loss'|'draw', title, detail }.
 */
export function describeResult(result, userColor) {
  if (!result) return null;
  const detail = REASON_LABELS[result.reason] ?? '';
  if (!result.winner) return { outcome: 'draw', title: 'Tablas', detail };
  return result.winner === userColor
    ? { outcome: 'win', title: '¡Ganaste!', detail }
    : { outcome: 'loss', title: 'Perdiste', detail };
}

/** Resultado PGN ("1-0", "0-1", "1/2-1/2"). */
export const pgnResult = (result) => (!result?.winner ? '1/2-1/2' : result.winner === 'w' ? '1-0' : '0-1');

/** Estado de fin de partida de una posición (sin considerar reloj ni rendición), o null si sigue. */
export function detectGameEnd(game) {
  if (game.isCheckmate()) return { winner: game.turn() === 'w' ? 'b' : 'w', reason: 'checkmate' };
  if (game.isStalemate()) return { winner: null, reason: 'stalemate' };
  if (game.isInsufficientMaterial()) return { winner: null, reason: 'insufficient' };
  if (game.isThreefoldRepetition()) return { winner: null, reason: 'repetition' };
  if (game.isDraw()) return { winner: null, reason: 'fifty' };
  return null;
}

/** PGN de la partida jugada, listo para cargarlo en el análisis. */
export function buildPlayPgn({ history, startFen, userColor, userName, botLabel, botElo, result, timeControl }) {
  const custom = isCustomStart(startFen);
  const chess = custom ? new Chess(startFen) : new Chess();
  for (const m of history) chess.move(typeof m === 'string' ? m : m.san);

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const userIsWhite = userColor === 'w';

  chess.header(
    'Event', 'Partida contra Stockfish',
    'Site', 'Tablero de Análisis',
    'Date', `${now.getFullYear()}.${pad(now.getMonth() + 1)}.${pad(now.getDate())}`,
    'White', userIsWhite ? userName : botLabel,
    'Black', userIsWhite ? botLabel : userName,
    'Result', pgnResult(result),
    userIsWhite ? 'BlackElo' : 'WhiteElo', String(botElo),
    'TimeControl', timeControl ? `${timeControl.base}${timeControl.inc ? `+${timeControl.inc}` : ''}` : '-',
  );
  if (custom) chess.header('SetUp', '1', 'FEN', startFen);
  return chess.pgn();
}
