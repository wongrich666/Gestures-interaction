import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { createDefaultEmotion } from '../audio/audioEmotion'
import { DEFAULT_PARTICLE_CONTROLS, EMPTY_AUDIO_FEATURES, HAND_CONNECTIONS } from '../core/config'
import { containRect, landmarkToCanvas } from '../core/math'
import type {
  AudioEmotion,
  AudioFeatures,
  CanvasRect,
  FaceData,
  FaceIntent,
  GestureSnapshot,
  HandData,
  ParticleControls,
  VisualGesture,
  VisualStyle,
} from '../core/types'
import { drawStyledVideo, drawStyleOverlay } from '../effects/frameEffects'
import {
  drawFaceIntentOverlay,
  drawGestureEffectOverlay,
  drawTopologyNetwork,
  shouldTriggerGestureBurst,
} from './gestureEffects'
import { ParticleSystem } from './particleSystem'
import { TrailSystem } from './trailSystem'

export type StageFrame = {
  video: HTMLVideoElement
  hands: HandData[]
  targetHand: HandData | null
  gesture: GestureSnapshot
  audio: AudioFeatures
  emotion?: AudioEmotion
  face?: FaceData | null
  faceIntent?: FaceIntent
  particleControls?: ParticleControls
  visualStyle: VisualStyle
  now: number
  mirrored?: boolean
}

export type StageCanvasHandle = {
  renderFrame: (frame: StageFrame) => void
  reset: () => void
  getCanvas: () => HTMLCanvasElement | null
}

type StageCanvasProps = {
  className?: string
}

type BurstTiming = {
  pinchAt: number
  gestureAt: number
}

export const StageCanvas = forwardRef<StageCanvasHandle, StageCanvasProps>(
  ({ className }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const particlesRef = useRef(new ParticleSystem())
    const trailsRef = useRef(new TrailSystem())
    const lastRenderTimeRef = useRef(0)
    const lastVisualGestureRef = useRef<VisualGesture>('none')
    const burstTimingRef = useRef<BurstTiming>({ pinchAt: -Infinity, gestureAt: -Infinity })

    useImperativeHandle(ref, () => ({
      renderFrame(frame) {
        const canvas = canvasRef.current
        const ctx = canvas?.getContext('2d')

        if (!canvas || !ctx) {
          return
        }

        const surface = resizeCanvas(canvas, ctx)
        const deltaMs = lastRenderTimeRef.current
          ? frame.now - lastRenderTimeRef.current
          : 16.67
        lastRenderTimeRef.current = frame.now

        drawFrame(
          ctx,
          surface,
          frame,
          trailsRef.current,
          particlesRef.current,
          deltaMs,
          lastVisualGestureRef.current,
          burstTimingRef.current,
        )
        lastVisualGestureRef.current = frame.gesture.visualGesture
      },
      reset() {
        particlesRef.current.clear()
        trailsRef.current.clear()
        lastRenderTimeRef.current = 0
        lastVisualGestureRef.current = 'none'
        burstTimingRef.current = { pinchAt: -Infinity, gestureAt: -Infinity }

        const canvas = canvasRef.current
        const ctx = canvas?.getContext('2d')

        if (canvas && ctx) {
          const surface = resizeCanvas(canvas, ctx)
          drawIdleFrame(ctx, surface)
        }
      },
      getCanvas() {
        return canvasRef.current
      },
    }))

    useEffect(() => {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')

      if (!canvas || !ctx) {
        return
      }

      const surface = resizeCanvas(canvas, ctx)
      drawIdleFrame(ctx, surface)
    }, [])

    return <canvas ref={canvasRef} className={className} aria-label="Gesture stage canvas" />
  },
)

StageCanvas.displayName = 'StageCanvas'

function drawFrame(
  ctx: CanvasRenderingContext2D,
  surface: CanvasRect,
  frame: StageFrame,
  trails: TrailSystem,
  particles: ParticleSystem,
  deltaMs: number,
  previousVisualGesture: VisualGesture,
  burstTiming: BurstTiming,
) {
  const emotion = frame.emotion ?? createDefaultEmotion()
  const videoRect = containRect(
    surface.width,
    surface.height,
    frame.video.videoWidth,
    frame.video.videoHeight,
  )
  const focusPoint = frame.gesture.indexTip
    ? landmarkToCanvas(frame.gesture.indexTip, videoRect, frame.mirrored ?? true)
    : null
  const palmPoint = frame.gesture.palmCenter
    ? landmarkToCanvas(frame.gesture.palmCenter, videoRect, frame.mirrored ?? true)
    : null
  const particleControls = frame.particleControls ?? DEFAULT_PARTICLE_CONTROLS

  drawBackground(ctx, surface, frame.audio, emotion, frame.now)
  drawStyledVideo(
    ctx,
    frame.video,
    videoRect,
    frame.visualStyle,
    frame.audio.bass,
    frame.mirrored ?? true,
  )
  drawStageWash(ctx, videoRect, frame.audio, emotion, frame.now)
  drawStyleOverlay(ctx, videoRect, frame.visualStyle, focusPoint, frame.audio, emotion, frame.now)
  drawTopologyNetwork(ctx, videoRect, frame.gesture.topology, emotion, frame.mirrored ?? true)
  particles.drawBackground(ctx, surface, frame.audio, emotion, frame.now)

  if (focusPoint && frame.gesture.indexVelocity > 0.00004) {
    trails.addPoint(focusPoint, frame.now, frame.audio.mid + frame.gesture.indexVelocity * 80)
  }

  if (
    frame.gesture.pinchEvent === 'pinch_start' &&
    frame.gesture.pinchCenter &&
    frame.now - burstTiming.pinchAt >= 180
  ) {
    burstTiming.pinchAt = frame.now
    particles.burst(
      landmarkToCanvas(frame.gesture.pinchCenter, videoRect, frame.mirrored ?? true),
      frame.visualStyle,
      frame.audio,
      emotion,
    )
  }

  if (
    shouldTriggerGestureBurst(
      previousVisualGesture,
      frame.gesture.visualGesture,
      frame.gesture.gestureState.phase,
    ) &&
    frame.now - burstTiming.gestureAt >= 260
  ) {
    burstTiming.gestureAt = frame.now
    const burstPoint =
      focusPoint ??
      palmPoint ?? {
        x: videoRect.x + videoRect.width * 0.5,
        y: videoRect.y + videoRect.height * 0.5,
      }
    particles.burst(burstPoint, frame.visualStyle, frame.audio, emotion)
  }

  trails.update(frame.now)
  particles.update(deltaMs, {
    surface,
    focusPoint,
    palmPoint,
    gesture: frame.gesture,
    audio: frame.audio,
    emotion,
    controls: particleControls,
    now: frame.now,
  })
  trails.draw(ctx, frame.visualStyle, frame.audio, frame.now, emotion)
  particles.draw(ctx, particleControls)
  drawGestureEffectOverlay(
    ctx,
    videoRect,
    frame.gesture,
    frame.audio,
    emotion,
    frame.now,
    frame.mirrored ?? true,
  )
  drawFaceIntentOverlay(
    ctx,
    videoRect,
    frame.faceIntent,
    frame.audio,
    emotion,
    frame.now,
    frame.mirrored ?? true,
  )
  drawHands(
    ctx,
    frame.hands,
    frame.targetHand,
    videoRect,
    frame.visualStyle,
    frame.audio,
    emotion,
    frame.mirrored ?? true,
  )
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  surface: CanvasRect,
  audio: AudioFeatures,
  emotion: AudioEmotion,
  now: number,
) {
  const bass = audio.bass
  const gradient = ctx.createRadialGradient(
    surface.width * 0.5,
    surface.height * 0.42,
    0,
    surface.width * 0.5,
    surface.height * 0.42,
    Math.max(surface.width, surface.height) * 0.82,
  )
  gradient.addColorStop(0, colorWithAlpha(emotion.palette.base, 0.82 + bass * 0.12))
  gradient.addColorStop(0.54, colorWithAlpha(emotion.palette.shadow, 0.96))
  gradient.addColorStop(1, emotion.palette.ink)

  ctx.clearRect(0, 0, surface.width, surface.height)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, surface.width, surface.height)

  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  ctx.strokeStyle = colorWithAlpha(emotion.palette.glow, 0.08 + emotion.intensity * 0.14)
  ctx.lineWidth = 1

  const lineCount = 10
  const drift = now * 0.00018

  for (let index = 0; index < lineCount; index += 1) {
    const x = surface.width * ((index + 0.5) / lineCount)
    const sway = Math.sin(drift + index * 0.7) * 18 * (0.2 + emotion.motion)
    ctx.beginPath()
    ctx.moveTo(x + sway, 0)
    ctx.lineTo(x - sway * 0.5, surface.height)
    ctx.stroke()
  }

  ctx.restore()
}

function drawStageWash(
  ctx: CanvasRenderingContext2D,
  rect: CanvasRect,
  audio: AudioFeatures,
  emotion: AudioEmotion,
  now: number,
) {
  ctx.save()
  ctx.globalCompositeOperation = 'screen'

  const gradient = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.width, rect.y + rect.height)
  gradient.addColorStop(0, colorWithAlpha(emotion.palette.glow, 0.05 + emotion.intensity * 0.1))
  gradient.addColorStop(0.5, 'rgba(0, 0, 0, 0)')
  gradient.addColorStop(1, colorWithAlpha(emotion.palette.accent, 0.05 + emotion.tension * 0.08))
  ctx.fillStyle = gradient
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height)

  if (audio.beat || emotion.pulse > 0.45) {
    ctx.globalAlpha = 0.08 + emotion.pulse * 0.1
    ctx.fillStyle = emotion.palette.highlight
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
  }

  ctx.globalCompositeOperation = 'overlay'
  ctx.strokeStyle = colorWithAlpha(emotion.palette.highlight, 0.06 + audio.treble * 0.08)
  ctx.lineWidth = 1

  for (let index = 0; index < 7; index += 1) {
    const y = rect.y + rect.height * ((index + ((now * 0.00008) % 1)) / 7)
    ctx.beginPath()
    ctx.moveTo(rect.x, y)
    ctx.lineTo(rect.x + rect.width, y + Math.sin(now * 0.001 + index) * 10)
    ctx.stroke()
  }

  ctx.restore()
}

function drawHands(
  ctx: CanvasRenderingContext2D,
  hands: HandData[],
  targetHand: HandData | null,
  rect: CanvasRect,
  style: VisualStyle,
  audio: AudioFeatures,
  emotion: AudioEmotion,
  mirrored: boolean,
) {
  for (const hand of hands) {
    const isTarget = hand === targetHand
    const lineColor = isTarget
      ? style === 'spotlight'
        ? colorWithAlpha(emotion.palette.highlight, 0.82 + audio.treble * 0.18)
        : colorWithAlpha(emotion.palette.glow, 0.78 + audio.treble * 0.2)
      : colorWithAlpha(emotion.palette.accent, 0.48 + audio.treble * 0.14)
    const pointColor = isTarget
      ? emotion.palette.highlight
      : colorWithAlpha(emotion.palette.glow, 0.58)

    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = isTarget ? 2.2 + audio.bass * 3 : 1.7 + audio.bass * 1.4
    ctx.strokeStyle = lineColor
    ctx.shadowBlur = isTarget ? 14 + audio.bass * 18 : 8 + audio.bass * 8
    ctx.shadowColor = lineColor

    for (const [startIndex, endIndex] of HAND_CONNECTIONS) {
      const start = landmarkToCanvas(hand.landmarks[startIndex], rect, mirrored)
      const end = landmarkToCanvas(hand.landmarks[endIndex], rect, mirrored)
      ctx.beginPath()
      ctx.moveTo(start.x, start.y)
      ctx.lineTo(end.x, end.y)
      ctx.stroke()
    }

    for (const landmark of hand.landmarks) {
      const point = landmarkToCanvas(landmark, rect, mirrored)
      ctx.beginPath()
      ctx.fillStyle = pointColor
      ctx.arc(point.x, point.y, isTarget ? 3.2 : 2.2, 0, Math.PI * 2)
      ctx.fill()
    }

    drawFingerTip(ctx, hand, rect, isTarget, mirrored)
    ctx.restore()
  }
}

function drawFingerTip(
  ctx: CanvasRenderingContext2D,
  hand: HandData,
  rect: CanvasRect,
  isTarget: boolean,
  mirrored: boolean,
) {
  if (!isTarget) {
    return
  }

  const indexTip = landmarkToCanvas(hand.landmarks[8], rect, mirrored)

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.beginPath()
  ctx.fillStyle = 'rgba(92, 225, 255, 0.95)'
  ctx.shadowBlur = 24
  ctx.shadowColor = 'rgba(67, 212, 255, 0.9)'
  ctx.arc(indexTip.x, indexTip.y, 7, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawIdleFrame(ctx: CanvasRenderingContext2D, surface: CanvasRect) {
  drawBackground(ctx, surface, EMPTY_AUDIO_FEATURES, createDefaultEmotion(), performance.now())

  ctx.save()
  ctx.fillStyle = 'rgba(255, 255, 255, 0.72)'
  ctx.font = '600 18px system-ui, Segoe UI, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('Gesture Stage', surface.width * 0.5, surface.height * 0.5)
  ctx.restore()
}

function colorWithAlpha(hex: string, alpha: number) {
  const value = hex.replace('#', '')
  const r = Number.parseInt(value.slice(0, 2), 16)
  const g = Number.parseInt(value.slice(2, 4), 16)
  const b = Number.parseInt(value.slice(4, 6), 16)

  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`
}

function resizeCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): CanvasRect {
  const bounds = canvas.getBoundingClientRect()
  const width = Math.max(1, bounds.width)
  const height = Math.max(1, bounds.height)
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const pixelWidth = Math.floor(width * dpr)
  const pixelHeight = Math.floor(height * dpr)

  if (canvas.width !== pixelWidth) {
    canvas.width = pixelWidth
  }

  if (canvas.height !== pixelHeight) {
    canvas.height = pixelHeight
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  return {
    x: 0,
    y: 0,
    width,
    height,
  }
}
