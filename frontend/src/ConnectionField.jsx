import { useLayoutEffect, useRef } from 'react'

/**
 * Campo de sinapsis de Hippocamp: la misma materia que la red neuronal,
 * pero como atmósfera de toda la sala. Un canvas fijo, sin pointer events.
 * Intensidad por pantalla: onboarding habitable, loading más vivo,
 * workspace callado para no pelear con el grafo de fotos.
 */

const GOLDEN = Math.PI * (3 - Math.sqrt(5))

const MOOD = {
  onboarding: { nodes: 24, pulses: 8, alpha: 0.2, speed: 0.85, span: 340 },
  loading: { nodes: 28, pulses: 11, alpha: 0.26, speed: 1.15, span: 360 },
  workspace: { nodes: 18, pulses: 5, alpha: 0.11, speed: 0.62, span: 300 },
}

function seed(index, salt) {
  const x = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453
  return x - Math.floor(x)
}

export default function ConnectionField({ mood = 'onboarding' }) {
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const config = MOOD[mood] ?? MOOD.onboarding

  useLayoutEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return undefined

    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return undefined

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const nodes = Array.from({ length: config.nodes }, (_, index) => ({
      turn: index * GOLDEN + seed(index, 1) * 0.5,
      orbit: 0.16 + seed(index, 2) * 0.78,
      drift: (seed(index, 3) > 0.5 ? 1 : -1) * (0.045 + seed(index, 4) * 0.07),
      wobble: 0.03 + seed(index, 5) * 0.05,
      phase: seed(index, 6) * Math.PI * 2,
      size: 1.1 + seed(index, 7) * 2.4,
      warm: seed(index, 8) > 0.68,
    }))

    const edges = []
    nodes.forEach((_, index) => {
      edges.push([index, (index + 1) % nodes.length])
      if (nodes.length > 6) edges.push([index, (index + 3) % nodes.length])
    })

    const pulses = Array.from({ length: config.pulses }, (_, index) => ({
      edge: Math.floor(seed(index, 9) * edges.length),
      delay: seed(index, 10) * 7,
      duration: 2.8 + seed(index, 11) * 2.6,
      warm: seed(index, 12) > 0.55,
    }))

    let width = 0
    let height = 0
    let elapsed = 0
    let last = performance.now()
    let visible = document.visibilityState !== 'hidden'
    let raf = 0

    function resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      width = wrap.clientWidth
      height = wrap.clientHeight
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    function locate(node, time) {
      const reach = Math.hypot(width, height) * 0.52
      const angle = node.turn + time * node.drift
      const radius = (node.orbit + Math.sin(time * 0.17 + node.phase) * node.wobble) * reach
      return {
        x: width / 2 + Math.cos(angle) * radius,
        y: height / 2 + Math.sin(angle) * radius * 0.72,
      }
    }

    function paint(time) {
      ctx.clearRect(0, 0, width, height)
      if (width === 0 || height === 0) return

      const points = nodes.map((node) => locate(node, time))
      const maxDist = config.span * config.span
      const { alpha } = config

      ctx.lineWidth = 1
      ctx.setLineDash([2.5, 7])
      edges.forEach(([from, to], index) => {
        const a = points[from]
        const b = points[to]
        const dx = a.x - b.x
        const dy = a.y - b.y
        if (dx * dx + dy * dy > maxDist) return
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.strokeStyle = index % 4 === 0
          ? `rgba(110, 127, 99, ${alpha * 0.7})`
          : `rgba(196, 86, 47, ${alpha})`
        ctx.stroke()
      })
      ctx.setLineDash([])

      pulses.forEach((pulse) => {
        const pair = edges[pulse.edge]
        if (!pair) return
        const a = points[pair[0]]
        const b = points[pair[1]]
        const progress = ((time + pulse.delay) % pulse.duration) / pulse.duration
        const fade = Math.sin(progress * Math.PI)
        ctx.beginPath()
        ctx.arc(
          a.x + (b.x - a.x) * progress,
          a.y + (b.y - a.y) * progress,
          pulse.warm ? 2.3 : 1.6,
          0,
          Math.PI * 2,
        )
        ctx.fillStyle = pulse.warm
          ? `rgba(196, 86, 47, ${0.62 * fade})`
          : `rgba(110, 127, 99, ${0.5 * fade})`
        ctx.fill()
      })

      points.forEach((point, index) => {
        const node = nodes[index]
        ctx.beginPath()
        ctx.arc(point.x, point.y, node.size, 0, Math.PI * 2)
        ctx.fillStyle = node.warm
          ? `rgba(196, 86, 47, ${alpha + 0.16})`
          : `rgba(58, 51, 45, ${alpha + 0.1})`
        ctx.fill()
      })
    }

    function tick(now) {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      elapsed += dt * config.speed
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

    resize()
    paint(0)

    const ro = new ResizeObserver(() => {
      resize()
      paint(elapsed)
    })
    ro.observe(wrap)

    const onVisibility = () => {
      visible = document.visibilityState !== 'hidden'
      if (visible) startLoop()
      else cancelAnimationFrame(raf)
    }
    document.addEventListener('visibilitychange', onVisibility)

    if (!reduced) raf = requestAnimationFrame(tick)

    return () => {
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      cancelAnimationFrame(raf)
    }
  }, [config.alpha, config.nodes, config.pulses, config.span, config.speed, mood])

  return (
    <div className={`connection-field connection-field--${mood}`} ref={wrapRef} aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  )
}
