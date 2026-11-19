import { useGameStore } from '../store/useGameStore';

/**
 * Abre en el tablero una partida ya analizada (por su gameId de plataforma).
 * `ply` (opcional) es el índice de jugada al que saltar una vez cargado el análisis.
 */
export function openAnalysedGame(gameId, ply = null) {
  const { gameId: currentId, analysisReady, history, setAppMode, setGameId, setTargetPly, goToMove } =
    useGameStore.getState();

  setAppMode('analysis');

  // Ya está cargada: no habrá nueva petición, así que se navega directamente.
  if (String(currentId) === String(gameId) && analysisReady && history.length > 0) {
    if (ply !== null && ply !== undefined) goToMove(Math.min(ply, history.length - 1));
    return;
  }

  setTargetPly(ply);
  setGameId(gameId);
}
