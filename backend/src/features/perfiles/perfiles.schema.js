const { z } = require('zod');

/**
 * El contrato del enriquecimiento. Esto es lo que el scrapeo de perfil tiene
 * que entregar para que el panel pueda construir una persona.
 *
 * Todo es opcional salvo a quién pertenece el dato. Un scraper devuelve lo que
 * el perfil tenga público: exigir la descripción dejaría afuera a la mitad de
 * los contactos. Lo que no venga no se rellena — el agente opina desde lo que
 * hay y el resultado declara cuánto de su panel estaba enriquecido.
 */

const experienciaSchema = z.object({
  cargo: z.string().trim().optional(),
  empresa: z.string().trim().optional(),
  desde: z.string().trim().optional(),
  hasta: z.string().trim().optional(),
});

const educacionSchema = z.object({
  institucion: z.string().trim().optional(),
  titulo: z.string().trim().optional(),
  anio: z.union([z.string(), z.number()]).optional(),
});

const publicacionSchema = z.object({
  texto: z.string().trim().min(1),
  fecha: z.string().trim().optional(),
  // Publicar y compartir lo de otro dicen cosas distintas sobre una persona.
  tipo: z.enum(['post', 'repost', 'comentario', 'articulo']).optional(),
  reacciones: z.number().int().nonnegative().optional(),
});

const enComunSchema = z.object({
  empresas: z.array(z.string().trim()).optional(),
  instituciones: z.array(z.string().trim()).optional(),
  grupos: z.array(z.string().trim()).optional(),
  conexionesMutuas: z.number().int().nonnegative().optional(),
});

const perfilSchema = z.object({
  // La conexión se identifica por id si ya se conoce, o por nombre. El nombre
  // es lo único que todos los scrapers traen igual.
  conexionId: z.union([z.string(), z.number()]).optional(),
  nombre: z.string().trim().min(1).optional(),
  descripcion: z.string().trim().optional(),
  cargoActual: z.string().trim().optional(),
  empresaActual: z.string().trim().optional(),
  sector: z.string().trim().optional(),
  ubicacion: z.string().trim().optional(),
  experiencia: z.array(experienciaSchema).optional(),
  educacion: z.array(educacionSchema).optional(),
  publicaciones: z.array(publicacionSchema).optional(),
  enComun: enComunSchema.optional(),
  seguidores: z.number().int().nonnegative().optional(),
  fuente: z.string().trim().optional(),
}).refine((p) => p.conexionId || p.nombre, {
  message: 'Cada perfil necesita conexionId o nombre para saber a quién pertenece.',
});

const ingestSchema = z.object({
  perfil: z.string().trim().min(1, 'Falta el perfil dueño de la red.'),
  perfiles: z.array(perfilSchema).min(1, 'No hay perfiles para cargar.'),
});

const perfilQuerySchema = z.object({ perfil: z.string().trim().min(1) });

module.exports = { ingestSchema, perfilQuerySchema, perfilSchema };
