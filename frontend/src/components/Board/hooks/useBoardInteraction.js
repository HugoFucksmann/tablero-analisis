import { useState } from 'react';
import { Chess } from 'chess.js';
import { useGameStore } from '../../../store/useGameStore';

// ¿Existe una jugada legal de promoción de `from` a `to` en la posición actual?
const isLegalPromotion = (from, to) => {
    try {
        const chess = new Chess(useGameStore.getState().fen);
        return chess.moves({ square: from, verbose: true }).some(m => m.to === to && m.promotion);
    } catch {
        return false;
    }
};

export const useBoardInteraction = (makeMove) => {
    const [promotionMove, setPromotionMove] = useState(null);

    function onDrop(arg1, arg2, arg3) {
        const sourceSquare = typeof arg1 === 'object' ? arg1.sourceSquare : arg1;
        const targetSquare = typeof arg1 === 'object' ? arg1.targetSquare : arg2;
        const piece = typeof arg1 === 'object' ? arg1.piece : arg3;

        if (!targetSquare || sourceSquare === targetSquare) return false;

        const isPawn = piece ? piece[1] === 'P' : true;
        const isPromotionRank = targetSquare[1] === '8' || targetSquare[1] === '1';

        // Solo se pide la pieza de promoción si la jugada es realmente legal; si no, rebota.
        if (isPawn && isPromotionRank && isLegalPromotion(sourceSquare, targetSquare)) {
            setPromotionMove({ from: sourceSquare, to: targetSquare });
            return false;
        }

        return makeMove({ from: sourceSquare, to: targetSquare, promotion: 'q' }) !== null;
    }

    function onPromotionPieceSelect(piece) {
        if (piece && promotionMove) {
            const promPiece = piece[1].toLowerCase();
            makeMove({ ...promotionMove, promotion: promPiece });
        }
        setPromotionMove(null);
        return true;
    }

    return { onDrop, onPromotionPieceSelect, promotionMove, setPromotionMove };
};
