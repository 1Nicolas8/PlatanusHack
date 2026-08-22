import { useLayoutEffect, useMemo, useRef } from 'react';


/**
 * Red viva de la audiencia: el dueño en el centro, las caras scrappeadas
 * orbitando. Las posiciones se mutan en el DOM (no por setState) para no
 * re-renderizar 60 veces por segundo.
 *
 * El SVG de las líneas vive FUERA del árbol de React: si fuera un <svg />
 * vacío, cada re-render del padre (el composer, el resumen) lo volvía a
 * dejar sin hijos y apagaba la red. Las burbujas tampoco pueden depender
 * de una clase que React pisa al reconciliar className.
 */

const MAX_NODES = 12
const GOLDEN = Math.PI * (3 - Math.sqrt(5))

function seedFrom(index, salt) {
  const x = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453
  return x - Math.floor(x)
}

function initialsOf(nombre) {
  return String(nombre ?? '')
    .split(/[-_.\s]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('') || '?'
}

function Face({ src, label, className }) {
  return (
    <span className={className}>
      {src ? (
        <img src={src} alt="" referrerPolicy="no-referrer" draggable="false" />
      ) : (
        <i>{initialsOf(label)}</i>
      )}
    </span>
  )
}

const GHOSTS = Array.from({ length: 6 }, (_, index) => ({
  connectionId: `ghost-${index}`,
  nombre: '',
  fotoUrl: null,
}))

function pickOrbit(contacts) {
  const source = contacts?.length ? contacts : GHOSTS
  const ranked = [...source].sort(
    (a, b) => Number(Boolean(b.fotoUrl)) - Number(Boolean(a.fotoUrl)),
  )
  return ranked.slice(0, MAX_NODES)
}

function layoutBodies(count) {
  const innerCount = Math.min(6, Math.max(3, Math.ceil(count * 0.45)))
  return Array.from({ length: count }, (_, index) => {
    const inner = index < innerCount
    const ringIndex = inner ? index : index - innerCount
    return {
      inner,
      baseAngle: ringIndex * GOLDEN + seedFrom(index, 1) * 0.4,
      orbit: inner ? 0.42 + seedFrom(index, 2) * 0.08 : 0.74 + seedFrom(index, 3) * 0.14,
      speed: (inner ? 0.18 : 0.11) * (seedFrom(index, 4) > 0.5 ? 1 : -1) * (0.75 + seedFrom(index, 5) * 0.5),
      wobble: 0.03 + seedFrom(index, 6) * 0.04,
      wobbleFreq: 0.55 + seedFrom(index, 7) * 0.7,
      phase: seedFrom(index, 8) * Math.PI * 2,
      sizeRatio: inner ? 0.108 : 0.086,
    }
  })
}

function neighborLinks(count) {
  const links = []
  for (let i = 0; i < count; i += 1) {
    links.push([i, (i + 1) % count])
    if (count > 4) links.push([i, (i + 2) % count])
  }
  return links
}

export default function NeuralNet({ owner, contacts }) {
  const wrapRef = useRef(null)
  const svgHostRef = useRef(null)
  const nodeRefs = useRef([])
  const coreRef = useRef(null)
  const orbit = useMemo(() => pickOrbit(contacts), [contacts])
  const orbitKey = orbit.map((person) => person.connectionId ?? person.nombre).join('|')

  useLayoutEffect(() => {
    const wrap = wrapRef.current
    const host = svgHostRef.current
    if (!wrap || !host) return undefined

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('aria-hidden', 'true')
    host.replaceChildren(svg)

    const bodies = layoutBodies(orbit.length)
    const links = neighborLinks(orbit.length)
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let elapsed = 0
    let last = performance.now()
    let visible = true
    let raf = 0

    function paint(t) {
      const { width, height } = wrap.getBoundingClientRect()
      if (width === 0 || height === 0) return

      svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
      svg.setAttribute('width', String(width))
      svg.setAttribute('height', String(height))
      const cx = width / 2
      const cy = height / 2
      const pad = Math.max(42, Math.min(width, height) * 0.09)
      const reachX = Math.max(90, width / 2 - pad)
      const reachY = Math.max(90, height / 2 - pad)
      const coreSize = Math.max(80, Math.min(124, Math.round(Math.min(width, height) * 0.16)))

      const points = bodies.map((body) => {
        const angle = body.baseAngle + t * body.speed
        const swell = body.orbit + Math.sin(t * body.wobbleFreq + body.phase) * body.wobble
        return {
          x: cx + Math.cos(angle) * swell * reachX,
          y: cy + Math.sin(angle) * swell * reachY,
          size: Math.max(40, Math.min(68, Math.round(Math.min(width, height) * body.sizeRatio))),
        }
      })

      if (coreRef.current) {
        coreRef.current.style.width = `${coreSize}px`
        coreRef.current.style.height = `${coreSize}px`
        coreRef.current.style.transform = `translate(${cx - coreSize / 2}px, ${cy - coreSize / 2}px)`
      }

      points.forEach((point, index) => {
        const node = nodeRefs.current[index]
        if (!node) return
        node.style.width = `${point.size}px`
        node.style.height = `${point.size}px`
        node.style.transform = `translate(${point.x - point.size / 2}px, ${point.y - point.size / 2}px)`
      })

      const rays = points.map((point, index) => {
        const pulse = (t * 0.22 + index * 0.17) % 1
        return {
          x1: cx,
          y1: cy,
          x2: point.x,
          y2: point.y,
          px: cx + (point.x - cx) * pulse,
          py: cy + (point.y - cy) * pulse,
          opacity: 0.25 + (1 - Math.abs(pulse - 0.55) * 2) * 0.45,
        }
      })

      const bridges = links.flatMap(([a, b], index) => {
        if (!points[a] || !points[b]) return []
        const dx = points[a].x - points[b].x
        const dy = points[a].y - points[b].y
        const maxSpan = Math.max(reachX, reachY) * 1.45
        if (dx * dx + dy * dy > maxSpan * maxSpan) return []
        const pulse = (t * 0.16 + index * 0.11) % 1
        return [{
          x1: points[a].x,
          y1: points[a].y,
          x2: points[b].x,
          y2: points[b].y,
          px: points[a].x + (points[b].x - points[a].x) * pulse,
          py: points[a].y + (points[b].y - points[a].y) * pulse,
        }]
      })

      const lineMarkup = [
        ...rays.map((ray) =>
          `<line x1="${ray.x1}" y1="${ray.y1}" x2="${ray.x2}" y2="${ray.y2}" />`,
        ),
        ...bridges.map((bridge) =>
          `<line class="neural-bridge" x1="${bridge.x1}" y1="${bridge.y1}" x2="${bridge.x2}" y2="${bridge.y2}" />`,
        ),
      ].join('')

      const pulseMarkup = [
        ...rays.map((ray) =>
          `<circle class="neural-pulse" cx="${ray.px}" cy="${ray.py}" r="2.2" opacity="${ray.opacity}" />`,
        ),
        ...bridges.slice(0, 8).map((bridge) =>
          `<circle class="neural-pulse neural-pulse--soft" cx="${bridge.px}" cy="${bridge.py}" r="1.5" />`,
        ),
      ].join('')

      svg.innerHTML = `<g class="neural-lines">${lineMarkup}</g><g class="neural-signals">${pulseMarkup}</g>`
    }

    function tick(now) {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      elapsed += dt
      paint(elapsed)
      if (visible && !reduced) raf = requestAnimationFrame(tick)
    }

    function startLoop() {
      cancelAnimationFrame(raf)
      paint(elapsed)
      if (!reduced && visible) {
        last = performance.now()
        raf = requestAnimationFrame(tick)
      }
    }

    paint(0)

    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting
        if (visible) startLoop()
        else cancelAnimationFrame(raf)
      },
      { threshold: 0.01 },
    )
    io.observe(wrap)

    const ro = new ResizeObserver(() => paint(elapsed))
    ro.observe(wrap)

    if (!reduced) raf = requestAnimationFrame(tick)

    return () => {
      io.disconnect()
      ro.disconnect()
      cancelAnimationFrame(raf)
      host.replaceChildren()
    }
  }, [orbit, orbitKey])

  return (
    <div className="neural-net" ref={wrapRef} aria-hidden="true">
      <div className="neural-svg-host" ref={svgHostRef} />
      <span className="neural-node neural-node--core" ref={coreRef}>
        <Face src={owner?.fotoUrl} label={owner?.label ?? 'Tú'} className="neural-face" />
      </span>
      {orbit.map((person, index) => (
        <span
          className="neural-node"
          key={person.connectionId ?? person.nombre ?? index}
          ref={(el) => {
            nodeRefs.current[index] = el
          }}
          title={person.nombre}
        >
          <Face src={person.fotoUrl} label={person.nombre} className="neural-face" />
        </span>
      ))}
    </div>
  )
}
