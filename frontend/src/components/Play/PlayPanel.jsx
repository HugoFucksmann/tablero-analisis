import React, { useEffect } from 'react';
import {
  Bot, Play, Lightbulb, Undo2, Handshake, Flag, RefreshCcw, Trophy, Frown, Scale, RotateCcw,
  ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, Search, Swords, Clock, Eye, Loader2, AlertTriangle,
} from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { useShallow } from 'zustand/react/shallow';
import { MoveList } from '../History/MoveList';
import { useDialog } from '../Common/ConfirmDialog';
import { BOT_LEVELS, TIME_CONTROLS, getLevel } from '../../utils/botLevels';
import { describeResult, isCustomStart } from '../../utils/playUtils';
import './PlayPanel.css';

const COLOR_OPTIONS = [
  { id: 'white', label: 'Blancas' },
  { id: 'random', label: 'Aleatorio' },
  { id: 'black', label: 'Negras' },
];

/* ── Configuración de la partida ─────────────────────────────────────────── */

const SetupView = () => {
  const { playConfig, setPlayConfig, startFen, setPlayStart, startPlay } = useGameStore(useShallow(state => ({
    playConfig: state.playConfig,
    setPlayConfig: state.setPlayConfig,
    startFen: state.play.startFen,
    setPlayStart: state.setPlayStart,
    startPlay: state.startPlay,
  })));

  const level = getLevel(playConfig.levelId);

  // Vista previa en el tablero: orientación, nombres y sin relojes heredados del análisis
  const searchUsername = useGameStore(state => state.searchUsername);
  useEffect(() => {
    const s = useGameStore.getState();
    const userWhite = playConfig.color !== 'black';
    const userName = searchUsername || 'Tú';
    s.setBoardOrientation(userWhite ? 'white' : 'black');
    if (userWhite) s.setPlayers(userName, 'Stockfish', null, level.elo);
    else s.setPlayers('Stockfish', userName, level.elo, null);
    s.setClocks(null, null);
  }, [playConfig.color, level.elo, searchUsername]);

  const levelIndex = BOT_LEVELS.findIndex(l => l.id === level.id);
  const custom = isCustomStart(startFen);
  const turn = startFen ? (startFen.split(' ')[1] === 'b' ? 'negras' : 'blancas') : 'blancas';

  return (
    <div className="play-scroll premium-scroll">
      <section className="play-section">
        <div className="play-section-title">Posición</div>
        <div className={`play-position ${custom ? 'custom' : ''}`}>
          <div className="play-position-text">
            <strong>{custom ? 'Posición del análisis' : 'Posición inicial'}</strong>
            <span>{custom ? `Mueven ${turn}` : 'Partida normal'}</span>
          </div>
          {custom ? (
            <button className="play-link-btn" onClick={() => setPlayStart(null)}>
              <RotateCcw size={12} /> Usar inicial
            </button>
          ) : null}
        </div>
        {!custom && <p className="play-hint-text">Desde Análisis puedes jugar desde cualquier posición con el botón del robot.</p>}
      </section>

      <section className="play-section">
        <div className="play-section-title">Juegas con</div>
        <div className="play-segment">
          {COLOR_OPTIONS.map(c => (
            <button
              key={c.id}
              className={`play-seg-btn ${playConfig.color === c.id ? 'active' : ''}`}
              onClick={() => setPlayConfig({ color: c.id })}
            >
              {c.label}
            </button>
          ))}
        </div>
      </section>

      <section className="play-section">
        <div className="play-section-title">
          Nivel del bot
          <span className="play-level-badge">{level.label} · ~{level.elo}</span>
        </div>
        <input
          className="play-slider"
          type="range"
          min={0}
          max={BOT_LEVELS.length - 1}
          step={1}
          value={levelIndex}
          onChange={(e) => setPlayConfig({ levelId: BOT_LEVELS[Number(e.target.value)].id })}
          style={{ '--pct': `${(levelIndex / (BOT_LEVELS.length - 1)) * 100}%` }}
          aria-label="Nivel del bot"
        />
        <div className="play-slider-ends"><span>Más fácil</span><span>Más difícil</span></div>
        <p className="play-level-desc">{level.desc}</p>
      </section>

      <section className="play-section">
        <div className="play-section-title"><Clock size={11} /> Tiempo</div>
        <div className="play-chips">
          {TIME_CONTROLS.map(t => (
            <button
              key={t.id}
              className={`play-chip ${playConfig.timeControlId === t.id ? 'active' : ''}`}
              onClick={() => setPlayConfig({ timeControlId: t.id })}
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>

      <section className="play-section">
        <div className="play-section-title">Ayudas</div>
        <label className="play-toggle">
          <span className="play-toggle-text"><strong>Pistas</strong><em>Flecha con la mejor jugada</em></span>
          <input type="checkbox" role="switch" checked={playConfig.hints} onChange={(e) => setPlayConfig({ hints: e.target.checked })} />
          <span className="play-switch" aria-hidden="true" />
        </label>
        <label className="play-toggle">
          <span className="play-toggle-text"><strong>Evaluación en vivo</strong><em>Barra de evaluación durante la partida</em></span>
          <input type="checkbox" role="switch" checked={playConfig.showEval} onChange={(e) => setPlayConfig({ showEval: e.target.checked })} />
          <span className="play-switch" aria-hidden="true" />
        </label>
      </section>

      <button className="play-start-btn" onClick={startPlay}>
        <Play size={14} /> Comenzar partida
      </button>
    </div>
  );
};

/* ── Partida en curso ────────────────────────────────────────────────────── */

const NavRow = () => {
  const { goToMove, currentMoveIndex, historyLength, boardOrientation, setBoardOrientation } = useGameStore(useShallow(state => ({
    goToMove: state.goToMove,
    currentMoveIndex: state.currentMoveIndex,
    historyLength: state.history.length,
    boardOrientation: state.boardOrientation,
    setBoardOrientation: state.setBoardOrientation,
  })));
  const atStart = currentMoveIndex <= -1;
  const atEnd = currentMoveIndex >= historyLength - 1;

  return (
    <div className="play-nav">
      <div className="play-nav-group">
        <button className="play-icon-btn" title="Inicio" disabled={atStart} onClick={() => goToMove(-1)}><ChevronsLeft size={15} /></button>
        <button className="play-icon-btn" title="Atrás" disabled={atStart} onClick={() => goToMove(currentMoveIndex - 1)}><ChevronLeft size={15} /></button>
        <button className="play-icon-btn" title="Adelante" disabled={atEnd} onClick={() => goToMove(currentMoveIndex + 1)}><ChevronRight size={15} /></button>
        <button className="play-icon-btn" title="Posición actual" disabled={atEnd} onClick={() => goToMove(historyLength - 1)}><ChevronsRight size={15} /></button>
      </div>
      <button
        className="play-icon-btn"
        title="Girar tablero (F)"
        onClick={() => setBoardOrientation(boardOrientation === 'white' ? 'black' : 'white')}
      >
        <RefreshCcw size={14} />
      </button>
    </div>
  );
};

const GameView = () => {
  const {
    userColor, levelId, thinking, hintBusy, hintsAllowed, hintsUsed, takebacks, drawMessage, engineError,
    turn, historyLength, atEnd,
    requestPlayHint, undoPlay, offerPlayDraw, resignPlay, patchPlay,
  } = useGameStore(useShallow(state => ({
    userColor: state.play.userColor,
    levelId: state.play.levelId,
    thinking: state.play.thinking,
    hintBusy: state.play.hintBusy,
    hintsAllowed: state.play.hintsAllowed,
    hintsUsed: state.play.hintsUsed,
    takebacks: state.play.takebacks,
    drawMessage: state.play.drawMessage,
    engineError: state.play.engineError,
    turn: state.fen.split(' ')[1],
    historyLength: state.history.length,
    atEnd: state.currentMoveIndex === state.history.length - 1,
    requestPlayHint: state.requestPlayHint,
    undoPlay: state.undoPlay,
    offerPlayDraw: state.offerPlayDraw,
    resignPlay: state.resignPlay,
    patchPlay: state.patchPlay,
  })));
  const { confirm, dialog } = useDialog();

  const level = getLevel(levelId);
  const userTurn = turn === userColor;
  const canAct = userTurn && atEnd && !thinking && !hintBusy;
  const firstUserPly = userColor === 'w' ? 0 : 1; // no se puede deshacer antes de tu primera jugada
  const canUndo = atEnd && historyLength - (userTurn ? 2 : 1) >= firstUserPly && historyLength > firstUserPly;

  // El aviso de tablas desaparece solo
  useEffect(() => {
    if (!drawMessage) return;
    const id = setTimeout(() => patchPlay({ drawMessage: null }), 4000);
    return () => clearTimeout(id);
  }, [drawMessage, patchPlay]);

  const handleResign = async () => {
    if (await confirm('¿Rendirte? Perderás la partida.', { confirmLabel: 'Rendirme' })) resignPlay();
  };

  return (
    <>
      <div className="play-status">
        <div className="play-status-main">
          <span className={`play-turn-dot ${userTurn ? 'you' : 'bot'}`} />
          <span className="play-turn-text">
            {thinking ? <><Loader2 size={13} className="play-spin" /> Stockfish piensa…</> : userTurn ? 'Tu turno' : 'Turno de Stockfish'}
          </span>
        </div>
        <span className="play-level-badge">{level.label} · ~{level.elo}</span>
      </div>

      {engineError && (
        <div className="play-alert">
          <AlertTriangle size={13} /> <span>{engineError}</span>
          <button className="play-link-btn" onClick={() => patchPlay({ engineError: null, retry: Date.now() })}>Reintentar</button>
        </div>
      )}
      {drawMessage && <div className="play-alert info">{drawMessage}</div>}

      <div className="play-actions">
        {hintsAllowed && (
          <button className="play-action" disabled={!canAct} onClick={requestPlayHint} title="Mostrar la mejor jugada">
            {hintBusy ? <Loader2 size={14} className="play-spin" /> : <Lightbulb size={14} />}
            <span>Pista{hintsUsed ? ` (${hintsUsed})` : ''}</span>
          </button>
        )}
        <button className="play-action" disabled={!canUndo} onClick={undoPlay} title="Deshacer tu última jugada">
          <Undo2 size={14} /><span>Deshacer{takebacks ? ` (${takebacks})` : ''}</span>
        </button>
        <button className="play-action" disabled={!canAct} onClick={offerPlayDraw} title="Ofrecer tablas">
          <Handshake size={14} /><span>Tablas</span>
        </button>
        <button className="play-action danger" onClick={handleResign} title="Rendirse">
          <Flag size={14} /><span>Rendirse</span>
        </button>
      </div>

      <NavRow />
      <MoveList compact />
      {dialog}
    </>
  );
};

/* ── Resultado ───────────────────────────────────────────────────────────── */

const ResultView = () => {
  const { result, userColor, hintsUsed, takebacks, historyLength, levelId, rematchPlay, newPlayGame, analyzePlayedGame } = useGameStore(useShallow(state => ({
    result: state.play.result,
    userColor: state.play.userColor,
    hintsUsed: state.play.hintsUsed,
    takebacks: state.play.takebacks,
    historyLength: state.history.length,
    levelId: state.play.levelId,
    rematchPlay: state.rematchPlay,
    newPlayGame: state.newPlayGame,
    analyzePlayedGame: state.analyzePlayedGame,
  })));

  const info = describeResult(result, userColor);
  if (!info) return null;
  const level = getLevel(levelId);
  const Icon = info.outcome === 'win' ? Trophy : info.outcome === 'loss' ? Frown : Scale;
  const moves = Math.ceil(historyLength / 2);

  return (
    <>
      <div className={`play-result ${info.outcome}`}>
        <Icon size={22} />
        <div className="play-result-text">
          <strong>{info.title}</strong>
          <span>{info.detail}</span>
        </div>
      </div>
      <div className="play-result-stats">
        <span><em>Rival</em>{level.label}</span>
        <span><em>Jugadas</em>{moves}</span>
        <span><em>Pistas</em>{hintsUsed}</span>
        <span><em>Deshacer</em>{takebacks}</span>
      </div>
      <div className="play-result-actions">
        <button className="play-start-btn" onClick={analyzePlayedGame} disabled={historyLength === 0}>
          <Search size={14} /> Analizar partida
        </button>
        <div className="play-result-row">
          <button className="play-text-btn" onClick={rematchPlay}><Swords size={13} /> Revancha</button>
          <button className="play-text-btn" onClick={newPlayGame}><Bot size={13} /> Nueva partida</button>
        </div>
      </div>
      <NavRow />
      <MoveList compact />
    </>
  );
};

/* ── Panel ───────────────────────────────────────────────────────────────── */

export const PlayPanel = () => {
  const phase = useGameStore(state => state.play.phase);

  return (
    <div className="play-panel" data-phase={phase}>
      <div className="play-header">
        <Bot size={15} />
        <h3>Jugar contra Stockfish</h3>
        {phase === 'playing' && <span className="play-live"><Eye size={11} /> En juego</span>}
      </div>
      {phase === 'setup' && <SetupView />}
      {phase === 'playing' && <GameView />}
      {phase === 'over' && <ResultView />}
    </div>
  );
};
