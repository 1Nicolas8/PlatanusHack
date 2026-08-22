ALTER TABLE "reacciones"
ADD COLUMN "subtipo" TEXT,
ADD COLUMN "grado" INTEGER;

ALTER TABLE "posts"
ADD COLUMN "alcanzados" INTEGER,
ADD COLUMN "pct_en_red" DECIMAL,
ADD COLUMN "pct_fuera_red" DECIMAL,
ADD COLUMN "compartidos" INTEGER,
ADD COLUMN "guardados" INTEGER,
ADD COLUMN "interacciones_sociales" INTEGER,
ADD COLUMN "visualizaciones_video" INTEGER,
ADD COLUMN "visualizaciones_perfil" INTEGER,
ADD COLUMN "seguidores_obtenidos" INTEGER;

ALTER TABLE "reacciones"
ADD CONSTRAINT "reacciones_subtipo_check"
CHECK ("subtipo" IS NULL OR "subtipo" IN ('like', 'love', 'celebrate')),
ADD CONSTRAINT "reacciones_grado_check"
CHECK ("grado" IS NULL OR "grado" IN (1, 2));

ALTER TABLE "posts"
ADD CONSTRAINT "posts_pct_en_red_check"
CHECK ("pct_en_red" IS NULL OR "pct_en_red" BETWEEN 0 AND 100),
ADD CONSTRAINT "posts_pct_fuera_red_check"
CHECK ("pct_fuera_red" IS NULL OR "pct_fuera_red" BETWEEN 0 AND 100);
