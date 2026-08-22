const fs = require('node:fs/promises');
const path = require('node:path');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const EXPECTED_HEADERS = ['nombre', 'headline', 'fecha_contacto', 'estado_busqueda'];
const VALID_ESTADOS = new Set(['empleo', 'personal']);

function parseTsv(contents) {
  const lines = contents.split(/\r?\n/).filter((line) => line !== '');
  const [header, ...dataLines] = lines;

  if (!header || header.split('\t').join('|') !== EXPECTED_HEADERS.join('|')) {
    throw new Error('El TSV no tiene el encabezado esperado.');
  }

  return dataLines.map((line, index) => {
    const [nombre, headline, fechaContacto, estadoBusqueda] = line.split('\t');
    const lineNumber = index + 2;

    if (!nombre) {
      throw new Error(`Fila ${lineNumber}: nombre es obligatorio.`);
    }
    if (fechaContacto && !/^\d{4}-\d{2}-\d{2}$/.test(fechaContacto)) {
      throw new Error(`Fila ${lineNumber}: fecha_contacto debe usar YYYY-MM-DD.`);
    }
    if (estadoBusqueda && !VALID_ESTADOS.has(estadoBusqueda)) {
      throw new Error(`Fila ${lineNumber}: estado_busqueda no es válido.`);
    }

    return {
      nombre,
      headline: headline || null,
      fecha_contacto: fechaContacto || null,
      estado_busqueda: estadoBusqueda || null,
    };
  });
}

async function main() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en backend/.env.');
  }

  const sourcePath = path.resolve(__dirname, '..', '..', 'data', 'conexiones_linkedin.tsv');
  const rows = parseTsv(await fs.readFile(sourcePath, 'utf8'));
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { error } = await supabase
    .from('conexiones')
    .upsert(rows, { onConflict: 'nombre,fecha_contacto' });

  if (error) {
    throw new Error(`No se pudo cargar conexiones: ${error.message}`);
  }

  const { count, error: countError } = await supabase
    .from('conexiones')
    .select('*', { count: 'exact', head: true });

  if (countError) {
    throw new Error(`La carga terminó, pero no se pudo verificar el conteo: ${countError.message}`);
  }

  console.info(`Carga completada: ${rows.length} filas fuente; ${count} filas en conexiones.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
