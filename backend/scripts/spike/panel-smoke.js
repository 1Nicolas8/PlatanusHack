/**
 * Prueba de humo del panel, punta a punta y contra los servicios de verdad:
 * Supabase para la red y la trazabilidad, Anthropic para los agentes.
 *
 * Escribe bajo un perfil de prueba propio y lo borra al terminar, así que no
 * toca la red de nadie.
 *
 * Uso: node scripts/spike/panel-smoke.js [--copy spam|bueno] [--panel 4] [--rondas 2] [--iteraciones 2]
 */

require('dotenv').config();
const request = require('supertest');
const createApp = require('../../src/app');
const { getSupabaseClient } = require('../../src/config/supabase');

const PERFIL = 'https://www.linkedin.com/in/panel-smoke-test/';
const PERFIL_KEY = 'linkedin.com/in/panel-smoke-test';

const out = (line = '') => process.stdout.write(`${line}\n`);

const CONTACTOS = [
  {
    nombre: 'Valentina Osorio (smoke)',
    headline: 'Founder en Cocina Nube · dark kitchens',
    perfil: {
      descripcion: 'Monté tres dark kitchens en Bogotá. Vivo peleando con el costo de domicilios.',
      cargoActual: 'Founder',
      empresaActual: 'Cocina Nube',
      sector: 'Food tech',
      experiencia: [{ cargo: 'Gerente de operaciones', empresa: 'Rappi', desde: '2018', hasta: '2021' }],
      educacion: [{ institucion: 'Universidad de los Andes', titulo: 'Administración', anio: 2016 }],
      publicaciones: [{ texto: 'El 30% de comisión de las apps se come el margen de cualquier cocina', tipo: 'post' }],
      enComun: { instituciones: ['Universidad de los Andes'], conexionesMutuas: 14 },
    },
  },
  {
    nombre: 'Camilo Restrepo (smoke)',
    headline: 'CTO en Fintech B2B',
    perfil: {
      descripcion: 'Ingeniero. Me interesan los sistemas de pagos y muy poco el marketing.',
      cargoActual: 'CTO',
      empresaActual: 'Pagos Andinos',
      sector: 'Fintech',
      publicaciones: [{ texto: 'Migramos a event sourcing y bajamos 40% los incidentes', tipo: 'post' }],
      enComun: { conexionesMutuas: 3 },
    },
  },
  {
    nombre: 'Daniela Cruz (smoke)',
    headline: 'Head of Growth · marketplaces',
    perfil: {
      descripcion: 'Growth para marketplaces. Compro herramientas si veo el número, no la promesa.',
      cargoActual: 'Head of Growth',
      empresaActual: 'Mercado Sur',
      publicaciones: [{ texto: 'Nadie necesita otra herramienta de IA, necesitan menos herramientas', tipo: 'post' }],
      enComun: { empresas: ['Rappi'], conexionesMutuas: 27 },
    },
  },
  {
    nombre: 'Jorge Medina (smoke)',
    headline: 'Consultor independiente',
    perfil: null,
  },
  {
    nombre: 'Sara Villalba (smoke)',
    headline: 'Directora de marketing · retail',
    perfil: {
      descripcion: 'Manejo el presupuesto de marketing de una cadena de retail. Escéptica de todo lo que se llame revolucionario.',
      cargoActual: 'Directora de marketing',
      empresaActual: 'Retail Andino',
      publicaciones: [{ texto: 'Cansada de propuestas que prometen 10x sin explicar cómo', tipo: 'post' }],
      enComun: { conexionesMutuas: 8 },
    },
  },
  {
    nombre: 'Andrés Pardo (smoke)',
    headline: 'Data engineer',
    perfil: {
      descripcion: 'Pipelines de datos. Publico poco, leo mucho.',
      cargoActual: 'Data engineer',
      empresaActual: 'Nubank',
      publicaciones: [{ texto: 'dbt no es una estrategia de datos', tipo: 'post' }],
      enComun: { conexionesMutuas: 1 },
    },
  },
];

const COPYS = {};

COPYS.spam = [
  '🚀 Estoy lanzando algo que va a REVOLUCIONAR la forma en que las empresas venden.',
  '',
  'Después de meses de trabajo, por fin puedo contarlo: creamos una plataforma con IA que multiplica x10 tus resultados comerciales.',
  '',
  '¿Querés saber más? Comentá "INFO" y te escribo por privado. 👇',
].join('\n');

COPYS.bueno = [
  'Una cocina que factura 40 millones al mes se queda con 12 después de comisiones, domicilios y desperdicio.',
  '',
  'Lo medimos en 9 dark kitchens de Bogotá durante seis meses. El desperdicio no era el problema principal: era pedir mal.',
  'Las tres que empezaron a proyectar demanda por franja horaria bajaron la merma de 11% a 4% sin cambiar proveedor.',
  '',
  'Escribí un desglose de cómo lo calculamos, con los números de las tres. Si manejás una cocina y querés el archivo, decímelo acá y te lo paso.',
].join('\n');

async function limpiar(client) {
  const { data: conexiones } = await client.from('conexiones').select('id').eq('perfil_url', PERFIL_KEY);
  const ids = (conexiones ?? []).map((c) => c.id);
  if (ids.length) await client.from('perfiles_enriquecidos').delete().in('conexion_id', ids);
  await client.from('corridas_panel').delete().eq('perfil_url', PERFIL_KEY);
  await client.from('conexiones').delete().eq('perfil_url', PERFIL_KEY);
}

async function main() {
  const argv = process.argv.slice(2);
  const arg = (name, fallback) => {
    const i = argv.indexOf(name);
    return i === -1 ? fallback : Number(argv[i + 1]);
  };

  const app = createApp();
  const client = getSupabaseClient();

  await limpiar(client);

  const { error } = await client
    .from('conexiones')
    .insert(CONTACTOS.map((c) => ({ perfil_url: PERFIL_KEY, nombre: c.nombre, headline: c.headline })));
  if (error) throw error;
  out(`Red de prueba cargada: ${CONTACTOS.length} contactos.`);

  const ingesta = await request(app)
    .post('/api/perfiles')
    .send({
      perfil: PERFIL,
      perfiles: CONTACTOS.filter((c) => c.perfil).map((c) => ({ nombre: c.nombre, ...c.perfil, fuente: 'smoke' })),
    });
  if (ingesta.status !== 201) throw new Error(`ingesta falló: ${ingesta.status} ${JSON.stringify(ingesta.body)}`);
  out(`Enriquecidos: ${ingesta.body.data.escritos}. Sin resolver: ${ingesta.body.data.sinResolver.length}.`);

  const inicio = Date.now();
  const evaluacion = await request(app)
    .post('/api/panel/evaluaciones')
    .send({
      perfil: PERFIL,
      copy: COPYS[argv.includes('--copy') ? argv[argv.indexOf('--copy') + 1] : 'spam'] ?? COPYS.spam,
      icp: 'founders de restaurantes y dark kitchens en LatAm',
      panel: arg('--panel', 4),
      rondas: arg('--rondas', 2),
      iteraciones: arg('--iteraciones', 2),
    });
  if (evaluacion.status !== 201) throw new Error(`evaluación falló: ${evaluacion.status} ${JSON.stringify(evaluacion.body)}`);

  const d = evaluacion.body.data;
  out('');
  out(`SCORE ${d.score}/100 (${d.banda}) — dispersión ${d.dispersion} — ${d.convergio ? 'CONVERGE' : 'CASO BORDE'}`);
  out(d.veredicto);
  out('');
  out('Por corrida:');
  for (const it of d.porIteracion) {
    out(`  #${it.iteracion}: ${it.score}/100 (${it.banda}) · engagement ${it.tasaEngagement}% · ` +
      `${it.likes}L ${it.comentarios}C ${it.compartidos}S ${it.ignorados}ign`);
  }
  out('');
  out(`Deliberación: ronda 1 ${d.deliberacion.scoreRonda1} → ronda final ${d.deliberacion.scoreRondaFinal} ` +
    `(${d.deliberacion.delta >= 0 ? '+' : ''}${d.deliberacion.delta}), ${d.deliberacion.cambiosDeOpinion} cambios de opinión`);
  for (const inf of d.deliberacion.influencias.slice(0, 5)) {
    out(`  ${inf.agente} ← ${inf.influenciadoPor}`);
  }
  out('');
  out('Objeciones más repetidas:');
  for (const o of d.objeciones.slice(0, 5)) out(`  (${o.veces}x) ${o.texto}`);
  out('');
  out('Comentarios del panel:');
  for (const c of d.comentarios.slice(0, 5)) out(`  ${c.nombre}: "${c.comentario}"`);
  out('');
  if (d.mejoras) {
    out(`Diagnóstico: ${d.mejoras.diagnostico}`);
    for (const m of d.mejoras.mejoras) out(`  - ${m.cambio}\n    porque: ${m.porQue}\n    evidencia: ${m.evidencia}`);
    out('');
    out('Copy sugerido:');
    out(d.mejoras.copySugerido);
  }
  out('');
  out(`Cobertura: ${JSON.stringify(d.cobertura)} · trazada: ${d.trazada} · ${Math.round((Date.now() - inicio) / 1000)}s`);

  const corrida = await request(app).get(`/api/panel/corridas/${d.corridaId}`);
  out(`Trazabilidad releída: ${corrida.body.data?.turnos?.length} turnos guardados con su prompt.`);

  await limpiar(client);
  out('Red de prueba borrada.');
}

main().catch((error) => {
  process.exitCode = 1;
  out(`FALLÓ: ${error.message}`);
});
