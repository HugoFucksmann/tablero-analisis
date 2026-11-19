import { useEffect, useRef } from 'react';
import { Chess } from 'chess.js';
import { useGameStore } from '../store/useGameStore';
import { backendService } from '../services/backendService';
import { getLevel, strengthOf, botMoveTime } from '../utils/botLevels';
import { detectGameEnd } from '../utils/playUtils';

const MIN_BOT_DELAY_MS = 450;   // el bot no responde al instante, para que se note el turno
const CLOCK_TICK_MS = 200;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Controlador del modo Jugar (montado en el tablero, solo actúa con appMode === 'play' y partida en curso):
 *  - pide la jugada al bot cuando le toca y la juega,
 *  - detecta el final de la partida (mate, tablas),
 *  - hace correr los relojes (con incremento) y da la partida por perdida si se agotan.
 */
export const usePlayController = () => {
  const appMode = useGameStore(s => s.appMode);
  const fen = useGameStore(s => s.fen);
  const atEnd = useGameStore(s => s.currentMoveIndex === s.history.length - 1);
  const historyLength = useGameStore(s => s.history.length);
  // Selectores primitivos: `play` cambia con cada tick del reloj y no debe re-renderizar el tablero
  const phase = useGameStore(s => s.play.phase);
  const userColor = useGameStore(s => s.play.userColor);
  const levelId = useGameStore(s => s.play.levelId);
  const retry = useGameStore(s => s.play.retry);
  const timeControl = useGameStore(s => s.play.timeControl);

  const playing = appMode === 'play' && phase === 'playing';

  // ── Jugada del bot ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!playing || !atEnd) return;

    let game;
    try { game = new Chess(fen); } catch { return; }
    if (game.isGameOver() || game.turn() === userColor) return;

    let cancelled = false;
    const started = Date.now();
    const store = useGameStore.getState();
    store.patchPlay({ thinking: true, engineError: null });

    const level = getLevel(levelId);
    const clock = store.play.clocks[game.turn()];
    const movetime = botMoveTime(level, timeControl ? clock : null, timeControl?.inc ?? 0);

    backendService.requestEngineMove(fen, { ...strengthOf(level), movetime })
      .then(async (res) => {
        if (cancelled || !res.move) return; // sin jugada: lo resuelve la detección de fin de partida
        const wait = MIN_BOT_DELAY_MS - (Date.now() - started);
        if (wait > 0) await sleep(wait);
        if (cancelled) return;
        const uci = res.move;
        useGameStore.getState().makeMove({
          from: uci.slice(0, 2),
          to: uci.slice(2, 4),
          ...(uci.length === 5 ? { promotion: uci[4] } : {}),
        });
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('[Play] El motor no respondió:', err.message);
        useGameStore.getState().patchPlay({ engineError: 'Stockfish no responde. Revisa que el servidor esté en marcha.' });
      })
      .finally(() => { if (!cancelled) useGameStore.getState().patchPlay({ thinking: false }); });

    return () => {
      cancelled = true;
      useGameStore.getState().patchPlay({ thinking: false });
    };
    // `retry` permite reintentar tras un fallo del motor sin cambiar la posición
  }, [playing, fen, atEnd, userColor, levelId, retry, timeControl]);

  // ── Fin de partida por posición ─────────────────────────────────────────────
  useEffect(() => {
    if (!playing) return;
    const end = detectGameEnd(useGameStore.getState().game);
    if (end) useGameStore.getState().finishPlay(end);
  }, [playing, fen]);

  // ── Relojes ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!playing || !timeControl) return;
    let last = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      const elapsed = (now - last) / 1000;
      last = now;

      const s = useGameStore.getState();
      if (s.play.phase !== 'playing' || s.history.length < 1) return; // el reloj arranca con la primera jugada

      const turn = s.fen.split(' ')[1];
      const clocks = { ...s.play.clocks };
      clocks[turn] = Math.max(0, clocks[turn] - elapsed);
      s.setPlayClocks(clocks.w, clocks.b);

      if (clocks[turn] <= 0) {
        s.finishPlay({ winner: turn === 'w' ? 'b' : 'w', reason: 'timeout' });
      }
    }, CLOCK_TICK_MS);
    return () => clearInterval(id);
  }, [playing, timeControl]);

  // Incremento: quien acaba de mover recibe `inc` segundos (no se devuelve nada al deshacer)
  const prevLength = useRef(0);
  useEffect(() => {
    const previous = prevLength.current;
    prevLength.current = historyLength;
    if (!playing || !timeControl?.inc || historyLength !== previous + 1) return;

    const s = useGameStore.getState();
    const mover = s.fen.split(' ')[1] === 'w' ? 'b' : 'w'; // el turno ya cambió
    const clocks = { ...s.play.clocks };
    clocks[mover] += timeControl.inc;
    s.setPlayClocks(clocks.w, clocks.b);
  }, [playing, historyLength, timeControl]);
};
