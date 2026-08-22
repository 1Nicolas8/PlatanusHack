const { z } = require('zod');
require('dotenv').config();

// Trata "" como "no seteado" — el .env.example deja placeholders vacíos y
// eso no debe tumbar el arranque en dev.
const optionalString = () =>
  z.preprocess((value) => (value === '' ? undefined : value), z.string().optional());
const optionalUrl = () =>
  z.preprocess((value) => (value === '' ? undefined : value), z.string().url().optional());

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  SUPABASE_URL: optionalUrl(),
  SUPABASE_SERVICE_ROLE_KEY: optionalString(),

  // Consumidas por Prisma (prisma.config.js), no por el código de la app.
  // DATABASE_URL apunta al pooler de transacción (6543) para queries;
  // DIRECT_URL al pooler de sesión (5432) para migraciones. No son
  // intercambiables: DDL no corre sobre un pooler en modo transacción.
  DATABASE_URL: optionalString(),
  DIRECT_URL: optionalString(),

  ANTHROPIC_API_KEY: optionalString(),
  ANTHROPIC_MODEL: optionalString(),

  // Apify: el actor que trae la red y las publicaciones desde un perfil.
  APIFY_TOKEN: optionalString(),
  APIFY_ACTOR_ID: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().default('NQEbFd0PlD0PJDKmW'),
  ),
  // Que scraper encadenar para resolver un profileUrl. Sin esto el actor no
  // tiene de donde sacar conexiones y falla, que es el comportamiento correcto:
  // preferimos un error claro a datos inventados.
  APIFY_CONNECTIONS_ACTOR_ID: optionalString(),
  // JSON con los parametros del scraper, incluida su cookie de sesion si la
  // pide. El backend lo reenvia sin leerlo ni guardarlo.
  APIFY_CONNECTIONS_ACTOR_INPUT: optionalString(),

  // La fuente publica: posts del perfil, y quien comento o reacciono en ellos.
  // Ninguno de los dos necesita sesion de LinkedIn — un post publico y sus
  // comentarios se ven deslogueado. Es el camino por defecto justamente por
  // eso: no hay que pedirle a nadie la cookie de su cuenta.
  APIFY_POSTS_ACTOR_ID: optionalString(),
  APIFY_POSTS_ACTOR_INPUT: optionalString(),
  APIFY_ENGAGEMENT_ACTOR_ID: optionalString(),
  APIFY_ENGAGEMENT_ACTOR_INPUT: optionalString(),
});

// Falla rápido y explícito si el .env está mal formado — más barato que un
// bug de runtime a mitad del demo.
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Variables de entorno inválidas:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

module.exports = parsed.data;
