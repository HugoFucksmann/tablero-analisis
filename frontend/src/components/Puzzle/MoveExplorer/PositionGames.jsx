import React, { useEffect, useState } from 'react';
import { openAnalysedGame } from '../../../utils/openGame';
import { backendService } from '../../../services/backendService';
import './PositionGames.css';

const RESULT = { 1: ['Victoria', 'win'], 0: ['Empate', 'draw'], '-1': ['Derrota', 'loss'] };

/** Partidas propias analizadas que alcanzaron la posición actual del explorador. */
export const PositionGames = ({ fen }) => {
  // El resultado guarda la posición que lo produjo: "cargando" = aún no hay resultado para este FEN.
  const [result, setResult] = useState({ fen: null, games: [] });
  const loading = result.fen !== fen;

  useEffect(() => {
    let active = true;
    const clean = fen.trim().split(' ').slice(0, 4).join(' ');
    backendService.getGamesAtPosition(clean)
      .then(res => { if (active) setResult({ fen, games: Array.isArray(res.games) ? res.games : [] }); })
      .catch(() => { if (active) setResult({ fen, games: [] }); });
    return () => { active = false; };
  }, [fen]);

  const openGame = (game) => {
    // `ply` es la jugada que salió de esta posición: la posición equivale al índice ply - 1
    openAnalysedGame(game.gameId, Math.max(-1, game.ply - 1));
  };

  if (loading || result.games.length === 0) return null;

  return (
    <div className="position-games">
      <div className="pg-title">Mis partidas en esta posición ({result.games.length})</div>
      <div className="pg-list premium-scroll">
        {result.games.map(g => {
          const [label, cls] = RESULT[g.win] || ['—', 'draw'];
          return (
            <div
              key={g.gameId}
              className="pg-row"
              role="button"
              tabIndex={0}
              onClick={() => openGame(g)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openGame(g); } }}
              title="Abrir partida en esta posición"
            >
              <span className={`pg-result ${cls}`}>{label}</span>
              <span className="pg-opponent">{g.opponent ? `vs ${g.opponent}` : 'Rival desconocido'}</span>
              <span className="pg-move">{g.moveSan}</span>
              <span className="pg-date">{g.date ? new Date(g.date).toLocaleDateString() : ''}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
