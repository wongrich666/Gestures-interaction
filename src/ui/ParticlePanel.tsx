import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import {
  DEFAULT_PARTICLE_CONTROLS,
  PARTICLE_PRESET_LABELS,
  PARTICLE_PRESETS,
} from '../core/config'
import type { ParticleControls, Point2D } from '../core/types'

type ParticlePanelProps = {
  controls?: ParticleControls
  onChange: (controls: ParticleControls) => void
}

export function ParticlePanel({ controls, onChange }: ParticlePanelProps) {
  const activeControls = controls ?? DEFAULT_PARTICLE_CONTROLS
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawingRef = useRef(false)
  const draftPointsRef = useRef<Point2D[]>(activeControls.customShape)
  const [draftPoints, setDraftPoints] = useState<Point2D[]>(activeControls.customShape)

  useEffect(() => {
    setDraftPoints(activeControls.customShape)
    draftPointsRef.current = activeControls.customShape
  }, [activeControls.customShape])

  useEffect(() => {
    drawPad(canvasRef.current, draftPoints)
  }, [draftPoints])

  const updateControls = useCallback(
    (patch: Partial<ParticleControls>) => {
      onChange({ ...activeControls, ...patch })
    },
    [activeControls, onChange],
  )

  const commitCustomShape = useCallback(
    (points: Point2D[]) => {
      const simplified = simplifyPoints(points, 180)
      setDraftPoints(simplified)
      onChange({ ...activeControls, preset: 'custom', customShape: simplified })
    },
    [activeControls, onChange],
  )

  const addPointFromEvent = useCallback((event: PointerEvent<HTMLCanvasElement>) => {
    const nextPoint = eventToPoint(event)

    setDraftPoints((previousPoints) => {
      const lastPoint = previousPoints[previousPoints.length - 1]

      if (lastPoint && Math.hypot(lastPoint.x - nextPoint.x, lastPoint.y - nextPoint.y) < 0.012) {
        draftPointsRef.current = previousPoints
        return previousPoints
      }

      const nextPoints = [...previousPoints, nextPoint]
      draftPointsRef.current = nextPoints

      return nextPoints
    })
  }, [])

  return (
    <div className="particle-panel">
      <div className="preset-grid" role="group" aria-label="Particle model preset">
        {PARTICLE_PRESETS.map((preset) => (
          <button
            className={preset === activeControls.preset ? 'preset-button active' : 'preset-button'}
            key={preset}
            type="button"
            onClick={() => updateControls({ preset })}
          >
            {PARTICLE_PRESET_LABELS[preset]}
          </button>
        ))}
      </div>

      <label className="slider-field">
        <span>
          密度 <b>{Math.round(activeControls.density)}</b>
        </span>
        <input
          type="range"
          min="120"
          max="1200"
          step="20"
          value={activeControls.density}
          onChange={(event) => updateControls({ density: Number(event.currentTarget.value) })}
        />
      </label>

      <label className="slider-field">
        <span>
          扩散 <b>{activeControls.spread.toFixed(2)}</b>
        </span>
        <input
          type="range"
          min="0.25"
          max="2.5"
          step="0.05"
          value={activeControls.spread}
          onChange={(event) => updateControls({ spread: Number(event.currentTarget.value) })}
        />
      </label>

      <label className="color-field">
        <span>颜色</span>
        <input
          type="color"
          value={activeControls.color}
          onChange={(event) => updateControls({ color: event.currentTarget.value })}
        />
      </label>

      <div className="draw-pad-shell">
        <canvas
          ref={canvasRef}
          className="draw-pad"
          width="320"
          height="180"
          onPointerDown={(event) => {
            drawingRef.current = true
            event.currentTarget.setPointerCapture(event.pointerId)
            const point = eventToPoint(event)
            draftPointsRef.current = [point]
            setDraftPoints([point])
          }}
          onPointerMove={(event) => {
            if (drawingRef.current) {
              addPointFromEvent(event)
            }
          }}
          onPointerUp={(event) => {
            drawingRef.current = false
            event.currentTarget.releasePointerCapture(event.pointerId)
            const point = eventToPoint(event)
            const nextPoints = [...draftPointsRef.current, point]
            draftPointsRef.current = nextPoints
            commitCustomShape(nextPoints)
          }}
          onPointerCancel={(event) => {
            drawingRef.current = false
            event.currentTarget.releasePointerCapture(event.pointerId)
          }}
        />
        <div className="draw-pad-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              setDraftPoints([])
              updateControls({ customShape: [] })
            }}
          >
            清空
          </button>
          <button
            className="primary-button"
            type="button"
            disabled={draftPoints.length < 2}
            onClick={() => commitCustomShape(draftPoints)}
          >
            生成手绘粒子
          </button>
        </div>
      </div>
    </div>
  )
}

function eventToPoint(event: PointerEvent<HTMLCanvasElement>): Point2D {
  const rect = event.currentTarget.getBoundingClientRect()

  return {
    x: clamp01((event.clientX - rect.left) / rect.width),
    y: clamp01((event.clientY - rect.top) / rect.height),
  }
}

function drawPad(canvas: HTMLCanvasElement | null, points: Point2D[]) {
  if (!canvas) {
    return
  }

  const ctx = canvas.getContext('2d')

  if (!ctx) {
    return
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height)

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
  gradient.addColorStop(0, 'rgba(94, 228, 255, 0.18)')
  gradient.addColorStop(1, 'rgba(255, 230, 111, 0.10)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
  ctx.lineWidth = 1

  for (let x = 0; x <= canvas.width; x += 32) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, canvas.height)
    ctx.stroke()
  }

  for (let y = 0; y <= canvas.height; y += 30) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(canvas.width, y)
    ctx.stroke()
  }

  if (points.length < 2) {
    ctx.fillStyle = 'rgba(232, 236, 233, 0.54)'
    ctx.font = '700 13px system-ui, Segoe UI, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('在这里画一个形态', canvas.width * 0.5, canvas.height * 0.5)
    return
  }

  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 5
  ctx.strokeStyle = 'rgba(94, 228, 255, 0.92)'
  ctx.shadowBlur = 18
  ctx.shadowColor = 'rgba(94, 228, 255, 0.76)'
  ctx.beginPath()

  points.forEach((point, index) => {
    const x = point.x * canvas.width
    const y = point.y * canvas.height

    if (index === 0) {
      ctx.moveTo(x, y)
    } else {
      ctx.lineTo(x, y)
    }
  })

  ctx.stroke()
  ctx.restore()
}

function simplifyPoints(points: Point2D[], maxPoints: number) {
  if (points.length <= maxPoints) {
    return points
  }

  const step = points.length / maxPoints
  const simplified: Point2D[] = []

  for (let index = 0; index < maxPoints; index += 1) {
    simplified.push(points[Math.floor(index * step)])
  }

  return simplified
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}
