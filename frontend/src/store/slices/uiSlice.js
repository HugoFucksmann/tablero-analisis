import { analysisBridge } from '../../services/analysisBridge';

// Estado de la partida/análisis que el modo Puzzles pisa (tablero, historial, evaluaciones…).
// Se guarda al entrar a Puzzles y se restaura al salir, para que Análisis y Explorador
// vuelvan exactamente a donde estaban en vez de quedar con el tablero del puzzle.
const SNAPSHOT_KEYS = [
  // partida
  'game', 'fen', 'history', 'currentMoveIndex', 'gameHeaders', 'pgnCommentsByIndex', 'arrows',
  'highlights', 'isExploreMode', 'mainLineData', 'hasPgnEvaluations', 'isReviewRequested',
  'startFen', 'explorerData', 'mastersData', 'gameId', 'variations',
  // análisis
  'evaluation', 'evaluationHistory', 'moveEvaluations', 'bestMoves', 'alternativeLines',
  'errorTimeClasses', 'analysisProgress', 'analysisLabel', 'analysisReady', 'analysisRequestId',
  'accuracy', 'accuracyByPhase', 'gameResult', 'ecoCode', 'openingName', 'openingPly', 'openingDetected',
  // interfaz
  'clocks', 'players', 'playerElos', 'gamePhase', 'boardOrientation', 'playerColor',
];

const pickState = (state) => Object.fromEntries(SNAPSHOT_KEYS.map(k => [k, state[k]]));

export const createUISlice = (set, get) => ({
  clocks: { white: null, black: null },
  players: { white: 'Blancas', black: 'Negras' },
  playerElos: { white: null, black: null },
  gamePhase: 'Opening',
  showTokenInput: false,
  isAutoPlaying: false,
  boardOrientation: 'white',
  playerColor: 'white',
  gameId: 0,

  setAutoPlaying: (v) => set({ isAutoPlaying: v }),
  setShowTokenInput: (v) => set({ showTokenInput: v }),
  setGameId: (id) => set({ gameId: id }),
  setBoardOrientation: (orientation) => set({ boardOrientation: orientation }),
  setPlayerColor: (color) => set({ playerColor: color }),
  setGamePhase: (phase) => set({ gamePhase: phase }),
  setClocks: (white, black) => {
    const current = get().clocks;
    if (current.white === white && current.black === black) return;
    set({ clocks: { white, black } });
  },
  setPlayers: (white, black, whiteElo = null, blackElo = null) => set({
    players: { white, black },
    playerElos: { white: whiteElo, black: blackElo }
  }),
  
  appMode: 'analysis',
  // Foto del estado previo a entrar en un modo que usa el tablero para otra cosa (null en el resto).
  preGameSnapshot: null,

  setAppMode: (mode) => {
    const { appMode: prev } = get();
    if (prev === mode) return;

    // Puzzles y Jugar "toman prestado" el tablero: al entrar se guarda la partida/análisis en curso
    // y al salir se restaura, para que Análisis y Explorador vuelvan exactamente a donde estaban.
    const borrows = (m) => m === 'puzzle' || m === 'play';

    if (borrows(prev)) {
      const { preGameSnapshot } = get();
      analysisBridge.cancelLive();
      set({
        ...(preGameSnapshot ?? {}),
        isAnalyzing: false,
        puzzleState: null,
        preGameSnapshot: null,
        appMode: borrows(mode) ? 'analysis' : mode,
        explorerMode: mode === 'explorer',
      });
      if (prev === 'play') get().resetPlay(); // abandona la partida y vuelve a la configuración
    }

    if (borrows(mode)) {
      const startFen = mode === 'play' ? get().play.startFen : null;
      set({ preGameSnapshot: pickState(get()), appMode: mode, explorerMode: false });
      if (mode === 'play') {
        // El tablero muestra la posición elegida (la del análisis o la inicial) hasta empezar
        get().resetPlay(startFen);
        get().loadFen(startFen ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
      }
      return;
    }

    if (!borrows(prev)) set({ appMode: mode, explorerMode: mode === 'explorer' });
  },

  puzzleState: null,
  setPuzzleState: (updater) => set((state) => ({ 
    puzzleState: typeof updater === 'function' ? updater(state.puzzleState) : updater 
  })),

  explorerMode: false,
  setExplorerMode: (v) => set({ explorerMode: v }),

  selectedStatCategory: null,
  setSelectedStatCategory: (cat) => set({ selectedStatCategory: cat }),

  targetPly: null,
  setTargetPly: (ply) => set({ targetPly: ply }),
});