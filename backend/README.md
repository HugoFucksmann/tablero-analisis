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
```

### Iniciar

```bash
npm run build   # compila TypeScript a dist/
npm start
```

El servidor escucha en `ws://127.0.0.1:9001`. Al arrancar carga el libro de aperturas y ejecuta un chequeo de integridad de la base de datos.

## 🏗️ Estructura del Proyecto

```
backend/
├── src/
│   ├── server.ts                   # Entrypoint: HTTP + WebSocket server
│   ├── handlers/
│   │   └── messageHandlers.ts      # Dispatcher de mensajes WebSocket
│   ├── core/
│   │   ├── engineProcess.ts        # Spawn/kill del proceso Stockfish
│   │   ├── stockfishProcess.ts     # API de alto nivel: init, analyze, stop
│   │   └── uciParser.ts            # Parseo de output UCI (info, bestmove)
│   ├── services/
│   │   ├── analysis/
│   │   │   ├── analysisQueue.ts          # Ciclo de vida de engines por sesión
│   │   │   ├── enginePool.ts             # Pool: N instancias × 1 hilo c/u
│   │   │   ├── analysisWorkerLoop.ts     # Distribuye posiciones entre engines
│   │   │   ├── gameAnalysisCoordinator.ts# Orquesta apertura + workers + métricas
│   │   │   ├── moveClassifier.ts         # Clasifica jugadas: label + errorTimeClass
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
│   │   ├── db.ts                   # Schema SQLite + migraciones automáticas
│   │   ├── gameStore.ts            # Orquesta guardado de análisis completo
│   │   ├── puzzleStore.ts          # CRUD de puzzles
│   │   ├── sqliteStore.ts          # Helpers de bajo nivel
│   │   └── repositories/
│   │       ├── analysisRepo.ts     # Queries sobre la tabla analyses
│   │       ├── puzzleRepo.ts       # Queries y filtros sobre puzzles
│   │       └── statsRepo.ts        # Agregaciones: stats, explorador, detalles
│   └── utils/
│       ├── analysisUtils.ts        # parsePgn, buildPositions, buildAnalysisOrder
│       ├── chessMath.ts            # cpToWhiteWinProb, cpToVisualScore
│       └── phaseDetector.ts        # Detecta Apertura / Medio Juego / Final
├── data/
│   ├── database.sqlite             # Se crea al primer arranque (git-ignorada)
│   ├── a.tsv … e.tsv              # Libro de aperturas TSV (Lichess oficial)
└── architecture_backend.md         # Especificación técnica detallada
```

## 📡 Protocolo WebSocket

Todos los mensajes son JSON. El campo `type` identifica la operación. Opcionalmente se puede incluir `requestId` y el backend lo reflejará en la respuesta.

### Análisis de posición (live)

| Dirección | `type` | Descripción |
|---|---|---|
| → | `analyze_position` | Analiza un FEN en tiempo real |
| ← | `analysis_progress` | Evaluación parcial mientras Stockfish busca |
| ← | `analysis_result` | Resultado final con score, mate, bestMove, lines |

### Análisis de partida completa

| Dirección | `type` | Descripción |
|---|---|---|
| → | `analyze_game` | Analiza el historial completo de una partida |
| ← | `move_result` | Resultado por jugada: label, score, isBook |
| ← | `opening_detected` | Apertura identificada (eco + nombre) |
| ← | `analysis_complete` | Accuracy final blancas / negras |
| ← | `analysis_cancelled` | El análisis fue cancelado |

### Análisis en lote

| Dirección | `type` | Descripción |
|---|---|---|
| → | `analyze_games` | Lote de partidas |
| ← | `batch_analysis_started` | Inicio del lote |
| ← | `batch_analysis_progress` | Progreso por partida |
| ← | `batch_analysis_game_complete` | Partida completada |
| ← | `batch_analysis_complete` | Lote finalizado |
| ← | `batch_analysis_cancelled` | Lote cancelado |

### Estadísticas y consultas

| Dirección | `type` | Descripción |
|---|---|---|
| → | `get_stats` | Estadísticas agregadas con filtros (username, tiempo, duración, count) |
| ← | `stats_data` | Payload completo de estadísticas |
| → | `get_stat_details` | FENs individuales para una categoría (tilt, comeback, blown_advantage) |
| ← | `stat_details_data` | Array de posiciones |
| → | `get_analyses` | Lista paginada de análisis guardados |
| ← | `analyses_list` | Array de análisis |
| → | `get_analysed_ids` | Lista ligera de IDs ya analizados |
| ← | `analysed_ids` | Array de gameIds |
| → | `get_full_analysis` | JSON completo de un análisis |
| ← | `full_analysis_data` | fullData con posiciones, evaluaciones y líneas |
| → | `delete_analyses` | Elimina análisis en lote |
| ← | `analyses_deleted` | Confirmación |

### Explorador y apertura

| Dirección | `type` | Descripción |
|---|---|---|
| → | `get_move_explorer` | Estadísticas de jugadas para un FEN |
| ← | `move_explorer_data` | Jugadas del usuario y rival con win-rate y evals |
| → | `get_book_moves` | Sugerencias del libro de aperturas para un FEN |
| ← | `book_moves` | Array de movimientos teóricos |

### Puzzles

| Dirección | `type` | Descripción |
|---|---|---|
| → | `extract_puzzles` | Extrae puzzles de una partida ya analizada |
| ← | `puzzle_result` | Un puzzle extraído |
| ← | `puzzles_complete` | Extracción finalizada |
| → | `get_puzzles` | Lista puzzles con filtros opcionales |
| ← | `puzzles_list` | Array de puzzles |
| → | `puzzle_solved` | Incrementa solvedCount de un puzzle |
| → | `delete_puzzle` | Elimina un puzzle |

### Control

| Dirección | `type` | Descripción |
|---|---|---|
| → | `cancel` | Cancela el análisis en curso |
| → | `clear_cache` | Limpia la caché de aperturas en memoria |
| → | `get_server_config` | Retorna la configuración activa del servidor |
| ← | `server_config` | Objeto config (threads, depth, hash, etc.) |

## 🔬 Clasificación de Jugadas

Cada jugada recibe una **etiqueta de calidad** calculada a partir del delta de win probability (`wp`):

| Etiqueta | Descripción |
|---|---|
| `Libro` | Jugada dentro del repertorio teórico |
| `Brillante` | Sacrificio no obvio que mantiene ventaja |
| `Mejor` | Coincide con la primera línea del motor |
| `Excelente` | Pérdida de wp < 2% |
| `Bueno` | Pérdida de wp < 5% |
| `Imprecisión` | Pérdida de wp 5–10% |
| `Error` | Pérdida de wp 10–20% |
| `Error grave` | Pérdida de wp > 20% |

Cuando hay información de reloj, los errores se **reclasifican por tiempo**:

| Etiqueta | Condición |
|---|---|
| `Time Pressure Error` | Tiempo restante < 10s |
| `Insta-move Blunder` | Tiempo empleado < 3s |
| `Deep-think Blunder` | Tiempo empleado > 30s |

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
