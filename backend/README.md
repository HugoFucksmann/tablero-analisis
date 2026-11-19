# ♟️ Chess Analysis Backend

[![Node.js](https://img.shields.io/badge/Node.js-20+-68a063.svg)](https://nodejs.org/)
[![SQLite](https://img.shields.io/badge/SQLite-better--sqlite3-003b57.svg)](https://www.sqlite.org/)
[![Stockfish](https://img.shields.io/badge/Engine-Stockfish-4b4b4b.svg)](https://stockfishchess.org/)
[![WebSocket](https://img.shields.io/badge/Protocol-WebSocket-010101.svg)](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
[![Chess.js](https://img.shields.io/badge/Logic-Chess.js_v1.4-8b4513.svg)](https://github.com/jhlywa/chess.js)

Servidor WebSocket local que centraliza toda la lógica de análisis de ajedrez. Corre el binario nativo de Stockfish en un pool de procesos paralelos, persiste los resultados en SQLite y expone una API orientada a eventos para el frontend.

## ✨ Características

- **⚡ Pool de motores paralelos** — crea una instancia de Stockfish por hilo configurado, cada una en su propio proceso con 1 hilo dedicado para máxima concurrencia
- **🗄️ SQLite normalizado** — tablas relacionales para análisis, jugadas individuales, métricas por fase y puzzles; sin JSON silos
- **📖 Libro de aperturas local** — 7 600+ posiciones indexadas desde los TSV oficiales de Lichess (A–E), lookup O(1), sin llamadas externas
- **🧩 Extracción de puzzles táctica** — identifica blunders significativos y construye puzzles con secuencia forzada, motivos tácticos y métricas de criticidad
- **📊 Estadísticas agregadas** — precisión por apertura, por fase, calidad de jugadas, patrones de tiempo, ventajas convertidas/perdidas y comebacks
- **🔭 Explorador de posiciones** — dado un FEN muestra todas las jugadas del usuario y del rival con win-rate, eval promedio y distribución de etiquetas
- **🔄 Análisis en lote** — analiza múltiples partidas reutilizando el pool de engines sin respawn
- **🤖 Motor de juego** — un Stockfish aparte, de fuerza limitada (`UCI_Elo` / `Skill Level`), responde las jugadas del modo Jugar sin afectar a la evaluación en vivo
- **💾 Respaldo HTTP** — `GET /backup` y `POST /restore` en el mismo puerto
- **🛡️ Validación y límites** — cada mensaje se valida (forma, tipos, rangos), 8 MB máximo y solo orígenes locales

## 🛠️ Stack

| Capa | Tecnología |
|---|---|
| Runtime | Node.js 20+ (ESM, TypeScript) |
| Protocolo | WebSockets (`ws`) |
| Chess Engine | Stockfish nativo (UCI) |
| Validación & FENs | Chess.js v1.4 |
| Base de datos | SQLite (`better-sqlite3`) |
| Libro de aperturas | TSVs A–E de Lichess (local) |

## ⚙️ Instalación

### Requisitos

Node.js 20+ y Stockfish instalado y en el `PATH` (o indicado en `STOCKFISH_PATH`):

```bash
# Ubuntu / Debian
sudo apt install stockfish

# macOS
brew install stockfish

# Windows: descargar el binario desde https://stockfishchess.org/download/
#          y apuntar STOCKFISH_PATH al .exe

# Verificar
stockfish --version
```

### Setup

```bash
cd backend
npm install
npm run build
```

### Variables de entorno

Copia `.env.example` a `.env` (todos los valores son opcionales):

```env
PORT=9001
STOCKFISH_PATH=stockfish
# DB_PATH=ruta/a/database.sqlite          (por defecto backend/data/database.sqlite)
# ALLOWED_ORIGINS=http://mi-equipo:5173   (además de localhost; separados por coma)
```

### Iniciar

```bash
npm run build   # compila TypeScript a dist/
npm start
```

El servidor escucha en `ws://127.0.0.1:9001` (y `http://127.0.0.1:9001` para el respaldo). Al arrancar carga el libro de aperturas y ejecuta un chequeo de integridad de la base de datos.

### Tests

```bash
npm test      # compila y corre node:test sobre dist/tests (requiere Node 22+ por el patrón de archivos)
```

Cubren lógica pura (probabilidades, clasificación, brillantes, tiempos, filtros de puzzles, libro de aperturas, validador) y repositorios sobre una base SQLite temporal (estadísticas, migración, repetición espaciada, respaldo/restauración).

## 🏗️ Estructura del Proyecto

```
backend/
├── src/
│   ├── server.ts                   # Entrypoint: HTTP (respaldo) + WebSocket, Origin, límite de tamaño
│   ├── handlers/
│   │   ├── messageHandlers.ts      # Dispatcher de mensajes WebSocket
│   │   └── messageValidator.ts     # Validación de forma, tipos y rangos de cada mensaje
│   ├── core/
│   │   ├── engineProcess.ts        # Spawn/kill del proceso Stockfish
│   │   ├── stockfishProcess.ts     # API de alto nivel: init, analyze, stop, setStrength, timeouts
│   │   └── uciParser.ts            # Parseo de output UCI (info, bestmove)
│   ├── services/
│   │   ├── analysis/
│   │   │   ├── analysisQueue.ts          # Motores por sesión: en vivo, partida/lote y juego (playMove)
│   │   │   ├── enginePool.ts             # Pool: N instancias × 1 hilo c/u
│   │   │   ├── analysisWorkerLoop.ts     # Distribuye posiciones entre engines
│   │   │   ├── gameAnalysisCoordinator.ts# Orquesta apertura + workers + métricas
│   │   │   ├── moveClassifier.ts         # Clasifica jugadas: label + errorTimeClass
│   │   │   ├── brilliantDetector.ts      # Detección de sacrificios (!!)
│   │   │   ├── evaluationRules.ts        # Umbrales wp y cálculo de accuracy
│   │   │   ├── advancedMetricsCalculator.ts # Tilt, comebacks, gestión de tiempo
│   │   │   ├── dataMiner.ts              # Motifs, tensión, OnlyMove, severidad
│   │   │   └── persistenceBuilder.ts     # Construye fullData + movesToSave
│   │   ├── openings/
│   │   │   ├── openingBook.ts      # Carga TSVs, Map<fen4 → entry>, getMoves()
│   │   │   └── openingService.ts   # Detecta apertura jugada a jugada (TSV-only)
│   │   └── puzzles/
│   │       ├── puzzleExtractor.ts  # Extrae puzzles de un análisis completo
│   │       └── puzzleFilters.ts    # Evalúa candidatos (wpLoss, secuencia, gap)
│   ├── storage/
│   │   ├── db.ts                   # Schema SQLite + migraciones versionadas (user_version)
│   │   ├── backup.ts               # Copia de seguridad (db.backup) y restauración por fusión
│   │   ├── gameStore.ts            # Orquesta guardado de análisis completo
│   │   ├── puzzleStore.ts          # CRUD de puzzles + repetición espaciada
│   │   ├── sqliteStore.ts          # Helpers de bajo nivel
│   │   └── repositories/
│   │       ├── analysisRepo.ts     # Queries sobre la tabla analyses
│   │       ├── puzzleRepo.ts       # Queries, filtros y SRS sobre puzzles
│   │       └── statsRepo.ts        # Agregaciones: stats, explorador, partidas por posición, salida de teoría
│   ├── tests/                      # node:test (se compila a dist/tests)
│   └── utils/
│       ├── analysisUtils.ts        # parsePgn, buildPositions, extractTimes, computeMoveTime
│       ├── chessMath.ts            # cpToWhiteWinProb, cpToVisualScore
│       └── phaseDetector.ts        # Detecta Apertura / Medio Juego / Final
├── data/
│   ├── database.sqlite             # Se crea al primer arranque (git-ignorada)
│   ├── a.tsv … e.tsv              # Libro de aperturas TSV (Lichess oficial)
└── architecture_backend.md         # Especificación técnica detallada
```

## 📡 Protocolo WebSocket

Todos los mensajes son JSON con un campo `type`. Opcionalmente llevan `requestId` y el servidor lo refleja en la respuesta. **La fuente de verdad de tipos y campos es [`shared/protocol.d.ts`](../shared/protocol.d.ts)**; todo mensaje entrante se valida antes de despacharse (los inválidos reciben `{ type: 'error' }`).

### Análisis de posición (live)

| Dirección | `type` | Descripción |
|---|---|---|
| → | `analyze_position` | Analiza un FEN en tiempo real (`fen`, `moveIndex`, config del motor) |
| ← | `position_progress` | Evaluación parcial mientras Stockfish busca |
| ← | `position_result` | Resultado final: score, mate, bestMove, lines |
| → | `cancel_live` | Cancela solo la evaluación en vivo (no toca lotes ni extracciones) |

### Análisis de partida completa

| Dirección | `type` | Descripción |
|---|---|---|
| → | `analyze_game` | Analiza el historial completo de una partida |
| ← | `status` / `progress` | Estado del motor y progreso general |
| ← | `move_result` | Resultado por jugada: label, errorTimeClass, moveTime, remainingTime, evaluación |
| ← | `opening_detected` | Apertura identificada (eco + nombre + plies de libro) |
| ← | `complete` | Accuracy final blancas / negras, por fase y resultado |
| ← | `cancelled` | El análisis fue cancelado |

### Análisis en lote

| Dirección | `type` | Descripción |
|---|---|---|
| → | `analyze_games` | Lote de partidas (`history` o `pgn`) |
| ← | `batch_analysis_started` / `_progress` / `_game_complete` | Avance del lote |
| ← | `batch_analysis_complete` / `_cancelled` | Fin o cancelación |

### Modo Jugar

| Dirección | `type` | Descripción |
|---|---|---|
| → | `engine_move` | Jugada del motor para un FEN con fuerza limitada: `elo` (1320–3190), `skill` (0–20, niveles más débiles) o ninguno (máxima fuerza), y `movetime` |
| ← | `engine_move_result` | `move` (UCI, vacío si no hay jugadas) y `score`/`mate` desde el punto de vista de quien mueve (se usan para pistas y tablas) |

### Estadísticas y consultas

| Dirección | `type` | Descripción |
|---|---|---|
| → | `get_stats` | Estadísticas con filtros (`username`, `time`, `duration`, `increment`, `start`, `count`) |
| ← | `stats_data` | Payload de estadísticas (incluye `openingDeviations`) |
| → | `get_stat_details` | Posiciones concretas de una categoría (tilt, comeback, blown_advantage) |
| ← | `stat_details_data` | Array de posiciones |
| → | `get_analyses` / ← `analyses_list` | Lista paginada de análisis guardados |
| → | `get_analysed_ids` / ← `analysed_ids` | IDs ya analizados (para insignias) |
| → | `get_full_analysis` / ← `full_analysis_data` | Análisis completo (posiciones, evaluaciones, líneas, tiempos) |
| → | `delete_analyses` / ← `analyses_deleted` | Borrado en lote |

### Explorador y apertura

| Dirección | `type` | Descripción |
|---|---|---|
| → | `get_move_explorer` / ← `move_explorer_data` | Jugadas del usuario y rival en un FEN, con win-rate y evals |
| → | `get_games_at_position` / ← `games_at_position` | Tus partidas que pasaron por ese FEN (con la jugada y el ply) |
| → | `get_book_moves` / ← `book_moves` | Movimientos teóricos del libro local |

### Puzzles

| Dirección | `type` | Descripción |
|---|---|---|
| → | `extract_puzzles` | Extrae puzzles de partidas (`pgn`/`history`) |
| → | `extract_puzzles_from_analyses` | Lo mismo desde partidas ya analizadas, reutilizando su historial guardado |
| ← | `puzzle_extraction_started` / `puzzle_game_done` / `puzzle_extraction_complete` / `extraction_cancelled` | Progreso de la extracción |
| → | `cancel_extraction` | Cancela la extracción |
| → | `get_puzzles` / ← `puzzle_list` | Puzzles guardados (con campos de repetición espaciada) |
| → | `get_puzzle_game_ids` / ← `puzzle_game_ids` | IDs de partidas con puzzles (insignias) |
| → | `puzzle_solved` / `puzzle_failed` | Registra el intento (SRS: acierto aleja el repaso, fallo lo reinicia) |
| → | `delete_puzzle` / ← `puzzle_deleted`; `clear_puzzles` / ← `puzzles_cleared` | Borrado |

### Control

| Dirección | `type` | Descripción |
|---|---|---|
| → | `cancel` | Cancela análisis, lote, extracción y búsqueda del bot |
| → | `clear_cache` | Limpia la caché de aperturas en memoria |
| → | `get_server_config` / ← `server_config` | Fuente del libro, núcleos y memoria del servidor |
| ← | `error` | `{ message, requestId? }` |

### HTTP (mismo puerto)

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/backup` | Descarga una copia consistente de la base (`.sqlite`) |
| `POST` | `/restore` | Cuerpo = archivo `.sqlite`. **Fusiona** con la base actual: los análisis del archivo reemplazan a los repetidos y los puzzles existentes se conservan. Valida tablas e integridad; máximo 1 GB |
| `GET` | `/` | Estado y versión |

Se aplica la misma verificación de `Origin` que en el WebSocket (CORS solo para orígenes permitidos).

## 🔬 Clasificación de Jugadas

Cada jugada recibe una **etiqueta de calidad** calculada a partir del delta de win probability (`wp`). La etiqueta es siempre ajedrecística; el tiempo se guarda aparte (ver abajo).

| Etiqueta | Descripción |
|---|---|
| `Libro` | Jugada dentro del repertorio teórico |
| `Brillante` | Mejor/excelente jugada que **sacrifica material** con compensación (ver `brilliantDetector.ts`) |
| `Mejor` | Coincide con la primera línea del motor |
| `Excelente` | Pérdida de wp ≤ 2% |
| `Bueno` | Pérdida de wp ≤ 5% |
| `Imprecisión` | Pérdida de wp ≤ 10% |
| `Error` | Pérdida de wp ≤ 20% |
| `Error grave` | Pérdida de wp > 20% |

**Brillante (`!!`):** solo se evalúa en jugadas `Mejor`/`Excelente`. Exige (1) que el rival pueda ganar ≥ 3 puntos de material por capturas (búsqueda de capturas; las recapturas cuentan y lo que ya estaba en prise antes de mover se descuenta) o que la variante del motor deje al jugador ≥ 3 puntos abajo tras 2 y 4 jugadas; (2) que antes no estuviera ya ganando (< 85 % de probabilidad); y (3) que después no esté perdiendo (≥ 35 %).

Cuando hay información de reloj, los errores (`Imprecisión`, `Error`, `Error grave`) llevan además una **clase de tiempo** (`errorTimeClass`), sin cambiar su etiqueta:

| `errorTimeClass` | Condición |
|---|---|
| `time_pressure` | Tiempo restante < 40 s |
| `precipitation` | Tiempo empleado < 3 s |
| `overthinking` | Tiempo empleado > 30 s |

El tiempo empleado es `reloj propio previo − reloj actual + incremento`. Se leen los comentarios `[%clk]` de Lichess y de Chess.com (con décimas).

## 🧠 Pool de Engines

El `EnginePool` crea **N procesos independientes de Stockfish**, donde N = `threads` configurado por el usuario (o `CPUs - 1` por defecto). Cada proceso corre con `Threads=1`, maximizando el paralelismo real: mientras un engine analiza una posición, los demás analizan otras en simultáneo.

```
threads=4  →  4 procesos Stockfish × 1 hilo c/u
             Hash total dividido equitativamente
```

El frontend puede ajustar `threads`, `depth`, `hash` y `multiPv` en cada petición de análisis.

## 🤝 Frontend

Este backend funciona en conjunto con el frontend del mismo repositorio ([`frontend/`](../frontend/README.md)). El frontend se conecta a `ws://127.0.0.1:9001` (configurable con `VITE_BACKEND_URL`).

---

<p align="center">Desarrollado con ♟️ por <strong>ElColof</strong></p>
