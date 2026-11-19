# Ideas de mejora y notas de verificación

Las funcionalidades de la lista original ya están implementadas (ver [CHANGELOG](CHANGELOG.md)). Aquí quedan las notas
de comportamiento que conviene tener presentes al probar y las ideas que siguen abiertas. Lo pendiente de verificar y
las decisiones están en [DECISIONES.md](DECISIONES.md).

## Notas de comportamiento

- **Variantes:** solo en memoria (se pierden al recargar o cambiar de partida); siempre cuelgan de la partida principal.
  Al abrir una variante las evaluaciones se recalculan en vivo.
- **Modo Jugar:** las partidas contra el bot no se guardan hasta pulsar "Analizar partida". Salir de la pestaña con una
  partida en curso la abandona (pide confirmación). La fuerza usa `Skill Level` por debajo de 1320 Elo y `UCI_Elo` por encima.
- **Respaldo:** "Restaurar" fusiona con la base actual (los análisis del archivo reemplazan a los repetidos; los puzzles
  existentes se conservan con su progreso).
- **Control de tiempo:** se guarda como `<base>+<incremento>` en segundos (también Lichess). Las partidas analizadas antes
  de ese cambio no tienen el formato nuevo ni `customStart`: conviene reanalizarlas.
- **Brillantes y tiempos:** las partidas ya analizadas conservan sus etiquetas y no tienen barras de tiempo hasta reanalizarlas.
- **Repetición espaciada:** intervalos 1/3/7/14/30/60 días; un fallo reinicia la racha y deja el puzzle pendiente de inmediato.
- **Estadísticas:** siempre sobre las jugadas del usuario (el bando se deduce del turno de `start_fen`).

## Ideas abiertas

- **Modo Jugar:** elegir la apertura a jugar, guardar las partidas del bot en el historial sin pasar por el análisis,
  más controles de tiempo (o personalizado) y un nivel que se adapte a tus resultados.
- **Variantes:** persistirlas junto al análisis y permitir anidarlas.
- **Móvil:** panel inferior expandible arrastrando y gestos para navegar jugadas sobre el tablero.
- **Análisis:** insertar líneas del motor como variantes (se retiró la sección de líneas del historial; la acción
  `addEngineVariation` se eliminó con ella).
- **Estadísticas:** informe de desviación por color y por apertura concreta con enlace a las partidas.
- **Puzzles:** sesiones de repaso diarias ("hoy toca repasar N puzzles") usando la fecha de próximo repaso.
