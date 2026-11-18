# Changelog

## 1.0.0

Primera versión estable del monorepo (frontend + backend).

### Cambios respecto a los repos separados
- Unificación en un monorepo: `frontend/`, `backend/` y `shared/` (contrato WebSocket tipado).
- Backend: SQLite en modo WAL, esquema consolidado con migraciones versionadas (`PRAGMA user_version`), consultas de estadísticas con ámbito materializado, carga del libro de aperturas ~3x más rápida, manejo de errores de `stdin` del motor.
- Frontend: sonidos sintetizados localmente con botón de silencio, token de Lichess solo desde la UI, menos re-renderizados y sin polling innecesario.
- Documentación reescrita y archivos obsoletos eliminados.
