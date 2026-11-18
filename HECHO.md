# Cambios realizados (v1.0)

Registro de lo ya implementado y verificado. Lo que sigue abierto está en [DECISIONES.md](DECISIONES.md).

## Estructura y documentación
- Monorepo `frontend/` + `backend/` + `shared/` (contrato WebSocket). Los repos originales no se tocaron; sin historia git (decisión tomada).
- Eliminados: `netlify.toml`, `src/migrate.ts`, `migrate_*.js` (estaban rotos: `require` en un paquete ESM), libros Polyglot `.bin` sin uso, `src/assets` de la plantilla Vite, `prox.md`, `todo.md`, `a.md`, `base.md`, `test_*`, `scratch/`. Respaldo guardado fuera del repo.
- READMEs reescritos según el código real; `architecture_backend.md` corregido (extensiones `.ts`, sin fallback a Lichess).
- Agregados: `LICENSE` (MIT), `CHANGELOG.md`, `.gitattributes`, `.editorconfig`, `.gitignore`, `package.json` raíz con scripts, CI de GitHub (build de ambos), `.env.example` del backend.
- Dependencias del backend actualizadas dentro de su rango semver, 0 vulnerabilidades (`ws` actualizado por un aviso de DoS).

## Seguridad básica y configuración
- Token de Lichess: se quitó `VITE_TOKEN_LICHESS`; ya no puede incrustarse en el bundle. Se ingresa solo desde la UI.
- Sonidos sintetizados con Web Audio API (sin red ni archivos) con botón de volumen bajo el tablero.
- Tipos compartidos del protocolo en `shared/protocol.d.ts`: el backend tiene tipados el dispatcher y el envío (chequeado por `tsc`); el frontend los referencia por JSDoc. El servidor valida que cada mensaje sea un objeto con `type`.

## Base de datos (backend)
- Esquema final en `CREATE TABLE` y migraciones versionadas con `PRAGMA user_version` (sin `try/catch` que ocultaba errores). Verificado sobre una copia de tu base real: migra bien, `integrity_check` y `foreign_key_check` OK, resultados idénticos a los anteriores.
- Eliminadas columnas heredadas de `puzzles` (`initialMove`, `theme`, `difficulty`) e índices redundantes; nuevo índice por fecha efectiva `COALESCE(gameDate, date)`.
- PRAGMAs: WAL, `synchronous = NORMAL`, `busy_timeout`, `temp_store = MEMORY`, caché y `mmap`. Ruta configurable con `DB_PATH`.
- `INSERT OR REPLACE` en `analyses` reemplazado por UPSERT (REPLACE borraba y reinsertaba la fila, disparando el `ON DELETE CASCADE`).

## Rendimiento
- `getStatDetails` ya no trae ni parsea los ~30 KB de `full_json` por partida (el rival se resuelve con `json_extract` solo si falta y se guarda en `analyses.opponent`): 28–41 ms → 2–3 ms.
- `getAggregatedStats`: el conjunto filtrado se calcula una vez en una tabla temporal y los statements se cachean. Corregido un `LIMIT NaN` si `count` llegaba inválido.
- Arranque: carga del libro de aperturas 5,7 s → 1,7 s con resultado idéntico, y búsqueda con camino rápido.
- Motor: handler de `error` en `stdin` (un `EPIPE` no capturado tumbaba el servidor) y decodificación UTF-8 segura de stdout.
- Frontend: `Board` y `PuzzlePlayer` usaban `useGameStore()` sin selector (re-render con cualquier cambio); se quitó un polling de 500 ms en el modal del motor; el socket ignora eventos de conexiones ya reemplazadas.
- Lint del frontend: de 39 problemas a 0 (ver más abajo).

## Estadísticas
- Validadas contra los datos crudos de la base (510 partidas): totales, win/draw rate, precisión media, por color, por fase y calidad de jugadas; tablas `phase_accuracy`/`move_quality` vs. los JSON de `analyses`. Todo coincide.
- "Evolución de precisión" promedia bloques de 10 partidas consecutivas (con menos de 20, una por punto), eje Y ajustado al rango real y tooltip por punto. El promedio ponderado de los bloques coincide con el de la base.
- La precisión promedio ya no cuenta como 0 las partidas sin dato; la tendencia usa el mismo criterio.
- "Aperturas críticas" exige mínimo 3 partidas (si no hay, relaja a 1).
- "Gestión de tiempo": el caso "Insta-move / Pánico" nunca se alcanzaba por el orden de las condiciones. Corregido.

## Puzzles
- Generador probado de punta a punta con Stockfish: produce los mismos puzzles que ya existían. Ahora las jugadas posteriores del solucionador se validan con MultiPV 2 y la solución se corta antes de la primera con alternativa clara; los mates se comparan correctamente con centipeones y no se duplica el puzzle del mismo error (partida + jugada).
- Movimiento libre: una jugada ilegal rebota sin penalizar; una legal pero incorrecta se ve ~0,7 s con sonido y cartel y luego el tablero vuelve a la posición previa. Si se retrocede en el historial, el intento devuelve a la posición del puzzle. El cartel de error se limpia al jugar bien.
- Puzzle → Explorador/Análisis: al entrar a Puzzles se guarda una foto de la partida y del análisis, y al salir se restaura tal cual. Probado en el navegador.

## Motor y análisis en lote
- Mover el tablero (evaluación en vivo) ya no cancela un lote: controladores de cancelación separados para lo en vivo y para partida/lote. Probado con Stockfish.
- Una partida defectuosa no tira el lote entero y se descartan repetidas en la misma tanda.
- Menos tráfico: no se envía `batch_move_result` (nadie lo consume) y el progreso se emite una vez por punto porcentual.
- `threads` (hasta los núcleos de la máquina), `hash` (16–1024 MB por motor) y `multiPv` (1–10) se acotan en el servidor; valores no numéricos caen al default.
- Tras un lote (también cancelado) el cliente refresca el historial de análisis.
- Configuración del motor: el control de hilos llega hasta todos los núcleos lógicos (antes núcleos − 1). Nuevo botón **"Configurar según mi PC"**: toma núcleos y RAM libre del backend (`get_server_config` ahora devuelve `cpuCount`, `totalMemMB`, `freeMemMB`; sin backend usa los núcleos del navegador) y sugiere hilos (núcleos − 1, o todos si hay menos de 4) y hash (~128 MB por motor, máx. un cuarto de la RAM libre).
- "Restablecer" desconectaba el backend y no volvía a conectar hasta recargar la página; ahora reconecta.

## Instalación y lint del frontend
- `npm ci` limpio funciona (el fallo anterior era del entorno: registro lento / `ENOTEMPTY` por el antivirus). Se quitó `.npmrc` con `legacy-peer-deps`: resolver el árbol sin esa opción no genera conflictos de dependencias.
- Lint sin errores ni avisos:
  - `PuzzlePlayer`: "resuelto" e "incorrecto" se derivan del estado del puzzle en el store (antes eran copias locales sincronizadas con efectos); el aviso al backend y el sonido al resolver corren una vez por resolución; la respuesta automática del rival declara todas sus dependencias; "Reintentar" tiene su propio manejador.
  - `MoveExplorerView`: las estadísticas de la última jugada se derivan con `useMemo` (conservando las de la última jugada que las tuvo) y el estado "cargando" se marca al cambiar la posición, sin `setState` dentro de efectos.
  - `StatsDetailView`: el resultado se guarda junto a la consulta que lo produjo (el "cargando" se deriva) y la consulta se repite si cambia el usuario; se ignoran respuestas de consultas ya reemplazadas.
  - `PuzzleSession`: mezcla uniforme (Fisher-Yates) en vez de `sort(() => Math.random() - 0.5)`.
- El CI de GitHub ahora también corre el lint del frontend.
- `npm audit fix` (sin `--force`) en el frontend: de 13 avisos a 5 (los restantes, ver DECISIONES A.6). El backend sigue en 0.
