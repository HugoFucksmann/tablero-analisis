import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Chess } from 'chess.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATA_DIR   = join(__dirname, '..', '..', '..', 'data');
const TSV_FILES  = ['a.tsv', 'b.tsv', 'c.tsv', 'd.tsv', 'e.tsv'];
const MAX_BACK   = 10; // maximum plies to search backwards in findLastKnown

/**
 * Normalizes a FEN to a 4-field key, letting chess.js fix the en passant
 * square. Chess.com omits the en passant square when no capture is possible;
 * chess.js (and the TSV data) may write it differently. Round-tripping through
 * chess.js canonicalizes the field so keys always match.
 */
function normalizeFen(fen: string): string {
    try {
        const chess = new Chess(fen);
        return chess.fen().split(' ').slice(0, 4).join(' ');
    } catch {
        // Fallback: strip clock fields without normalization
        return fen.split(' ').slice(0, 4).join(' ');
    }
}

/** Clave de 4 campos a partir de un FEN ya canónico (generado por chess.js). */
function keyFromFen(fen: string): string {
    const parts = fen.split(' ');
    return `${parts[0]} ${parts[1]} ${parts[2]} ${parts[3]}`;
}

/** "1. e4 e5 2. Nf3" -> ["e4", "e5", "Nf3"] */
function pgnToSanTokens(pgn: string): string[] {
    return pgn.replace(/\d+\.(\.\.)?/g, ' ').split(/\s+/).filter(Boolean);
}

/** Extracts the root name (before the first ":") from a full opening name. */
function rootName(name: string): string {
    const idx = name.indexOf(':');
    return idx !== -1 ? name.slice(0, idx).trim() : name;
}

export interface BookOpeningInfo {
    eco: string;
    name: string;
    rootName: string;
}

export interface BookMove {
    san: string;
    uci: string;
    count: number;
}

export interface BookPositionEntry {
    eco: string;
    name: string;
    rootName: string;
    nextMoves: Map<string, BookMove>;
}

export interface LastKnownOpeningResult {
    entry: BookOpeningInfo | null;
    ply: number;
    movesBack: number;
}

class OpeningBookClass {
    private _map: Map<string, BookPositionEntry>;
    private _loaded: boolean;

    constructor() {
        this._map  = new Map();
        this._loaded = false;
    }

    // ── Initialization ────────────────────────────────────────────────────────

    /**
     * Parses all TSV files and builds the in-memory Map.
     * Must be called once before any lookups.
     * Synchronous — runs at server startup, not in the request path.
     */
    public load(): void {
        if (this._loaded) return;

        let parsedEntries = 0;

        for (const file of TSV_FILES) {
            const filePath = join(DATA_DIR, file);

            if (!fs.existsSync(filePath)) {
                console.warn(`[OpeningBook] Missing TSV file: ${filePath}`);
                continue;
            }

            const lines = fs.readFileSync(filePath, 'utf8').split('\n');

            for (const line of lines) {
                if (!line.trim() || line.startsWith('eco')) continue;

                const parts = line.split('\t');
                if (parts.length < 3) continue;

                const [eco, name, pgn] = parts;
                if (!pgn?.trim()) continue;

                try {
                    const entry: BookOpeningInfo = {
                        eco:      eco.trim(),
                        name:     name.trim(),
                        rootName: rootName(name.trim()),
                    };

                    // Una sola pasada: cada Move de chess.js ya trae el FEN previo (`before`)
                    // y posterior (`after`), ambos canónicos; no hace falta reconstruir el tablero.
                    const chess = new Chess();
                    for (const san of pgnToSanTokens(pgn)) {
                        const move = chess.move(san);
                        const fenBefore = keyFromFen(move.before);
                        const fenAfter = keyFromFen(move.after);
                        const uci = move.from + move.to + (move.promotion || '');

                        // 1. Apertura asociada a la posición resultante (las líneas más específicas pisan a las anteriores)
                        const resulting = this._map.get(fenAfter);
                        if (!resulting) {
                            this._map.set(fenAfter, { ...entry, nextMoves: new Map<string, BookMove>() });
                        } else {
                            resulting.eco = entry.eco;
                            resulting.name = entry.name;
                            resulting.rootName = entry.rootName;
                        }

                        // 2. Jugada que lleva de fenBefore a fenAfter
                        let beforeEntry = this._map.get(fenBefore);
                        if (!beforeEntry) {
                            beforeEntry = { eco: '', name: '', rootName: '', nextMoves: new Map<string, BookMove>() };
                            this._map.set(fenBefore, beforeEntry);
                        }
                        const known = beforeEntry.nextMoves.get(move.san);
                        if (known) known.count++;
                        else beforeEntry.nextMoves.set(move.san, { san: move.san, uci, count: 1 });
                    }

                    parsedEntries++;
                } catch (err) {
                    // Malformed PGN — skip silently
                }
            }
        }

        this._loaded = true;
        console.log(
            `[OpeningBook] Loaded ${this._map.size} unique positions ` +
            `from ${parsedEntries} opening lines.`
        );
    }

    // ── Queries ───────────────────────────────────────────────────────────────

    /** @returns Number of positions in the book. */
    public get size(): number {
        return this._map.size;
    }

    /**
     * Looks up a position by FEN.
     * @param fen  Full FEN or 4-field FEN key
     */
    private _find(fen: string): BookPositionEntry | undefined {
        // Camino rápido: la mayoría de los FEN ya son canónicos y evitan instanciar Chess.
        return this._map.get(keyFromFen(fen)) ?? this._map.get(normalizeFen(fen));
    }

    public lookup(fen: string): BookOpeningInfo | null {
        const data = this._find(fen);
        if (!data) return null;
        return { eco: data.eco, name: data.name, rootName: data.rootName };
    }

    /**
     * Returns available moves from the book for a given FEN.
     */
    public getMoves(fen: string): BookMove[] {
        const data = this._find(fen);
        if (!data || !data.nextMoves) return [];
        return Array.from(data.nextMoves.values()).sort((a, b) => b.count - a.count);
    }

    /**
     * Finds the last known opening position at or before `upToPly`.
     */
    public findLastKnown(positions: string[], upToPly: number): LastKnownOpeningResult {
        const limit = Math.max(0, upToPly - MAX_BACK);

        for (let ply = upToPly; ply >= limit; ply--) {
            if (!positions[ply]) continue;
            const entry = this.lookup(positions[ply]);
            if (entry && entry.name) {
                return { entry, ply, movesBack: upToPly - ply };
            }
        }

        return { entry: null, ply: -1, movesBack: upToPly };
    }
}

/** Singleton instance — shared across the entire process. */
export const OpeningBook = new OpeningBookClass();
export default OpeningBook;
