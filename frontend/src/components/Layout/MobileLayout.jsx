import React, { useState } from 'react';
import {
  Settings, ChevronDown, Check,
  ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, Play, Pause, RefreshCcw,
} from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { useShallow } from 'zustand/react/shallow';
import { MODES, useModeSwitch } from './useModeSwitch';
import './MobileLayout.css';

/** Navegación por las jugadas, siempre a mano en la parte inferior. */
const MobileDock = () => {
  const {
    goToMove, currentMoveIndex, historyLength, isAutoPlaying, setAutoPlaying,
    boardOrientation, setBoardOrientation, canAutoPlay,
  } = useGameStore(useShallow(state => ({
    goToMove: state.goToMove,
    currentMoveIndex: state.currentMoveIndex,
    historyLength: state.history.length,
    isAutoPlaying: state.isAutoPlaying,
    setAutoPlaying: state.setAutoPlaying,
    boardOrientation: state.boardOrientation,
    setBoardOrientation: state.setBoardOrientation,
    canAutoPlay: state.appMode === 'analysis' || state.appMode === 'explorer',
  })));

  const atStart = currentMoveIndex <= -1;
  const atEnd = currentMoveIndex >= historyLength - 1;

  return (
    <nav className="m-dock" aria-label="Navegación de jugadas">
      <button className="m-dock-btn" aria-label="Inicio" disabled={atStart} onClick={() => goToMove(-1)}>
        <ChevronsLeft size={22} />
      </button>
      <button className="m-dock-btn" aria-label="Jugada anterior" disabled={atStart} onClick={() => goToMove(currentMoveIndex - 1)}>
        <ChevronLeft size={24} />
      </button>
      {canAutoPlay && (
        <button
          className={`m-dock-btn ${isAutoPlaying ? 'active' : ''}`}
          aria-label={isAutoPlaying ? 'Pausar' : 'Reproducir'}
          aria-pressed={isAutoPlaying}
          disabled={atEnd && !isAutoPlaying}
          onClick={() => setAutoPlaying(!isAutoPlaying)}
        >
          {isAutoPlaying ? <Pause size={20} /> : <Play size={20} />}
        </button>
      )}
      <button className="m-dock-btn" aria-label="Jugada siguiente" disabled={atEnd} onClick={() => goToMove(currentMoveIndex + 1)}>
        <ChevronRight size={24} />
      </button>
      <button className="m-dock-btn" aria-label="Final" disabled={atEnd} onClick={() => goToMove(historyLength - 1)}>
        <ChevronsRight size={22} />
      </button>
      <span className="m-dock-sep" aria-hidden="true" />
      <button
        className="m-dock-btn"
        aria-label="Girar tablero"
        onClick={() => setBoardOrientation(boardOrientation === 'white' ? 'black' : 'white')}
      >
        <RefreshCcw size={18} />
      </button>
    </nav>
  );
};

/**
 * Diseño móvil: pantalla fija sin scroll de página.
 *   barra superior (menú de modos desplegable) · tablero fijo · contenido con scroll propio · dock de jugadas.
 * El tablero se oculta (sigue montado, para no perder análisis en curso) en los modos que no lo usan.
 */
export const MobileLayout = ({ board, panels, detail, onOpenSettings }) => {
  const { appMode, selectMode, dialog } = useModeSwitch();
  const [menuOpen, setMenuOpen] = useState(false);
  const { puzzlePlaying, statDetail } = useGameStore(useShallow(state => ({
    puzzlePlaying: state.puzzleState !== null,
    statDetail: state.selectedStatCategory !== null,
  })));

  const current = MODES.find(m => m.id === appMode) ?? MODES[0];
  const showBoard = appMode === 'analysis' || appMode === 'explorer' || appMode === 'play'
    || (appMode === 'puzzle' && puzzlePlaying);
  const showDock = showBoard && appMode !== 'puzzle';
  const showDetail = appMode === 'stats' && statDetail;

  const handleSelect = async (mode) => {
    setMenuOpen(false);
    await selectMode(mode);
  };

  return (
    <div className="m-shell">
      <header className="m-topbar">
        <button
          className={`m-mode-btn ${menuOpen ? 'open' : ''}`}
          onClick={() => setMenuOpen(o => !o)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          {React.createElement(current.Icon, { size: 17 })}
          <span>{current.label}</span>
          <ChevronDown size={15} className="m-chevron" />
        </button>
        <button className="m-icon-btn" onClick={onOpenSettings} aria-label="Configurar motor de análisis">
          <Settings size={18} />
        </button>

        {menuOpen && (
          <>
            <div className="m-backdrop" onClick={() => setMenuOpen(false)} role="presentation" />
            <div className="m-menu" role="menu">
              {MODES.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  role="menuitem"
                  className={`m-menu-item ${appMode === id ? 'active' : ''}`}
                  onClick={() => handleSelect(id)}
                >
                  {React.createElement(Icon, { size: 18 })}
                  <span>{label}</span>
                  {appMode === id && <Check size={16} className="m-menu-check" />}
                </button>
              ))}
            </div>
          </>
        )}
      </header>

      <div className={`m-board-area ${showBoard ? '' : 'hidden'}`}>
        <div className="m-board">{board}</div>
      </div>

      <main className="m-content">
        {showDetail ? detail : <aside className="side-panels">{panels}</aside>}
      </main>

      {showDock && <MobileDock />}
      {dialog}
    </div>
  );
};
