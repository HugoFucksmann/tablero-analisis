/**
 * Agrupa la serie cronológica de precisión en bloques de `size` partidas consecutivas
 * y devuelve el promedio de cada bloque. El último bloque puede ser más corto.
 * Con pocas partidas (< 2 bloques completos) no se agrupa: se muestran tal cual.
 *
 * @param {{ date: string, accuracy: number }[]} trend  ordenada de la más antigua a la más reciente
 * @param {number} [size=10]
 * @returns {{ accuracy: number, from: number, to: number, count: number, date: string }[]}
 *   `from`/`to`: posición (1-based) de la primera y última partida del bloque.
 */
export function groupAccuracyTrend(trend, size = 10) {
  const valid = (trend || []).filter(t => Number.isFinite(t?.accuracy));
  const step = valid.length >= size * 2 ? size : 1;
  const groups = [];

  for (let i = 0; i < valid.length; i += step) {
    const chunk = valid.slice(i, i + step);
    const sum = chunk.reduce((acc, t) => acc + t.accuracy, 0);
    groups.push({
      accuracy: sum / chunk.length,
      from: i + 1,
      to: i + chunk.length,
      count: chunk.length,
      date: chunk[chunk.length - 1].date,
    });
  }
  return groups;
}
