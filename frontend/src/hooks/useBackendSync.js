import { useEffect, useRef } from 'react';
import { useGameStore } from '../store/useGameStore';
import { backendService } from '../services/backendService';

export const useBackendSync = () => {
  const gameId = useGameStore(state => state.gameId);

  useEffect(() => {
    const cleanup = backendService.addHandler((msg) => {
      const {
        applyFullAnalysis, setAnalyses, setAnalysedGameIds, setBatchStatus, setPuzzleGameIds, setExtractionStatus,
      } = useGameStore.getState();

      if (msg.type === 'connection_status' && msg.connected) {
        backendService.getAnalyses(0, 50);
        backendService.getAnalysedIds();
        backendService.getPuzzleGameIds();
      }
      // Estado del lote en el store: la evaluación en vivo se pausa mientras corre
      switch (msg.type) {
        case 'batch_analysis_started':
          setBatchStatus({ current: 0, total: msg.total, pct: 0, label: 'Iniciando…' });
          break;
        case 'batch_analysis_progress':
          setBatchStatus({ ...useGameStore.getState().batchStatus, current: msg.gameIndex, pct: msg.pct, label: msg.label });
          break;
        case 'batch_analysis_game_complete':
          setBatchStatus({ ...useGameStore.getState().batchStatus, current: msg.gameIndex + 1, pct: 100 });
          break;
        case 'batch_analysis_complete':
        case 'batch_analysis_cancelled':
        case 'error':
          if (useGameStore.getState().batchStatus) setBatchStatus(null);
          break;
      }
      // Extracción de puzzles: estado global (pausa la evaluación en vivo y alimenta el overlay)
      switch (msg.type) {
        case 'puzzle_extraction_started':
          setExtractionStatus({ current: 0, total: msg.totalGames, extracted: 0 });
          break;
        case 'puzzle_game_done':
          setExtractionStatus({ ...useGameStore.getState().extractionStatus, current: msg.gameIndex + 1, extracted: msg.totalExtracted });
          break;
        case 'puzzle_extraction_complete':
        case 'extraction_cancelled':
          setExtractionStatus(null);
          backendService.getPuzzleGameIds();
          break;
        case 'error':
          if (useGameStore.getState().extractionStatus) setExtractionStatus(null);
          break;
        case 'puzzle_game_ids':
          setPuzzleGameIds(msg.ids);
          break;
        case 'puzzles_cleared':
          setPuzzleGameIds([]);
          break;
        case 'puzzle_deleted':
          backendService.getPuzzleGameIds();
          break;
      }
      if (msg.type === 'full_analysis_data') {
        applyFullAnalysis(msg.data);
        const { targetPly, setTargetPly, goToMove } = useGameStore.getState();
        if (targetPly !== null) {
          goToMove(targetPly);
          setTargetPly(null);
        }
      }
      if (msg.type === 'analyses_list') {
        if (msg.offset === 0) {
          setAnalyses(msg.analyses);
        } else {
          setAnalyses(prev => {
            const existingIds = new Set(prev.map(a => a.id));
            const newItems = msg.analyses.filter(a => !existingIds.has(a.id));
            return [...prev, ...newItems];
          });
        }
      }
      // Mantiene sincronizado el conjunto ligero de insignias cada vez que llegan análisis completos
      if (msg.type === 'analysed_ids') {
        setAnalysedGameIds(msg.ids);
      }
    });

    if (backendService.isConnected) {
      backendService.getAnalyses(0, 50);
      backendService.getAnalysedIds();
      backendService.getPuzzleGameIds();
    }

    return () => cleanup();
  }, []);

  // Solo se pide el análisis completo si el servidor lo tiene (evita "Analysis not found"
  // con IDs temporales de PGN recién cargados). Se reevalúa cuando llega la lista de IDs.
  const analysedGameIds = useGameStore(state => state.analysedGameIds);
  const lastLoadedId = useRef(null);
  useEffect(() => {
    if (gameId && gameId !== lastLoadedId.current && analysedGameIds.includes(String(gameId))) {
      lastLoadedId.current = gameId;
      backendService.getFullAnalysis(gameId);
    }
  }, [gameId, analysedGameIds]);
};
