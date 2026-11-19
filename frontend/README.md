# ♟️ Chess Analysis — Frontend

SPA en React para analizar partidas de ajedrez: tablero interactivo, evaluación en vivo, análisis de partida completa, variantes, estadísticas agregadas, explorador de aperturas, puzzles generados a partir de tus propios errores y un modo para jugar contra Stockfish. Se comunica por WebSocket con el [backend](../backend/README.md), que corre Stockfish nativo y guarda los resultados en SQLite. Tiene un diseño propio para móvil y tablet.

## Stack

| Capa | Tecnología |
| :--- | :--- |
| UI | React 19 + Vite 8 (JavaScript, CSS plano) |
| Estado | Zustand 5 (slices: game, analysis, library, ui, play) |
| Tablero | `react-chessboard` + `chess.js` |
| Animaciones / iconos | Framer Motion, lucide-react |
| Comunicación | WebSocket nativo (`src/services/backendService.js`) + HTTP para el respaldo |
| Fuentes externas | APIs públicas de Lichess y Chess.com (importar partidas), Lichess Masters (explorador) |

## Requisitos

- Node.js 20+ (22+ para los tests)
- El backend corriendo (por defecto en `ws://localhost:9001`).

## Uso

```bash
cd frontend
npm install
npm run dev       # desarrollo
npm run build     # build de producción en dist/
npm run preview   # servir el build
npm run lint
npm test          # tests de utilidades (node:test)
```

### Variables de entorno (opcionales)

| Variable | Descripción |
| :--- | :--- |
| `VITE_BACKEND_URL` | URL del WebSocket del backend. Default: `ws://localhost:9001` (el respaldo usa la misma URL con `http`) |

## Modos de la aplicación

| Modo | Qué hace |
| :--- | :--- |
| **Análisis** | Tablero + gráfico de evaluación (con barras de tiempo), historial con variantes, explorador de aperturas e importación. |
| **Explorador** | Estadísticas propias y de maestros por posición, con la lista de tus partidas que pasaron por ella. |
| **Jugar** | Partida contra Stockfish (`play` en el store): configuración, partida en curso y resultado. |
| **Puzzles** | Biblioteca con filtros y repetición espaciada, extractor y reproductor. |
| **Estadísticas** | Dashboard con filtros, historial de partidas analizadas y detalle de posiciones. |

Los modos **Puzzles** y **Jugar** "toman prestado" el tablero: al entrar se guarda una foto del estado de Análisis/Explorador (`preGameSnapshot`) y al salir se restaura tal cual.

### Modo Jugar

- Configuración persistida en `playConfig`: color, nivel (`utils/botLevels.js`: 9 niveles, ~900 a sin límite), control de tiempo (`TIME_CONTROLS`), pistas y evaluación en vivo.
- `store/slices/playSlice.js` — acciones: iniciar, rendirse, deshacer, pista, tablas, revancha, "Analizar partida" (construye el PGN con `utils/playUtils.js`, vuelve a Análisis, lo carga y lanza el análisis completo).
- `hooks/usePlayController.js` (montado en el tablero) — pide la jugada del bot (`engine_move`), detecta el final de partida, hace correr los relojes con incremento y da la partida por perdida si se agotan.
- Desde Análisis, el botón del robot (`openPlayFromPosition`) abre esta pestaña con la posición actual.
- La barra de evaluación y la evaluación en vivo solo se muestran con "Evaluación en vivo" activada (el bot no debe poder espiarla).

### Diseño móvil

Con ancho ≤ 1100 px `Dashboard` usa `components/Layout/MobileLayout.jsx` en lugar del diseño de escritorio:

```text
┌ barra superior ── menú de modos desplegable · engranaje
├ tablero ───────── fijo (se oculta en Estadísticas y en la biblioteca de Puzzles; sigue montado)
├ contenido ─────── el panel del modo, con scroll propio
└ dock ──────────── ⏮ ◀ ▶/⏸ ▶ ⏭ · girar tablero
```

Los paneles son los mismos que en escritorio; solo cambia dónde se colocan. El cambio de modo (con confirmación si hay una partida en curso) se comparte en `useModeSwitch.jsx`. En escritorio, si el sidebar es estrecho, las pestañas de modo muestran solo el icono (consulta de contenedor sobre el propio sidebar).

## Atajos de teclado

`←` `→` jugada anterior/siguiente · `Inicio` `Fin` · `F` girar tablero · `Espacio` reproducir/pausar (se detiene en tus errores de imprecisión o peores y en los errores del rival; no actúa en Puzzles ni en Jugar).

## Estructura

```text
src/
├── components/
│   ├── Analysis/   # Gráfico de evaluación (barras de tiempo), barra, paneles, explorador de aperturas
│   ├── Board/      # Tablero, jugadores/relojes, controles, hooks de interacción y navegación
│   ├── Common/     # Diálogo de confirmación/aviso (reemplaza alert/confirm)
│   ├── History/    # Lista de jugadas y panel de variantes
│   ├── Import/     # Importar (Lichess, Chess.com, PGN/archivos) y configuración del motor + respaldo
│   ├── Layout/     # Dashboard, selector de modos, diseño móvil
│   ├── Play/       # Modo Jugar (configuración, partida, resultado)
│   ├── Puzzle/     # Biblioteca, reproductor, extractor y explorador de movimientos
│   └── Stats/      # Dashboard de estadísticas, historial y detalle
├── constants/      # Constantes de ajedrez
├── hooks/          # Sincronización con backend, reloj, evaluación en vivo, análisis completo, controlador de Jugar
├── services/       # backendService (WS/HTTP), gameApi (importación), lichessExplorerService, analysisBridge
├── store/          # Zustand: slices (game, analysis, library, ui, play) y selectores
└── utils/          # Tablero, flechas, PGN (export/import), variantes, niveles del bot, PGN del bot, sonidos
```

## Notas de diseño

- **Analysis bridge:** separa la evaluación en vivo (`cancelLive`) del análisis de partida/lote (`cancel`) para que mover el tablero nunca interrumpa un lote. La evaluación en vivo se pausa mientras corre un lote o una extracción.
- **Variantes:** se guardan en `variations` (`utils/variations.js`); toda variante cuelga de la partida principal (prefijo común + jugadas propias). Viven en memoria.
- **Estadísticas:** todo se calcula en el backend; el frontend solo pinta (`StatsCards.jsx`). Los tiempos llegan en segundos.
- **Filtros de tiempo:** `utils/timeControl.js` normaliza el `TimeControl` de los PGN a `<base>+<incremento>` en segundos.
- **Uso local:** el backend escucha solo en `127.0.0.1`, por lo que la app está pensada para usarse en local junto al backend.
- **Token de Lichess:** se ingresa desde la UI (ícono de llave en el explorador de aperturas) y queda en `localStorage`. No se lee de variables de entorno para no incrustarlo en el bundle.
- **Sonidos:** sintetizados con Web Audio API (sin archivos ni red); se activan/desactivan con el botón de volumen bajo el tablero.
