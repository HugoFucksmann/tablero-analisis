import React, { useState, useEffect, useRef } from 'react';
import { Chess } from 'chess.js';
import { EvaluationBar } from '../Analysis/EvaluationBar';
import { calculateMaterial } from '../../utils/chessUtils';
import { getActiveColor } from '../../utils/boardUtils';

import { PlayerArea } from './PlayerArea';
import { EvalBadgeOverlay } from './EvalBadge';
import { ConnectedChessboard } from './ConnectedChessboard';
import './Board.css';

import { 
  useFen, useMakeMove, useClocks, usePlayers, usePlayerElos, 
  useHistory, useCurrentMoveIndex, useBoardOrientation, useGoToMove
} from '../../store/selectors/gameSelectors';

import { useFullGameAnalysis } from '../../hooks/useFullGameAnalysis';
import { useLiveEvaluation } from '../../hooks/useLiveEvaluation';
import { useClockSync } from '../../hooks/useClockSync';
import { useEvaluationNavigation } from '../../hooks/useEvaluationNavigation';
import { usePlayController } from '../../hooks/usePlayController';

import { useBoardInteraction } from './hooks/useBoardInteraction';
import { useBoardNavigation } from './hooks/useBoardNavigation';
import { useGameStore } from '../../store/useGameStore';
import { useShallow } from 'zustand/react/shallow';
import { playChessSound } from '../../utils/soundUtils';

const WRONG_MOVE_REVERT_MS = 700;

const toMoveObj = (uci) => ({ from: uci.slice(0, 2), to: uci.slice(2, 4), ...(uci.length === 5 ? { promotion: uci[4] } : {}) });

// ¿Ambas jugadas dan jaque mate desde `fen`? (puzzles de mate: cualquier mate es válido)
const bothDeliverMate = (fen, expectedUci, playedMove) => {
  try {
    const mates = (m) => {
      const c = new Chess(fen);
      c.move(m);
      return c.isCheckmate();
    };
    return mates(toMoveObj(expectedUci)) && mates(playedMove);
  } catch {
    return false;
  }
};

export const Board = () => {
  useFullGameAnalysis();
  useLiveEvaluation();
  useClockSync();
  useEvaluationNavigation();
  usePlayController();

  const fen = useFen();
  const makeMoveNormal = useMakeMove();
  const clocks = useClocks();
  const players = usePlayers();
  const playerElos = usePlayerElos();
  const history = useHistory();
  const currentMoveIndex = useCurrentMoveIndex();
  const boardOrientation = useBoardOrientation();
  const goToMove = useGoToMove();

  const { appMode, puzzleState, setPuzzleState } = useGameStore(useShallow(state => ({
    appMode: state.appMode,
    puzzleState: state.puzzleState,
    setPuzzleState: state.setPuzzleState,
  })));

  // En Jugar la barra de evaluación se oculta salvo que el usuario active "Mostrar evaluación"
  const showEvalBar = useGameStore(s => s.appMode !== 'play' || s.play.showEval);

  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const boardRef = useRef(null);
  const wrongMoveTimerRef = useRef(null);
  useEffect(() => () => clearTimeout(wrongMoveTimerRef.current), []);

  useBoardNavigation(boardRef, currentMoveIndex, history.length, goToMove);

  const makeMove = React.useCallback((move) => {
    // Modo Jugar: solo se mueve con la partida en curso, en tu turno y sin que el bot esté pensando
    if (appMode === 'play') {
      const { play, fen: currentFen, history: h, currentMoveIndex: idx, goToMove: go } = useGameStore.getState();
      if (play.phase !== 'playing' || currentFen.split(' ')[1] !== play.userColor || play.thinking) return null;
      // Si estabas repasando jugadas anteriores, vuelve al final en vez de mover desde el pasado
      if (idx !== h.length - 1) {
        go(h.length - 1);
        return null;
      }
    }
    if (appMode === 'puzzle' && puzzleState && !puzzleState.isSolved) {
      if (puzzleState.isAnimating) return null; // Reject silently during animation

      // Si el usuario retrocedió en el historial (rueda del mouse o flechas), la posición
      // en pantalla no es la del puzzle: volver al final en vez de juzgar la jugada.
      const { history: h, currentMoveIndex: idx, goToMove: go } = useGameStore.getState();
      if (idx !== h.length - 1) {
        go(h.length - 1);
        return null;
      }

      // Puzzle logic interception
      const expectedMove = puzzleState.sequence[puzzleState.currentStep];
      const isPromotionExpected = expectedMove && expectedMove.length === 5;
      const uciMove = move.from + move.to + (isPromotionExpected ? (move.promotion || 'q') : '');

      const isLastStep = puzzleState.currentStep === puzzleState.sequence.length - 1;
      // Última jugada de un puzzle de mate: cualquier mate legal se acepta aunque difiera del guardado.
      const isAlternativeMate = !!expectedMove && uciMove !== expectedMove && isLastStep
        && bothDeliverMate(useGameStore.getState().fen, expectedMove, move);

      if (uciMove === expectedMove || isAlternativeMate) {
        // Correct move
        setPuzzleState(prev => ({ ...prev, isWrong: false, currentStep: prev.currentStep + 1, isSolved: prev.currentStep + 1 >= prev.sequence.length }));
        return makeMoveNormal(move);
      }

      // Jugada incorrecta: se deja mover libremente. Si es legal se muestra en el tablero un
      // instante y luego la pieza vuelve a su lugar; si es ilegal, la pieza vuelve de inmediato.
      const before = useGameStore.getState();
      const snapshot = {
        game: before.game,
        fen: before.fen,
        history: before.history,
        currentMoveIndex: before.currentMoveIndex,
        isExploreMode: before.isExploreMode,
        mainLineData: before.mainLineData,
        evaluationHistory: before.evaluationHistory,
        bestMoves: before.bestMoves,
        moveEvaluations: before.moveEvaluations,
        alternativeLines: before.alternativeLines,
        evaluation: before.evaluation,
        gameId: before.gameId,
      };

      const result = makeMoveNormal(move);
      if (!result) return null; // ilegal: rebota sin penalizar

      const wrongFen = useGameStore.getState().fen;
      // Bloquea nuevas jugadas mientras se muestra el error.
      setPuzzleState(prev => ({ ...prev, isWrong: true, isAnimating: true }));
      playChessSound('illegal');

      clearTimeout(wrongMoveTimerRef.current);
      wrongMoveTimerRef.current = setTimeout(() => {
        const now = useGameStore.getState();
        // Solo revertir si seguimos en el mismo puzzle y en la posición del error
        // (el usuario pudo pulsar Reintentar / cambiar de puzzle mientras tanto).
        if (now.gameId !== snapshot.gameId || now.fen !== wrongFen) return;
        useGameStore.setState({ ...snapshot, arrows: [] });
        setPuzzleState(prev => (prev ? { ...prev, isAnimating: false } : prev));
      }, WRONG_MOVE_REVERT_MS);

      return result;
    }
    return makeMoveNormal(move);
  }, [appMode, puzzleState, makeMoveNormal, setPuzzleState]);

  const { onDrop, onPromotionPieceSelect, promotionMove } = useBoardInteraction(makeMove);
  
  const material = React.useMemo(() => calculateMaterial(fen), [fen]);
  const activeColor = React.useMemo(() => getActiveColor(fen), [fen]);

  const squareStyles = React.useMemo(() => {
    const highlights = {};
    const move = currentMoveIndex >= 0 ? history[currentMoveIndex] : null;
    if (move) {
      highlights[move.from] = { backgroundColor: 'rgba(255, 255, 100, 0.22)' };
      highlights[move.to] = { backgroundColor: 'rgba(255, 255, 100, 0.32)' };
    }
    return highlights;
  }, [currentMoveIndex, history]);

  const topSide = boardOrientation === 'white' ? 'black' : 'white';
  const bottomSide = boardOrientation === 'white' ? 'white' : 'black';

  const playerAreaProps = (side, isTop) => ({
    side,
    name: players[side],
    elo: playerElos?.[side] ?? null,
    clock: clocks[side] ?? null,
    material: material[side],
    isActive: activeColor === side,
    isTop,
  });

  return (
    <div className="board-container">
      <PlayerArea {...playerAreaProps(topSide, true)} />

      <div className="board-main-layout">
        {showEvalBar && (
          <div className="eval-bar-aside">
            <EvaluationBar orientation={isMobile ? 'horizontal' : 'vertical'} />
          </div>
        )}

        <div className="board-frame">
          <div className="board-main-area" ref={boardRef}>
            
            <ConnectedChessboard
                fen={fen}
                boardOrientation={boardOrientation}
                squareStyles={squareStyles}
                promotionMove={promotionMove}
                onDrop={onDrop}
                onPromotionPieceSelect={onPromotionPieceSelect}
            />

            <EvalBadgeOverlay />
          </div>
        </div>
      </div>

      <PlayerArea {...playerAreaProps(bottomSide, false)} />
    </div>
  );
};