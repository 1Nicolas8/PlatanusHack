# AGENTS.md — backend

Express + Node.js (CommonJS), arquitectura **feature-based**, Supabase como DB, Prisma solo
para migraciones. Este documento es la referencia para cualquier agente AI (Claude Code,
Cursor, Copilot) o persona que trabaje en el repo.

El proyecto arranca de cero: hoy solo existen los healthchecks y la infraestructura. Las
reglas de abajo son las que hicieron falta la primera vez — están acá para no volver a
descubrirlas a mitad del hackathon.

## 1. Arquitectura: feature-based

No hay carpetas `controllers/`, `services/`, `routes/` a nivel raíz. Cada **feature** es
autocontenido y agrupa todas sus capas juntas:

```
src/
  config/                 # env, clientes externos. Nada de lógica de negocio.
  shared/                 # transversal, sin conocimiento de ningún feature
    middlewares/          # errorHandler, notFound, validate
    errors/AppError.js    # error de dominio con statusCode
    logger/               # pino
    health/               # liveness + readiness
    utils/                # asyncHandler, helpers puros
  features/
    <feature>/
      <feature>.schema.js
      <feature>.repository.js
      <feature>.service.js
      <feature>.controller.js
      <feature>.routes.js
      __tests__/
  app.js                  # ensambla middlewares + monta rutas de cada feature
  server.js               # listen + shutdown
api/index.js              # entrypoint de Vercel
```

### Reglas de dependencias

- Un feature puede importar el `*.service.js` (nunca el `*.repository.js`) de otro feature.
- `shared/` no puede importar nada de `features/`. Es una vía de una sola dirección.
- Si dos features necesitan compartir un schema, vive en `shared/` o se duplica
  deliberadamente. No crear un feature "common" para eso.

### Capas: `routes → controller → service → repository`

- **routes**: verbo+path → validación → controller. Cero lógica.
- **controller**: adapta HTTP ↔ dominio. Sin reglas de negocio ni queries.
- **service**: toda la lógica. No conoce Express ni SQL. Es lo que más se testea.
- **repository**: única capa que conoce Supabase. Si cambia la DB, solo se toca acá.

## 2. Convenciones

- Archivos en `kebab-case`, patrón `<feature>.<capa>.js`. En `shared/` se nombran por lo que
  hacen (`asyncHandler.js`, `AppError.js` en PascalCase por ser clase).
- Funciones con nombre de negocio, no de implementación.
- **Sin comentarios que expliquen el QUÉ.** Solo cuando hay una razón no obvia.
- Errores de negocio siempre como `AppError`, nunca `throw new Error(...)` suelto.
- **Nunca `console.log`.** Usar `shared/logger/logger.js` con contexto primero:
  `logger.warn({ userId }, 'mensaje corto')`.
- Validación con Zod en el borde del sistema, una sola vez.
- Nada hardcodeado: URLs, intervalos y keys viven en `.env` / `src/config/env.js`, con
  default sensato y validación al arranque.

## 3. Tests

Jest + Supertest. `npm test` corre todo.

- Se testean con profundidad los `*.service.js`.
- Se mockean siempre el repository y los clientes externos.
- Los tests de integración montan la app con `createApp()` y pegan por HTTP.
- **Un feature sin al menos un test de su `service.js` no está terminado.**
- Cuidado con el punto ciego clásico: si el test arma el objeto a mano y el repository
  devuelve otra forma (snake_case vs camelCase), el test pasa y producción rompe. Testeá al
  menos una función que hable con el repository, no solo las puras.

## 4. Comandos

```bash
npm run dev               # nodemon
npm start                 # prestart aplica migraciones y arranca
npm test / test:watch
npm run lint / lint:fix
npm run format

npm run db:migrate        # aplica migraciones pendientes (prisma migrate deploy)
npm run db:migrate:status # qué falta aplicar
npm run db:migrate:diff   # SQL del delta entre la DB viva y schema.prisma
```

## 5. Base de datos

**Prisma se usa solo para migraciones.** No hay Prisma Client: la capa de datos es
`@supabase/supabase-js` dentro de los `*.repository.js`. No importes `PrismaClient` — no está
instalado.

`prisma/schema.prisma` es la única fuente de verdad del esquema. Para cambiarlo:

1. Editá `prisma/schema.prisma`.
2. `npm run db:migrate:diff` → imprime el SQL del delta contra la DB actual.
3. Guardalo en `prisma/migrations/<YYYYMMDDHHMMSS>_<descripcion>/migration.sql`.
4. `npm run db:migrate`.

Reglas:

- Nunca edites una migración ya aplicada — siempre agregá una nueva.
- Los `CHECK` no se pueden expresar en `schema.prisma`; se escriben a mano al final del
  `migration.sql` correspondiente.
- Si agregás una tabla o columna, actualizá también el repository que la consulta: Prisma no
  genera tipos acá, así que nada te avisa en tiempo de compilación.
- `prisma` está en `dependencies`, no en `devDependencies`, porque `prestart` corre
  `migrate deploy` también en producción, donde `--omit=dev` lo dejaría afuera.
- No se usa `prisma migrate dev`: necesita una shadow database que Supabase no permite crear.
  Por eso el flujo de arriba usa `migrate diff` contra la DB viva.

## 6. Deploy (Vercel)

**Root Directory = `backend`.** El entrypoint es `api/index.js`, que exporta la instancia de
Express. `vercel.json` reescribe todas las rutas hacia ahí.

No depende de la autodetección de framework: el preset del proyecto está en `null`. Si lo
ponés en `express`, Vercel escanea `app.js`/`index.js`/`server.js` antes que `src/`, toma la
fábrica `createApp` en vez de una app, y **toda request termina en 504**.

Las migraciones se aplican en el build:

```
push a main → Vercel buildea → npm run db:migrate → deploy
```

Por eso `DIRECT_URL` tiene que estar cargada como variable de entorno del proyecto, y por eso
apunta al session pooler: el build corre sobre IPv4 y el host directo es IPv6-only.

Otras dos que cuestan tiempo si no se saben:

- **No setees `PORT`** en Vercel. La plataforma lo asigna; un valor fijo hace que la app
  escuche en otro puerto y la función nunca responda.
- Con el preset en `null`, Vercel exige un directorio de salida. Por eso existe `public/`
  vacío y `outputDirectory` en `vercel.json`.

## 7. Trabajo en background

`setInterval` necesita un proceso vivo y en serverless muere con la instancia — además de
duplicarse en cada una. Si el proyecto necesita tareas periódicas, dispáralas por HTTP desde
un scheduler externo, no desde `server.js`.

Los crons de Vercel no alcanzan para intervalos cortos: **Hobby permite uno por día** (una
expresión más frecuente falla el deploy) y **Pro uno por minuto**. Con `maxDuration` de 300s
en Hobby, un ping cada 5 minutos a un endpoint que loopea internamente cubre intervalos de
segundos con un solo disparo.
