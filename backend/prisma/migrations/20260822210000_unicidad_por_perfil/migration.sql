-- La unicidad era global: dos personas con un contacto homonimo se pisaban, y
-- `posts.orden` arrancaba en 1 para todos, asi que el segundo perfil que
-- cargara datos sobreescribia los posts del primero. La clave natural incluye
-- al dueno.

ALTER TABLE conexiones ALTER COLUMN perfil_url SET NOT NULL;
ALTER TABLE posts      ALTER COLUMN perfil_url SET NOT NULL;

-- Se borran las unicidades que no incluyen al dueno, sin depender del nombre
-- que Prisma les haya puesto.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname, conrelid::regclass::text AS tabla
    FROM pg_constraint pc
    WHERE contype = 'u'
      AND conrelid IN ('conexiones'::regclass, 'posts'::regclass)
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(pc.conkey) k
        JOIN pg_attribute a ON a.attrelid = pc.conrelid AND a.attnum = k
        WHERE a.attname = 'perfil_url'
      )
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', c.tabla, c.conname);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS conexiones_perfil_nombre_fecha_key
  ON conexiones (perfil_url, nombre, fecha_contacto);
CREATE UNIQUE INDEX IF NOT EXISTS posts_perfil_orden_key
  ON posts (perfil_url, orden);
CREATE UNIQUE INDEX IF NOT EXISTS posts_perfil_orden_cronologico_key
  ON posts (perfil_url, orden_cronologico);
