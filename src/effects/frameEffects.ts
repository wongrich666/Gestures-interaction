import type { AudioEmotion, AudioFeatures, CanvasRect, Point2D, VisualStyle } from '../core/types'

let scratchCanvas: HTMLCanvasElement | null = null

export function drawStyledVideo(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  rect: CanvasRect,
  style: VisualStyle,
  bass: number,
  mirrored = true,
) {
  if (style === 'mosaic') {
    drawMosaicVideo(ctx, video, rect, bass, mirrored)
    return
  }

  drawVideo(ctx, video, rect, mirrored)

  if (style === 'binary') {
    applyBinary(ctx, rect, bass)
  }
}

export function drawStyleOverlay(
  ctx: CanvasRenderingContext2D,
  rect: CanvasRect,
  style: VisualStyle,
  focusPoint: Point2D | null,
  audio: AudioFeatures,
  emotion: AudioEmotion,
  now: number,
) {
  if (style === 'blue_tears') {
    drawBlueTearsOverlay(ctx, rect, audio.bass, emotion)
  }

  if (style === 'spotlight') {
    drawSpotlightOverlay(ctx, rect, focusPoint, audio.bass, emotion)
  }

  if (style === 'aurora') {
    drawAuroraOverlay(ctx, rect, focusPoint, audio, emotion, now)
  }

  if (style === 'ink') {
    drawInkOverlay(ctx, rect, focusPoint, audio, emotion, now)
  }

  if (style === 'pulse_grid') {
    drawPulseGridOverlay(ctx, rect, focusPoint, audio, emotion, now)
  }
}

function drawVideo(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  rect: CanvasRect,
  mirrored: boolean,
) {
  ctx.save()

  if (mirrored) {
    ctx.translate(rect.x + rect.width, rect.y)
    ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0, rect.width, rect.height)
  } else {
    ctx.drawImage(video, rect.x, rect.y, rect.width, rect.height)
  }

  ctx.restore()
}

function drawMosaicVideo(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  rect: CanvasRect,
  bass: number,
  mirrored: boolean,
) {
  const blockSize = 16 + Math.round(bass * 28)
  const width = Math.max(32, Math.floor(rect.width / blockSize))
  const height = Math.max(18, Math.floor(rect.height / blockSize))
  const scratch = getScratchCanvas(width, height)
  const scratchCtx = scratch.getContext('2d')

  if (!scratchCtx) {
    drawVideo(ctx, video, rect, mirrored)
    return
  }

  scratchCtx.clearRect(0, 0, width, height)
  scratchCtx.drawImage(video, 0, 0, width, height)

  ctx.save()
  ctx.imageSmoothingEnabled = false

  if (mirrored) {
    ctx.translate(rect.x + rect.width, rect.y)
    ctx.scale(-1, 1)
    ctx.drawImage(scratch, 0, 0, rect.width, rect.height)
  } else {
    ctx.drawImage(scratch, rect.x, rect.y, rect.width, rect.height)
  }

  ctx.restore()
}

function applyBinary(ctx: CanvasRenderingContext2D, rect: CanvasRect, bass: number) {
  try {
    const scale = ctx.getTransform().a || 1
    const x = Math.floor(rect.x * scale)
    const y = Math.floor(rect.y * scale)
    const width = Math.max(1, Math.floor(rect.width * scale))
    const height = Math.max(1, Math.floor(rect.height * scale))
    const image = ctx.getImageData(x, y, width, height)
    const data = image.data
    const threshold = 112 + bass * 58

    for (let index = 0; index < data.length; index += 4) {
      const luminance = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114
      const value = luminance > threshold ? 255 : 8
      data[index] = value
      data[index + 1] = value
      data[index + 2] = value
    }

    ctx.putImageData(image, x, y)
  } catch {
    return
  }
}

function drawBlueTearsOverlay(
  ctx: CanvasRenderingContext2D,
  rect: CanvasRect,
  bass: number,
  emotion: AudioEmotion,
) {
  const gradient = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.height)
  gradient.addColorStop(0, colorWithAlpha(emotion.palette.glow, 0.16 + bass * 0.16))
  gradient.addColorStop(0.5, 'rgba(19, 89, 255, 0.08)')
  gradient.addColorStop(1, colorWithAlpha(emotion.palette.shadow, 0.26 + bass * 0.18))

  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  ctx.fillStyle = gradient
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
  ctx.restore()
}

function drawSpotlightOverlay(
  ctx: CanvasRenderingContext2D,
  rect: CanvasRect,
  focusPoint: Point2D | null,
  bass: number,
  emotion: AudioEmotion,
) {
  const focus = focusPoint ?? {
    x: rect.x + rect.width * 0.5,
    y: rect.y + rect.height * 0.45,
  }
  const radius = Math.min(rect.width, rect.height) * (0.28 + bass * 0.08)
  const gradient = ctx.createRadialGradient(
    focus.x,
    focus.y,
    radius * 0.18,
    focus.x,
    focus.y,
    radius * 1.9,
  )

  gradient.addColorStop(0, colorWithAlpha(emotion.palette.highlight, 0.16 + bass * 0.12))
  gradient.addColorStop(0.35, 'rgba(0, 0, 0, 0.10)')
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0.78)')

  ctx.save()
  ctx.fillStyle = gradient
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
  ctx.restore()
}

function drawAuroraOverlay(
  ctx: CanvasRenderingContext2D,
  rect: CanvasRect,
  focusPoint: Point2D | null,
  audio: AudioFeatures,
  emotion: AudioEmotion,
  now: number,
) {
  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  const bandCount = 4
  const drift = now * 0.00025

  for (let band = 0; band < bandCount; band += 1) {
    const yBase = rect.y + rect.height * (0.22 + band * 0.16)
    const alpha = 0.16 + emotion.intensity * 0.18 - band * 0.015
    const amplitude = rect.height * (0.035 + audio.mid * 0.04 + band * 0.006)

    ctx.beginPath()
    ctx.strokeStyle = colorWithAlpha(band % 2 ? emotion.palette.accent : emotion.palette.glow, alpha)
    ctx.shadowBlur = 24 + emotion.pulse * 26
    ctx.shadowColor = emotion.palette.glow
    ctx.lineWidth = 12 + emotion.motion * 18 - band * 1.4

    for (let step = 0; step <= 80; step += 1) {
      const t = step / 80
      const x = rect.x + rect.width * t
      const y =
        yBase +
        Math.sin(t * Math.PI * 2.2 + drift * (2 + band)) * amplitude +
        Math.sin(t * Math.PI * 7 + now * 0.001 + band) * amplitude * 0.28

      if (step === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    }

    ctx.stroke()
  }

  if (focusPoint) {
    const radius = rect.height * (0.12 + emotion.intensity * 0.16)
    const glow = ctx.createRadialGradient(focusPoint.x, focusPoint.y, 0, focusPoint.x, focusPoint.y, radius)
    glow.addColorStop(0, colorWithAlpha(emotion.palette.highlight, 0.42))
    glow.addColorStop(0.45, colorWithAlpha(emotion.palette.glow, 0.16))
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = glow
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
  }

  ctx.restore()
}

function drawInkOverlay(
  ctx: CanvasRenderingContext2D,
  rect: CanvasRect,
  focusPoint: Point2D | null,
  audio: AudioFeatures,
  emotion: AudioEmotion,
  now: number,
) {
  ctx.save()
  ctx.globalCompositeOperation = 'multiply'
  ctx.fillStyle = colorWithAlpha(emotion.palette.ink, 0.16 + emotion.tension * 0.28)
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
  ctx.restore()

  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  ctx.strokeStyle = colorWithAlpha(emotion.palette.glow, 0.28 + audio.treble * 0.24)
  ctx.lineWidth = 1.2 + audio.mid * 4
  ctx.shadowBlur = 18
  ctx.shadowColor = emotion.palette.glow

  const origin = focusPoint ?? {
    x: rect.x + rect.width * 0.5,
    y: rect.y + rect.height * 0.5,
  }

  for (let stroke = 0; stroke < 9; stroke += 1) {
    const angle = (Math.PI * 2 * stroke) / 9 + now * 0.00018
    const length = rect.width * (0.1 + audio.bass * 0.08 + stroke * 0.006)

    ctx.beginPath()
    ctx.moveTo(origin.x, origin.y)
    ctx.bezierCurveTo(
      origin.x + Math.cos(angle) * length * 0.35,
      origin.y + Math.sin(angle) * length * 0.28,
      origin.x + Math.cos(angle + 0.8) * length * 0.72,
      origin.y + Math.sin(angle + 0.8) * length * 0.54,
      origin.x + Math.cos(angle + 0.2) * length,
      origin.y + Math.sin(angle + 0.2) * length,
    )
    ctx.stroke()
  }

  ctx.restore()
}

function drawPulseGridOverlay(
  ctx: CanvasRenderingContext2D,
  rect: CanvasRect,
  focusPoint: Point2D | null,
  audio: AudioFeatures,
  emotion: AudioEmotion,
  now: number,
) {
  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  ctx.strokeStyle = colorWithAlpha(emotion.palette.accent, 0.14 + emotion.pulse * 0.18)
  ctx.lineWidth = 1
  ctx.shadowBlur = audio.beat ? 18 : 6
  ctx.shadowColor = emotion.palette.accent

  const spacing = 38 - emotion.motion * 12
  const offset = (now * (0.02 + emotion.motion * 0.05)) % spacing
  const horizon = rect.y + rect.height * 0.62

  for (let y = horizon + offset; y < rect.y + rect.height; y += spacing) {
    const depth = (y - horizon) / Math.max(1, rect.height - horizon + rect.y)
    ctx.beginPath()
    ctx.moveTo(rect.x + rect.width * 0.08 * (1 - depth), y)
    ctx.lineTo(rect.x + rect.width * (1 - 0.08 * (1 - depth)), y)
    ctx.stroke()
  }

  for (let column = -8; column <= 8; column += 1) {
    const x = rect.x + rect.width * 0.5 + column * spacing * 0.72
    ctx.beginPath()
    ctx.moveTo(rect.x + rect.width * 0.5, horizon)
    ctx.lineTo(x, rect.y + rect.height)
    ctx.stroke()
  }

  if (focusPoint) {
    ctx.beginPath()
    ctx.strokeStyle = colorWithAlpha(emotion.palette.highlight, 0.34)
    ctx.lineWidth = 2.5
    ctx.arc(focusPoint.x, focusPoint.y, 26 + emotion.pulse * 32, 0, Math.PI * 2)
    ctx.stroke()
  }

  ctx.restore()
}

function colorWithAlpha(hex: string, alpha: number) {
  const value = hex.replace('#', '')
  const r = Number.parseInt(value.slice(0, 2), 16)
  const g = Number.parseInt(value.slice(2, 4), 16)
  const b = Number.parseInt(value.slice(4, 6), 16)

  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`
}

function getScratchCanvas(width: number, height: number) {
  if (!scratchCanvas) {
    scratchCanvas = document.createElement('canvas')
  }

  if (scratchCanvas.width !== width) {
    scratchCanvas.width = width
  }

  if (scratchCanvas.height !== height) {
    scratchCanvas.height = height
  }

  return scratchCanvas
}
