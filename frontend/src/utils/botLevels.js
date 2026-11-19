/**
 * Niveles del bot (Stockfish) y controles de tiempo del modo Jugar.
 *
 * Fuerza: por debajo de ~1320 Elo el motor no admite `UCI_Elo`, así que los niveles más bajos usan
 * `Skill Level` (0–20); el resto usa `UCI_Elo`; "Máximo" juega sin límite. El Elo mostrado es orientativo.
 */
export const BOT_LEVELS = [
  { id: 'beginner', label: 'Principiante', elo: 900, skill: 0, movetime: 80, desc: 'Se equivoca a menudo. Para empezar sin presión.' },
  { id: 'easy', label: 'Fácil', elo: 1150, skill: 3, movetime: 120, desc: 'Juega ideas simples y deja piezas colgadas.' },
  { id: 'casual', label: 'Aficionado', elo: 1350, uciElo: 1350, movetime: 300, desc: 'Nivel de jugador casual.' },
  { id: 'club', label: 'Club', elo: 1600, uciElo: 1600, movetime: 500, desc: 'Sólido tácticamente, con fallos posicionales.' },
  { id: 'intermediate', label: 'Intermedio', elo: 1900, uciElo: 1900, movetime: 700, desc: 'Aprovecha casi todos los errores tácticos.' },
  { id: 'advanced', label: 'Avanzado', elo: 2200, uciElo: 2200, movetime: 900, desc: 'Nivel de jugador de torneo.' },
  { id: 'expert', label: 'Experto', elo: 2500, uciElo: 2500, movetime: 1200, desc: 'Muy difícil de batir sin una ventaja clara.' },
  { id: 'master', label: 'Maestro', elo: 2850, uciElo: 2850, movetime: 1500, desc: 'Nivel de gran maestro.' },
  { id: 'max', label: 'Stockfish', elo: 3200, full: true, movetime: 2000, desc: 'Fuerza máxima, sin límites.' },
];

export const DEFAULT_LEVEL_ID = 'club';

export const getLevel = (id) => BOT_LEVELS.find(l => l.id === id) ?? BOT_LEVELS.find(l => l.id === DEFAULT_LEVEL_ID);

/** Parámetros de fuerza que entiende el backend (`engine_move`). */
export function strengthOf(level) {
  if (level.full) return { elo: null, skill: null };
  if (level.uciElo) return { elo: level.uciElo, skill: null };
  return { elo: null, skill: level.skill ?? 0 };
}

export const TIME_CONTROLS = [
  { id: 'none', label: 'Sin reloj', base: null, inc: 0 },
  { id: '1+0', label: '1 min', base: 60, inc: 0 },
  { id: '3+2', label: '3 | 2', base: 180, inc: 2 },
  { id: '5+0', label: '5 min', base: 300, inc: 0 },
  { id: '10+0', label: '10 min', base: 600, inc: 0 },
  { id: '15+10', label: '15 | 10', base: 900, inc: 10 },
];

export const getTimeControl = (id) => TIME_CONTROLS.find(t => t.id === id) ?? TIME_CONTROLS[0];

/**
 * Tiempo de búsqueda del bot (ms). Sin reloj: el del nivel. Con reloj: una fracción de lo que le queda
 * (más el incremento), acotada por el tiempo del nivel para que no se pase pensando.
 */
export function botMoveTime(level, botClockSec, incSec = 0) {
  if (botClockSec === null || botClockSec === undefined) return level.movetime;
  const budget = (botClockSec / 40 + incSec * 0.8) * 1000;
  return Math.round(Math.max(60, Math.min(level.movetime, budget)));
}

/** "m:ss" (o "h:mm:ss"): el formato que espera PlayerArea. */
export function formatClock(seconds) {
  if (seconds === null || seconds === undefined) return null;
  const total = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
