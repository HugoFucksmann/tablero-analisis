# Changelog

## 1.1.0

### Nuevo
- **Jugar contra Stockfish** (pestaña propia): color, 9 niveles (~900 a sin límite; `Skill Level` por debajo de 1320 Elo y `UCI_Elo` por encima), relojes con incremento, pistas, deshacer, oferta de tablas, rendición, revancha y "Analizar partida". El botón del robot de Análisis abre la partida desde la posición actual. Reemplaza al modo práctica anterior.
- **Jugadas brillantes (`!!`)**: detección de sacrificios con compensación (búsqueda de capturas + variante del motor), en lugar de la regla anterior que marcaba cualquier mejora grande.
- **Variantes** en el historial, exportadas entre paréntesis en el PGN anotado.
- **Tiempo por jugada** en el gráfico de evaluación (carril propio, activado por defecto) y lectura de relojes de Chess.com (décimas) con incremento.
- **Reproducción automática** más rápida que se detiene en los errores, y atajos de teclado globales.
- **Explorador**: lista de tus partidas que pasaron por la posición, con apertura directa en ese punto. Clic en una fila del historial abre la partida.
- **Puzzles**: repetición espaciada (1/3/7/14/30/60 días), filtros por tipo/color/motivo/estado, extracción desde la selección múltiple y desde el historial, insignia en partidas con puzzles y mates alternativos aceptados.
- **Estadísticas**: filtros por incremento y posición inicial, informe de **salida de teoría** y gráfico de tiempo por jugada.
- **Importar** archivos `.pgn` (arrastrar o elegir; varias partidas = lote) y **respaldo/restauración** de análisis y puzzles (`GET /backup`, `POST /restore`).
- **Diseño móvil** propio: menú de modos desplegable, tablero fijo, contenido con scroll propio y barra inferior de navegación; el tablero se oculta en los modos que no lo usan.
- Interfaz: márgenes laterales unificados, alturas de los paneles del sidebar según contenido con prioridad Historial > Explorador > Importar, pestañas con solo icono si el sidebar es estrecho, fondo del tablero, botones y diálogos más sobrios (sin `alert`/`confirm`).

### Corregido
- La evaluación en vivo ya no cancela lotes ni extracciones (`cancel_live` separado de `cancel`) y se pausa mientras corren.
- La reclasificación por tiempo ya no sobrescribe la etiqueta de la jugada: el tiempo vive en `errorTimeClass` y badges, gráfico, *tilt* y estadísticas vuelven a coincidir.
- **Estadísticas personales** (calidad de jugadas, errores por tiempo, aperturas críticas) contaban también las jugadas del rival; ahora cuentan solo las del usuario. La tarjeta de tiempo dividía por 1000 y el promedio en errores se diluía con partidas sin errores.
- El tiempo por jugada ahora suma el incremento y los controles de tiempo de Lichess se guardan en segundos (antes quedaban en minutos).
- `MoveInsightCard` mostraba siempre `?`; el diálogo de promoción solo aparece con promociones legales.
- La lista de jugadas alinea bien las partidas que empiezan con turno de negras.

### Backend
- Contrato `shared/protocol.d.ts` con todos los payloads tipados; validación de mensajes entrantes (`messageValidator.ts`), límite de 8 MB y verificación de `Origin`.
- SQLite: `analysis_full_data` unificada a `analysis_id → analyses(id)`, columnas `customStart` y de repetición espaciada (migraciones v2–v4), explorador agregado en SQL sobre rango indexado y aislamiento del conjunto filtrado de estadísticas (`withScope`).
- Stockfish: timeouts de handshake y de búsqueda, motor independiente para el modo Jugar.
- Tests (`npm test`, `node:test`) y CI con typecheck + tests (Node 22).

## 1.0.0

Primera versión estable del monorepo (frontend + backend).

### Cambios respecto a los repos separados
- Unificación en un monorepo: `frontend/`, `backend/` y `shared/` (contrato WebSocket tipado).
- Backend: SQLite en modo WAL, esquema consolidado con migraciones versionadas (`PRAGMA user_version`), consultas de estadísticas con ámbito materializado, carga del libro de aperturas ~3x más rápida, manejo de errores de `stdin` del motor.
- Frontend: sonidos sintetizados localmente con botón de silencio, token de Lichess solo desde la UI, menos re-renderizados y sin polling innecesario.
- Documentación reescrita y archivos obsoletos eliminados.
