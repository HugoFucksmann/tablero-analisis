import { Chess } from 'chess.js';

/**
 * Variantes: líneas alternativas guardadas respecto a la partida principal.
 * Cada variante es { id, prefix: SAN[], moves: SAN[], source: 'user' | 'engine' }:
 *  - `prefix`: jugadas comunes con la principal hasta el punto de bifurcación,
 *  - `moves`: jugadas propias de la variante (la primera difiere de la principal en ese punto).
 */

export const sansOf = (moves) => (moves ?? []).map(m => (typeof m === 'string' ? m : m.san));

const startsWith = (arr, head) => head.length <= arr.length && head.every((x, i) => arr[i] === x);

/** Recorta una línea completa respecto a la principal: devuelve { prefix, moves } o null si no aporta nada. */
export function splitFromMainLine(mainSans, fullSans) {
  let d = 0;
  while (d < fullSans.length && d < mainSans.length && fullSans[d] === mainSans[d]) d++;
  if (d >= fullSans.length) return null; // la línea está contenida en la principal
  return { prefix: fullSans.slice(0, d), moves: fullSans.slice(d) };
}

/** Añade una línea (completa, desde la posición inicial) a la lista de variantes sin duplicar. */
export function addVariation(variations, mainSans, fullSans, source = 'user') {
  const part = splitFromMainLine(mainSans, fullSans);
  if (!part) return variations;

  for (const v of variations) {
    if (v.prefix.length !== part.prefix.length || !startsWith(v.prefix, part.prefix)) continue;
    // Ya existe una variante igual o más larga con la misma bifurcación
    if (startsWith(v.moves, part.moves)) return variations;
  }

  // Si la nueva extiende a una existente (misma bifurcación), la reemplaza
  const kept = variations.filter(v =>
    !(v.prefix.length === part.prefix.length && startsWith(v.prefix, part.prefix) && startsWith(part.moves, v.moves)));

  const id = `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return [...kept, { id, ...part, source }];
}

/** Variantes guardadas + la línea actual (si el usuario está explorando fuera de la principal). */
export function allVariations(variations, mainSans, currentSans, isExploreMode) {
  return isExploreMode ? addVariation(variations, mainSans, currentSans, 'user') : variations;
}

/** Reproduce SANs desde la posición inicial y devuelve las jugadas "verbose" (o null si alguna es ilegal). */
export function replaySans(sans, startFen = null) {
  try {
    const chess = startFen ? new Chess(startFen) : new Chess();
    const out = [];
    for (const san of sans) {
      const m = chess.move(san);
      if (!m) return null;
      out.push(m);
    }
    return out;
  } catch {
    return null;
  }
}
