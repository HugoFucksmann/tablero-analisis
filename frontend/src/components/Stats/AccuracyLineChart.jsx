import React, { useMemo } from 'react';
import { groupAccuracyTrend } from '../../utils/statsUtils';
import './AccuracyLineChart.css';

const WIDTH = 400;
const HEIGHT = 80;
const PADDING = 8;
const GROUP_SIZE = 10;

/**
 * Evolución de precisión: promedio por bloques de 10 partidas consecutivas.
 * El eje Y se ajusta al rango real de los datos (con margen) para que la
 * tendencia se note aunque la precisión varíe pocos puntos.
 */
const AccuracyLineChart = ({ data }) => {
  const chartData = useMemo(() => {
    const groups = groupAccuracyTrend(data, GROUP_SIZE);
    if (groups.length === 0) return null;

    const values = groups.map(g => g.accuracy);
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const margin = Math.max(2, (rawMax - rawMin) * 0.15);
    const min = Math.max(0, rawMin - margin);
    const max = Math.min(100, rawMax + margin);
    const range = max - min || 1;

    const getY = (acc) => HEIGHT - PADDING - ((acc - min) / range) * (HEIGHT - 2 * PADDING);
    const getX = (i) => (groups.length <= 1
      ? WIDTH / 2
      : PADDING + (i / (groups.length - 1)) * (WIDTH - 2 * PADDING));

    const points = groups.map((g, i) => ({
      ...g,
      x: getX(i),
      y: getY(g.accuracy),
      label: g.from === g.to
        ? `Partida ${g.from}: ${g.accuracy.toFixed(1)}%`
        : `Partidas ${g.from}–${g.to}: ${g.accuracy.toFixed(1)}%`,
    }));

    const linePoints = points.map(p => `${p.x},${p.y}`).join(' ');
    const first = points[0];
    const last = points[points.length - 1];
    const areaPath = [
      `M ${first.x} ${HEIGHT}`,
      ...points.map(p => `L ${p.x} ${p.y}`),
      `L ${last.x} ${HEIGHT}`,
      'Z',
    ].join(' ');

    return {
      points, linePoints, areaPath,
      min: Math.round(min), max: Math.round(max),
      grouped: groups.length > 0 && groups[0].count > 1,
    };
  }, [data]);

  if (!chartData) {
    return <div className="no-data-chart">No hay suficientes datos para mostrar la tendencia</div>;
  }

  const { areaPath, linePoints, points, min, max, grouped } = chartData;

  return (
    <div className="line-chart-wrapper" style={{ height: '100px', marginTop: '10px', position: 'relative' }}>
      <span style={{ position: 'absolute', top: 0, left: 2, fontSize: 9, opacity: 0.5 }}>{max}%</span>
      <span style={{ position: 'absolute', bottom: 0, left: 2, fontSize: 9, opacity: 0.5 }}>{min}%</span>
      {grouped && (
        <span style={{ position: 'absolute', top: 0, right: 2, fontSize: 9, opacity: 0.5 }}>
          promedio cada {GROUP_SIZE} partidas
        </span>
      )}
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        className="graph-svg"
      >
        <defs>
          <linearGradient id="accGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ff9800" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#ff9800" stopOpacity="0" />
          </linearGradient>
        </defs>

        <path d={areaPath} fill="url(#accGradient)" />

        <line
          x1={PADDING} y1={HEIGHT / 2}
          x2={WIDTH - PADDING} y2={HEIGHT / 2}
          stroke="rgba(255,255,255,0.05)"
          strokeWidth="1"
          strokeDasharray="2 2"
        />

        {points.length > 1 && (
          <polyline
            points={linePoints}
            fill="none"
            stroke="#ff9800"
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {points.map((p) => (
          <circle key={`${p.from}-${p.to}`} cx={p.x} cy={p.y} r="2" fill="#ff9800" style={{ opacity: 0.85 }}>
            <title>{p.label}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
};

export default React.memo(AccuracyLineChart);
