CREATE TABLE "arquetipos" (
    "id" BIGSERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "awareness" TEXT NOT NULL,
    "objeciones" TEXT NOT NULL,
    "pain_points" TEXT NOT NULL,
    "sensibilidad_precio" TEXT NOT NULL,
    "intencion_compra" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "arquetipos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "arquetipos_nombre_key" ON "arquetipos"("nombre");

ALTER TABLE "conexiones" ADD COLUMN "arquetipo_id" BIGINT;

ALTER TABLE "conexiones"
ADD CONSTRAINT "conexiones_arquetipo_id_fkey"
FOREIGN KEY ("arquetipo_id") REFERENCES "arquetipos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
