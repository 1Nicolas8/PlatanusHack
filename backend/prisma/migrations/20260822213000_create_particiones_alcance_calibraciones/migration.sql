ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "orden_cronologico" INTEGER;

UPDATE "posts"
SET "orden_cronologico" = 11 - "orden"
WHERE "orden_cronologico" IS NULL;

ALTER TABLE "posts" ALTER COLUMN "orden_cronologico" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "posts_orden_cronologico_key" ON "posts"("orden_cronologico");

CREATE TABLE "particiones_posts" (
  "esquema" TEXT NOT NULL,
  "post_id" BIGINT NOT NULL,
  "rol" TEXT NOT NULL,
  CONSTRAINT "particiones_posts_pkey" PRIMARY KEY ("esquema", "post_id"),
  CONSTRAINT "particiones_posts_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "particiones_posts_rol_check" CHECK ("rol" IN ('calibracion', 'evaluacion'))
);

CREATE INDEX "particiones_posts_esquema_rol_idx" ON "particiones_posts"("esquema", "rol");

CREATE TABLE "corridas_calibracion" (
  "id" TEXT NOT NULL,
  "esquema_particion" TEXT NOT NULL,
  "modelo_alcance_habilitado" BOOLEAN NOT NULL,
  "pct_en_red_supuesto" DECIMAL NOT NULL,
  "fuerza_prior" DECIMAL NOT NULL,
  "supuesto_alcance" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "corridas_calibracion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "corridas_calibracion_pct_check" CHECK ("pct_en_red_supuesto" BETWEEN 0 AND 100),
  CONSTRAINT "corridas_calibracion_k_check" CHECK ("fuerza_prior" > 0)
);

CREATE TABLE "alcances_agentes_posts" (
  "corrida_id" TEXT NOT NULL,
  "agente_id" BIGINT NOT NULL,
  "post_id" BIGINT NOT NULL,
  "exposure_prob" DECIMAL NOT NULL,
  "impresiones_en_red" DECIMAL NOT NULL,
  "fuente_alcance" TEXT NOT NULL,
  "supuesto_alcance" TEXT NOT NULL,
  CONSTRAINT "alcances_agentes_posts_pkey" PRIMARY KEY ("corrida_id", "agente_id", "post_id"),
  CONSTRAINT "alcances_agentes_posts_corrida_id_fkey" FOREIGN KEY ("corrida_id") REFERENCES "corridas_calibracion"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "alcances_agentes_posts_agente_id_fkey" FOREIGN KEY ("agente_id") REFERENCES "agentes_simulacion"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "alcances_agentes_posts_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "alcances_agentes_posts_prob_check" CHECK ("exposure_prob" BETWEEN 0 AND 1),
  CONSTRAINT "alcances_agentes_posts_impresiones_check" CHECK ("impresiones_en_red" >= 0)
);

CREATE INDEX "alcances_agentes_posts_post_id_idx" ON "alcances_agentes_posts"("post_id");

CREATE TABLE "calibraciones_agentes" (
  "corrida_id" TEXT NOT NULL,
  "agente_id" BIGINT NOT NULL,
  "tasa_calibrada" DECIMAL NOT NULL,
  "tasa_arquetipo" DECIMAL NOT NULL,
  "exitos" INTEGER NOT NULL,
  "fallos_ponderados" DECIMAL NOT NULL,
  "k_usado" DECIMAL NOT NULL,
  "esquema_particion" TEXT NOT NULL,
  "supuesto_alcance" TEXT NOT NULL,
  CONSTRAINT "calibraciones_agentes_pkey" PRIMARY KEY ("corrida_id", "agente_id"),
  CONSTRAINT "calibraciones_agentes_corrida_id_fkey" FOREIGN KEY ("corrida_id") REFERENCES "corridas_calibracion"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "calibraciones_agentes_agente_id_fkey" FOREIGN KEY ("agente_id") REFERENCES "agentes_simulacion"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "calibraciones_agentes_tasa_check" CHECK ("tasa_calibrada" BETWEEN 0 AND 1 AND "tasa_arquetipo" BETWEEN 0 AND 1),
  CONSTRAINT "calibraciones_agentes_evidencia_check" CHECK ("exitos" >= 0 AND "fallos_ponderados" >= 0 AND "k_usado" > 0)
);

INSERT INTO "particiones_posts" ("esquema", "post_id", "rol")
SELECT 'temporal', "id", CASE WHEN "orden_cronologico" BETWEEN 1 AND 7 THEN 'calibracion' ELSE 'evaluacion' END
FROM "posts"
WHERE "orden_cronologico" BETWEEN 1 AND 10
ON CONFLICT ("esquema", "post_id") DO UPDATE SET "rol" = EXCLUDED."rol";
