/**
 * Convierte el campo TimeControl de PGN a la forma canónica "<base>+<incremento>" en segundos
 * (la que usa el backend para filtrar por duración e incremento).
 * Formatos soportados:
 *   - "600+5"   → '600+5' (Lichess / Chess.com: segundos base + incremento)
 *   - "600"     → '600+0' (sin incremento)
 *   - "0:10:00" → '600+0' (reloj inicial PGN: horas:minutos:segundos)
 *   - "-" / "?" → null    (sin control de tiempo)
 */
export function normalizeTimeControl(raw) {
    if (!raw || raw === '-' || raw === '?') return null;
    let baseSec = 0;
    let incSec = 0;

    if (raw.includes(':')) {
        // Formato HH:MM:SS
        const parts = raw.split(':').map(Number);
        if (parts.length === 3) {
            baseSec = parts[0] * 3600 + parts[1] * 60 + parts[2];
        } else if (parts.length === 2) {
            baseSec = parts[0] * 60 + parts[1];
        }
    } else {
        // Formato segundos+incremento
        const [base, inc] = raw.split('+');
        baseSec = parseInt(base, 10);
        incSec = parseInt(inc, 10);
    }

    if (isNaN(baseSec) || baseSec === 0) return null;
    return `${baseSec}+${isNaN(incSec) ? 0 : incSec}`;
}
