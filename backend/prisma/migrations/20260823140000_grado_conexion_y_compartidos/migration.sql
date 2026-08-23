-- Grado de la conexión y compartidos atribuibles.
--
-- Dos huecos que hacían que la simulación mostrara cosas que no pasan:
--
--   grado         `conexiones` no distinguía primer de segundo grado, así que
--                 gente que solo ve tu post si alguien lo comparte entraba al
--                 panel dando like directo. `reacciones.grado` ya existía y
--                 nadie lo llenaba; el que faltaba era el de la persona.
--   compartir     el CHECK de `reacciones.tipo` solo admitía like|comentario.
--                 Con eso la mezcla observada nunca tenía compartidos y el
--                 número de reposts salía siempre de una estimación.
--
-- Sin default a propósito: NULL significa "no sabemos el grado", y el código lo
-- trata como primer grado porque la red actual se armó desde quienes ya
-- reaccionaron a algo del dueño. Un default de 1 escrito en la tabla haría que
-- ese supuesto quedara indistinguible de un dato medido.

ALTER TABLE "conexiones"
ADD COLUMN IF NOT EXISTS "grado" SMALLINT;

ALTER TABLE "conexiones"
DROP CONSTRAINT IF EXISTS "conexiones_grado_check";

ALTER TABLE "conexiones"
ADD CONSTRAINT "conexiones_grado_check"
CHECK ("grado" IS NULL OR "grado" IN (1, 2));

CREATE INDEX IF NOT EXISTS "conexiones_perfil_url_grado_idx"
ON "conexiones"("perfil_url", "grado");

ALTER TABLE "reacciones"
DROP CONSTRAINT IF EXISTS "reacciones_tipo_check";

ALTER TABLE "reacciones"
ADD CONSTRAINT "reacciones_tipo_check"
CHECK ("tipo" IN ('like', 'comentario', 'compartir'));
