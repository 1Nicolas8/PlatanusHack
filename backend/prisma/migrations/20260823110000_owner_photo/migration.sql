-- Foto del dueño de la red, tomada del autor de sus posts scrappeados.
-- Los contactos ya la tienen en perfiles_enriquecidos; el dueño no es un
-- contacto de su propia red, así que vive acá con el snapshot de la corrida.

ALTER TABLE "audiencias_actor"
  ADD COLUMN IF NOT EXISTS "foto_url" TEXT;
