import React, { useState } from 'react';
import {
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  RefreshCcw,
  Volume2,
  VolumeX,
  Play,
  Pause,
  Bot,
} from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { useShallow } from 'zustand/react/shallow';
import { isSoundEnabled, setSoundEnabled, playChessSound } from '../../utils/soundUtils';
import './BoardControls.css';



export const BoardControls = () => {
  const {
    goToMove,
    currentMoveIndex, history,
    boardOrientation, setBoardOrientation,
    isAutoPlaying, setAutoPlaying,
    openPlayFromPosition,
  } = useGameStore(useShallow(state => ({
    goToMove: state.goToMove,
    currentMoveIndex: state.currentMoveIndex,
    history: state.history,
    boardOrientation: state.boardOrientation,
    setBoardOrientation: state.setBoardOrientation,
    isAutoPlaying: state.isAutoPlaying,
    setAutoPlaying: state.setAutoPlaying,
    openPlayFromPosition: state.openPlayFromPosition,
  })));

  const [soundOn, setSoundOn] = useState(isSoundEnabled);

  const handleToggleSound = () => {
    const next = !soundOn;
    setSoundEnabled(next);
    setSoundOn(next);
    if (next) playChessSound('move');
  };

  const handleToggleOrientation = () => {
    setBoardOrientation(boardOrientation === 'white' ? 'black' : 'white');
  };

  const isAtStart = currentMoveIndex === -1;
  const isAtEnd = currentMoveIndex === history.length - 1;



  return (
    <div className="board-controls-container">
      {/* ── Row 1: standard navigation ─────────────────────────────── */}
      <div className="navigation-group">
        <button className="control-btn" title="Inicio" disabled={isAtStart} onClick={() => goToMove(-1)}>
          <ChevronsLeft size={20} />
        </button>
        <button className="control-btn" title="Atrás" disabled={isAtStart} onClick={() => goToMove(currentMoveIndex - 1)}>
          <ChevronLeft size={20} />
        </button>
        <button
          className={`control-btn ${isAutoPlaying ? 'active' : ''}`}
          title={isAutoPlaying ? 'Pausar (Espacio)' : 'Reproducir: se detiene en los errores (Espacio)'}
          aria-pressed={isAutoPlaying}
          disabled={isAtEnd && !isAutoPlaying}
          onClick={() => setAutoPlaying(!isAutoPlaying)}
        >
          {isAutoPlaying ? <Pause size={20} /> : <Play size={20} />}
        </button>
        <button className="control-btn" title="Adelante" disabled={isAtEnd} onClick={() => goToMove(currentMoveIndex + 1)}>
          <ChevronRight size={20} />
        </button>
        <button className="control-btn" title="Final" disabled={isAtEnd} onClick={() => goToMove(history.length - 1)}>
          <ChevronsRight size={20} />
        </button>
      </div>

      <div className="utility-group">
        <button
          className="control-btn secondary"
          title={soundOn ? 'Silenciar sonidos' : 'Activar sonidos'}
          aria-pressed={soundOn}
          onClick={handleToggleSound}
        >
          {soundOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>
        <button
          className="control-btn secondary"
          title="Jugar contra Stockfish desde esta posición"
          onClick={openPlayFromPosition}
        >
          <Bot size={18} />
        </button>
        <button className="control-btn secondary" title="Girar Tablero (F)" onClick={handleToggleOrientation}>
          <RefreshCcw size={18} />
        </button>
      </div>
    </div>
  );
};