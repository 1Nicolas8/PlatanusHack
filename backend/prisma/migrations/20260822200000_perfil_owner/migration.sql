-- Multi-tenancy: cada red pertenece a un perfil.
--
-- Hasta ahora habia un unico dataset compartido sin dueño: pegaras el perfil
-- que pegaras, veias los mismos contactos. Eso hace que el producto muestre la
-- red de otra persona como si fuera la tuya.

ALTER TABLE conexiones ADD COLUMN IF NOT EXISTS perfil_url text;
ALTER TABLE posts      ADD COLUMN IF NOT EXISTS perfil_url text;

-- Las filas existentes se marcan como el dataset semilla en vez de asignarse a
-- alguien al azar. Quien corresponda las reasigna con un UPDATE explicito.
UPDATE conexiones SET perfil_url = 'seed:dataset-inicial' WHERE perfil_url IS NULL;
UPDATE posts      SET perfil_url = 'seed:dataset-inicial' WHERE perfil_url IS NULL;

CREATE INDEX IF NOT EXISTS idx_conexiones_perfil ON conexiones (perfil_url);
CREATE INDEX IF NOT EXISTS idx_posts_perfil      ON posts (perfil_url);
