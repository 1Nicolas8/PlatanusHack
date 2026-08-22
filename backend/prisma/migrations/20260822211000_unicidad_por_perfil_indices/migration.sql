-- `posts.orden` seguia siendo unico a nivel global: existia como indice unico y
-- no como constraint, asi que el barrido de la migracion anterior no lo alcanzo.
-- Mientras exista, el segundo perfil que cargue posts choca contra el primero.
DROP INDEX IF EXISTS posts_orden_key;
DROP INDEX IF EXISTS posts_orden_cronologico_key;

-- Nombres canonicos de Prisma, para que `migrate diff` quede en cero.
ALTER INDEX IF EXISTS conexiones_perfil_nombre_fecha_key
  RENAME TO conexiones_perfil_url_nombre_fecha_contacto_key;
ALTER INDEX IF EXISTS posts_perfil_orden_key
  RENAME TO posts_perfil_url_orden_key;
ALTER INDEX IF EXISTS posts_perfil_orden_cronologico_key
  RENAME TO posts_perfil_url_orden_cronologico_key;
