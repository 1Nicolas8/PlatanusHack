# backend

Express + Node.js (CommonJS), Supabase como base de datos, Prisma solo para migraciones.

Además de los healthchecks, expone la extracción de red, el mapa de audiencia y el panel
deliberativo de agentes hiperpersonalizados.

## Quick start

```bash
cp .env.example .env   # completar Supabase y las dos URLs de la base
npm install
npm run db:migrate     # crea el esquema desde cero (idempotente)
npm run dev
```

- `GET /health` — liveness: el proceso responde. Sin I/O.
- `GET /health/ready` — readiness: además llega a la base. Devuelve 503 con el motivo si no.

## Panel de agentes hiperpersonalizados

Un agente por contacto real de tu red juzga tu copy. No son arquetipos: cada agente es una
persona con su nombre, su trabajo, dónde estudió, de qué habla cuando publica y qué comparte
con vos. Corre varias veces para que la dispersión diga si el veredicto se sostiene, y cada
corrida queda trazada turno por turno.

### 1. Persistir el enriquecimiento del actor

El flujo normal no requiere que el frontend reenvíe perfiles. Al completar
`GET /api/network/runs/:runId`, el backend persiste automáticamente cada contacto y su contexto
enriquecido, vinculados al `perfil_url` dueño y al snapshot de esa corrida. Una nueva corrida
se vuelve la audiencia activa sin mezclar perfiles de snapshots anteriores.

`GET /api/perfiles/cobertura?perfil=…` devuelve el `runId` activo, conexiones, perfiles
enriquecidos y el pool elegible —hasta 200 personas diversas por empresa/cargo—.

#### Ingesta manual compatible — `POST /api/perfiles`

Es el contrato que consume el scrapeo de perfil. Todo es opcional salvo saber a quién
pertenece el dato (`conexionId` o `nombre`): un scraper devuelve lo que el perfil tenga
público, y lo que no venga simplemente no se usa.

```jsonc
{
  "perfil": "https://linkedin.com/in/tu-perfil",   // dueño de la red
  "perfiles": [{
    "nombre": "Ana Pérez",                          // o "conexionId": "42"
    "descripcion": "About del perfil",
    "cargoActual": "CTO", "empresaActual": "Acme", "sector": "SaaS", "ubicacion": "Bogotá",
    "experiencia":   [{ "cargo": "Lead", "empresa": "Previa", "desde": "2018", "hasta": "2022" }],
    "educacion":     [{ "institucion": "Uniandes", "titulo": "Ing. Sistemas", "anio": 2014 }],
    "publicaciones": [{ "texto": "...", "fecha": "2026-08-01", "tipo": "post", "reacciones": 34 }],
    "enComun": { "empresas": [], "instituciones": ["Uniandes"], "grupos": [], "conexionesMutuas": 12 },
    "seguidores": 3400,
    "fuente": "apify/<actor>"
  }]
}
```

Responde qué se escribió y **qué no se pudo pegar**: `sinResolver` (gente que no está en la
red cargada) y `ambiguos` (homónimos — no se elige uno al azar). `GET /api/perfiles/cobertura?perfil=…`
dice cuánto de la red está enriquecida.

A quién conviene enriquecer lo decide `GET /api/red/mapa`, que devuelve el plan en
`enrichment.toEnrich`: enriquecer cuesta un scrape por persona, así que el presupuesto va a
donde el dato cambia una decisión.

### 2. Evaluar un copy — `POST /api/panel/evaluaciones`

```jsonc
{
  "perfil": "https://linkedin.com/in/tu-perfil",
  "copy": "el texto del post",
  "icp": "founders de restaurantes en LatAm",   // opcional
  "panel": 12, "rondas": 2, "iteraciones": 3    // opcionales, estos son los defaults
}
```

Devuelve `score` (0-100) y su `banda`, la `dispersion` entre corridas y `convergio`, el
detalle `porIteracion`, qué pasó en la `deliberacion`, las `objeciones` agrupadas, los
`comentarios` textuales del panel y `mejoras` (diagnóstico, cambios anclados a objeciones y
el copy reescrito).

Tres cosas que la respuesta dice y conviene leer:

- **`convergio: false` es el hallazgo**, no un error: significa que las corridas cruzan
  bandas y ese copy es un caso borde donde el resultado depende del azar.
- **`cobertura`** distingue turnos esperados de corridos y perdidos. Una iteración se corta
  sola si nadie comentó: sin comentarios la ronda siguiente no tendría qué leer.
- **`comoLeerlo`**: la tasa de engagement del panel no es una predicción de alcance. Al panel
  se le pidió deliberar, así que comenta bastante más que un feed real; cuánta gente
  reaccionaría lo responde el motor calibrado (`POST /api/simulation/compare`).

Costo máximo: `panel × rondas × iteraciones + 1` llamadas al modelo — con los defaults, 73.
La ronda siguiente se corta si nadie comenta, así que una corrida puede consumir menos.

### 3. Trazabilidad

- `GET /api/panel/corridas?perfil=…` — historial de corridas del perfil.
- `GET /api/panel/corridas/:corridaId` — la corrida completa, turno por turno, **con el
  prompt exacto que recibió cada agente**. Es lo único que permite explicar después por qué
  un agente dijo lo que dijo.

Prueba de humo punta a punta (crea un perfil de prueba y lo borra):

```bash
node scripts/spike/panel-smoke.js --copy spam|bueno --panel 6 --rondas 2 --iteraciones 3
```

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
