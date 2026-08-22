-- La salida enriquecida del actor queda vinculada a la conexión y a la
-- corrida que la produjo. El panel consulta solo el snapshot activo de cada
-- perfil, en vez de mezclar redes o reutilizar datos viejos.

ALTER TABLE "conexiones"
  ADD COLUMN IF NOT EXISTS "linkedin_url" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "conexiones_perfil_url_linkedin_url_key"
  ON "conexiones"("perfil_url", "linkedin_url");

CREATE TABLE IF NOT EXISTS "audiencias_actor" (
  "run_id" TEXT NOT NULL,
  "perfil_url" TEXT NOT NULL,
  "total_contactos" INTEGER NOT NULL,
  "iniciada_en" TIMESTAMPTZ(6) NOT NULL,
  "terminada_en" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "audiencias_actor_pkey" PRIMARY KEY ("run_id")
);

CREATE INDEX IF NOT EXISTS "audiencias_actor_perfil_url_iniciada_en_idx"
  ON "audiencias_actor"("perfil_url", "iniciada_en");

ALTER TABLE "perfiles_enriquecidos"
  ADD COLUMN IF NOT EXISTS "actor_run_id" TEXT,
  ADD COLUMN IF NOT EXISTS "conexiones" INTEGER,
  ADD COLUMN IF NOT EXISTS "foto_url" TEXT,
  ADD COLUMN IF NOT EXISTS "linkedin_url" TEXT,
  ADD COLUMN IF NOT EXISTS "grado_grafo" INTEGER,
  ADD COLUMN IF NOT EXISTS "es_icp" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "confianza_icp" DECIMAL,
  ADD COLUMN IF NOT EXISTS "razon_icp" TEXT;

CREATE INDEX IF NOT EXISTS "perfiles_enriquecidos_actor_run_id_idx"
  ON "perfiles_enriquecidos"("actor_run_id");

ALTER TABLE "perfiles_enriquecidos"
  ADD CONSTRAINT "perfiles_enriquecidos_actor_run_id_fkey"
  FOREIGN KEY ("actor_run_id") REFERENCES "audiencias_actor"("run_id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "perfiles_enriquecidos"
  ADD CONSTRAINT "perfiles_enriquecidos_confianza_icp_check"
  CHECK ("confianza_icp" IS NULL OR "confianza_icp" BETWEEN 0 AND 1),
  ADD CONSTRAINT "perfiles_enriquecidos_grado_grafo_check"
  CHECK ("grado_grafo" IS NULL OR "grado_grafo" >= 0),
  ADD CONSTRAINT "perfiles_enriquecidos_conexiones_check"
  CHECK ("conexiones" IS NULL OR "conexiones" >= 0);
