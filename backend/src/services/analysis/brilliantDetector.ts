import { Chess } from 'chess.js';

/**
 * Detección de jugadas brillantes (!!), como chess.com: una jugada muy buena que sacrifica material.
 *
 * Una jugada es brillante cuando se cumple todo:
 *  1. Es la mejor jugada o casi (lo garantiza quien llama: solo se evalúan jugadas 'Mejor' o 'Excelente').
 *  2. Sacrifica material: deja una pieza (3 puntos o más) que el rival puede ganar capturando,
 *     aunque luego no la tome. Se comprueba de dos formas (basta una):
 *       a) búsqueda de capturas: el rival gana ≥ 3 puntos netos con la mejor secuencia de capturas
 *          (las recapturas cuentan, así que un intercambio parejo no es un sacrificio);
 *       b) variante del motor: el jugador queda ≥ 3 puntos por debajo tras 2 y tras 4 jugadas.
 *  3. No estaba ya ganando de sobra (si ya ganaba, sacrificar no tiene mérito).
 *  4. Después no está perdiendo: el sacrificio tiene compensación.
 */

export const BRILLIANT_MIN_SACRIFICE = 3;     // una pieza menor
export const BRILLIANT_MAX_WP_BEFORE = 0.85;  // desde aquí ya se considera ganada
export const BRILLIANT_MIN_WP_AFTER = 0.35;   // por debajo, el sacrificio no compensa (ligera desventaja admitida)
const PV_PLIES_SHORT = 2;
const PV_PLIES_LONG = 4;

const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };

/** Material (blancas − negras) de un FEN, con valores 1/3/3/5/9. */
export function materialBalance(fen: string): number {
    let total = 0;
    for (const ch of fen.split(' ')[0]) {
        const v = PIECE_VALUE[ch.toLowerCase()];
        if (v === undefined) continue;
        total += ch === ch.toLowerCase() ? -v : v;
    }
    return total;
}

export interface BrilliantInput {
    fenBefore: string;      // posición antes de la jugada
    fenAfter: string;       // posición después de la jugada (mueve el rival)
    pv: string | undefined; // variante principal del motor desde fenAfter, en UCI separado por espacios
    moverIsWhite: boolean;
    wpBefore: number;       // probabilidad de que ganen las blancas antes de la jugada
    wpAfter: number;        // ...y después
}

/** Pérdida de material del que mueve tras `plies` jugadas de la variante (positivo = ha perdido material). */
function deficitAfter(fenAfter: string, moves: string[], plies: number, baseline: number, moverIsWhite: boolean): number | null {
    const upTo = Math.min(plies, moves.length);
    if (upTo < PV_PLIES_SHORT) return null;
    const chess = new Chess(fenAfter);
    for (let i = 0; i < upTo; i++) {
        const uci = moves[i];
        try {
            chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
        } catch {
            return null; // variante ilegal: no se puede asegurar nada
        }
    }
    const diff = materialBalance(chess.fen());
    const moverDiff = moverIsWhite ? diff : -diff;
    return baseline - moverDiff;
}

const QS_MAX_DEPTH = 8;

/** Material (blancas − negras) desde el punto de vista de quien tiene el turno. */
function materialForSideToMove(chess: Chess): number {
    const diff = materialBalance(chess.fen());
    return chess.turn() === 'w' ? diff : -diff;
}

/**
 * Búsqueda de capturas (quiescence, negamax con poda): mejor material que puede asegurar quien tiene
 * el turno usando solo capturas, pudiendo "plantarse" en cualquier momento.
 */
function captureSearch(chess: Chess, alpha: number, beta: number, depth: number): number {
    const standPat = materialForSideToMove(chess);
    if (standPat >= beta) return beta;
    if (depth === 0) return standPat;
    let best = Math.max(alpha, standPat);
    for (const move of chess.moves({ verbose: true })) {
        if (!move.captured) continue;
        chess.move(move);
        const score = -captureSearch(chess, -beta, -best, depth - 1);
        chess.undo();
        if (score >= beta) return beta;
        if (score > best) best = score;
    }
    return best;
}

/** Material que el rival puede ganar solo con capturas desde `fenAfter`, respecto a `baseline` (perspectiva del que movió). */
function captureDeficit(fenAfter: string, baseline: number): number {
    const chess = new Chess(fenAfter);
    const opponentBest = captureSearch(chess, -Infinity, Infinity, QS_MAX_DEPTH); // material del rival (su perspectiva)
    return baseline + opponentBest;
}

/**
 * Material que el rival ya podía ganar por capturas ANTES de la jugada (como si le tocara a él).
 * Si no se puede construir esa posición (p. ej. el rey rival estaría en jaque), se asume 0.
 */
function hangingBefore(fenBefore: string, baseline: number): number {
    try {
        const parts = fenBefore.split(' ');
        parts[1] = parts[1] === 'w' ? 'b' : 'w';
        parts[3] = '-'; // sin captura al paso
        const hanging = captureDeficit(parts.join(' '), baseline);
        // Un peón en prise es ruido (casi toda posición tiene alguno): solo cuenta si ya había una pieza colgando
        return hanging >= BRILLIANT_MIN_SACRIFICE ? hanging : 0;
    } catch {
        return 0;
    }
}

export function isBrilliantMove(input: BrilliantInput): boolean {
    const { fenBefore, fenAfter, pv, moverIsWhite, wpBefore, wpAfter } = input;

    const moverBefore = moverIsWhite ? wpBefore : 1 - wpBefore;
    const moverAfter = moverIsWhite ? wpAfter : 1 - wpAfter;
    if (moverBefore >= BRILLIANT_MAX_WP_BEFORE) return false;
    if (moverAfter < BRILLIANT_MIN_WP_AFTER) return false;

    try {
        const before = materialBalance(fenBefore);
        const baseline = moverIsWhite ? before : -before;

        // a) el rival puede ganar una pieza capturando (aunque la mejor respuesta sea otra), y ese riesgo
        //    lo creó esta jugada: se descuenta lo que ya estaba en prise antes de mover
        const deficit = captureDeficit(fenAfter, baseline);
        if (deficit >= BRILLIANT_MIN_SACRIFICE && deficit - hangingBefore(fenBefore, baseline) >= BRILLIANT_MIN_SACRIFICE) return true;

        // b) la variante del motor deja al jugador una pieza abajo de forma sostenida
        const moves = (pv ?? '').trim().split(/\s+/).filter(Boolean);
        if (moves.length < PV_PLIES_SHORT) return false;
        const short = deficitAfter(fenAfter, moves, PV_PLIES_SHORT, baseline, moverIsWhite);
        const long = deficitAfter(fenAfter, moves, PV_PLIES_LONG, baseline, moverIsWhite);
        if (short === null || long === null) return false;
        return short >= BRILLIANT_MIN_SACRIFICE && long >= BRILLIANT_MIN_SACRIFICE;
    } catch {
        return false;
    }
}
