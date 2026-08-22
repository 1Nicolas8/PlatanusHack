# SIM-36 / SIM-37 — alcance y calibración

Fecha de ejecución: 2026-08-22. Esquema de partición: `temporal` (`orden_cronologico` 1–7 calibración, 8–10 evaluación).

## Configuración y supuesto

- Fuerza del prior: `K=5`.
- Alcance encendido: aproximación uniforme `min(1, impresiones_en_red / 406)`.
- El post 1 usa su `pct_en_red=40%` medido. Para los posts sin desglose se imputa explícitamente el mismo `40%` observado.
- Alcance apagado: `exposure_prob=1` para todo par agente-post.
- Corrida encendida: `e01da53d574201fafd88c1f4`. Corrida apagada: `a0cd984b274e38681f80fbab`.

## Tasa base por arquetipo (alcance encendido)

| # | Arquetipo | Tasa base |
|---:|---|---:|
| 1 | Founders y Emprendedores Tech/Startups | 8.0475% |
| 2 | Data Scientists, Analistas de Datos y BI | 7.4401% |
| 3 | Diseñadores UX/UI y Product Designers | 7.0979% |
| 4 | Project Managers, PMO y Consultores de Transformación Digital | 6.5721% |
| 5 | Especialistas en IA, Automatización y AI Engineers | 6.0666% |
| 6 | Desarrolladores de Software y Full Stack Engineers | 4.7959% |
| 7 | Marketing Digital, Growth y Ventas B2B | 4.6392% |
| 8 | Arquitectos Cloud, DevOps y Ciberseguridad | 4.3814% |
| 9 | Estudiantes Universitarios (Ingeniería, Sistemas, Negocios) | 2.4645% |
| 10 | Profesionales de RRHH, Talento y Psicología Organizacional | 0.6360% |
| 11 | Consultores Legales y LegalTech | 0.0000% |
| 12 | Perfiles de Finanzas, Banca e Inversiones | 0.0000% |

## Top 10 agentes (alcance encendido)

| # | Agente | Nivel | Tasa calibrada | Éxitos | Fallos ponderados |
|---:|---:|---|---:|---:|---:|
| 1 | 354 | calibrado | 49.8991% | 5 | 0.8266 |
| 2 | 391 | calibrado | 46.2280% | 5 | 1.6207 |
| 3 | 382 | calibrado | 41.0669% | 4 | 1.4788 |
| 4 | 387 | calibrado | 40.4606% | 4 | 1.4788 |
| 5 | 137 | calibrado | 33.4793% | 3 | 2.0719 |
| 6 | 165 | calibrado | 32.6533% | 3 | 2.4197 |
| 7 | 389 | calibrado | 32.3618% | 3 | 2.4197 |
| 8 | 334 | calibrado | 32.0160% | 3 | 2.4788 |
| 9 | 362 | calibrado | 30.9176% | 3 | 2.4788 |
| 10 | 403 | calibrado | 30.8428% | 3 | 2.4788 |

## Verificaciones

- La partición cargada tiene 7 posts de calibración y 3 de evaluación. Cada corrida guardó `406 × 7 = 2.842` estimaciones de alcance y 406 calibraciones; la consulta encontró 0 alcances de posts de evaluación.
- Las 406 tasas están dentro de `[0,1]` en ambas corridas.
- Tasa calibrada media con alcance encendido: **4.9167%**. Con alcance apagado: **3.6242%**. Cambiaron 388 de 406 tasas; las 18 restantes pertenecen a grupos/evidencias cuya tasa queda exactamente en cero.
- La desviación máxima de los 366 agentes `prior` respecto a su arquetipo fue **9.6083 puntos porcentuales** con alcance encendido (8.0645 pp apagado). No es razonable describir ese máximo como “muy cerca”: corresponde al agente 176, con 1 éxito, 4.0719 fallos ponderados, tasa de arquetipo 0.6360% y tasa calibrada 10.2443%. Se reporta sin alterar `K` ni la fórmula solicitada.
- Una segunda ejecución de la corrida encendida conservó el mismo identificador y los mismos conteos, verificando idempotencia.
- La evidencia cuenta pares únicos agente-post. Esto evita inflar éxitos cuando una persona tiene más de una fila de reacción para el mismo post.

Tests: 18/18 en verde. ESLint: sin errores. Migraciones: base al día con 7 migraciones.
