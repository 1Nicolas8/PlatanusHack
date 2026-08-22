CREATE TABLE "agentes_simulacion" (
    "id" BIGSERIAL NOT NULL,
    "conexion_id" BIGINT NOT NULL,
    "arquetipo_id" BIGINT NOT NULL,
    "nivel" TEXT NOT NULL,
    "reacciones_observadas" INTEGER NOT NULL DEFAULT 0,
    "umbral_usado" INTEGER NOT NULL,
    "semilla" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agentes_simulacion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agentes_simulacion_conexion_id_key" ON "agentes_simulacion"("conexion_id");

ALTER TABLE "agentes_simulacion"
ADD CONSTRAINT "agentes_simulacion_conexion_id_fkey"
FOREIGN KEY ("conexion_id") REFERENCES "conexiones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "agentes_simulacion"
ADD CONSTRAINT "agentes_simulacion_arquetipo_id_fkey"
FOREIGN KEY ("arquetipo_id") REFERENCES "arquetipos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "agentes_simulacion"
ADD CONSTRAINT "agentes_simulacion_nivel_check" CHECK ("nivel" IN ('calibrado', 'prior')),
ADD CONSTRAINT "agentes_simulacion_reacciones_observadas_check" CHECK ("reacciones_observadas" >= 0),
ADD CONSTRAINT "agentes_simulacion_umbral_usado_check" CHECK ("umbral_usado" >= 0);
