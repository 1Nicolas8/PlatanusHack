const { z } = require('zod');

const startRunSchema = z.object({
  profileUrl: z.string().url('profileUrl tiene que ser una URL válida'),
  icp: z.string().min(3, 'Sin ICP no se puede clasificar la red'),
  // Qué actor usa para traer las conexiones y las publicaciones es decisión de
  // quien llama: este backend no elige scraper ni guarda credenciales ajenas.
  connectionsActorId: z.string().optional(),
  connectionsActorInput: z.record(z.any()).optional(),
  profileActorId: z.string().optional(),
  profileActorInput: z.record(z.any()).optional(),
  postsActorId: z.string().optional(),
  postsActorInput: z.record(z.any()).optional(),
});

const runIdSchema = z.object({ runId: z.string().min(1) });

const runQuerySchema = z.object({
  // Permite inspeccionar una corrida sin escribir en las tablas del equipo.
  persist: z
    .preprocess((v) => (v === undefined ? undefined : v !== 'false'), z.boolean().optional()),
});

module.exports = { startRunSchema, runIdSchema, runQuerySchema };
