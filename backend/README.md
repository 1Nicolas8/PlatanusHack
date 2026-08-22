# backend

Express + Node.js (CommonJS), Supabase como base de datos, Prisma solo para migraciones.

Punto de partida limpio: hoy solo expone los healthchecks. La infraestructura de migraciones
automáticas y de deploy ya está resuelta y probada en producción.

## Quick start

```bash
cp .env.example .env   # completar Supabase y las dos URLs de la base
npm install
npm run db:migrate     # crea el esquema desde cero (idempotente)
npm run dev
```

- `GET /health` — liveness: el proceso responde. Sin I/O.
- `GET /health/ready` — readiness: además llega a la base. Devuelve 503 con el motivo si no.

## Esquema de DB

`prisma/schema.prisma` es la fuente de verdad; las migraciones viven en `prisma/migrations/`.
`npm run db:migrate` las aplica todas desde cero, así que cualquiera del equipo levanta el
esquema con un solo comando.

## Deploy

Vercel, con **Root Directory = `backend`** y framework preset en `null`. `vercel.json` corre
`npm run db:migrate` en el build, así que **cada push a `main` aplica las migraciones
pendientes** antes de publicar.

## Antes de escribir código

Leé [`AGENTS.md`](./AGENTS.md). Tiene la arquitectura, las convenciones, los estándares de
testing y — sobre todo — la sección de deploy, que documenta las trampas concretas de Vercel y
Supabase que ya nos costaron tiempo una vez.
