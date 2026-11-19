import { useEffect, useState } from 'react';
import { useGameStore } from '../store/useGameStore';
import { analysisBridge } from '../services/analysisBridge';
import { backendService } from '../services/backendService';

export const useLiveEvaluation = () => {
    const fen = useGameStore(state => state.fen);
    const currentMoveIndex = useGameStore(state => state.currentMoveIndex);

    const setAnalyzing = useGameStore(state => state.setAnalyzing);
    const setEvaluation = useGameStore(state => state.setEvaluation);
    const setBestMoveForIndex = useGameStore(state => state.setBestMoveForIndex);
    const setAlternativeLinesForIndex = useGameStore(state => state.setAlternativeLinesForIndex);
    const appMode = useGameStore(state => state.appMode);
    const isBatchRunning = useGameStore(state => !!state.batchStatus || !!state.extractionStatus);
    const playShowEval = useGameStore(state => state.play.showEval);
    
    const [isConnected, setIsConnected] = useState(backendService.isConnected);

    useEffect(() => {
        const removeHandler = backendService.addHandler((msg) => {
            if (msg.type === 'connection_status') {
                setIsConnected(msg.connected);
            }
        });
        return removeHandler;
    }, []);

    useEffect(() => {
        const state = useGameStore.getState();

        // Evitar interrumpir un análisis de partida completa en curso
        const isFullGameAnalysisRunning = state.isReviewRequested && !state.analysisReady;

        // Pausar mientras corre un lote (evita contención de CPU)
        if (currentMoveIndex < -1 || isFullGameAnalysisRunning || isBatchRunning) return;

        // Posición ya evaluada por el análisis completo: no relanzar Stockfish
        if (state.analysisReady && state.evaluationHistory[currentMoveIndex]?.score !== undefined
            && state.alternativeLines?.[currentMoveIndex]?.length) {
            return;
        }

        let isActive = true;

        analysisBridge.analyzePosition(fen, currentMoveIndex, {
            onStatus: setAnalyzing,
            onResult: (result) => {
                if (!isActive) return;
                
                useGameStore.setState((state) => {
                    const updates = {};
                    if (result.score !== undefined) {
                        const normalized = { score: result.score, mate: result.mate };
                        updates.evaluationHistory = {
                            ...state.evaluationHistory,
                            [result.moveIndex]: { moveIndex: result.moveIndex, ...normalized }
                        };
                        if (result.moveIndex === state.currentMoveIndex) {
                            updates.evaluation = normalized;
                        }
                    }
                    if (result.bestMove) {
                        updates.bestMoves = {
                            ...state.bestMoves,
                            [result.moveIndex]: result.bestMove
                        };
                    }
                    if (result.lines?.length) {
                        updates.alternativeLines = {
                            ...state.alternativeLines,
                            [result.moveIndex]: result.lines
                        };
                    }
                    return updates;
                });
            },
        });

        return () => {
            isActive = false;
            analysisBridge.cancelLive();
        };
    }, [fen, currentMoveIndex, setEvaluation, setBestMoveForIndex, setAlternativeLinesForIndex, setAnalyzing, appMode, isConnected, isBatchRunning, playShowEval]);
};
