import { useGameStore } from '../store/useGameStore';
import { backendService } from './backendService';
import { normalizeTimeControl } from '../utils/timeControl';

class AnalysisBridge {
    #abortController = null;     // análisis de partida (job)
    #liveAbortController = null; // evaluación en vivo
    isRunning = false;

    constructor() {
        backendService.addHandler((msg) => {
            if (msg.type === 'cancelled') {
                const state = useGameStore.getState();
                if (state.setCanceling) state.setCanceling(false);
                
                if (!this.isRunning) {
                    if (state.setAnalyzing) state.setAnalyzing(false);
                    if (state.isReviewRequested && state.setAnalysisReady) {
                        state.setAnalysisReady(true);
                    }
                }
            }
        });
    }

    cancel(isUserAction = true) {
        const state = useGameStore.getState();
        if (isUserAction && state.setCanceling) state.setCanceling(true);
        backendService.cancel();

        this.isRunning = false;
        if (this.#abortController) {
            this.#abortController.abort();
            this.#abortController = null;
        }
        // El `cancel` total del servidor también detiene la evaluación en vivo.
        if (this.#liveAbortController) {
            this.#liveAbortController.abort();
            this.#liveAbortController = null;
        }
    }

    async analyzeGame(history, currentIndex, callbacks = {}) {
        const storeState = useGameStore.getState();
        const { 
            onMoveResult, onProgress, onStatus, onComplete, onOpeningDetected, 
            gameId = storeState.gameId || Date.now(), 
            startFen: forcedStartFen 
        } = callbacks;

        if (!backendService.isConnected) {
            onProgress?.(0, 'Backend not connected');
            return;
        }

        const engineConfig = { ...storeState.engineConfig, lichessToken: storeState.lichessToken };
        const startFen = forcedStartFen || storeState.startFen;

        this.cancel(false);
        if (!history || history.length === 0) return;

        this.#abortController = new AbortController();
        this.isRunning = true;
        onStatus?.(true);

        const removeHandler = backendService.addHandler((msg) => {
            switch (msg.type) {
                case 'status': onStatus?.(msg.running); break;
                case 'progress': onProgress?.(msg.pct, msg.label); break;
                case 'move_result': onMoveResult?.(msg); break;
                case 'opening_detected': onOpeningDetected?.(msg); break;
                case 'complete':
                    onComplete?.(msg.accuracy, msg.accuracyByPhase, msg.win ?? null);
                    this.isRunning = false;
                    onStatus?.(false);
                    removeHandler();
                    break;
                case 'error':
                    this.isRunning = false;
                    onStatus?.(false);
                    removeHandler();
                    break;
            }
        });

        this.#abortController.signal.addEventListener('abort', () => removeHandler());

        // Extraer tiempos de los comentarios del PGN
        const times = [];
        for (let i = 0; i < history.length; i++) {
            const comment = storeState.pgnCommentsByIndex?.[i];
            if (comment) {
                // Chess.com incluye décimas: [%clk 0:04:58.7]
                const match = comment.match(/\[%clk\s+(\d+):(\d{1,2}):(\d{1,2})(?:\.(\d+))?\]/);
                if (match) {
                    const h = parseInt(match[1], 10);
                    const m = parseInt(match[2], 10);
                    const s = parseInt(match[3], 10);
                    const frac = match[4] ? parseFloat(`0.${match[4]}`) : 0;
                    times.push(h * 3600 + m * 60 + s + frac);
                    continue;
                }
            }
            times.push(null);
        }

        // Extraer metadatos si vienen de PGN Headers
        const pgnHeaders = callbacks.pgnHeaders || storeState.gameHeaders || {};
        const playerColor = callbacks.playerColor || storeState.playerColor || 'white';
        
        // Determinar si ganó el jugador (1: Win, 0: Draw, -1: Loss)
        const result = pgnHeaders.Result || '*';
        let win = 1; 
        if (result === '1/2-1/2') win = 0;
        else if (playerColor === 'white' && result === '0-1') win = -1;
        else if (playerColor === 'black' && result === '1-0') win = -1;

        // Normalizar el TimeControl del PGN a un formato corto ('1m','3m','5m','10m','15m','30m')
        const rawTc = pgnHeaders.TimeControl || storeState.clocks?.white || '';
        const timeControl = normalizeTimeControl(rawTc);

        // Extraer nombres de jugadores del PGN
        const playerWhite = pgnHeaders.White || null;
        const playerBlack = pgnHeaders.Black || null;

        // Derivar oponente según el color del jugador
        const opponent = playerColor === 'white'
            ? (playerBlack || null)
            : (playerWhite || null);

        // Extraer fecha real de la partida desde el PGN (formato YYYY.MM.DD o ISO)
        const rawDate = pgnHeaders.UTCDate || pgnHeaders.Date || null;
        const rawTime = pgnHeaders.UTCTime || null;
        let gameDate = null;
        if (rawDate && rawDate !== '????.??.??') {
            const datePart = rawDate.replace(/\./g, '-');
            gameDate = rawTime ? `${datePart}T${rawTime}` : `${datePart}T00:00:00`;
        }

        backendService.analyzeGame(history, currentIndex, gameId, engineConfig, startFen, {
            playerColor,
            win,
            timeControl,
            playerWhite,
            playerBlack,
            opponent,
            gameDate,
            times,
        });
    }

    /** Cancela solo la evaluación en vivo; no afecta a análisis de partida, lotes ni extracción. */
    cancelLive() {
        if (this.#liveAbortController) {
            this.#liveAbortController.abort();
            this.#liveAbortController = null;
            if (backendService.isConnected) backendService.cancelLive();
        }
    }

    async analyzePosition(fen, moveIndex, callbacks = {}) {
        const { onResult, onStatus } = callbacks;
        const state = useGameStore.getState();
        const engineConfig = state.engineConfig ?? {};

        // Puzzles no evalúa; Jugar solo si el usuario activó "Mostrar evaluación" (si no, sería hacer trampa)
        if ((state.appMode === 'puzzle' && !state.explorerMode)
            || (state.appMode === 'play' && !state.play.showEval)
            || !backendService.isConnected) return;

        // Reemplaza solo la consulta en vivo anterior (el servidor también lo hace en analyze_position).
        if (this.#liveAbortController) {
            this.#liveAbortController.abort();
            this.#liveAbortController = null;
        }
        onStatus?.(true);

        const removeHandler = backendService.addHandler((msg) => {
            if (msg.type === 'position_progress' || msg.type === 'position_result') {
                onResult?.(msg);
            }
            if (msg.type === 'position_result' || msg.type === 'error') {
                onStatus?.(false);
            }
        });

        const ac = new AbortController();
        this.#liveAbortController = ac;
        ac.signal.addEventListener('abort', () => removeHandler());

        backendService.analyzePosition(fen, moveIndex, {
            ...engineConfig,
            depth: engineConfig.liveDepth ?? engineConfig.depth ?? 18,
            multiPv: engineConfig.liveMultiPv ?? engineConfig.multiPv ?? 1
        });
    }

    clearCache(gameId) {
        backendService.clearCache(gameId);
    }
}

export const analysisBridge = new AnalysisBridge();
