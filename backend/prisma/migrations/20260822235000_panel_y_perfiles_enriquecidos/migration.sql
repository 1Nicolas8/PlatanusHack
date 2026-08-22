-- Panel hiperpersonalizado: perfiles enriquecidos + trazabilidad de corridas.
--
-- Solo crea. El diff contra la DB viva tambien proponia dropear las tablas de
-- la idea anterior (sala de trading); se dejaron fuera a proposito — borrar
-- datos ajenos no es parte de este cambio.

CREATE TABLE IF NOT EXISTS "perfiles_enriquecidos" (
    "conexion_id" BIGINT NOT NULL,
    "descripcion" TEXT,
    "cargo_actual" TEXT,
    "empresa_actual" TEXT,
    "sector" TEXT,
    "ubicacion" TEXT,
    "experiencia" JSONB,
    "educacion" JSONB,
    "publicaciones" JSONB,
    "en_comun" JSONB,
    "seguidores" INTEGER,
    "fuente" TEXT,
    "extraido_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "perfiles_enriquecidos_pkey" PRIMARY KEY ("conexion_id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "corridas_panel" (
    "id" TEXT NOT NULL,
    "perfil_url" TEXT NOT NULL,
    "copy" TEXT NOT NULL,
    "icp" TEXT,
    "panel" INTEGER NOT NULL,
    "rondas" INTEGER NOT NULL,
    "iteraciones" INTEGER NOT NULL,
    "modelo" TEXT NOT NULL,
    "semilla" TEXT NOT NULL,
    "score" DECIMAL,
    "desviacion" DECIMAL,
    "convergio" BOOLEAN,
    "veredicto" TEXT,
    "mejoras" JSONB,
    "resumen" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "corridas_panel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "turnos_panel" (
    "id" BIGSERIAL NOT NULL,
    "corrida_panel_id" TEXT NOT NULL,
    "iteracion" INTEGER NOT NULL,
    "ronda" INTEGER NOT NULL,
    "conexion_id" BIGINT,
    "nombre" TEXT NOT NULL,
    "headline" TEXT,
    "accion" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "objecion" TEXT,
    "comentario" TEXT,
    "razon" TEXT,
    "vio" JSONB,
    "prompt" TEXT NOT NULL,
    "respuesta" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "turnos_panel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "corridas_panel_perfil_url_idx" ON "corridas_panel"("perfil_url");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "turnos_panel_corrida_panel_id_iteracion_ronda_idx" ON "turnos_panel"("corrida_panel_id", "iteracion", "ronda");

-- AddForeignKey
ALTER TABLE "perfiles_enriquecidos" ADD CONSTRAINT "perfiles_enriquecidos_conexion_id_fkey" FOREIGN KEY ("conexion_id") REFERENCES "conexiones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turnos_panel" ADD CONSTRAINT "turnos_panel_corrida_panel_id_fkey" FOREIGN KEY ("corrida_panel_id") REFERENCES "corridas_panel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

