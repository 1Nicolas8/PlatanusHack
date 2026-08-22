-- Misma trampa que con posts: la unicidad global de conexiones tambien vivia
-- como indice y no como constraint, asi que sobrevivio al barrido.
DROP INDEX IF EXISTS conexiones_nombre_fecha_contacto_key;

-- Redundantes: los indices unicos por perfil ya arrancan con perfil_url, que es
-- el prefijo que estos buscaban servir.
DROP INDEX IF EXISTS idx_conexiones_perfil;
DROP INDEX IF EXISTS idx_posts_perfil;
