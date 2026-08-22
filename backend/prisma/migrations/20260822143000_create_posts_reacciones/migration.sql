CREATE TABLE "posts" (
    "id" BIGSERIAL NOT NULL,
    "titulo" TEXT,
    "texto" TEXT NOT NULL,
    "fecha" DATE,
    "tipo" TEXT,
    "impresiones" INTEGER,
    "total_reacciones" INTEGER,
    "orden" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reacciones" (
    "id" BIGSERIAL NOT NULL,
    "post_id" BIGINT NOT NULL,
    "conexion_id" BIGINT,
    "nombre" TEXT NOT NULL,
    "headline" TEXT,
    "tipo" TEXT NOT NULL,
    "texto_comentario" TEXT,
    "en_conexiones" BOOLEAN NOT NULL,

    CONSTRAINT "reacciones_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "posts_orden_key" ON "posts"("orden");
CREATE UNIQUE INDEX "reacciones_post_id_nombre_tipo_key"
ON "reacciones"("post_id", "nombre", "tipo");

ALTER TABLE "reacciones"
ADD CONSTRAINT "reacciones_post_id_fkey"
FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reacciones"
ADD CONSTRAINT "reacciones_conexion_id_fkey"
FOREIGN KEY ("conexion_id") REFERENCES "conexiones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "reacciones"
ADD CONSTRAINT "reacciones_tipo_check"
CHECK ("tipo" IN ('like', 'comentario'));
