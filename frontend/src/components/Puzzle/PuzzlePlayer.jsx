import React, { useState, useEffect, useRef } from 'react';
import { useGameStore } from '../../store/useGameStore';
import { useShallow } from 'zustand/react/shallow';
import { backendService } from '../../services/backendService';
import { ArrowLeft, ChevronLeft, ChevronRight, Eye, SkipForward, CheckCircle2, XCircle, RotateCcw } from 'lucide-react';
import { playChessSound } from '../../utils/soundUtils';

export const PuzzlePlayer = ({ puzzles, initialIndex, onBack }) => {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const [showSolution, setShowSolution] = useState(false);
    const [showOriginal, setShowOriginal] = useState(false);
    const [prevIndex, setPrevIndex] = useState(initialIndex);
    const opponentTimerRef = useRef(null);

    // Al cambiar de puzzle, restablecer las vistas locales (ajuste durante el render: evita un
    // setState dentro de un efecto).
    if (prevIndex !== currentIndex) {
        setPrevIndex(currentIndex);
        setShowSolution(false);
        setShowOriginal(false);
    }

    const {
        loadFen, setBoardOrientation, setPuzzleState, puzzleState,
        makeMove, goToMove, history, currentMoveIndex, setArrows
    } = useGameStore(useShallow(state => ({
        loadFen: state.loadFen,
        setBoardOrientation: state.setBoardOrientation,
        setPuzzleState: state.setPuzzleState,
        puzzleState: state.puzzleState,
        makeMove: state.makeMove,
        goToMove: state.goToMove,
        history: state.history,
        currentMoveIndex: state.currentMoveIndex,
        setArrows: state.setArrows,
    })));

    const puzzle = puzzles[currentIndex];
    const label = puzzle?.label || 'Táctica';
    const solutionSequence = Array.isArray(puzzle?.solutionSequence) ? puzzle.solutionSequence : [];
    const originalContinuation = Array.isArray(puzzle?.originalContinuation) ? puzzle.originalContinuation : [];
    const contextMoves = Array.isArray(puzzle?.contextMoves) ? puzzle.contextMoves : [];
    const playerColor = puzzle?.playerColor || (puzzle?.fen && puzzle.fen.includes(' w ') ? 'white' : 'black');

    // El estado del puzzle vive en el store: resuelto / incorrecto se derivan de ahí.
    const isSolved = Boolean(puzzleState?.isSolved);
    const isWrong = Boolean(puzzleState?.isWrong);

    // Carga el tablero del puzzle (solo acciones del store; no toca estado local de React).
    const initPuzzle = () => {
        if (!puzzle) return;
        if (opponentTimerRef.current) clearTimeout(opponentTimerRef.current);

        setArrows([]);

        if (puzzle.baseFen && puzzle.playedMove) {
            loadFen(puzzle.baseFen);
            setBoardOrientation(playerColor);
            contextMoves.forEach(m => makeMove(m));
            setPuzzleState({ sequence: ['__animating__'], currentStep: 0, isWrong: false, isSolved: false, isAnimating: true });
            opponentTimerRef.current = setTimeout(() => {
                makeMove(puzzle.playedMove);
                setPuzzleState({ sequence: solutionSequence, currentStep: 0, isWrong: false, isSolved: false });
            }, 1000);
        } else if (puzzle.preBlunderFen && puzzle.playedMove) {
            loadFen(puzzle.preBlunderFen);
            setBoardOrientation(playerColor);
            setPuzzleState({ sequence: ['__animating__'], currentStep: 0, isWrong: false, isSolved: false, isAnimating: true });
            opponentTimerRef.current = setTimeout(() => {
                makeMove(puzzle.playedMove);
                setPuzzleState({ sequence: solutionSequence, currentStep: 0, isWrong: false, isSolved: false });
            }, 1000);
        } else {
            loadFen(puzzle.fen);
            setBoardOrientation(playerColor);
            setPuzzleState({ sequence: solutionSequence, currentStep: 0, isWrong: false, isSolved: false });
        }
    };

    // Reintentar: además de recargar el tablero, ocultar la solución mostrada.
    const handleRetry = () => {
        setShowSolution(false);
        setShowOriginal(false);
        initPuzzle();
    };

    // El efecto debe correr solo al cambiar de puzzle; `initPuzzle` se recrea en cada render.
    const initPuzzleRef = useRef(initPuzzle);
    useEffect(() => {
        initPuzzleRef.current = initPuzzle;
    });

    useEffect(() => {
        initPuzzleRef.current();
        return () => {
            if (opponentTimerRef.current) clearTimeout(opponentTimerRef.current);
            setPuzzleState(null);
            setArrows([]);
        };
    }, [currentIndex, setPuzzleState, setArrows]);

    // Al resolver el puzzle: avisar al backend y sonar, una sola vez por resolución.
    const puzzleId = puzzle?.id;
    useEffect(() => {
        if (!isSolved || !puzzleId) return;
        backendService.puzzleSolved(puzzleId);
        playChessSound('notify');
    }, [isSolved, puzzleId]);

    // Fallo: registrarlo una sola vez por intento fallido (repetición espaciada)
    useEffect(() => {
        if (!isWrong || !puzzleId) return;
        backendService.puzzleFailed(puzzleId);
    }, [isWrong, puzzleId]);

    // Respuesta automática del rival cuando le toca (pasos impares de la secuencia).
    const step = puzzleState?.currentStep;
    const sequence = puzzleState?.sequence;
    useEffect(() => {
        if (step === undefined || !sequence || isSolved || isWrong) return;
        if (step % 2 !== 1 || !sequence[step]) return;

        const oppUci = sequence[step];
        const oppMove = { from: oppUci.slice(0, 2), to: oppUci.slice(2, 4), ...(oppUci.length === 5 ? { promotion: oppUci[4] } : {}) };
        opponentTimerRef.current = setTimeout(() => {
            setPuzzleState(prev => ({ ...prev, currentStep: step + 1 }));
            makeMove(oppMove);
        }, 600);

        return () => {
            if (opponentTimerRef.current) clearTimeout(opponentTimerRef.current);
        };
    }, [step, sequence, isSolved, isWrong, makeMove, setPuzzleState]);

    useEffect(() => {
        if (currentMoveIndex >= 0 && history[currentMoveIndex]) {
            const move = history[currentMoveIndex];
            const isSolver = move.color === (playerColor === 'white' ? 'w' : 'b');
            setArrows([{ startSquare: move.from, endSquare: move.to, color: isSolver ? 'rgba(16, 185, 129, 0.8)' : 'rgba(239, 68, 68, 0.8)' }]);
        } else {
            setArrows([]);
        }
    }, [currentMoveIndex, history, setArrows, playerColor]);

    const applySequence = (sequenceToPlay) => {
        setPuzzleState(prev => ({ ...prev, isSolved: true }));
        if (puzzle.baseFen && puzzle.playedMove) {
            loadFen(puzzle.baseFen);
            setBoardOrientation(playerColor);
            contextMoves.forEach(m => makeMove(m));
            makeMove(puzzle.playedMove);
        } else if (puzzle.preBlunderFen && puzzle.playedMove) {
            loadFen(puzzle.preBlunderFen);
            setBoardOrientation(playerColor);
            makeMove(puzzle.playedMove);
        } else {
            loadFen(puzzle.fen);
            setBoardOrientation(playerColor);
        }
        sequenceToPlay.forEach(m => {
            if (m.length >= 4 && m[0] >= 'a' && m[0] <= 'h') makeMove({ from: m.slice(0, 2), to: m.slice(2, 4), ...(m.length === 5 ? { promotion: m[4] } : {}) });
            else makeMove(m);
        });
    };

    const handleSolutionClick = (uciStr, i) => {
        if (!puzzleState || i !== puzzleState.currentStep || isSolved) return;

        const uci = {
            from: uciStr.slice(0, 2),
            to: uciStr.slice(2, 4),
            ...(uciStr.length === 5 ? { promotion: uciStr[4] } : {})
        };

        setPuzzleState(prev => ({
            ...prev,
            currentStep: prev.currentStep + 1,
            isSolved: prev.currentStep + 1 >= prev.sequence.length,
            isWrong: false
        }));

        makeMove(uci);
    };

    const handleNext = () => {
        if (currentIndex < puzzles.length - 1) setCurrentIndex(prev => prev + 1);
        else onBack();
    };

    if (!puzzle) return null;

    return (
        <div className="puzzle-container glass-panel player-mode">
            <div className="puzzle-header">
                <button className="back-btn" onClick={onBack}>
                    <ArrowLeft size={16} /> Volver
                </button>
                <h2>Entrenando ({currentIndex + 1}/{puzzles.length})</h2>
            </div>

            <div className="player-content premium-scroll">
                <div className="ps-info">
                    <span className="pc-label">{label}</span>
                    <p className="ps-hint">
                        {puzzle.playedMove ? `Tu oponente jugó ${puzzle.playedMove}. ¿Mejor respuesta?` : 'Encuentra la mejor secuencia.'}
                    </p>
                </div>

                {isWrong && !isSolved && (
                    <div className="ps-feedback wrong">
                        <div>
                            <XCircle size={16} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                            Movimiento incorrecto.
                        </div>
                        <button className="ph-btn-small" onClick={handleRetry}>
                            <RotateCcw size={12} /> Reintentar
                        </button>
                    </div>
                )}

                {isSolved && (
                    <div className="ps-feedback solved">
                        <div><CheckCircle2 size={16} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> ¡Excelente!</div>
                        {originalContinuation.length > 0 && (
                            <button className="ph-btn-small" onClick={() => { setShowOriginal(!showOriginal); applySequence(!showOriginal ? originalContinuation : solutionSequence); }}>
                                {showOriginal ? 'Ver Solución' : 'Ver Partida Real'}
                            </button>
                        )}
                    </div>
                )}

                <div className="ps-nav">
                    <button className="ps-nav-btn" onClick={() => currentMoveIndex >= 0 && goToMove(currentMoveIndex - 1)} disabled={currentMoveIndex < 0}><ChevronLeft size={18} /></button>
                    <span className="ps-nav-label">{currentMoveIndex + 1} / {history.length}</span>
                    <button className="ps-nav-btn" onClick={() => currentMoveIndex < history.length - 1 && goToMove(currentMoveIndex + 1)} disabled={currentMoveIndex >= history.length - 1}><ChevronRight size={18} /></button>
                </div>

                <div className="ps-controls">
                    <button className="ph-btn secondary" onClick={() => setShowSolution(!showSolution)}>
                        <Eye size={16} /> {showSolution ? 'Ocultar' : 'Ver Solución'}
                    </button>
                    <button className="ph-btn primary" onClick={handleNext}>
                        <SkipForward size={16} /> {isSolved && currentIndex < puzzles.length - 1 ? 'Siguiente' : currentIndex === puzzles.length - 1 ? 'Finalizar' : 'Saltar'}
                    </button>
                </div>

                {(showSolution || isSolved) && (
                    <div className={`ps-solution ${showOriginal ? 'original-mode' : ''}`}>
                        <span className="sol-label">{showOriginal ? 'Partida real:' : 'Solución:'}</span>
                        <div className="sol-moves">
                            {(showOriginal ? originalContinuation : solutionSequence).map((m, i) => {
                                const isDone = puzzleState ? puzzleState.currentStep > i : false;
                                const isNext = puzzleState ? i === puzzleState.currentStep && !isSolved && !showOriginal : false;

                                return (
                                    <span
                                        key={i}
                                        className={`sol-move ${(isDone || showOriginal) ? 'done' : ''} ${isNext ? 'clickable' : ''}`}
                                        onClick={() => !showOriginal ? handleSolutionClick(m, i) : null}
                                    >
                                        {m}
                                    </span>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};