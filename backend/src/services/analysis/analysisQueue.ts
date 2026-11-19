import { StockfishProcess, type PlayStrength } from '../../core/stockfishProcess.js';
import { ChessMath } from '../../utils/chessMath.js';
import { mapLines, parsePgn } from '../../utils/analysisUtils.js';
import { GameAnalysisCoordinator } from './gameAnalysisCoordinator.js';
import { EnginePool } from './enginePool.js';

export interface LiveAnalysisCallbacks {
    onProgress?: (data: { score: number; mate: number | null; bestMove: string; moveIndex: number; lines: any[] }) => void;
    onResult?: (data: { score: number; mate: number | null; bestMove: string; moveIndex: number; lines: any[] }) => void;
    onError?: (err: any) => void;
}

export interface GameAnalysisCallbacks {
    onStatus?: (running: boolean) => void;
    onProgress?: (pct: number, label: string) => void;
    onMoveResult?: (data: any) => void;
    onOpeningDetected?: (data: any) => void;
    onComplete?: (accuracy: any, accuracyByPhase?: any, win?: number | null) => void;
    onCancelled?: () => void;
    onError?: (err: any) => void;
}

export interface BatchAnalysisCallbacks {
    onGameStarted?: (data: { gameIndex: number; total: number; gameId: string }) => void;
    onGameProgress?: (data: { gameIndex: number; pct: number; label: string }) => void;
    onGameComplete?: (data: { gameIndex: number; accuracy: any }) => void;
    onBatchComplete?: (data: { total: number }) => void;
    onCancelled?: () => void;
    onError?: (err: any) => void;
    onMoveResult?: (data: any) => void;
    onOpeningDetected?: (data: any) => void;
}

/** Jugada del motor (UCI, '' si no hay) y su evaluación desde el punto de vista de quien mueve. */
export interface PlayMoveResult {
    move: string;
    score: number;
    mate: number | null;
}

export class AnalysisQueue {
    private _sf: StockfishProcess;
    // Controladores independientes: una consulta en vivo (el usuario mueve el tablero) no debe
    // abortar un análisis de partida o un lote en curso, y viceversa.
    private _liveAc: AbortController | null;
    private _jobAc: AbortController | null;
    private _liveRunning: boolean;
    private _jobRunning: boolean;
    private _gameCoordinator: GameAnalysisCoordinator;
    // Motor independiente para jugar contra el usuario: su fuerza limitada no debe afectar a la evaluación en vivo.
    private _playSf: StockfishProcess | null = null;
    private _playAc: AbortController | null = null;

    constructor() {
        this._sf = new StockfishProcess();
        this._liveAc = null;
        this._jobAc = null;
        this._liveRunning = false;
        this._jobRunning = false;
        this._gameCoordinator = new GameAnalysisCoordinator();
    }

    public get running(): boolean {
        return this._liveRunning || this._jobRunning;
    }

    /** Cancela solo la evaluación en vivo (mensaje `cancel_live` del cliente). */
    public cancelLive(): void {
        this._cancelLive();
    }

    /** Cancela solo la evaluación en vivo. */
    private _cancelLive(): void {
        this._liveRunning = false;
        if (this._liveAc) {
            this._liveAc.abort();
            this._liveAc = null;
        }
        this._sf.stop();
    }

    /** Cancela solo el análisis de partida / lote. */
    private _cancelJob(): void {
        this._jobRunning = false;
        if (this._jobAc) {
            console.log('[Engine] Cancelling current analysis');
            this._jobAc.abort();
            this._jobAc = null;
        }
    }

    /** Cancelación total (mensaje `cancel` del cliente o cierre de la conexión). */
    public cancel(): void {
        this._cancelJob();
        this._cancelLive();
        this.cancelPlay();
    }

    public destroy(): void {
        console.log('[Engine] Destroying session Stockfish instance');
        this.cancel();
        this._playAc?.abort();
        this._playAc = null;
        this._playSf?.destroy();
        this._playSf = null;
        this._sf.destroy();
    }

    /**
     * Calcula la respuesta del motor a una posición con fuerza limitada (modo práctica).
     * Devuelve la jugada en UCI, o '' si no hay jugadas (fin de partida).
     */
    public async playMove(
        fen: string,
        options: PlayStrength & { movetimeMs?: number } = {},
        config: any = {}
    ): Promise<PlayMoveResult> {
        this._playAc?.abort();
        const ac = new AbortController();
        this._playAc = ac;

        if (!this._playSf) this._playSf = new StockfishProcess();
        const sf = this._playSf;

        try {
            await sf.init({ threads: 1, hash: 64, multiPv: 1, ...(config?.threads ? { threads: Math.min(config.threads, 2) } : {}) });
            await sf.setStrength({ elo: options.elo ?? null, skill: options.skill ?? null });
            if (ac.signal.aborted) return { move: '', score: 0, mate: null };
            const movetime = Math.min(10_000, Math.max(100, Math.floor(options.movetimeMs ?? 1000)));
            const result = await sf.analyzePosition(fen, 30, ac.signal, null, 1, movetime);
            if (ac.signal.aborted) return { move: '', score: 0, mate: null };
            // score/mate son desde el punto de vista de quien mueve en `fen`
            return { move: result.bestMove, score: result.score, mate: result.mate };
        } finally {
            if (this._playAc === ac) this._playAc = null;
        }
    }

    /** Cancela una búsqueda del modo práctica en curso. */
    public cancelPlay(): void {
        this._playAc?.abort();
        this._playAc = null;
        this._playSf?.stop();
    }

    /**
     * Analyzes a single position (Live mode).
     */
    public async analyzePosition(
        fen: string,
        moveIndex: number,
        config: any = {},
        callbacks: LiveAnalysisCallbacks = {}
    ): Promise<void> {
        const { onProgress, onResult, onError } = callbacks;

        this._cancelLive();

        try {
            await (this._sf as any)._initPromise;
        } catch {
            /* ignore — we'll re-init below */
        }

        const ac = new AbortController();
        this._liveAc = ac;
        const { signal } = ac;
        this._liveRunning = true;

        const depth = config.depth ?? 18;
        const multiPv = config.multiPv ?? 3;

        try {
            await this._sf.init(config);
            if (signal.aborted) return;

            const isBlackTurn = fen.includes(' b ');

            const result = await this._sf.analyzePosition(
                fen,
                depth,
                signal,
                ({ score, mate, bestMove, lines }) => {
                    onProgress?.({
                        score: ChessMath.cpToVisualScore(score, mate, isBlackTurn),
                        mate,
                        bestMove,
                        moveIndex,
                        lines: mapLines(lines, isBlackTurn),
                    });
                },
                multiPv,
            );

            if (!signal.aborted) {
                const visualScore = ChessMath.cpToVisualScore(result.score, result.mate, isBlackTurn);
                console.log(`[Live] Position analyzed | Score: ${visualScore}`);

                onResult?.({
                    score: visualScore,
                    mate: result.mate,
                    bestMove: result.bestMove,
                    moveIndex,
                    lines: mapLines(result.lines, isBlackTurn),
                });
            }
        } catch (e: any) {
            if (e.name !== 'AbortError') {
                onError?.(e);
            }
        } finally {
            // Solo limpiar si seguimos siendo la consulta vigente (otra pudo reemplazarnos).
            if (this._liveAc === ac) {
                this._liveAc = null;
                this._liveRunning = false;
            }
        }
    }

    /**
     * Analyzes a full game history.
     */
    public async analyzeGame(
        history: any[],
        currentIndex: number,
        gameId: string,
        engineConfig: any = {},
        callbacks: GameAnalysisCallbacks = {},
        startFen: string | null = null,
        extraInfo: any = {}
    ): Promise<void> {
        this._cancelJob();
        this._cancelLive(); // el análisis completo usa todos los núcleos: liberar el motor en vivo
        if (!history || history.length === 0) return;

        this._gameCoordinator = new GameAnalysisCoordinator();

        const ac = new AbortController();
        this._jobAc = ac;
        const { signal } = ac;
        this._jobRunning = true;

        try {
            await this._gameCoordinator.run(
                history,
                currentIndex,
                gameId,
                engineConfig,
                {
                    ...callbacks,
                    signal,
                    startFen
                },
                extraInfo
            );
            
            if (signal.aborted) {
                console.log('[Game] Analysis cancelled — notifying client');
                callbacks.onCancelled?.();
            }
        } catch (e: any) {
            if (e.name !== 'AbortError') {
                callbacks.onError?.(e);
            } else {
                console.log('[Game] Analysis cancelled (AbortError) — notifying client');
                callbacks.onCancelled?.();
            }
        } finally {
            if (this._jobAc === ac) {
                this._jobAc = null;
                this._jobRunning = false;
            }
        }
    }

    /**
     * Analyzes multiple games sequentially.
     */
    public async analyzeGames(
        games: any[],
        engineConfig: any = {},
        callbacks: BatchAnalysisCallbacks = {}
    ): Promise<void> {
        const { onGameStarted, onGameProgress, onGameComplete, onBatchComplete, onCancelled, onError } = callbacks;

        // Solo se reemplaza el trabajo anterior: mover el tablero (análisis en vivo) no interrumpe el lote.
        this._cancelJob();
        if (!Array.isArray(games) || games.length === 0) return;

        // Sin partidas repetidas en la misma tanda.
        const seen = new Set<string>();
        games = games.filter((g) => {
            const id = String(g?.gameId);
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
        });

        const ac = new AbortController();
        this._jobAc = ac;
        const { signal } = ac;
        this._jobRunning = true;

        console.log(`[Batch] Starting batch analysis of ${games.length} games`);

        const pool = new EnginePool(engineConfig);

        try {
            await pool.init();
            const batchEngines = pool.engines;
            console.log(`[Batch] Engine pool ready: ${pool.count} engine(s)`);

            for (let i = 0; i < games.length; i++) {
                if (signal.aborted) break;
                try {

                    const game = games[i];
                    const { history, gameId, pgn, startFen, playerColor, win, timeControl, opponent, gameDate } = game;

                    let actualHistory = history;
                    let actualStartFen = startFen;

                    if (!actualHistory && pgn) {
                        const parsed = parsePgn(pgn);
                        actualHistory = parsed.history;
                        actualStartFen = parsed.startFen;
                        game.times = parsed.times;
                        if (!game.playerWhite && parsed.headers?.White) game.playerWhite = parsed.headers.White;
                        if (!game.playerBlack && parsed.headers?.Black) game.playerBlack = parsed.headers.Black;
                    }

                    if (!actualHistory || actualHistory.length === 0) {
                        console.warn(`[Batch] Game ${i} has no history/PGN, skipping.`);
                        continue;
                    }

                    onGameStarted?.({ gameIndex: i, total: games.length, gameId });

                    this._gameCoordinator = new GameAnalysisCoordinator();

                    await this._gameCoordinator.run(
                        actualHistory,
                        0,
                        gameId,
                        engineConfig,
                        {
                            onProgress: (pct, label) => onGameProgress?.({ gameIndex: i, pct, label }),
                            onMoveResult: (data) => callbacks.onMoveResult?.({ gameIndex: i, ...data }),
                            onOpeningDetected: (data) => callbacks.onOpeningDetected?.({ gameIndex: i, ...data }),
                            onComplete: (accuracy) => onGameComplete?.({ gameIndex: i, accuracy }),
                            signal,
                            startFen: actualStartFen
                        },
                        {
                            playerColor,
                            win,
                            timeControl,
                            times: game.times,
                            username: game.username,
                            playerWhite: game.playerWhite || null,
                            playerBlack: game.playerBlack || null,
                            opponent: opponent || game.opponent || null,
                            gameDate: gameDate || game.gameDate || null
                        },
                        batchEngines
                    );

                    if (signal.aborted) break;
                } catch (e: any) {
                    if (e?.name === 'AbortError' || signal.aborted) break;
                    // Una partida defectuosa (PGN inválido, error del motor) no debe tirar el lote entero.
                    console.error(`[Batch] Game ${i} (${games[i]?.gameId}) failed, continuing:`, e?.message);
                }
            }

            if (signal.aborted) {
                onCancelled?.();
            } else {
                onBatchComplete?.({ total: games.length });
            }
        } catch (e: any) {
            if (e.name !== 'AbortError') {
                onError?.(e);
            } else {
                onCancelled?.();
            }
        } finally {
            pool.destroy();
            console.log('[Batch] Engine pool destroyed');
            if (this._jobAc === ac) {
                this._jobAc = null;
                this._jobRunning = false;
            }
        }
    }
}
export default AnalysisQueue;
