import { useEffect, useRef } from 'react';
import { useGameStore } from '../../../store/useGameStore';

const AUTOPLAY_INTERVAL_MS = 350;

// Etiquetas que detienen la reproducción automática (como la revisión de chess.com)
const STOP_FOR_PLAYER = new Set(['Imprecisión', 'Error', 'Error grave']);
const STOP_FOR_OPPONENT = new Set(['Error', 'Error grave']);

/** ¿La jugada `index` es un error que merece detener la reproducción? Tus fallos desde la imprecisión; los del rival desde el error. */
function isNotableMistake(index) {
    const { moveEvaluations, analysisReady, playerColor } = useGameStore.getState();
    if (!analysisReady) return false;
    const label = moveEvaluations?.[index];
    if (!label) return false;
    const isPlayerMove = (index % 2 === 0) === (playerColor === 'white');
    return (isPlayerMove ? STOP_FOR_PLAYER : STOP_FOR_OPPONENT).has(label);
}

const isTypingTarget = (el) => {
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
};

export const useBoardNavigation = (boardRef, currentMoveIndex, historyLength, goToMove) => {
    const scrollState = useRef({ currentMoveIndex, maxIndex: historyLength - 1 });

    useEffect(() => {
        scrollState.current = { currentMoveIndex, maxIndex: historyLength - 1 };
    }, [currentMoveIndex, historyLength]);

    useEffect(() => {
        const el = boardRef.current;
        if (!el) return;

        let lastScrollTime = 0;

        const handleWheel = (e) => {
            const now = performance.now();
            if (now - lastScrollTime < 60) return;

            const { currentMoveIndex: currentIdx, maxIndex } = scrollState.current;

            if (e.deltaY > 0) {
                if (currentIdx < maxIndex) {
                    goToMove(currentIdx + 1);
                    lastScrollTime = now;
                }
            }
            else if (e.deltaY < 0) {
                if (currentIdx > -1) {
                    goToMove(currentIdx - 1);
                    lastScrollTime = now;
                }
            }
        };

        el.addEventListener('wheel', handleWheel, { passive: true });
        return () => el.removeEventListener('wheel', handleWheel);
    }, [goToMove, boardRef]);

    // ── Atajos de teclado globales ───────────────────────────────────
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
            const { currentMoveIndex: idx, maxIndex } = scrollState.current;
            const store = useGameStore.getState();

            switch (e.key) {
                case 'ArrowLeft':
                    if (idx > -1) goToMove(idx - 1);
                    break;
                case 'ArrowRight':
                    if (idx < maxIndex) goToMove(idx + 1);
                    break;
                case 'Home':
                    goToMove(-1);
                    break;
                case 'End':
                    goToMove(maxIndex);
                    break;
                case 'f':
                case 'F':
                    store.setBoardOrientation(store.boardOrientation === 'white' ? 'black' : 'white');
                    break;
                case ' ':
                    // No robar Espacio a botones/enlaces enfocados
                    if (e.target?.closest?.('button, a, [role="button"]')) return;
                    if (store.appMode === 'puzzle' || store.appMode === 'play') return;
                    store.setAutoPlaying(!store.isAutoPlaying);
                    break;
                default:
                    return;
            }
            e.preventDefault();
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [goToMove]);

    // ── Reproducción automática ──────────────────────────────────────
    const isAutoPlaying = useGameStore(state => state.isAutoPlaying);
    useEffect(() => {
        if (!isAutoPlaying) return;
        const timer = setInterval(() => {
            const { currentMoveIndex: idx, maxIndex } = scrollState.current;
            if (idx >= maxIndex) {
                useGameStore.getState().setAutoPlaying(false);
                return;
            }
            goToMove(idx + 1);
            // Se detiene en el error: pulsar play de nuevo continúa con la siguiente jugada
            if (isNotableMistake(idx + 1)) useGameStore.getState().setAutoPlaying(false);
        }, AUTOPLAY_INTERVAL_MS);
        return () => clearInterval(timer);
    }, [isAutoPlaying, goToMove]);

    // Detener al desmontar el tablero
    useEffect(() => () => useGameStore.getState().setAutoPlaying(false), []);
};
