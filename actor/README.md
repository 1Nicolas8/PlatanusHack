# Founder Network Graph

Toma la red de contactos de un founder, clasifica cada contacto contra su ICP,
construye el grafo de cercanía y calcula a cuántos saltos está de una oportunidad.

## Entradas

Hay tres formas de traer la red, y el actor las prueba en este orden.

| # | Entrada | ¿Necesita sesión de LinkedIn? |
|---|---|---|
| 1 | `connections` / `connectionsUrl` — tu export oficial, o cualquier CSV con esas columnas | no: es dato tuyo |
| 2 | `engagementActorId` + `postsActorId` — quién comenta y reacciona en tus posts públicos | **no** |
| 3 | `connectionsActorId` — un scraper de la lista de conexiones | **sí, cookie `li_at`** |

La 3 va última a propósito. La lista de conexiones de LinkedIn no es pública:
sacarla obliga a entregar la cookie de una cuenta real. Los comentarios de un
post público, en cambio, se renderizan para cualquiera — de ahí sale la 2.

Y la 2 no es un premio consuelo: la lista de conexiones dice quién te aceptó
una solicitud alguna vez, el engagement dice **quién te lee y te responde**.
Para decidir a quién cultivar, lo segundo es mejor señal. Además la temperatura
de cada contacto deja de ser un modelo: es el conteo real de sus interacciones.

| Campo | Qué es |
|---|---|
| `connections` / `connectionsUrl` | fuente 1 — tu primer grado |
| `postsActorId` / `engagementActorId` | fuente 2 — el actor que trae tus posts, y el que mira quién interactuó en ellos |
| `connectionsActorId` / `connectionsActorInput` | fuente 3 — scraper de conexiones y sus credenciales |
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
| `interactions` / `comments` / `reactions` | **real** con la fuente 2; `null` con las otras — nunca `0`, porque "no medido" y "medido en cero" no son lo mismo |
| Clasificación de ICP | derivado por LLM |
| Aristas | **real** si pasás `edges` o si vienen del engagement, si no modelo de homofilia |
| Alcance a dos saltos | estimación declarada |

Una aclaración sobre las aristas de la fuente 2: que dos personas hayan
comentado el mismo post es **co-audiencia observada**, no prueba de que se
conozcan. El grafo las trata como adyacentes porque para propagar alcance es lo
que importa, pero no las llames conexiones.

`realRatio` en el log dice qué fracción del grafo es dato observado. El reporte
lleva un `disclaimer` con lo mismo, para que ningún número modelado se presente
como medido.

El backend persiste este contrato al finalizar la corrida y lo vincula al perfil dueño y al
`runId`. El navegador solo envía el perfil y el copy: nunca transporta la audiencia completa.

## Costo del LLM

Se agrupa por headline único antes de clasificar: el costo escala con la
variedad de la red, no con su tamaño. Una red de 2.000 contactos con 300
headlines distintos son ~8 llamadas.
