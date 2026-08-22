ALTER TABLE "agentes_simulacion"
ALTER COLUMN "arquetipo_id" DROP NOT NULL;

ALTER TABLE "agentes_simulacion"
DROP CONSTRAINT "agentes_simulacion_arquetipo_id_fkey";

ALTER TABLE "agentes_simulacion"
ADD CONSTRAINT "agentes_simulacion_arquetipo_id_fkey"
FOREIGN KEY ("arquetipo_id") REFERENCES "arquetipos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
