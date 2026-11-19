import React, { useState, useEffect, useRef, useMemo } from 'react';
import { backendService } from '../../services/backendService';
import { Play, Download, Trash2, Loader2 } from 'lucide-react';
import { Chessboard } from 'react-chessboard';
import { PuzzlePlayer } from './PuzzlePlayer';
import { PuzzleImporter } from './PuzzleImporter';
import { useDialog } from '../Common/ConfirmDialog';
import './Puzzle.css';

const LazyChessboard = React.memo(({ fen, orientation }) => {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef(null);

  // Se monta al acercarse a la pantalla y se desmonta al alejarse: con cientos de puzzles, mantener
  // todos los tableros montados cuesta memoria y DOM (el contenedor conserva su tamaño).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setIsVisible(entry.isIntersecting), { rootMargin: '400px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} style={{ width: '100%', height: '100%' }}>
      {isVisible && (
        <Chessboard
          options={{
            position: fen,
            boardOrientation: orientation,
            allowDragging: false,
            animationDurationInMs: 0,
            darkSquareStyle: { backgroundColor: '#779556' },
            lightSquareStyle: { backgroundColor: '#ebecd0' }
          }}
        />
      )}
    </div>
  );
});

// ── Repetición espaciada: estado y prioridad de cada puzzle ──────────────────
const isDue = (p, now) => !p.nextReviewAt || new Date(p.nextReviewAt).getTime() <= now;

function srsStatus(p, now) {
  if (!p.attempts) return 'new';
  if (p.streak === 0) return 'failed';
  if (isDue(p, now)) return 'due';
  return p.streak >= 3 ? 'mastered' : 'scheduled';
}

const STATUS_LABELS = {
  new: 'Nuevo', failed: 'Fallado', due: 'Repasar', scheduled: 'Programado', mastered: 'Dominado',
};

// Orden de entrenamiento: fallados → pendientes de repaso → nuevos → resto (por fecha de repaso)
const STATUS_RANK = { failed: 0, due: 1, new: 2, scheduled: 3, mastered: 4 };

const PUZZLE_TYPE_LABELS = { mate: 'Mate', tactical_blunder: 'Táctica' };

const STATUS_FILTERS = [
  ['all', 'Todos'], ['pending', 'Pendientes'], ['failed', 'Fallados'], ['new', 'Nuevos'], ['mastered', 'Dominados'],
];

export const PuzzleDashboard = () => {
  const [view, setView] = useState('library');
  const [puzzles, setPuzzles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [startIndex, setStartIndex] = useState(0);
  const [loadedAt, setLoadedAt] = useState(0);

  const { confirm, dialog } = useDialog();
  const [filters, setFilters] = useState({ type: 'all', color: 'all', status: 'all', motif: 'all' });
  const setFilter = (key, value) => setFilters(prev => ({ ...prev, [key]: value }));
  const viewRef = useRef(view);

  // 1. Escuchar siempre los mensajes del backend
  useEffect(() => {
    const removeHandler = backendService.addHandler((msg) => {
      if (msg.type === 'puzzle_list') {
        setPuzzles(msg.puzzles.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
        setLoadedAt(Date.now());
        setLoading(false);
      }
      if (msg.type === 'puzzle_deleted') {
        setPuzzles(prev => prev.filter(p => p.id !== msg.id));
      }
      if (msg.type === 'puzzles_cleared') {
        setPuzzles([]);
      }
      // Si el backend se (re)conecta mientras vemos la biblioteca, volver a pedir la lista
      if (msg.type === 'connection_status' && msg.connected && viewRef.current === 'library') {
        backendService.getPuzzles();
      }
    });

    return () => removeHandler();
  }, []);

  // 2. Pedir los puzzles cada vez que volvamos a la pestaña de librería
  useEffect(() => {
    viewRef.current = view;
    if (view === 'library' && backendService.isConnected) {
      backendService.getPuzzles();
    }
  }, [view]);

  // Filtros + orden de entrenamiento por prioridad SRS
  const motifOptions = useMemo(
    () => [...new Set(puzzles.flatMap(p => (Array.isArray(p.tacticalMotifs) ? p.tacticalMotifs : [])))].sort(),
    [puzzles],
  );

  const visible = useMemo(() => {
    const now = loadedAt; // instante en que llegó la lista (evita llamar a Date.now() en el render)
    return puzzles
      .map(p => ({ p, status: srsStatus(p, now) }))
      .filter(({ p, status }) => {
        if (filters.type !== 'all' && p.puzzleType !== filters.type) return false;
        if (filters.color !== 'all' && (p.playerColor || 'white') !== filters.color) return false;
        if (filters.motif !== 'all' && !(p.tacticalMotifs || []).includes(filters.motif)) return false;
        if (filters.status === 'pending') return status === 'failed' || status === 'due' || status === 'new';
        if (filters.status !== 'all') return status === filters.status;
        return true;
      })
      .sort((a, b) =>
        STATUS_RANK[a.status] - STATUS_RANK[b.status]
        || new Date(a.p.nextReviewAt || 0) - new Date(b.p.nextReviewAt || 0))
      .map(({ p, status }) => ({ ...p, srsStatus: status }));
  }, [puzzles, filters, loadedAt]);

  const handleTrainAll = () => {
    if (visible.length === 0) return;
    setStartIndex(0);
    setView('player');
  };

  const handleTrainSingle = (index) => {
    setStartIndex(index);
    setView('player');
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (await confirm('¿Eliminar este puzzle?', { confirmLabel: 'Eliminar' })) {
      backendService.deletePuzzle(id);
    }
  };

  const handleClearAll = async () => {
    if (await confirm('¿Borrar toda la biblioteca? Esta acción no se puede deshacer.', { confirmLabel: 'Borrar todo' })) {
      backendService.clearPuzzles();
    }
  };

  if (view === 'player') {
    return <PuzzlePlayer puzzles={visible} initialIndex={startIndex} onBack={() => setView('library')} />;
  }

  if (view === 'importer') {
    return <PuzzleImporter onBack={() => setView('library')} />;
  }

  return (
    <div className="puzzle-container glass-panel">
      <div className="puzzle-header">
        <div className="ph-title">
          <h2>Biblioteca de Puzzles</h2>
          <span className="ph-count">
            {visible.length === puzzles.length ? `${puzzles.length} guardados` : `${visible.length} de ${puzzles.length}`}
          </span>
        </div>
        <div className="ph-actions">
          {puzzles.length > 0 && (
            <button className="ph-icon-btn danger" onClick={handleClearAll} title="Borrar toda la biblioteca" aria-label="Borrar toda la biblioteca">
              <Trash2 size={14} />
            </button>
          )}
          <button className="ph-icon-btn" onClick={() => setView('importer')} title="Extraer puzzles de mis partidas" aria-label="Extraer puzzles de mis partidas">
            <Download size={14} />
          </button>
          <button className="ph-icon-btn accent" onClick={handleTrainAll} disabled={visible.length === 0} title="Entrenar" aria-label="Entrenar">
            <Play size={14} />
          </button>
        </div>
      </div>

      {puzzles.length > 0 && (
        <div className="puzzle-filters">
          <select value={filters.status} onChange={(e) => setFilter('status', e.target.value)} aria-label="Estado">
            {STATUS_FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select value={filters.type} onChange={(e) => setFilter('type', e.target.value)} aria-label="Tipo">
            <option value="all">Todo tipo</option>
            <option value="mate">Mates</option>
            <option value="tactical_blunder">Tácticas</option>
          </select>
          <select value={filters.color} onChange={(e) => setFilter('color', e.target.value)} aria-label="Color">
            <option value="all">Ambos colores</option>
            <option value="white">Blancas</option>
            <option value="black">Negras</option>
          </select>
          <select value={filters.motif} onChange={(e) => setFilter('motif', e.target.value)} aria-label="Motivo táctico">
            <option value="all">Todo motivo</option>
            {motifOptions.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      )}

      {loading ? (
        <div className="puzzle-loading">
          <Loader2 className="spinner" size={32} />
          <p>Cargando biblioteca…</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="puzzle-empty">
          <p>{puzzles.length === 0 ? 'No hay puzzles guardados.' : 'Ningún puzzle coincide con los filtros.'}</p>
          {puzzles.length === 0 && (
            <button className="ph-btn primary" onClick={() => setView('importer')}>
              Extraer de mis partidas
            </button>
          )}
        </div>
      ) : (
        <div className="puzzle-grid premium-scroll">
          {visible.map((p, index) => {
            const orientation = p.playerColor === 'black' ? 'black' : 'white';
            const label = p.label || 'Táctica';
            const motifs = Array.isArray(p.tacticalMotifs) ? p.tacticalMotifs : [];

            return (
              <div
                key={p.id}
                className="puzzle-card"
                role="button"
                tabIndex={0}
                onClick={() => handleTrainSingle(index)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleTrainSingle(index);
                  }
                }}
              >
                <div className="pc-board-wrapper">
                  <LazyChessboard fen={p.fen} orientation={orientation} />
                  <button className="pc-delete-btn" onClick={(e) => handleDelete(e, p.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="pc-info">
                  <span className="pc-label">
                    {label}
                    <span className={`pc-srs ${p.srsStatus}`} title={p.nextReviewAt ? `Próximo repaso: ${new Date(p.nextReviewAt).toLocaleDateString()}` : 'Sin repasar'}>
                      {STATUS_LABELS[p.srsStatus]}
                    </span>
                    {p.puzzleType && <span className="pc-type">{PUZZLE_TYPE_LABELS[p.puzzleType] || p.puzzleType}</span>}
                  </span>
                  <span className="pc-meta" suppressHydrationWarning>
                    {p.opponent ? `vs ${p.opponent}` : (p.gameId ? `Partida ${p.gameId.slice(-6)}` : 'Manual')}
                    {p.win !== undefined && p.win !== null ? (p.win === 1 ? ' (Victoria)' : p.win === 0 ? ' (Empate)' : ' (Derrota)') : ''}
                    {p.gameDate ? ` • ${new Date(p.gameDate).toLocaleDateString()}` : ''}
                  </span>
                  <div className="pc-badges">
                    {p.isOnlyMove && (
                      <span className="pc-badge only-move" title={`Gap crítico: ${p.criticalityGap}`}>Only Move</span>
                    )}
                    {p.tensionIndex > 4 && (
                      <span className="pc-badge tension" title={`${p.attackedSquares} casillas bajo ataque`}>
                        Tensión ({p.tensionIndex})
                      </span>
                    )}
                    {p.blunderSeverity > 0.5 && (
                      <span className="pc-badge severe">Severo ({Number(p.blunderSeverity).toFixed(2)})</span>
                    )}
                    {motifs.map(m => (
                      <span key={m} className="pc-badge motif">{m}</span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {dialog}
    </div>
  );
};