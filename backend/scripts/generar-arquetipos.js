const crypto = require('node:crypto');
const path = require('node:path');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');
const { z } = require('zod');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
const TOOL_NAME = 'registrar_arquetipos';
const STOP_WORDS = new Set([
  'a', 'al', 'and', 'at', 'con', 'de', 'del', 'en', 'for', 'in', 'la', 'las', 'los', 'of',
  'para', 'the', 'to', 'un', 'una', 'y', 'senior', 'sr', 'junior', 'jr', 'lead', 'manager',
]);

const archetypeSchema = z.object({
  nombre: z.string().trim().min(3).max(100),
  descripcion: z.string().trim().min(20),
  awareness: z.string().trim().min(10),
  objeciones: z.string().trim().min(10),
  pain_points: z.string().trim().min(10),
  sensibilidad_precio: z.string().trim().min(10),
  intencion_compra: z.string().trim().min(10),
  keywords: z.array(z.string().trim().min(2).max(80)).min(8).max(30),
}).strict();

const responseSchema = z.object({
  arquetipos: z.array(archetypeSchema).min(8).max(12),
}).strict().superRefine(({ arquetipos }, context) => {
  const names = arquetipos.map(({ nombre }) => normalize(nombre));
  if (new Set(names).size !== names.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Los nombres de arquetipo deben ser únicos.' });
  }
});

const toolInputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['arquetipos'],
  properties: {
    arquetipos: {
      type: 'array',
      minItems: 8,
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'nombre', 'descripcion', 'awareness', 'objeciones', 'pain_points',
          'sensibilidad_precio', 'intencion_compra', 'keywords',
        ],
        properties: {
          nombre: { type: 'string', minLength: 3, maxLength: 100 },
          descripcion: { type: 'string', minLength: 20 },
          awareness: { type: 'string', minLength: 10 },
          objeciones: { type: 'string', minLength: 10 },
          pain_points: { type: 'string', minLength: 10 },
          sensibilidad_precio: { type: 'string', minLength: 10 },
          intencion_compra: { type: 'string', minLength: 10 },
          keywords: {
            type: 'array', minItems: 8, maxItems: 30,
            items: { type: 'string', minLength: 2, maxLength: 80 },
          },
        },
      },
    },
  },
};

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .replace(/[^a-z0-9+#.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(value) {
  return new Set(normalize(value).split(' ').filter((token) => token.length > 1 && !STOP_WORDS.has(token)));
}

function stableIndex(value, length) {
  const hash = crypto.createHash('sha256').update(value).digest();
  return hash.readUInt32BE(0) % length;
}

function scoreHeadline(headline, archetype) {
  const normalizedHeadline = normalize(headline);
  const headlineTokens = tokens(headline);
  const keywordTokens = new Set(archetype.keywords.flatMap((keyword) => [...tokens(keyword)]));
  const definitionTokens = tokens([
    archetype.nombre, archetype.descripcion, archetype.awareness, archetype.objeciones,
    archetype.pain_points, archetype.sensibilidad_precio, archetype.intencion_compra,
  ].join(' '));
  let score = 0;
  for (const keyword of archetype.keywords) {
    const normalizedKeyword = normalize(keyword);
    if (normalizedKeyword && normalizedHeadline.includes(normalizedKeyword)) score += 100;
  }
  for (const token of headlineTokens) {
    if (keywordTokens.has(token)) score += 10;
    if (definitionTokens.has(token)) score += 1;
  }
  return score;
}

function assignArchetype(connection, archetypes) {
  const scored = archetypes.map((archetype, index) => ({ archetype, index, score: scoreHeadline(connection.headline, archetype) }));
  scored.sort((left, right) => right.score - left.score || left.index - right.index);
  if (scored[0].score > 0) return { archetype: scored[0].archetype, method: 'keywords' };
  const index = stableIndex(`${connection.id}\u0000${normalize(connection.headline)}`, archetypes.length);
  return { archetype: archetypes[index], method: 'desempate_estable' };
}

async function selectAll(query, label) {
  const { data, error } = await query;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

async function propagateAssignmentsToAgents(supabase, connections, assignments) {
  for (const archetypeId of new Set(assignments.map(({ archetype }) => String(archetype.id)))) {
    const connectionIds = assignments.flatMap((assignment, index) => (
      String(assignment.archetype.id) === archetypeId ? [connections[index].id] : []
    ));
    const { error } = await supabase
      .from('agentes_simulacion')
      .update({ arquetipo_id: archetypeId })
      .in('conexion_id', connectionIds);
    if (error) throw new Error(`No se pudieron propagar asignaciones a agentes_simulacion: ${error.message}`);
  }
}

async function requestArchetypes(apiKey, headlines, previousError) {
  const correction = previousError
    ? `\nLa respuesta anterior fue rechazada por esta validación: ${previousError}. Corrígela exactamente.`
    : '';
  const prompt = [
    'Deriva entre 8 y 12 arquetipos exclusivamente de los headlines reales adjuntos.',
    'No inventes un ICP abstracto. Refleja la composición observada: roles técnicos, data/IA, RRHH/psicología, founders, finanzas, diseño, estudiantes y cualquier otro grupo que realmente aparezca.',
    'Cada keyword debe ser una palabra o frase de cargo/industria que aparezca en los headlines o una variante directa en español/inglés; se usará para clasificación determinista.',
    'Haz categorías mutuamente distinguibles y devuelve el resultado solo mediante la herramienta registrar_arquetipos.',
    correction,
    `HEADLINES (${headlines.length}):`,
    ...headlines.map((headline, index) => `${index + 1}. ${headline || '(sin headline)'}`),
  ].join('\n');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }],
      tools: [{ name: TOOL_NAME, description: 'Entrega los arquetipos derivados de los headlines.', input_schema: toolInputSchema }],
      tool_choice: { type: 'tool', name: TOOL_NAME },
    }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = body?.error?.message || `HTTP ${response.status}`;
    throw new Error(`Anthropic rechazó la solicitud: ${detail}`);
  }
  const toolUse = body.content?.find((block) => block.type === 'tool_use' && block.name === TOOL_NAME);
  if (!toolUse) throw new Error('Anthropic no devolvió el bloque tool_use registrar_arquetipos.');
  return toolUse.input;
}

function coerceArchetypePayload(raw) {
  if (!raw || typeof raw !== 'object') return raw;

  let archetypes = raw.arquetipos;
  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof archetypes === 'string') {
      try {
        archetypes = JSON.parse(archetypes);
      } catch {
        break;
      }
      continue;
    }
    if (Array.isArray(archetypes) || !archetypes || typeof archetypes !== 'object') break;
    if (Object.hasOwn(archetypes, 'arquetipos')) {
      archetypes = archetypes.arquetipos;
      continue;
    }
    if (Object.hasOwn(archetypes, 'items')) {
      archetypes = archetypes.items;
      continue;
    }
    const entries = Object.entries(archetypes);
    if (entries.length && entries.every(([key]) => /^\d+$/.test(key))) {
      archetypes = entries
        .sort(([left], [right]) => Number(left) - Number(right))
        .map(([, value]) => value);
    }
    break;
  }
  return { ...raw, arquetipos: archetypes };
}

async function generateValidatedArchetypes(apiKey, headlines) {
  let validationError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const raw = await requestArchetypes(apiKey, headlines, validationError);
    const parsed = responseSchema.safeParse(coerceArchetypePayload(raw));
    if (parsed.success) return parsed.data.arquetipos;
    validationError = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
  }
  throw new Error(`La respuesta del LLM no validó después de 2 intentos: ${validationError}`);
}

function summarize(connections, archetypes, assignments) {
  const counts = new Map(archetypes.map(({ nombre }) => [nombre, 0]));
  let keywordMatches = 0;
  let stableFallbacks = 0;
  let existingAssignments = 0;
  for (const assignment of assignments) {
    counts.set(assignment.archetype.nombre, counts.get(assignment.archetype.nombre) + 1);
    if (assignment.method === 'keywords') keywordMatches += 1;
    if (assignment.method === 'desempate_estable') stableFallbacks += 1;
    if (assignment.method === 'existente') existingAssignments += 1;
  }
  const distribution = [...counts.entries()]
    .map(([nombre, conexiones]) => ({ nombre, conexiones }))
    .sort((left, right) => right.conexiones - left.conexiones || left.nombre.localeCompare(right.nombre, 'es'));
  return {
    conexiones: connections.length,
    arquetipos: distribution,
    top_5: distribution.slice(0, 5),
    bottom_5: [...distribution].sort((left, right) => left.conexiones - right.conexiones || left.nombre.localeCompare(right.nombre, 'es')).slice(0, 5),
    asignacion: {
      por_keywords: keywordMatches,
      desempate_estable: stableFallbacks,
      existentes: existingAssignments,
      no_asignadas: [],
    },
  };
}

async function main() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en backend/.env.');
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const connections = await selectAll(
    supabase.from('conexiones').select('id,nombre,headline,arquetipo_id').order('id'),
    'No se pudieron leer conexiones',
  );
  if (connections.length !== 406) throw new Error(`Se esperaban 406 conexiones y se encontraron ${connections.length}.`);

  let stored = await selectAll(supabase.from('arquetipos').select('*').order('id'), 'No se pudieron leer arquetipos');
  const storedIds = new Set(stored.map(({ id }) => String(id)));
  const completeExisting = stored.length >= 8 && stored.length <= 12
    && connections.every(({ arquetipo_id: archetypeId }) => archetypeId && storedIds.has(String(archetypeId)));

  if (completeExisting) {
    const byId = new Map(stored.map((archetype) => [String(archetype.id), archetype]));
    const assignments = connections.map((connection) => ({ archetype: byId.get(String(connection.arquetipo_id)), method: 'existente' }));
    await propagateAssignmentsToAgents(supabase, connections, assignments);
    const report = summarize(connections, stored, assignments);
    report.idempotencia = 'Se conservó la población existente; no se llamó al LLM ni se reasignó.';
    console.info(JSON.stringify(report, null, 2));
    return;
  }

  if (!ANTHROPIC_API_KEY) throw new Error('Falta ANTHROPIC_API_KEY en backend/.env; no se modificó arquetipos ni conexiones.');
  const generated = await generateValidatedArchetypes(ANTHROPIC_API_KEY, connections.map(({ headline }) => headline));
  const rows = generated.map(({ keywords: _keywords, ...archetype }) => archetype);
  const { error: upsertError } = await supabase.from('arquetipos').upsert(rows, { onConflict: 'nombre' });
  if (upsertError) throw new Error(`No se pudieron guardar arquetipos: ${upsertError.message}`);

  stored = await selectAll(
    supabase.from('arquetipos').select('*').in('nombre', generated.map(({ nombre }) => nombre)).order('id'),
    'No se pudieron recuperar arquetipos',
  );
  const storedByName = new Map(stored.map((archetype) => [archetype.nombre, archetype]));
  const assignable = generated.map((archetype) => ({ ...archetype, id: storedByName.get(archetype.nombre)?.id }));
  if (assignable.some(({ id }) => !id)) throw new Error('No se recuperaron todos los arquetipos insertados; no se asignaron conexiones.');
  const assignments = connections.map((connection) => assignArchetype(connection, assignable));
  for (const archetype of assignable) {
    const ids = assignments.flatMap((assignment, index) => assignment.archetype.nombre === archetype.nombre ? [connections[index].id] : []);
    if (!ids.length) continue;
    const { error } = await supabase.from('conexiones').update({ arquetipo_id: archetype.id }).in('id', ids);
    if (error) throw new Error(`No se pudieron asignar conexiones a ${archetype.nombre}: ${error.message}`);
  }
  await propagateAssignmentsToAgents(supabase, connections, assignments);

  const report = summarize(connections, assignable, assignments);
  console.info(JSON.stringify(report, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { normalize, scoreHeadline, assignArchetype, coerceArchetypePayload, responseSchema, summarize };
