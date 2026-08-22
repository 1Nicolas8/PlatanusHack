CREATE TABLE "conexiones" (
    "id" BIGSERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "headline" TEXT,
    "fecha_contacto" DATE,
    "estado_busqueda" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conexiones_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "conexiones_nombre_fecha_contacto_key"
ON "conexiones"("nombre", "fecha_contacto");
