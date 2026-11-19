import { Chess } from 'chess.js';

const BLANK_LINE = String.fromCharCode(10, 10); // separa cabeceras y movetext en PGN

/**
 * Genera un PGN anotado a partir del historial completo de la partida.
 *
 * @param {Array}  history              - history[] del store (array de movimientos verbose)
 * @param {Object} moveEvaluations      - { moveIndex: label }
 * @param {Array}  evaluationHistory    - [{ moveIndex, score }]
 * @param {Object} engineConfig         - { depth, ... }
 * @param {Object} originalHeaders      - headers guardados al importar (White, Black, WhiteElo, etc.)
 * @param {Object} pgnCommentsByIndex   - { moveIndex: commentString } con [%clk] y otros datos originales
 * @param {Array}  variations           - variantes { prefix: SAN[], moves: SAN[], source } respecto a la principal;
 *                                        se exportan entre paréntesis tras la jugada que sustituyen
 */
export const generateAnnotatedPgn = (
    history,
    moveEvaluations,
    evaluationHistory,
    engineConfig,
    originalHeaders = {},
    pgnCommentsByIndex = {},
    variations = []
) => {
    try {
        const startFen = originalHeaders.FEN || null;
        const pgnGame = startFen ? new Chess(startFen) : new Chess();

        // Copiar encabezados originales filtrando nulos y placeholders de chess.js
        const PLACEHOLDERS = new Set(['?', '????.??.??']);
        for (const key in originalHeaders) {
            const val = originalHeaders[key];
            if (val === null || val === undefined) continue;
            if (PLACEHOLDERS.has(String(val))) continue;
            // No sobreescribir FEN si ya lo inicializamos en el constructor
            if (key === 'FEN' && startFen) continue;
            pgnGame.header(key, String(val));
        }
        if (startFen) pgnGame.header('FEN', startFen);

        if (engineConfig?.depth) {
            pgnGame.header('Annotator', `Tablero Análisis (Stockfish Profundidad ${engineConfig.depth})`);
        }

        // Reproducir todos los movimientos desde el array completo del store
        const comments = [];
        for (let i = 0; i < history.length; i++) {
            const move = history[i];
            try {
                pgnGame.move(move.san);
            } catch {
                console.warn(`pgnExport: movimiento inválido en índice ${i}: ${move.san}`);
                break;
            }

            const evalObj = evaluationHistory?.[i];
            const moveEval = moveEvaluations[i];

            // Extraer [%clk] del comentario original si existe
            const originalComment = pgnCommentsByIndex[i] ?? '';
            const clkMatch = originalComment.match(/\[%clk\s+[^\]]+\]/);
            const clkTag = clkMatch ? clkMatch[0] : '';

            let comment = '';
            // Primero el [%clk] para respetar el estándar PGN
            if (clkTag) comment += clkTag;
            if (evalObj?.score !== undefined) {
                comment += comment ? ` [%eval ${evalObj.score}]` : `[%eval ${evalObj.score}]`;
            }
            if (moveEval) {
                comment += comment ? ` ${moveEval}` : moveEval;
            }

            comments[i] = comment;
            if (comment) {
                pgnGame.setComment(comment);
            }
        }

        // Asegurar resultado al final si la partida terminó
        if (!pgnGame.header().Result) {
            if (pgnGame.isGameOver()) {
                if (pgnGame.isCheckmate()) {
                    pgnGame.header('Result', pgnGame.turn() === 'w' ? '0-1' : '1-0');
                } else {
                    pgnGame.header('Result', '1/2-1/2');
                }
            } else {
                pgnGame.header('Result', '*');
            }
        }

        if (variations.length > 0) {
            const pgn = pgnGame.pgn();
            const split = pgn.indexOf(BLANK_LINE);
            const headerBlock = split >= 0 ? pgn.slice(0, split) : '';
            const result = pgnGame.header().Result || '*';
            const movetext = buildMovetext(history.map(m => m.san), comments, variations, startFen, result);
            return headerBlock ? headerBlock + BLANK_LINE + movetext : movetext;
        }

        return pgnGame.pgn();
    } catch (e) {
        console.error('Error generating PGN:', e);
        try {
            const fallback = new Chess();
            for (const m of history) {
                try { fallback.move(m.san); } catch { break; }
            }
            return fallback.pgn();
        } catch {
            return '';
        }
    }
};

/** Numeración de jugadas ("12." / "12...") según el FEN inicial (turno y número de jugada). */
function numberingFor(startFen) {
    const parts = (startFen || '').split(' ');
    const firstIsWhite = parts[1] !== 'b';
    const startFullmove = parseInt(parts[5], 10) || 1;
    return (ply) => {
        const isWhite = firstIsWhite ? ply % 2 === 0 : ply % 2 === 1;
        const number = startFullmove + Math.floor((ply + (firstIsWhite ? 0 : 1)) / 2);
        return { isWhite, number };
    };
}

/**
 * Movetext con variantes entre paréntesis. chess.js no sabe escribir variantes, así que se arma a mano:
 * una variante con prefijo de longitud p sustituye a la jugada p de la principal y se escribe tras ella.
 */
function buildMovetext(mainSans, comments, variations, startFen, result) {
    const at = numberingFor(startFen);
    const byPly = new Map();
    for (const v of variations) {
        if (!v.moves?.length) continue;
        const ply = v.prefix.length;
        if (!byPly.has(ply)) byPly.set(ply, []);
        byPly.get(ply).push(v);
    }

    const token = (ply, san, forceNumber) => {
        const { isWhite, number } = at(ply);
        if (isWhite) return `${number}. ${san}`;
        return forceNumber ? `${number}... ${san}` : san;
    };

    const out = [];
    let needNumber = true; // la primera jugada, o la que sigue a una variante, lleva número aunque sea de negras
    mainSans.forEach((san, i) => {
        out.push(token(i, san, needNumber));
        needNumber = false;
        if (comments[i]) out.push(`{${comments[i]}}`);

        for (const v of byPly.get(i) ?? []) {
            const inner = v.moves.map((s, k) => token(i + k, s, k === 0));
            if (v.source === 'engine') inner.splice(1, 0, '{Stockfish}');
            out.push(`(${inner.join(' ')})`);
            needNumber = true;
        }
    });

    // Variantes que parten justo después de la última jugada de la principal
    for (const v of byPly.get(mainSans.length) ?? []) {
        const inner = v.moves.map((s, k) => token(mainSans.length + k, s, k === 0));
        if (v.source === 'engine') inner.splice(1, 0, '{Stockfish}');
        out.push(`(${inner.join(' ')})`);
    }

    out.push(result);
    return out.join(' ');
}

export const downloadPgn = (pgnString, filename = 'analisis_partida.pgn') => {
    const blob = new Blob([pgnString], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};
