import React from 'react';
import { Calendar, Clock, Layers, Plus, Crown } from 'lucide-react';
import './StatsFilterBar.css';


export const StatsFilterBar = ({ 
  timeFilter, 
  durationFilter, 
  countFilter, 
  incrementFilter = 'all',
  startFilter = 'all',
  onFilterChange 
}) => {
  return (
    <div className="stats-filters-bar">
      <div className="filter-pill-group">
        <Calendar size={13} />
        <select
          value={timeFilter}
          onChange={(e) => onFilterChange('timeFilter', e.target.value)}
          className="stats-dropdown"
          aria-label="Período"
        >
          <option value="all">Todo</option>
          <option value="7d">7 días</option>
          <option value="30d">30 días</option>
        </select>
      </div>
      <div className="filter-pill-group">
        <Clock size={13} />
        <select
          value={durationFilter}
          onChange={(e) => onFilterChange('durationFilter', e.target.value)}
          className="stats-dropdown"
          aria-label="Control de tiempo"
        >
          <option value="all">Mix</option>
          <option value="1m">1m Bala</option>
          <option value="3m">3m Blitz</option>
          <option value="5m">5m Blitz</option>
          <option value="10m">10m Rápida</option>
          <option value="15m">15m Rápida</option>
          <option value="30m">30m Clásica</option>
        </select>
      </div>
      <div className="filter-pill-group">
        <Plus size={13} />
        <select
          value={incrementFilter}
          onChange={(e) => onFilterChange('incrementFilter', e.target.value)}
          className="stats-dropdown"
          aria-label="Incremento"
        >
          <option value="all">Cualquier inc.</option>
          <option value="none">Sin inc.</option>
          <option value="inc">Con inc.</option>
        </select>
      </div>
      <div className="filter-pill-group">
        <Crown size={13} />
        <select
          value={startFilter}
          onChange={(e) => onFilterChange('startFilter', e.target.value)}
          className="stats-dropdown"
          aria-label="Posición inicial"
        >
          <option value="all">Cualquier inicio</option>
          <option value="standard">Estándar</option>
          <option value="custom">Personalizado</option>
        </select>
      </div>
      <div className="filter-pill-group">
        <Layers size={13} />
        <select
          value={countFilter}
          onChange={(e) => onFilterChange('countFilter', e.target.value)}
          className="stats-dropdown"
          aria-label="Cantidad de partidas"
        >
          <option value="10">Últ. 10</option>
          <option value="25">Últ. 25</option>
          <option value="50">Últ. 50</option>
          <option value="all">Todas</option>
        </select>
      </div>
    </div>
  );
};
