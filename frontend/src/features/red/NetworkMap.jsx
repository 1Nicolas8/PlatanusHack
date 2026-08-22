import { useEffect, useState } from 'react';
import { fetchNetworkMap } from '../../api';



/**
 * Mapa radial de la red.
 *
 * Dos variables visuales y no mas: la distancia al centro es cuanto interactua
 * con vos, el tamano del nodo es su alcance. Un grafo que codifica cinco cosas
 * no se lee de un vistazo, y menos en proyector.
 *
 * Los contactos frios se dibujan igual, en el anillo exterior. Que el 80% de
 * una red nunca haya interactuado ES el insight — esconderlos mostraria una red
 * mas viva de lo que esta.
 */

const SIZE = 520
const CENTER = SIZE / 2
const RING_RADIUS = { 1: 60, 2: 115, 3: 170, 4: 215, 5: 245 }
const RING_COLOR = { 1: '#c2410c', 2: '#ea580c', 3: '#f59e0b', 4: '#a8a29e', 5: '#d6d3d1' }

/** El nodo crece con el alcance, con piso para que nada quede invisible. */
const radiusFor = (reach, max) => 2.5 + (reach / (max || 1)) * 6

function polar(index, total, radius) {
  const angle = (index / Math.max(total, 1)) * Math.PI * 2 - Math.PI / 2
  return { x: CENTER + Math.cos(angle) * radius, y: CENTER + Math.sin(angle) * radius }
}

function Graph({ nodes, onSelect, selectedId }) {
  const maxReach = Math.max(...nodes.map((n) => n.reach.score), 1)
  const byRing = new Map()
  for (const n of nodes) {
    if (!byRing.has(n.heat.ring)) byRing.set(n.heat.ring, [])
    byRing.get(n.heat.ring).push(n)
  }

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="netmap-svg" role="img" aria-label="Mapa de tu red">
      {Object.entries(RING_RADIUS).map(([ring, r]) => (
        <circle key={ring} cx={CENTER} cy={CENTER} r={r} fill="none" stroke="#e7e5e4" strokeDasharray="3 5" />
      ))}

      {[...byRing.entries()].map(([ring, list]) =>
        list.map((node, i) => {
          const { x, y } = polar(i, list.length, RING_RADIUS[ring])
          const isSelected = selectedId === node.id
          return (
            <circle
              key={node.id}
              cx={x}
              cy={y}
              r={radiusFor(node.reach.score, maxReach) * (isSelected ? 1.8 : 1)}
              fill={RING_COLOR[ring]}
              stroke={node.actionable ? '#0f766e' : 'none'}
              strokeWidth={node.actionable ? 1.6 : 0}
              opacity={isSelected ? 1 : 0.85}
              onClick={() => onSelect(node)}
              style={{ cursor: 'pointer' }}
            >
              <title>{`${node.nombre} — ${node.headline}`}</title>
            </circle>
          )
        }),
      )}

      <circle cx={CENTER} cy={CENTER} r={16} fill="#1c1917" />
      <text x={CENTER} y={CENTER + 4} textAnchor="middle" fill="#fff" fontSize="11">vos</text>
    </svg>
  )
}

export default function NetworkMap({ perfil }) {
  const [map, setMap] = useState(null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    // Sin perfil no se pide nada: el backend responde 400 a proposito, porque
    // un mapa sin dueño mostraba la red de otra persona como si fuera tuya.
    if (!perfil) return undefined

    // `vigente` evita el clasico de las respuestas fuera de orden: si cambias
    // de perfil y la peticion vieja tarda mas, pintaria la red equivocada.
    let vigente = true
    fetchNetworkMap({ perfil })
      .then((data) => {
        if (!vigente) return
        setMap(data)
        setError('')
      })
      .catch((e) => {
        if (!vigente) return
        setMap(null)
        setError(e.message)
      })

    return () => {
      vigente = false
    }
  }, [perfil])

  if (!perfil) return null
  if (error) return <p className="form-error">No se pudo cargar el mapa: {error}</p>
  if (!map) return <p className="netmap-loading">Leyendo tu red…</p>

  const { summary, rings, cultivate } = map

  return (
    <section className="netmap">
      <header className="netmap-head">
        <h2>Tu red</h2>
        <p>
          {summary.total} contactos · {summary.everInteracted} interactuaron alguna vez ·{' '}
          <strong>{summary.actionable} para activar</strong>
        </p>
        {/* El origen de cada numero, visible. Un alcance estimado no puede
            leerse igual que uno medido. */}
        <p className="netmap-source">
          calor: {summary.heatSource} · alcance: {summary.reachSource}
        </p>
      </header>

      <div className="netmap-body">
        <Graph nodes={map.nodes} onSelect={setSelected} selectedId={selected?.id} />

        <aside className="netmap-side">
          <ul className="netmap-rings">
            {rings.map((r) => (
              <li key={r.ring}>
                <span className="netmap-dot" style={{ background: RING_COLOR[r.ring] }} />
                {r.label} <strong>{r.count}</strong>
              </li>
            ))}
          </ul>

          {selected ? (
            <div className="netmap-detail">
              <h3>{selected.nombre}</h3>
              <p className="netmap-headline">{selected.headline}</p>
              <p>
                alcance {selected.reach.score} · {selected.heat.interactions} interacciones ·{' '}
                {selected.heat.label}
              </p>
              {selected.posts.length > 0 ? (
                <p className="netmap-hook">Interactuó con: “{selected.posts[0].texto}”</p>
              ) : (
                <p className="netmap-hook netmap-hook--empty">Nunca interactuó con tu contenido.</p>
              )}
            </div>
          ) : (
            <p className="netmap-hint">Tocá un contacto para ver su detalle.</p>
          )}
        </aside>
      </div>

      <section className="netmap-cultivate">
        <h3>A quién escribirle</h3>
        <p className="netmap-source">{cultivate.summary.note}</p>
        <ol>
          {cultivate.recommendations.slice(0, 6).map((r) => (
            <li key={r.id}>
              <strong>{r.nombre}</strong> <span className="netmap-headline">{r.headline}</span>
              <span className="netmap-why">{r.why.join('; ')}</span>
            </li>
          ))}
        </ol>
      </section>
    </section>
  )
}
