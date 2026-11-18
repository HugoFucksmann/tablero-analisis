import { analysisBridge } from '../../services/analysisBridge';

// Estado de la partida/análisis que el modo Puzzles pisa (tablero, historial, evaluaciones…).
// Se guarda al entrar a Puzzles y se restaura al salir, para que Análisis y Explorador
// vuelvan exactamente a donde estaban en vez de quedar con el tablero del puzzle.
const SNAPSHOT_KEYS = [
  // partida
  'game', 'fen', 'history', 'currentMoveIndex', 'gameHeaders', 'pgnCommentsByIndex', 'arrows',
  'highlights', 'isExploreMode', 'mainLineData', 'hasPgnEvaluations', 'isReviewRequested',
  'startFen', 'explorerData', 'mastersData', 'gameId',
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
  boardOrientation: 'white',
  playerColor: 'white',
  gameId: 0,

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
  // Foto del estado previo a entrar en Puzzles (null fuera de ese modo).
  preGameSnapshot: null,

  setAppMode: (mode) => {
    const { appMode: prev, preGameSnapshot } = get();
    if (prev === mode) return;

    if (mode === 'puzzle') {
      // Entrar a Puzzles: guardar la partida actual antes de que el reproductor la reemplace.
      set({ preGameSnapshot: pickState(get()), appMode: mode, explorerMode: false });
      return;
    }

    if (prev === 'puzzle') {
      // Salir de Puzzles: descartar el tablero del puzzle y recuperar la partida anterior.
      analysisBridge.cancel();
      set({
        ...(preGameSnapshot ?? {}),
        isAnalyzing: false,
        puzzleState: null,
        preGameSnapshot: null,
        appMode: mode,
        explorerMode: mode === 'explorer',
      });
      return;
    }

    set({ appMode: mode, explorerMode: mode === 'explorer' });
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