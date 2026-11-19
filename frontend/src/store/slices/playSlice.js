import { Chess } from 'chess.js';
import { backendService } from '../../services/backendService';
import { playChessSound } from '../../utils/soundUtils';
import { START_FEN, buildPlayPgn } from '../../utils/playUtils';
import { DEFAULT_LEVEL_ID, getLevel, getTimeControl, formatClock } from '../../utils/botLevels';

const HINT_MOVETIME_MS = 700;
const DRAW_EVAL_MOVETIME_MS = 400;
const MIN_PLIES_FOR_DRAW = 10;      // Stockfish no acepta tablas en las primeras jugadas
const DRAW_ACCEPT_MAX_LOSS_CP = 25; // acepta si no está claramente peor

const initialPlay = (startFen = null) => ({
  phase: 'setup',            // 'setup' | 'playing' | 'over'
  startFen,                  // null = posición inicial estándar
  userColor: 'w',
  levelId: DEFAULT_LEVEL_ID,
  timeControl: null,         // { base, inc } | null
  clocks: { w: null, b: null }, // segundos
  showEval: false,
  hintsAllowed: true,
  hintsUsed: 0,
  hintBusy: false,
  takebacks: 0,
  thinking: false,
  engineError: null,
  retry: 0,                  // se incrementa para reintentar tras un fallo del motor
  drawMessage: null,
  result: null,              // { winner: 'w' | 'b' | null, reason }
});

const toArrow = (uci) => ({
  startSquare: uci.slice(0, 2),
  endSquare: uci.slice(2, 4),
  color: 'rgba(250, 204, 21, 0.85)',
});

export const createPlaySlice = (set, get) => ({
  // Preferencias de la configuración (se persisten)
  playConfig: { color: 'white', levelId: DEFAULT_LEVEL_ID, timeControlId: 'none', showEval: false, hints: true },
  play: initialPlay(),

  setPlayConfig: (patch) => set((s) => ({ playConfig: { ...s.playConfig, ...patch } })),

  /** Estado limpio de configuración (al entrar o salir del modo Jugar). */
  resetPlay: (startFen = null) => set({ play: initialPlay(startFen) }),

  patchPlay: (patch) => set((s) => ({ play: { ...s.play, ...patch } })),

  /** Desde Análisis: abrir la pestaña Jugar con la posición actual del tablero. */
  openPlayFromPosition: () => {
    const fen = get().fen;
    set({ play: initialPlay(fen) });
    get().setAppMode('play');
  },

  /** Elegir la posición inicial (null = estándar) y mostrarla en el tablero. */
  setPlayStart: (fen) => {
    if (get().play.phase === 'playing') return;
    set((s) => ({ play: { ...s.play, startFen: fen } }));
    get().loadFen(fen ?? START_FEN);
  },

  setPlayClocks: (w, b) => {
    const tc = get().play.timeControl;
    set((s) => ({ play: { ...s.play, clocks: { w, b } } }));
    if (tc) get().setClocks(formatClock(w), formatClock(b));
  },

  startPlay: () => {
    const { playConfig, play, searchUsername } = get();
    if (play.phase === 'playing') return;

    const level = getLevel(playConfig.levelId);
    const tcDef = getTimeControl(playConfig.timeControlId);
    const timeControl = tcDef.base ? { base: tcDef.base, inc: tcDef.inc } : null;
    const userColor = playConfig.color === 'random'
      ? (Math.random() < 0.5 ? 'w' : 'b')
      : (playConfig.color === 'black' ? 'b' : 'w');

    // Tablero limpio en la posición elegida
    get().loadFen(play.startFen ?? START_FEN);
    get().setBoardOrientation(userColor === 'w' ? 'white' : 'black');
    get().setPlayerColor(userColor === 'w' ? 'white' : 'black');
    const userName = searchUsername || 'Tú';
    if (userColor === 'w') get().setPlayers(userName, 'Stockfish', null, level.elo);
    else get().setPlayers('Stockfish', userName, level.elo, null);
    get().setClocks(timeControl ? formatClock(timeControl.base) : null, timeControl ? formatClock(timeControl.base) : null);

    set({
      play: {
        ...initialPlay(play.startFen),
        phase: 'playing',
        userColor,
        levelId: level.id,
        timeControl,
        clocks: timeControl ? { w: timeControl.base, b: timeControl.base } : { w: null, b: null },
        showEval: playConfig.showEval,
        hintsAllowed: playConfig.hints,
      },
    });
    playChessSound('notify');
  },

  finishPlay: (result) => {
    if (get().play.phase !== 'playing') return;
    set((s) => ({ play: { ...s.play, phase: 'over', result, thinking: false, hintBusy: false, drawMessage: null }, arrows: [] }));
    playChessSound('notify');
  },

  resignPlay: () => {
    const { play } = get();
    get().finishPlay({ winner: play.userColor === 'w' ? 'b' : 'w', reason: 'resign' });
  },

  /** Deshacer: tu última jugada (y la respuesta del bot si ya la dio). */
  undoPlay: () => {
    const { play, history, fen, currentMoveIndex } = get();
    if (play.phase !== 'playing' || currentMoveIndex !== history.length - 1) return;
    const userTurn = fen.split(' ')[1] === play.userColor;
    const count = userTurn ? 2 : 1;
    const firstUserPly = (play.startFen ? new Chess(play.startFen).turn() : 'w') === play.userColor ? 0 : 1;
    if (history.length - count < firstUserPly) return;
    get().truncateHistory(count);
    set((s) => ({ play: { ...s.play, takebacks: s.play.takebacks + 1, thinking: false, drawMessage: null } }));
  },

  /** Pista: la mejor jugada del motor a máxima fuerza, dibujada como flecha. */
  requestPlayHint: async () => {
    const { play, fen } = get();
    if (play.phase !== 'playing' || !play.hintsAllowed || play.hintBusy || play.thinking) return;
    if (fen.split(' ')[1] !== play.userColor) return;
    set((s) => ({ play: { ...s.play, hintBusy: true } }));
    try {
      const res = await backendService.requestEngineMove(fen, { elo: null, skill: null, movetime: HINT_MOVETIME_MS });
      if (get().fen === fen && res.move) {
        set((s) => ({ arrows: [toArrow(res.move)], play: { ...s.play, hintsUsed: s.play.hintsUsed + 1 } }));
      }
    } catch (e) {
      console.warn('[Play] No se pudo obtener la pista:', e.message);
    } finally {
      set((s) => ({ play: { ...s.play, hintBusy: false } }));
    }
  },

  /** Ofrecer tablas: Stockfish acepta si no está mejor (y la partida no está en sus primeras jugadas). */
  offerPlayDraw: async () => {
    const { play, fen, history } = get();
    if (play.phase !== 'playing' || play.hintBusy || play.thinking) return;
    if (fen.split(' ')[1] !== play.userColor) return;
    if (history.length < MIN_PLIES_FOR_DRAW) {
      set((s) => ({ play: { ...s.play, drawMessage: 'Stockfish rechazó las tablas: es muy pronto.' } }));
      return;
    }
    set((s) => ({ play: { ...s.play, hintBusy: true, drawMessage: null } }));
    try {
      // La evaluación llega desde el punto de vista de quien mueve (el usuario)
      const res = await backendService.requestEngineMove(fen, { elo: null, skill: null, movetime: DRAW_EVAL_MOVETIME_MS });
      const userBetterOrEqual = res.mate !== null && res.mate !== undefined
        ? res.mate > 0
        : res.score >= -DRAW_ACCEPT_MAX_LOSS_CP;
      if (get().fen !== fen) return;
      if (userBetterOrEqual) {
        get().finishPlay({ winner: null, reason: 'agreement' });
      } else {
        set((s) => ({ play: { ...s.play, drawMessage: 'Stockfish rechazó las tablas: cree que está mejor.' } }));
      }
    } catch (e) {
      console.warn('[Play] No se pudo evaluar la oferta de tablas:', e.message);
    } finally {
      set((s) => ({ play: { ...s.play, hintBusy: false } }));
    }
  },

  /** Revancha: mismos ajustes con los colores cambiados. */
  rematchPlay: () => {
    const { play } = get();
    get().setPlayConfig({ color: play.userColor === 'w' ? 'black' : 'white' });
    set((s) => ({ play: { ...s.play, phase: 'setup' } }));
    get().startPlay();
  },

  /** Volver a la configuración (misma posición inicial). */
  newPlayGame: () => {
    const { play } = get();
    set({ play: initialPlay(play.startFen) });
    get().loadFen(play.startFen ?? START_FEN);
  },

  /** Pasa la partida jugada al análisis, la carga y lanza el análisis completo. */
  analyzePlayedGame: () => {
    const { play, history, searchUsername } = get();
    if (!history.length) return;
    const level = getLevel(play.levelId);
    const userName = searchUsername || 'Tú';
    const pgn = buildPlayPgn({
      history,
      startFen: play.startFen,
      userColor: play.userColor,
      userName,
      botLabel: `Stockfish (${level.label})`,
      botElo: level.elo,
      result: play.result ?? { winner: null, reason: 'agreement' },
      timeControl: play.timeControl,
    });
    const userColor = play.userColor === 'w' ? 'white' : 'black';

    get().setAppMode('analysis'); // restaura el tablero previo y limpia el modo Jugar
    if (get().loadPgn(pgn)) {
      get().setPlayerColor(userColor);
      get().setBoardOrientation(userColor);
      get().startFullAnalysis();
    }
  },
});

