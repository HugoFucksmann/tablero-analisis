import { cpus } from 'os';
import { EngineProcess, EngineState } from './engineProcess.js';
import { parseInfoLine, parseBestmoveLine } from './uciParser.js';

const HANDSHAKE_TIMEOUT_MS = 15_000;
const DEFAULT_MOVETIME_MS = 30_000;
// `go ... movetime N` acota la búsqueda; si pasado ese tiempo + margen no llega `bestmove`, se fuerza el cierre.
const SEARCH_WATCHDOG_MARGIN_MS = 10_000;

/** Fuerza del motor al jugar contra el usuario: por Elo, por Skill Level (más débil) o sin límite. */
export interface PlayStrength {
    elo?: number | null;
    skill?: number | null;
}

export interface StockfishConfig {
    threads: number;
    hash: number;
    multiPv: number;
    depth: number;
}

export const DEFAULT_CONFIG: StockfishConfig = {
    threads: Math.max(1, cpus().length - 1),
    hash: 128,
    multiPv: 1,
    depth: 18,
};

export interface AnalysisProgressLine {
    multipv: number;
    score: number;
    mate: number | null;
    pv: string;
    move: string;
    depth: number;
}

export interface AnalysisProgress {
    depth: number;
    score: number;
    mate: number | null;
    bestMove: string;
    lines: AnalysisProgressLine[];
}

export interface AnalysisResult {
    score: number;
    mate: number | null;
    bestMove: string;
    pv: string;
    lines: AnalysisProgressLine[];
}

export class StockfishProcess {
    private _engine: EngineProcess;
    private _config: StockfishConfig;
    private _initPromise: Promise<void> | null;
    private _idlePromise: Promise<void>;
    private _idleResolve: (() => void) | null;
    private _activeMultiPv: number;
    // Tras destroy() el motor no puede volver a lanzarse: una petición en vuelo que se reanude después
    // (p. ej. al cerrarse la conexión durante el arranque) dejaría un proceso Stockfish huérfano.
    private _destroyed = false;

    constructor() {
        this._engine = new EngineProcess();
        this._config = { ...DEFAULT_CONFIG };
        this._initPromise = null;
        this._idlePromise = Promise.resolve();
        this._idleResolve = null;
        this._activeMultiPv = DEFAULT_CONFIG.multiPv;
        this._engine.onDied = () => this._onEngineDied();
    }

    public async init(config: Partial<StockfishConfig> = {}): Promise<void> {
        if (this._destroyed) throw new DOMException('Engine destroyed', 'AbortError');
        const merged = { ...this._config, ...config };
        // La configuración viene del cliente: acotarla a valores seguros.
        const clamp = (v: unknown, min: number, max: number, fallback: number) =>
            typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : fallback;
        merged.hash = clamp(merged.hash, 16, 1024, DEFAULT_CONFIG.hash);
        merged.threads = clamp(merged.threads, 1, Math.max(1, cpus().length), DEFAULT_CONFIG.threads);
        merged.multiPv = clamp(merged.multiPv, 1, 10, DEFAULT_CONFIG.multiPv);

        if (this._engine.state === EngineState.IDLE) {
            const prev = this._config;
            if (JSON.stringify(merged) !== JSON.stringify(prev)) {
                if (merged.threads !== prev.threads) {
                    console.log(`[Engine] Updating Threads: ${prev.threads} -> ${merged.threads}`);
                    this._engine.send(`setoption name Threads value ${merged.threads}`);
                }
                if (merged.hash !== prev.hash) {
                    console.log(`[Engine] Updating Hash: ${prev.hash}MB -> ${merged.hash}MB`);
                    this._engine.send(`setoption name Hash value ${merged.hash}`);
                }
                if (merged.multiPv !== prev.multiPv) {
                    console.log(`[Engine] Updating MultiPV: ${prev.multiPv} -> ${merged.multiPv}`);
                    this._engine.send(`setoption name MultiPV value ${merged.multiPv}`);
                }
                this._config = merged;
            }
            return this._initPromise || Promise.resolve();
        }

        if (this._initPromise) return this._initPromise;

        this._config = merged;
        this._initPromise = this._spawnAndHandshake();
        return this._initPromise;
    }

    public newGame(): void {
        if (this._engine.state === EngineState.IDLE) {
            this._engine.send('ucinewgame');
        }
    }

    public async analyzePosition(
        fen: string,
        depth: number,
        signal: AbortSignal | null = null,
        onProgress: ((progress: AnalysisProgress) => void) | null = null,
        multiPv: number | null = null,
        movetimeMs: number = DEFAULT_MOVETIME_MS
    ): Promise<AnalysisResult> {
        if (!fen || typeof fen !== 'string') throw new Error('Invalid FEN');
        // Basic UCI injection prevention
        if (!/^[rnbqkpRNBQKP1-8\/\s\-wbea-h0-9]+$/.test(fen)) {
            throw new Error('Malformed FEN string');
        }

        if (this._destroyed) throw new DOMException('Engine destroyed', 'AbortError');

        if (this._engine.state === EngineState.DEAD) {
            this._initPromise = null;
            await this.init(this._config);
        } else {
            await this._initPromise;
        }

        await this._idlePromise;
        if (this._destroyed) throw new DOMException('Engine destroyed', 'AbortError');

        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        if (this._engine.state !== EngineState.IDLE) {
            throw new Error(`Unexpected engine state: ${this._engine.state}`);
        }

        const effectiveMultiPv = multiPv ?? this._config.multiPv;

        return new Promise<AnalysisResult>((resolve, reject) => {
            this._idlePromise = new Promise<void>(r => { this._idleResolve = r; });
            this._engine.state = EngineState.SEARCHING;

            const lines: Record<number, AnalysisProgressLine> = {};
            let settled = false;

            const watchdog = setTimeout(() => {
                if (settled) return;
                console.error('[Engine] Search watchdog fired — killing engine');
                this._engine.kill();
                this._onEngineDied();
                settle(new Error('Engine search timed out'), null);
            }, movetimeMs + SEARCH_WATCHDOG_MARGIN_MS);

            const settle = (err: Error | DOMException | null, result: AnalysisResult | null) => {
                if (settled) return;
                settled = true;
                clearTimeout(watchdog);
                signal?.removeEventListener('abort', onAbort);

                if (err && err.name !== 'AbortError' && this._engine.lineHandler === searchHandler) {
                    this._engine.lineHandler = null;
                    restoreOnDied();
                }

                if (err) reject(err);
                else if (result) resolve(result);
            };

            const prevOnDied = this._engine.onDied;
            const restoreOnDied = () => { this._engine.onDied = prevOnDied; };
            this._engine.onDied = () => {
                restoreOnDied();
                this._onEngineDied();
                settle(new Error('Engine died during analysis'), null);
            };

            const onAbort = () => {
                if (this._engine.state === EngineState.SEARCHING) {
                    this._engine.state = EngineState.STOPPING;
                    this._engine.send('stop');
                }
                settle(new DOMException('Aborted', 'AbortError'), null);
            };
            signal?.addEventListener('abort', onAbort);

            const searchHandler = (line: string) => {
                const bm = parseBestmoveLine(line);
                if (bm !== null) {
                    this._engine.state = EngineState.IDLE;
                    this._engine.lineHandler = null;
                    restoreOnDied();
                    if (this._idleResolve) {
                        this._idleResolve();
                        this._idleResolve = null;
                    }

                    if (!settled) {
                        const bestLine = lines[1] || { score: 0, mate: null, pv: '', move: bm.bestMove, depth: 0, multipv: 1 };
                        settle(null, {
                            score: bestLine.score,
                            mate: bestLine.mate ?? null,
                            bestMove: bm.bestMove || bestLine.move,
                            pv: bestLine.pv,
                            lines: Object.values(lines).sort((a, b) => a.multipv - b.multipv),
                        });
                    }
                    return;
                }

                if (this._engine.state === EngineState.STOPPING) return;

                const info = parseInfoLine(line);
                if (info !== null) {
                    const { multipv: idx, depth: d, score, mate, pv, move } = info;
                    if (!lines[idx]) {
                        lines[idx] = { multipv: idx, score: 0, mate: null, pv: '', move: '', depth: 0 };
                    }

                    lines[idx].depth = d;
                    lines[idx].score = score;
                    lines[idx].mate = mate;
                    lines[idx].pv = pv;
                    lines[idx].move = move;

                    if (onProgress) {
                        onProgress({
                            depth: lines[1]?.depth ?? 0,
                            score: lines[1]?.score ?? 0,
                            mate: lines[1]?.mate ?? null,
                            bestMove: lines[1]?.move ?? '',
                            lines: Object.values(lines).sort((a, b) => a.multipv - b.multipv),
                        });
                    }
                }
            };

            this._engine.lineHandler = (line: string) => {
                if (line === 'readyok') {
                    if (signal?.aborted || this._engine.state === EngineState.STOPPING) {
                        this._engine.state = EngineState.IDLE;
                        this._engine.lineHandler = null;
                        restoreOnDied();
                        if (this._idleResolve) { this._idleResolve(); this._idleResolve = null; }
                        settle(new DOMException('Aborted', 'AbortError'), null);
                        return;
                    }
                    this._engine.send(`position fen ${fen}`);
                    this._engine.send(`go depth ${depth} movetime ${movetimeMs}`);
                    this._engine.lineHandler = searchHandler;
                }
            };

            if (effectiveMultiPv !== this._activeMultiPv) {
                console.log(`[Engine] MultiPV changed: ${this._activeMultiPv} -> ${effectiveMultiPv}`);
                this._activeMultiPv = effectiveMultiPv;
                this._engine.send(`setoption name MultiPV value ${effectiveMultiPv}`);
                this._engine.send('isready');
            } else {
                if (signal?.aborted || (this._engine.state as string) === EngineState.STOPPING) {
                    this._engine.state = EngineState.IDLE;
                    this._engine.lineHandler = null;
                    restoreOnDied();
                    if (this._idleResolve) { this._idleResolve(); this._idleResolve = null; }
                    settle(new DOMException('Aborted', 'AbortError'), null);
                    return;
                }
                this._engine.lineHandler = searchHandler;
                this._engine.send(`position fen ${fen}`);
                this._engine.send(`go depth ${depth} movetime ${movetimeMs}`);
            }
        });
    }

    /**
     * Activa (elo) o desactiva (null) el modo de fuerza limitada del motor. Solo con el motor libre.
     * UCI_Elo en Stockfish admite 1320–3190.
     */
    public async setStrength(strength: PlayStrength = {}): Promise<void> {
        await this._initPromise;
        await this._idlePromise;
        if (this._engine.state !== EngineState.IDLE) return;
        const { elo = null, skill = null } = strength;
        if (typeof elo === 'number') {
            // Fuerza por Elo (1320–3190); el nivel de habilidad vuelve al máximo para que no se sumen limitaciones
            const clamped = Math.min(3190, Math.max(1320, Math.floor(elo)));
            this._engine.send('setoption name Skill Level value 20');
            this._engine.send('setoption name UCI_LimitStrength value true');
            this._engine.send(`setoption name UCI_Elo value ${clamped}`);
        } else if (typeof skill === 'number') {
            // Niveles por debajo del Elo mínimo de UCI_Elo: Skill Level 0–20
            this._engine.send('setoption name UCI_LimitStrength value false');
            this._engine.send(`setoption name Skill Level value ${Math.min(20, Math.max(0, Math.floor(skill)))}`);
        } else {
            this._engine.send('setoption name UCI_LimitStrength value false');
            this._engine.send('setoption name Skill Level value 20');
        }
    }

    public async stopAndWait(): Promise<void> {
        if (this._engine.state === EngineState.SEARCHING) {
            this._engine.state = EngineState.STOPPING;
            this._engine.send('stop');
        }
        await this._idlePromise;
    }

    public stop(): void {
        if (this._engine.state === EngineState.SEARCHING) {
            this._engine.state = EngineState.STOPPING;
            this._engine.send('stop');
        }
    }

    public destroy(): void {
        this._destroyed = true;
        this._initPromise = null;
        this._activeMultiPv = DEFAULT_CONFIG.multiPv;
        if (this._idleResolve) { this._idleResolve(); this._idleResolve = null; }
        this._idlePromise = Promise.resolve();
        this._engine.kill();
    }

    private _spawnAndHandshake(): Promise<void> {
        return new Promise<void>((resolveRaw, rejectRaw) => {
            // Si el motor no responde al handshake UCI, abortar en vez de colgar toda la cola.
            const timer = setTimeout(() => {
                this._engine.kill();
                this._onEngineDied();
                rejectRaw(new Error(`Engine UCI handshake timed out after ${HANDSHAKE_TIMEOUT_MS}ms`));
            }, HANDSHAKE_TIMEOUT_MS);
            const resolve = () => { clearTimeout(timer); resolveRaw(); };
            const reject = (e: unknown) => { clearTimeout(timer); rejectRaw(e); };

            this._engine.spawn()
                .then(() => {
                    if (this._destroyed) {
                        // Se destruyó mientras arrancaba: no dejar el proceso vivo
                        this._engine.kill();
                        reject(new DOMException('Engine destroyed', 'AbortError'));
                        return;
                    }
                    const prevOnDied = this._engine.onDied;
                    this._engine.onDied = () => {
                        this._onEngineDied();
                        reject(new Error('Engine died during UCI handshake'));
                    };

                    this._engine.lineHandler = (line: string) => {
                        if (line === 'uciok') {
                            console.log(`[Engine] Initializing with Threads: ${this._config.threads}, Hash: ${this._config.hash}MB, MultiPV: ${this._config.multiPv}`);
                            this._engine.send(`setoption name Threads value ${this._config.threads}`);
                            this._engine.send(`setoption name Hash value ${this._config.hash}`);
                            this._engine.send(`setoption name MultiPV value ${this._config.multiPv}`);
                            this._engine.send('isready');
                        }
                        if (line === 'readyok') {
                            this._engine.state = EngineState.IDLE;
                            this._engine.lineHandler = null;
                            this._engine.onDied = prevOnDied;
                            resolve();
                        }
                    };

                    this._engine.send('uci');
                })
                .catch(reject);
        });
    }

    private _onEngineDied(): void {
        this._initPromise = null;
        this._activeMultiPv = DEFAULT_CONFIG.multiPv;
        if (this._idleResolve) { this._idleResolve(); this._idleResolve = null; }
        this._idlePromise = Promise.resolve();
        this._engine.onDied = () => this._onEngineDied();
    }
}
