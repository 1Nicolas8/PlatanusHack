# Reporte SIM-10 / SIM-11

Fecha de ejecución: 2026-08-22.

## Estado

- SIM-10 — ✅ 12 arquetipos generados por el LLM y asignados a las 406 conexiones.
- SIM-11 — ✅ los 406 agentes heredaron el arquetipo de su conexión.
- No se tocaron las tablas del proyecto que comparte la base.

## Falla encontrada y corrección

Anthropic rechazó las dos primeras respuestas porque entregó `arquetipos` como un objeto
anidado en vez del array que exige Zod. La coerción previa solo contemplaba JSON serializado
como string.

Se extendió `coerceArchetypePayload()` para desempaquetar, con un máximo de cuatro niveles,
strings JSON, wrappers `arquetipos`/`items` y objetos con índices numéricos. El schema Zod
sigue siendo estricto: exige entre 8 y 12 arquetipos, nombres únicos, dimensiones no vacías y
entre 8 y 30 keywords por arquetipo. También se corrigió el resumen de una corrida idempotente
para no presentar asignaciones existentes como coincidencias nuevas por keywords.

## Distribución generada

| Arquetipo | Conexiones |
|---|---:|
| Desarrolladores de Software y Full Stack Engineers | 74 |
| Data Scientists, Analistas de Datos y BI | 53 |
| Founders y Emprendedores Tech/Startups | 49 |
| Estudiantes Universitarios (Ingeniería, Sistemas, Negocios) | 48 |
| Marketing Digital, Growth y Ventas B2B | 34 |
| Profesionales de RRHH, Talento y Psicología Organizacional | 31 |
| Arquitectos Cloud, DevOps y Ciberseguridad | 27 |
| Especialistas en IA, Automatización y AI Engineers | 26 |
| Diseñadores UX/UI y Product Designers | 25 |
| Project Managers, PMO y Consultores de Transformación Digital | 21 |
| Perfiles de Finanzas, Banca e Inversiones | 15 |
| Consultores Legales y LegalTech | 3 |
| **Total** | **406** |

### Cinco con más conexiones

1. Desarrolladores de Software y Full Stack Engineers — 74
2. Data Scientists, Analistas de Datos y BI — 53
3. Founders y Emprendedores Tech/Startups — 49
4. Estudiantes Universitarios (Ingeniería, Sistemas, Negocios) — 48
5. Marketing Digital, Growth y Ventas B2B — 34

### Cinco con menos conexiones

1. Consultores Legales y LegalTech — 3
2. Perfiles de Finanzas, Banca e Inversiones — 15
3. Project Managers, PMO y Consultores de Transformación Digital — 21
4. Diseñadores UX/UI y Product Designers — 25
5. Especialistas en IA, Automatización y AI Engineers — 26

## Calidad de asignación

- Por keywords: 389 conexiones (95,8 %).
- Por desempate estable: 17 conexiones (4,2 %).
- Sin asignar: 0.

El porcentaje bajo de desempates indica que el matching por keywords cubre bien la población;
no hay señal de debilidad generalizada en esta corrida.

## Idempotencia y verificación

El script se ejecutó dos veces. La segunda corrida detectó que la población ya estaba completa,
no llamó al LLM y no insertó ni reasignó datos. Antes y después coincidieron las huellas de los
12 IDs/nombres (`987e65436eeea63b54145112dc7ff7cdd5e0b105efe8fdf9152aad9e97eb4c11`) y de
las 406 parejas conexión/arquetipo
(`5885b2235cfe7776335043885b298902537bd8c2c86843aecb13a992931e2bc3`).

- `arquetipos`: 12 filas; awareness, objeciones, pain points, sensibilidad de precio e intención
  de compra presentes y no vacíos en todas.
- `conexiones`: 406 filas, 0 con `arquetipo_id` nulo.
- `agentes_simulacion`: 406 filas, 0 con `arquetipo_id` nulo y 0 desalineadas respecto a su
  conexión.
- Niveles preservados: 40 `calibrado` y 366 `prior`.
- `npm run lint`: verde.
- `npm test`: 3 suites, 14 tests, todos en verde.
