# ♟️ Chess Analysis — Frontend

SPA en React para analizar partidas de ajedrez: tablero interactivo, evaluación en vivo, análisis de partida completa, estadísticas agregadas, explorador de aperturas y puzzles generados a partir de tus propios errores. Se comunica por WebSocket con el [backend](../backend/README.md), que corre Stockfish nativo y guarda los resultados en SQLite.

## Stack

| Capa | Tecnología |
| :--- | :--- |
| UI | React 19 + Vite 8 (JavaScript, CSS plano) |
| Estado | Zustand 5 (slices: game, analysis, library, ui) |
| Tablero | `react-chessboard` + `chess.js` |
| Animaciones / iconos | Framer Motion, lucide-react |
| Comunicación | WebSocket nativo (`src/services/backendService.js`) |
| Fuentes externas | APIs públicas de Lichess y Chess.com (importar partidas), Lichess Masters (explorador) |

## Requisitos

- Node.js 20+
- El backend corriendo (por defecto en `ws://localhost:9001`).

## Uso

```bash
cd frontend
npm install
npm run dev       # desarrollo
npm run build     # build de producción en dist/
npm run preview   # servir el build
npm run lint
```

### Variables de entorno (opcionales)

| Variable | Descripción |
| :--- | :--- |
| `VITE_BACKEND_URL` | URL del WebSocket del backend. Default: `ws://localhost:9001` |

## Estructura

```text
src/
├── components/   # Analysis, Board, History, Import, Layout, Puzzle, Stats
├── constants/    # Constantes de ajedrez
├── hooks/        # Sincronización con backend, reloj, evaluación en vivo, análisis completo
├── services/     # backendService (WS), gameApi (importación), lichessExplorerService, analysisBridge
├── store/        # Zustand: slices y selectores
└── utils/        # Tablero, flechas, PGN, sonidos
```

## Notas de diseño

- **Analysis bridge:** serializa las solicitudes de análisis en vivo y de partida completa para que no se pisen entre sí; cancela la anterior antes de iniciar la nueva.
- **Uso local:** el backend escucha solo en `127.0.0.1`, por lo que la app está pensada para usarse en local junto al backend.
- **Token de Lichess:** se ingresa desde la UI (ícono de llave en el explorador de aperturas) y queda en `localStorage`. No se lee de variables de entorno para no incrustarlo en el bundle.
- **Sonidos:** sintetizados con Web Audio API (sin archivos ni red); se activan/desactivan con el botón de volumen bajo el tablero.
