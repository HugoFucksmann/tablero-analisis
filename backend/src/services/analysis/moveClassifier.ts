import { EvaluationEngine } from './evaluationRules.js';
import { MAX_BOOK_PLY } from '../openings/openingService.js';
import { Move } from 'chess.js';
import { EvaluationResult } from '../../utils/analysisUtils.js';
import { isBrilliantMove } from './brilliantDetector.js';

export interface ClassifyInput {
    ply: number;
    history: (string | Move)[];
    positions: string[];
    evalResults: (EvaluationResult | undefined)[];
    bookStatus: (boolean | null)[];
    openingDone: boolean;
    moveTime?: number | null;
    remainingTime?: number | null;
}

export interface ClassifiedMove {
    index: number;
    label: string;
    isBook: boolean;
    wpLoss: number;
    isWhiteMove: boolean;
    moveTime?: number | null;
    remainingTime?: number | null;
    errorTimeClass: 'time_pressure' | 'precipitation' | 'overthinking' | null;
}

export class MoveClassifier {
    public static classify({
        ply,
        history,
        positions,
        evalResults,
        bookStatus,
        openingDone,
        moveTime,
        remainingTime
    }: ClassifyInput): ClassifiedMove | null {
        if (ply < 0 || ply >= history.length) return null;

        const before = evalResults[ply];
        const after = evalResults[ply + 1];
        if (!before || !after) return null;

        const openingResolved = bookStatus[ply] !== null || openingDone || ply >= MAX_BOOK_PLY;
        if (!openingResolved) return null;

        const isWhiteMove = !positions[ply].includes(' b ');
        const movePlayed = history[ply];
        const lan = typeof movePlayed === 'string' ? movePlayed : (movePlayed.lan ?? movePlayed.san);
        
        const isEngineBest = before.bestMove === lan;
        const isBook = bookStatus[ply] === true;

        // `label` conserva siempre la etiqueta ajedrecística; la dimensión temporal
        // vive solo en `errorTimeClass`.
        let label: string = isBook
            ? 'Libro'
            : EvaluationEngine.classifyMove(before.wp, after.wp, isWhiteMove, isEngineBest);

        // Sacrificio con compensación: mejor/excelente jugada que entrega material → Brillante (!!)
        if ((label === 'Mejor' || label === 'Excelente') && isBrilliantMove({
            fenBefore: positions[ply],
            fenAfter: positions[ply + 1],
            pv: after.lines?.[0]?.pv,
            moverIsWhite: isWhiteMove,
            wpBefore: before.wp,
            wpAfter: after.wp,
        })) {
            label = 'Brillante';
        }

        // Lógica de clasificación extendida por tiempo
        let errorTimeClass: 'time_pressure' | 'precipitation' | 'overthinking' | null = null;
        const isBlunder = label === 'Error' || label === 'Error grave' || label === 'Imprecisión';
        if (isBlunder) {
            if (remainingTime !== undefined && remainingTime !== null && remainingTime < 40) {
                errorTimeClass = 'time_pressure';
            } else if (moveTime !== undefined && moveTime !== null && moveTime < 3) {
                errorTimeClass = 'precipitation';
            } else if (moveTime !== undefined && moveTime !== null && moveTime > 30) {
                errorTimeClass = 'overthinking';
            }
        }

        let wpLoss = isWhiteMove ? (before.wp - after.wp) : (after.wp - before.wp);
        if (isEngineBest || wpLoss < 0) wpLoss = 0;

        return {
            index: ply,
            label,
            isBook,
            wpLoss,
            isWhiteMove,
            moveTime,
            remainingTime,
            errorTimeClass
        };
    }
}
