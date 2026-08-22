# Founder Network Graph

Toma la red de contactos de un founder, clasifica cada contacto contra su ICP,
construye el grafo de cercanía y calcula a cuántos saltos está de una oportunidad.

## Entradas

| Campo | Qué es |
|---|---|
| `connections` / `connectionsUrl` | tu primer grado. Export oficial de LinkedIn, salida de un actor de red, o cualquier CSV con las mismas columnas |
| `edges` | opcional. Pares `[A, B]` de contactos que se conocen. Si vienen, mandan sobre el modelo |
| `icp` | a quién le vendés |
| `anthropicApiKey` | para clasificar headlines contra el ICP |

## Salidas

- **Dataset**: cada contacto conserva identidad (`name`, `headline`, `url`, `photoUrl`), contexto
  profesional (`company`, `currentTitle`, `workHistory`, `education`, `location`, `followers`,
  `connectionsCount`) y suma `isIcp`, `confidence`, `reason` y `degree`.
- **`OPPORTUNITY_REPORT`** en el key-value store: ICP a un salto, estimación a dos,
  empresas con más ICP, y el veredicto de si la red aguanta para publicar.

## Qué es dato y qué es modelo

| Capa | Origen |
|---|---|
| Nodos, empresas, cargos | **real** |
| Clasificación de ICP | derivado por LLM |
| Aristas | **real** si pasás `edges`, si no modelo de homofilia |
| Alcance a dos saltos | estimación declarada |

`realRatio` en el log dice qué fracción del grafo es dato observado. El reporte
lleva un `disclaimer` con lo mismo, para que ningún número modelado se presente
como medido.

El backend persiste este contrato al finalizar la corrida y lo vincula al perfil dueño y al
`runId`. El navegador solo envía el perfil y el copy: nunca transporta la audiencia completa.

## Costo del LLM

Se agrupa por headline único antes de clasificar: el costo escala con la
variedad de la red, no con su tamaño. Una red de 2.000 contactos con 300
headlines distintos son ~8 llamadas.
