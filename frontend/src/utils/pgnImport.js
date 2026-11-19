import { Chess } from 'chess.js';
import { normalizeTimeControl } from './timeControl.js';

/** Divide un texto con una o varias partidas PGN en partidas individuales. */
export function splitPgnGames(text) {
  if (!text) return [];
  const normalized = text.replace(/\r\n?/g, '\n').trim();
  if (!normalized) return [];
  // Una partida nueva empieza con una cabecera [Event ...] tras una línea en blanco
  return normalized
    .split(/\n\s*\n(?=\[Event\s)/)
    .map(g => g.trim())
    .filter(g => g.length > 0);
}

// Hash estable (djb2) para que reimportar el mismo PGN no genere un análisis duplicado
function stableId(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return `pgn-${h.toString(36)}`;
}

/**
 * Convierte un PGN individual en la entrada que espera `analyze_games`.
 * Devuelve null si el PGN no es válido o no tiene jugadas.
 */
export function buildBatchGameFromPgn(pgn, username = '') {
  try {
    const chess = new Chess();
    chess.loadPgn(pgn);
    if (chess.history().length === 0) return null;

    const h = chess.header();
    const user = username.trim().toLowerCase();
    const isBlack = !!user && (h.Black ?? '').toLowerCase() === user;
    const isWhite = !!user && (h.White ?? '').toLowerCase() === user;
    const playerColor = isBlack && !isWhite ? 'black' : 'white';

    const result = h.Result ?? '*';
    const win = result === '1/2-1/2' ? 0
      : ((playerColor === 'white' && result === '1-0') || (playerColor === 'black' && result === '0-1')) ? 1 : -1;

    let gameId = null;
    const site = h.Site ?? '';
    if (site.includes('lichess.org/') || site.includes('chess.com/')) {
      gameId = site.split('/').pop().split(/[#?]/)[0] || null;
    }

    const rawDate = h.UTCDate || h.Date;
    const gameDate = rawDate && rawDate !== '????.??.??'
      ? `${rawDate.replace(/\./g, '-')}T${h.UTCTime || '00:00:00'}`
      : null;

    return {
      pgn,
      gameId: gameId || stableId(pgn),
      username: username.trim() || null,
      playerColor,
      win,
      timeControl: normalizeTimeControl(h.TimeControl),
      opponent: playerColor === 'white' ? (h.Black ?? null) : (h.White ?? null),
      gameDate,
    };
  } catch {
    return null;
  }
}
