const { z } = require('zod');

const startRunSchema = z.object({
  profileUrl: z.string().url('profileUrl tiene que ser una URL válida'),
  // Opcional: el analisis de red — alcance, relevancia, grafo — no lo necesita.
  // Solo la clasificacion de ICP, que pasa a ser una capa extra y no el eje.
  icp: z.string().min(3).optional(),
  // La red ya cargada, sin scrapear nada. Es el camino del export oficial de
  // LinkedIn ("Get a copy of your data"): dato propio del usuario, gratis y
  // completo. La lista de conexiones no es pública, así que sin esto la única
  // alternativa es un scraper con la sesión de LinkedIn.
  // El tope no es estético: el body viaja a una función serverless con límite
  // de tamaño, y el actor igual recorta en `maxNodes`.
  connections: z.array(z.record(z.any())).max(5000).optional(),
  connectionsUrl: z.string().url('connectionsUrl tiene que ser una URL válida').optional(),
  // Qué actor usa para traer las conexiones y las publicaciones es decisión de
  // quien llama: este backend no elige scraper ni guarda credenciales ajenas.
  connectionsActorId: z.string().optional(),
  connectionsActorInput: z.record(z.any()).optional(),
  postsActorId: z.string().optional(),
  postsActorInput: z.record(z.any()).optional(),
  // Quién comentó y reaccionó en los posts públicos del perfil. Es la fuente
  // que no pide sesión de LinkedIn, y va en pareja con el actor de posts.
  engagementActorId: z.string().optional(),
  engagementActorInput: z.record(z.any()).optional(),
  // Cómo se llama el campo del perfil en el scraper elegido. Adivinarlo falla
  // en silencio: harvestapi usa `targetUrls` y con otro nombre devuelve cero.
  profileField: z.string().optional(),
  // Relee una corrida ya pagada en vez de scrapear otra vez.
  engagementDatasetId: z.string().optional(),
});

const runIdSchema = z.object({ runId: z.string().min(1) });

const runQuerySchema = z.object({
  // Permite inspeccionar una corrida sin escribir en las tablas del equipo.
  persist: z
    .preprocess((v) => (v === undefined ? undefined : v !== 'false'), z.boolean().optional()),
});

module.exports = { startRunSchema, runIdSchema, runQuerySchema };
