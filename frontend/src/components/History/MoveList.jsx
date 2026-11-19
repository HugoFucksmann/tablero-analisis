import React, { useMemo, useRef, useEffect } from 'react';
import { RotateCcw } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { useShallow } from 'zustand/react/shallow';
import { EVAL_CONFIG } from '../../constants/chessConstants.jsx';
import { getPieceIcon } from '../../utils/chessUtils';
import { VariationsPanel } from './VariationsPanel';
import './MoveList.css';

const RenderMove = ({ move, side, currentMoveIndex, goToMove }) => {
  // Hueco vacío: mantiene las columnas alineadas (p. ej. cuando la primera jugada es de negras)
  if (!move) return <div aria-hidden="true" />;
  const config = EVAL_CONFIG[move.eval];
  const pieceMatch = move.san.match(/^([NBRQK])/);
  const piece = pieceMatch ? pieceMatch[1] : null;
  const moveText = piece ? move.san.substring(1) : move.san;

  return (
    <div
      className={`move-item ${currentMoveIndex === move.index ? 'active' : ''} ${side}`}
      title={move.eval || ''}
      onClick={() => goToMove(move.index)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          goToMove(move.index);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <span className="san">
        {piece && <span className={`piece-icon ${side}`}>{getPieceIcon(piece, side)}</span>}
        <span className="move-text">{moveText}</span>
      </span>
      {config && (
        <span
          className="eval-icon"
          style={{ color: config.color, backgroundColor: config.bg }}
        >
          {config.icon}
        </span>
      )}
    </div>
  );
};

/** `compact`: sin botón de volver a la partida principal ni variantes (p. ej. en el modo Jugar). */
export const MoveList = ({ compact = false }) => {
  const {
    history,
    moveEvaluations,
    currentMoveIndex,
    goToMove,
    isExploreMode,
    restoreMainLine,
    startFen,
  } = useGameStore(useShallow(state => ({
    history: state.history,
    moveEvaluations: state.moveEvaluations,
    currentMoveIndex: state.currentMoveIndex,
    goToMove: state.goToMove,
    isExploreMode: state.isExploreMode,
    restoreMainLine: state.restoreMainLine,
    startFen: state.startFen,
  })));

  const scrollRef = useRef(null);

  useEffect(() => {
    if (!scrollRef.current) return;
    const activeItem = scrollRef.current.querySelector('.move-item.active');
    if (activeItem) {
      activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [currentMoveIndex]);

  const getSan = (entry) => (entry && typeof entry === 'object' ? entry.san : entry);

  const movePairs = useMemo(() => {
    // Partidas que arrancan con turno de negras (FEN personalizado): la primera jugada va en la columna
    // de negras y la numeración sigue la del FEN.
    const fenParts = (startFen || '').split(' ');
    const blackFirst = fenParts[1] === 'b';
    const startFullmove = parseInt(fenParts[5], 10) || 1;

    const entry = (i) => (history[i]
      ? { ...history[i], san: getSan(history[i]), index: i, eval: moveEvaluations[i] }
      : null);

    const pairs = [];
    let i = 0;
    if (blackFirst && history.length > 0) {
      pairs.push({ round: startFullmove, white: null, black: entry(0) });
      i = 1;
    }
    for (; i < history.length; i += 2) {
      pairs.push({
        round: startFullmove + Math.floor((i + (blackFirst ? 1 : 0)) / 2),
        white: entry(i),
        black: entry(i + 1),
      });
    }
    return pairs;
  }, [history, moveEvaluations, startFen]);

  return (
    <div className="move-list-container premium-scroll">
      <div className="move-list-header">
        <span>#</span>
        <span>Blancas</span>
        <span>Negras</span>
        {isExploreMode && !compact && (
          <button
            className="explore-restore-btn"
            onClick={restoreMainLine}
            title="Volver a la partida principal"
          >
            <RotateCcw size={11} />
          </button>
        )}
      </div>

      <div className="move-list-body" ref={scrollRef}>
        {movePairs.map((pair) => (
          <div key={pair.round} className="move-row">
            <span className="round-num">{pair.round}.</span>
            <RenderMove move={pair.white} side="white" currentMoveIndex={currentMoveIndex} goToMove={goToMove} />
            <RenderMove move={pair.black} side="black" currentMoveIndex={currentMoveIndex} goToMove={goToMove} />
          </div>
        ))}
        {history.length === 0 && (
          <div className="empty-history">Sin movimientos aún</div>
        )}
      </div>

      {!compact && <VariationsPanel />}
    </div>
  );
};