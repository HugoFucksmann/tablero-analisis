# Pendiente (v1.0)

Solo lo que falta o necesita tu criterio. Lo ya hecho está en [HECHO.md](HECHO.md).

## A. Decisiones tuyas
1. **Pausar la evaluación en vivo durante un lote.** Hoy compite por CPU con el lote. Requiere que el cliente lo sepa (`batchStatus`).
2. **Regenerar los puzzles ya guardados** para que apliquen el criterio de solución sin ambigüedad (los viejos conservan sus continuaciones largas).
3. **Hilos por defecto de la UI** (hoy 2): ¿subirlo, o dejarlo y usar el botón "Configurar según mi PC"?
4. **Token de Lichess viejo**: el `.env` original del backend tenía `LICHESS_TOKEN`. Si era real, revocarlo.
5. **Licencia**: MIT con "Hugo Fucksmann" como titular; cambiar si preferís otra.
6. **Dependencias**: evaluar majors nuevos (eslint 10, framer-motion 14, better-sqlite3 13, TypeScript 7, `@types/better-sqlite3` 9) y los 5 avisos `high` de `npm audit` del frontend (cadena `vite` → `tinyglobby`/`fdir` → `picomatch`, solo desarrollo/build): arreglarlos exige `npm audit fix --force`, que sube Vite de versión mayor.

## B. Deuda técnica
1. **Esquema SQL** (requiere rehacer tablas o decidir diseño):
   - `analysis_full_data.game_id` referencia `analyses(gameId)` y el resto `analyses(id)`.
   - `analyses.accuracyByPhase`/`labelCounts` (JSON) duplican `phase_accuracy`/`move_quality`.
   - `puzzles.gameId` sin FK: al borrar una partida sus puzzles quedan huérfanos (¿intencional?).
   - Sin `NOT NULL`/`CHECK` en columnas como `win` o `color`.
   - `getMoveExplorer` y las métricas avanzadas agregan en JS; podrían agregarse en SQL.
   - Correr `VACUUM;` una vez con el servidor apagado para recuperar el espacio libre de migraciones pasadas.
2. **Puzzles**: en los mates con varias formas válidas de dar mate en la última jugada solo se acepta la guardada.
3. **Tipos compartidos**: sin validación en runtime, y los payloads pesados (stats, puzzles, análisis completo) están como `unknown`; se pueden tipar con más detalle.
4. **Memoria por conexión**: cada conexión WebSocket tiene su propio motor en vivo (y su pool al analizar); varias pestañas abiertas multiplican el uso.
5. **Tests y CI con tests**: diferidos a la siguiente fase.

## C. Seguridad (diferida a pedido, para el final)
Token de Lichess en `localStorage` en texto plano, validación de `Origin` y del esquema de mensajes en el WebSocket, límites de tamaño de mensaje, CORS/CSP.
