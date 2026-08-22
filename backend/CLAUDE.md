# CLAUDE.md

@AGENTS.md

Todo lo anterior (arquitectura feature-based, convenciones, estándares de testing, base de
datos y deploy) aplica igual para Claude Code. Este archivo solo evita duplicar el contenido
— editá `AGENTS.md`, no este archivo, cuando cambien las reglas.

## Notas específicas para Claude Code en este repo

- Antes de tocar un feature existente, leé su carpeta completa (`routes` → `controller` →
  `service` → `repository` → `__tests__`). El patrón de capas es consistente, así que el
  feature vecino ya resuelto es la mejor referencia de estilo.
- Al agregar un endpoint, seguí el patrón `validate(schema) + asyncHandler(controller.fn)`.
- No hay CI configurado (hackathon). Antes de dar por terminado un cambio, corré localmente
  `npm run lint` y `npm test` — ambos deben quedar en verde.
- Si agregás una tabla, sumala como una migración nueva en `prisma/migrations/`; nunca edites
  una ya aplicada.
