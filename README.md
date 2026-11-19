# ♟️ Tablero de Análisis de Ajedrez

[![Node.js](https://img.shields.io/badge/Node.js-20+-68a063.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/Backend-TypeScript-3178c6.svg)](https://www.typescriptlang.org/)
[![Stockfish](https://img.shields.io/badge/Motor-Stockfish-4b4b4b.svg)](https://stockfishchess.org/)
[![SQLite](https://img.shields.io/badge/DB-SQLite-003b57.svg)](https://www.sqlite.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

Herramienta **local** para analizar tus partidas de ajedrez con Stockfish nativo. Importás partidas de Lichess, Chess.com o por PGN, las analizás (una por una o en lote), y obtenés una radiografía de tu juego: precisión por fase, calidad de cada jugada, aperturas que rinden o fallan, errores bajo presión de tiempo y un entrenador de puzzles armado con **tus propios errores**.

Todo corre en tu máquina: el motor, la base de datos y la app. No hay cuentas ni servidores externos (solo las APIs públicas de Lichess y Chess.com para traer partidas).

## ✨ Qué podés hacer

| | |
|---|---|
| **📥 Importar** | Partidas de Lichess y Chess.com por usuario, pegando un PGN o arrastrando un archivo `.pgn` (si trae varias partidas, se analizan en lote). Selección múltiple para analizar o extraer puzzles. |
| **🔍 Analizar** | Evaluación en vivo mientras navegás y análisis completo de la partida, con barra y gráfico de evaluación. Reproducción automática que se detiene en tus errores. |
| **🏷️ Clasificar jugadas** | Brillante (`!!`, sacrificios), mejor, excelente, bueno, imprecisión, error y error grave, más jugadas de libro. Los errores se etiquetan además por tiempo: apuros de reloj, precipitación o sobrepensar. |
| **⏱️ Tiempo por jugada** | Barras de tiempo pensado bajo el gráfico de evaluación (partidas con reloj `[%clk]`, incluido el formato de Chess.com con décimas). |
| **🌿 Variantes** | Probá líneas alternativas sin perder las anteriores; se exportan entre paréntesis en el PGN anotado. |
| **🤖 Jugar contra Stockfish** | Pestaña propia: elegí color, nivel (~900 a máximo), reloj con incremento, pistas y evaluación opcional. Desde Análisis, el botón del robot abre la partida desde la posición que estás viendo. Al terminar, la analizás con un clic. |
| **📊 Estadísticas** | Evolución de precisión, rendimiento por color, fase y apertura, aperturas críticas, calidad de jugadas y errores por tiempo (siempre sobre *tus* jugadas). Filtros por período, duración, incremento, posición inicial y cantidad. |
| **🧠 Perfil psicológico** | Conversión de ventajas, remontadas, colapsos tras un error (*tilt*) y gestión del tiempo, con acceso a las posiciones concretas. |
| **📖 Salida de teoría** | En qué jugada abandonás el libro de aperturas y con qué frecuencia esa salida es un error. |
| **🔭 Explorador** | Qué jugaste (y tus rivales) en cada posición con win-rate y evaluación, libro local, maestros de Lichess y la lista de **tus partidas que pasaron por esa posición** (clic para abrirlas ahí). |
| **🧩 Puzzles** | Tácticas extraídas de tus errores (desde el importador, el historial o el análisis en lote), con filtros por tipo, color, motivo y estado, y **repetición espaciada** (los fallados y pendientes van primero). Cualquier mate legal se acepta en la última jugada. |
| **💾 Respaldo** | Descargá o restaurá una copia de tus análisis y puzzles desde el engranaje ⚙️ (la restauración fusiona con lo que ya tenés). |
| **📱 Móvil** | Diseño propio: menú de modos desplegable, tablero fijo, contenido con scroll propio y navegación de jugadas siempre a mano. |
| **⚙️ Rendimiento** | Un motor de Stockfish por hilo; **"Configurar según mi PC"** ajusta hilos y memoria a tu hardware. |

### Atajos de teclado

`←` `→` jugada anterior/siguiente · `Inicio` `Fin` · `F` girar el tablero · `Espacio` reproducir/pausar (se detiene en los errores).

## 🧱 Arquitectura

```
┌────────────────┐   WebSocket    ┌─────────────────────────────┐
│   frontend/    │ ◄────────────► │   backend/                  │
│  React 19+Vite │  ws://:9001    │  Node + TypeScript          │
│  Zustand       │                │  Pool de Stockfish (UCI)    │
└────────────────┘                │  SQLite (better-sqlite3)    │
        ▲                         │  Libro de aperturas (TSV)   │
        │                         └─────────────────────────────┘
        └──── tipos de mensajes ────── shared/protocol.d.ts
```

| Carpeta | Contenido |
| :--- | :--- |
| [`frontend/`](frontend/README.md) | SPA en React 19 + Vite: tablero, análisis, explorador, modo Jugar, estadísticas y puzzles (escritorio y móvil). |
| [`backend/`](backend/README.md) | Servidor WebSocket (+ respaldo HTTP), pool de Stockfish, motor de juego del bot, SQLite, libro de aperturas y extracción de puzzles. Incluye la tabla completa de mensajes. |
| [`shared/`](shared/protocol.d.ts) | Contrato de mensajes WebSocket, fuente única de verdad para ambos lados. |

El servidor escucha solo en `127.0.0.1`, valida cada mensaje entrante (forma, tipos y rangos), limita su tamaño (8 MB) y solo acepta conexiones desde páginas locales (`localhost`); para permitir otros orígenes usá `ALLOWED_ORIGINS`. Además del WebSocket expone `GET /backup` y `POST /restore` para el respaldo.

## 🚀 Puesta en marcha

### Requisitos

- **Node.js 20 o superior** (22 o superior para correr los tests)
- **Stockfish** instalado (cualquier versión reciente con soporte UCI)

```bash
# Ubuntu / Debian
sudo apt install stockfish

# macOS
brew install stockfish

# Windows: descargar el binario desde https://stockfishchess.org/download/
# y apuntar STOCKFISH_PATH a ese .exe (ver abajo)
```

### 1. Backend

```bash
cd backend
cp .env.example .env     # en Windows: copy .env.example .env
npm install
npm run build
npm start                # escucha en ws://127.0.0.1:9001
```

Si Stockfish no está en el `PATH`, editá `backend/.env`:

```env
PORT=9001
STOCKFISH_PATH=C:\ruta\a\stockfish.exe
# Opcionales
# DB_PATH=C:\ruta\a\database.sqlite
# ALLOWED_ORIGINS=http://mi-equipo:5173
```

La base de datos se crea sola en `backend/data/database.sqlite` en el primer arranque.

### 2. Frontend

En otra terminal:

```bash
cd frontend
npm install
npm run dev
```

Abrí la URL que muestra Vite (normalmente http://localhost:5173). Si el backend corre en otro puerto o equipo, definí `VITE_BACKEND_URL` (por ejemplo `ws://127.0.0.1:9002`) antes de levantar el frontend.

### Atajos desde la raíz

```bash
npm run install:all      # instala backend y frontend
npm run build            # compila ambos
npm run start:backend    # inicia el servidor
npm run dev:frontend     # inicia la app en modo desarrollo
npm run lint             # lint del frontend
npm run typecheck        # chequeo de tipos del backend
npm test                 # tests del backend y del frontend (node:test)
```

## 🧭 Primeros pasos en la app

1. En **Importar**, escribí tu usuario de Lichess o Chess.com y elegí la plataforma (o pegá/arrastrá un PGN).
2. Seleccioná varias partidas y pulsá **Analizar Partidas** para procesarlas en lote (o abrí una para analizarla individualmente).
3. Probá el engranaje ⚙️ y **"Configurar según mi PC"** para aprovechar tus núcleos. Ahí también está el respaldo.
4. Revisá **Estadísticas**, navegá tus partidas en **Explorador** y entrená con los **Puzzles** extraídos de tus errores.
5. Para practicar, usá **Jugar**: desde cero o desde cualquier posición de tus partidas con el botón del robot.

> Las partidas analizadas antes de cambios grandes (por ejemplo, el formato de control de tiempo o el detector de brillantes) conservan sus datos viejos: reanalizalas para verlos actualizados.

El explorador de maestros de Lichess requiere un token personal de Lichess, que se ingresa desde el ícono de llave del panel de aperturas (queda solo en tu navegador).

## 🛠️ Solución de problemas

| Síntoma | Qué revisar |
| :--- | :--- |
| La app dice "Desconectado" | Que el backend esté corriendo (`npm start` en `backend/`) y el puerto sea el esperado. |
| El análisis no arranca o falla al lanzar el motor | `STOCKFISH_PATH` en `backend/.env`; probá ejecutar `stockfish` en una terminal. |
| El lote usa poca CPU | Subí los hilos en el engranaje o usá **"Configurar según mi PC"**. |
| El bot no responde en **Jugar** | Mismo diagnóstico que el análisis: backend en marcha y `STOCKFISH_PATH`. Aparece un aviso con botón **Reintentar**. |
| "Origin not allowed" / el frontend no conecta | Estás sirviendo el frontend desde un host que no es `localhost`: agregalo en `ALLOWED_ORIGINS` del backend. |
| `npm install` falla en `better-sqlite3` | Usá Node 20+ (hay binarios precompilados); en caso contrario hacen falta herramientas de compilación nativas. |

## 🗺️ Estado y próximos pasos

La versión **1.1** suma el modo Jugar, las variantes, el respaldo, el diseño móvil y mucho más; ver el [CHANGELOG](CHANGELOG.md). Lo pendiente y las decisiones abiertas están en [DECISIONES.md](DECISIONES.md); lo ya hecho, en [HECHO.md](HECHO.md); y las ideas y notas de verificación, en [ideas-mejora.md](ideas-mejora.md).

## 📄 Licencia

[MIT](LICENSE)
