# Pendiente

Solo lo que falta o necesita tu criterio. Lo ya hecho está en [HECHO.md](HECHO.md).

## A. Verificación manual (navegador + Stockfish real)
- Lote de análisis con navegación simultánea por el tablero.
- Puzzle de mate resuelto con un mate alternativo; promoción ilegal (no debe abrir el diálogo).
- Modo Jugar completo: rendirse, tablas, final por mate/tiempo, revancha y "Analizar partida"; partidas desde una posición con turno de negras.
- Restaurar un respaldo real, importar un `.pgn` con varias partidas y el diseño móvil en un dispositivo físico (tablet incluida).
- Reanalizar partidas antiguas para ver brillantes, tiempos y filtros nuevos.

## B. Decisiones tuyas
1. **Hilos por defecto de la UI** (hoy 2): ¿subirlo, o dejarlo y usar "Configurar según mi PC"?
2. **Token de Lichess viejo**: el `.env` original del backend tenía `LICHESS_TOKEN`. Si era real, revocarlo.
3. **Licencia**: MIT con "Hugo Fucksmann" como titular; cambiar si preferís otra.
4. **Dependencias**: evaluar majors nuevos (eslint 10, framer-motion 14, better-sqlite3 13, TypeScript 7, `@types/better-sqlite3` 9) y los 5 avisos `high` de `npm audit` del frontend (cadena `vite` → `tinyglobby`/`fdir` → `picomatch`, solo desarrollo/build): arreglarlos exige `npm audit fix --force`, que sube Vite de versión mayor.
5. **Regenerar los puzzles ya guardados** para que apliquen el criterio de solución sin ambigüedad (los viejos conservan sus continuaciones largas).
6. **Umbrales del detector de brillantes** (`brilliantDetector.ts`: 3 puntos de sacrificio, <85 % de probabilidad previa, ≥35 % posterior): ajustar tras probar con tus partidas.

## C. Deuda técnica
1. **Esquema SQL:** `analyses.accuracyByPhase`/`labelCounts` (JSON) duplican `phase_accuracy`/`move_quality` (la tarjeta de calidad ya no usa `move_quality`); sin `NOT NULL`/`CHECK` en columnas como `win` o `color`; correr `VACUUM;` una vez con el servidor apagado para recuperar espacio.
2. **Memoria por conexión:** cada conexión WebSocket tiene su propio motor en vivo, su motor de juego y, al analizar, su pool; varias pestañas abiertas multiplican el uso.
3. **Variantes:** viven solo en memoria y son siempre hermanas de la partida principal (sin anidar).
4. **Móvil:** con un teléfono de ~800 px de alto el panel inferior queda en ~240 px; una mejora posible es un panel expandible arrastrando.
5. **Tests:** faltan componentes React, la extracción de puzzles con motor real y el resto de handlers del servidor.

## Decisiones ya tomadas (para recordar)
- `puzzles.gameId` **no** tiene FK a propósito: los puzzles pueden extraerse de partidas sin analizar y sobreviven al borrado de su análisis (documentado en `db.ts` y cubierto por un test).
- Las estadísticas personales cuentan solo las jugadas del usuario (el bando se deduce del turno de `start_fen`).
- Las partidas contra el bot no se guardan hasta que se pulsa "Analizar partida".
