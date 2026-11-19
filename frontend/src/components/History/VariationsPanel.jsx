import React from 'react';
import { X, Cpu, GitBranch } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { useShallow } from 'zustand/react/shallow';
import './VariationsPanel.css';

const MAX_VARIATION_PLIES = 8;

/** "12... Nc6 13. Bb5" a partir del ply de inicio y las jugadas SAN. */
function formatLine(startPly, sans, firstIsWhite, startFullmove) {
  const parts = [];
  sans.slice(0, MAX_VARIATION_PLIES).forEach((san, i) => {
    const ply = startPly + i;
    const isWhite = firstIsWhite ? ply % 2 === 0 : ply % 2 === 1;
    const number = startFullmove + Math.floor((ply + (firstIsWhite ? 0 : 1)) / 2);
    if (isWhite) parts.push(`${number}. ${san}`);
    else parts.push(i === 0 ? `${number}... ${san}` : san);
  });
  return parts.join(' ') + (sans.length > MAX_VARIATION_PLIES ? ' …' : '');
}

export const VariationsPanel = () => {
  const {
    variations, loadVariation, deleteVariation, startFen, isExploreMode,
  } = useGameStore(useShallow(state => ({
    variations: state.variations,
    loadVariation: state.loadVariation,
    deleteVariation: state.deleteVariation,
    startFen: state.startFen,
    isExploreMode: state.isExploreMode,
  })));

  const fenParts = (startFen || '').split(' ');
  const firstIsWhite = fenParts[1] !== 'b';
  const startFullmove = parseInt(fenParts[5], 10) || 1;

  if (variations.length === 0) return null;

  return (
    <div className="variations-panel">
      {variations.length > 0 && (
        <div className="vp-section">
          <div className="vp-title">
            <GitBranch size={11} /> Variantes ({variations.length}){isExploreMode ? ' · explorando' : ''}
          </div>
          {variations.map(v => (
            <div key={v.id} className={`vp-line ${v.source}`}>
              <button className="vp-open" onClick={() => loadVariation(v.id)} title="Abrir esta variante en el tablero">
                {v.source === 'engine' && <Cpu size={10} />}
                <span className="vp-moves">{formatLine(v.prefix.length, v.moves, firstIsWhite, startFullmove)}</span>
              </button>
              <button className="vp-delete" onClick={() => deleteVariation(v.id)} aria-label="Eliminar variante" title="Eliminar variante">
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
