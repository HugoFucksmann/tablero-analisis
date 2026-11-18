/**
 * Sugiere hilos y memoria hash del motor según los recursos de la máquina.
 *
 * - Hilos: un motor de Stockfish por hilo; se deja un núcleo libre para el navegador, el
 *   servidor y el sistema (en máquinas de 1-3 núcleos se usan todos).
 * - Hash: ~128 MB por motor, sin superar un cuarto de la RAM libre ni el máximo del control.
 *   Se redondea hacia abajo a múltiplos de `step` (el paso del slider).
 *
 * @param {{ cpuCount: number, freeMemMB?: number | null }} resources
 * @param {{ minHash?: number, maxHash?: number, step?: number, mbPerEngine?: number }} [limits]
 * @returns {{ threads: number, hash: number }}
 */
export function recommendEngineConfig(resources, limits = {}) {
  const { minHash = 256, maxHash = 8192, step = 256, mbPerEngine = 128 } = limits;
  const cpuCount = Math.max(1, Math.floor(resources.cpuCount) || 1);

  const threads = cpuCount >= 4 ? cpuCount - 1 : cpuCount;

  const freeCap = Number.isFinite(resources.freeMemMB) ? resources.freeMemMB * 0.25 : maxHash;
  const wanted = Math.min(threads * mbPerEngine, freeCap, maxHash);
  const hash = Math.max(minHash, Math.floor(wanted / step) * step);

  return { threads, hash };
}
