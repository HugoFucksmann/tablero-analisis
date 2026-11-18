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
| **📥 Importar** | Partidas de Lichess y Chess.com por usuario, o pegando un PGN. Selección múltiple para analizar en lote. |
| **🔍 Analizar** | Evaluación en vivo con varias líneas mientras navegás, y análisis completo de partida con barra y gráfico de evaluación. |
| **🏷️ Clasificar jugadas** | Brillante, mejor, excelente, bueno, imprecisión, error y error grave, más detección de jugadas de libro. |
| **📊 Estadísticas** | Evolución de precisión (promedio cada 10 partidas), rendimiento por color, fase y apertura, aperturas críticas, calidad de jugadas. |
| **🧠 Perfil psicológico** | Conversión de ventajas, remontadas, colapsos tras un error (*tilt*) y gestión del tiempo, con acceso a las posiciones concretas. |
| **🔭 Explorador** | Qué jugaste (y qué jugaron tus rivales) en cada posición, con win-rate y evaluación; libro de aperturas local y maestros de Lichess. |
| **🧩 Puzzles** | Extrae tácticas de tus errores reales y las entrena: podés mover libremente y, si no es la jugada correcta, la pieza vuelve. |
| **⚙️ Rendimiento** | Un motor de Stockfish por hilo; botón **"Configurar según mi PC"** que ajusta hilos y memoria a tu hardware. |

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
| [`frontend/`](frontend/README.md) | SPA en React 19 + Vite: tablero, paneles de análisis, estadísticas y puzzles. |
| [`backend/`](backend/README.md) | Servidor WebSocket, pool de Stockfish, SQLite, libro de aperturas y extracción de puzzles. Incluye la tabla completa de mensajes. |
| [`shared/`](shared/protocol.d.ts) | Contrato de mensajes WebSocket, fuente única de verdad para ambos lados. |

El servidor escucha solo en `127.0.0.1`: está pensado para uso personal en tu equipo.

## 🚀 Puesta en marcha

### Requisitos

- **Node.js 20 o superior**
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
```

## 🧭 Primeros pasos en la app

1. En **Importar**, escribí tu usuario de Lichess o Chess.com y elegí la plataforma.
2. Seleccioná varias partidas y pulsá **Analizar** para procesarlas en lote (o abrí una para analizarla individualmente).
3. Probá el engranaje ⚙️ y **"Configurar según mi PC"** para aprovechar tus núcleos.
4. Revisá **Estadísticas**, navegá por tus partidas en **Explorador** y entrená con los **Puzzles** extraídos de tus errores.

El explorador de maestros de Lichess requiere un token personal de Lichess, que se ingresa desde el ícono de llave del panel de aperturas (queda solo en tu navegador).

## 🛠️ Solución de problemas

| Síntoma | Qué revisar |
| :--- | :--- |
| La app dice "Desconectado" | Que el backend esté corriendo (`npm start` en `backend/`) y el puerto sea el esperado. |
| El análisis no arranca o falla al lanzar el motor | `STOCKFISH_PATH` en `backend/.env`; probá ejecutar `stockfish` en una terminal. |
| El lote usa poca CPU | Subí los hilos en el engranaje o usá **"Configurar según mi PC"**. |
| `npm install` falla en `better-sqlite3` | Usá Node 20+ (hay binarios precompilados); en caso contrario hacen falta herramientas de compilación nativas. |

## 🗺️ Estado y próximos pasos

La versión **1.0** incluye todo lo anterior. Lo pendiente y las decisiones abiertas están en [DECISIONES.md](DECISIONES.md); lo ya hecho, en [HECHO.md](HECHO.md); el historial de versiones, en el [CHANGELOG](CHANGELOG.md).

## 📄 Licencia

[MIT](LICENSE)
