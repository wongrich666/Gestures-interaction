import { landmarkToCanvas } from '../core/math'
import type {
  AudioEmotion,
  AudioFeatures,
  CanvasRect,
  FaceIntent,
  FingerTopology,
  GesturePhase,
  GestureSnapshot,
  Point2D,
  TopologyPoint,
  VisualGesture,
} from '../core/types'

const ORBIT_EMOJIS: Partial<Record<VisualGesture, string[]>> = {
  index_orbit: ['✨', '😄', '🎵', '🌟'],
  victory_orbit: ['✌️', '😊', '🎉', '💫'],
  ok_orbit: ['👌', '✅', '💎', '✨'],
  finger_heart: ['🫰', '💗', '✨', '💞'],
  two_hand_heart: ['🫶', '💖', '💗', '✨'],
  thumbs_up: ['👍', '⚡', '🌟'],
  thumbs_down: ['👎', '〰️', '▫️'],
  call_me: ['🤙', '📞', '🎶'],
  point_left: ['👈', '✨'],
  point_right: ['👉', '✨'],
  point_up: ['☝️', '⭐'],
  point_down: ['👇', '🔹'],
  point_forward: ['🫵', '💥'],
  clap: ['👏', '✨', '🎵'],
  prayer: ['🙏', '🕯️', '✨'],
  push: ['🫷', '🫸', '〰️'],
}

export function drawTopologyNetwork(
  ctx: CanvasRenderingContext2D,
  rect: CanvasRect,
  topology: FingerTopology,
  emotion: AudioEmotion,
  mirrored: boolean,
) {
  if (topology.activeTips.length < 2) {
    return
  }

  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  for (const segment of topology.segments) {
    const from = topologyPointToCanvas(segment.from, rect, mirrored)
    const to = topologyPointToCanvas(segment.to, rect, mirrored)
    const alpha = segment.crossHand ? 0.2 + topology.crossDensity * 0.28 : 0.08

    ctx.beginPath()
    ctx.strokeStyle = colorWithAlpha(segment.crossHand ? emotion.palette.accent : emotion.palette.glow, alpha)
    ctx.lineWidth = segment.crossHand ? 1.3 + topology.crossDensity * 2.2 : 0.8
    ctx.shadowBlur = segment.crossHand ? 18 : 7
    ctx.shadowColor = segment.crossHand ? emotion.palette.accent : emotion.palette.glow
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.stroke()
  }

  for (const intersection of topology.intersections.slice(0, 16)) {
    const point = landmarkToCanvas({ x: intersection.x, y: intersection.y, z: 0 }, rect, mirrored)

    ctx.beginPath()
    ctx.fillStyle = colorWithAlpha(emotion.palette.highlight, 0.52)
    ctx.shadowBlur = 22
    ctx.shadowColor = emotion.palette.highlight
    ctx.arc(point.x, point.y, 3.4 + topology.crossDensity * 5, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.restore()
}

export function drawGestureEffectOverlay(
  ctx: CanvasRenderingContext2D,
  rect: CanvasRect,
  gesture: GestureSnapshot,
  audio: AudioFeatures,
  emotion: AudioEmotion,
  now: number,
  mirrored: boolean,
) {
  if (gesture.visualGesture === 'none') {
    return
  }

  const anchor = resolveGestureAnchor(gesture, rect, mirrored)

  if (!anchor) {
    return
  }

  if (gesture.visualGesture === 'punch') {
    drawImpact(ctx, anchor, gesture.effectIntensity, emotion, now)
    return
  }

  if (gesture.visualGesture === 'finger_gun') {
    drawFingerGun(ctx, anchor, gesture.indexDirection, gesture.effectIntensity, emotion, now)
    return
  }

  if (gesture.visualGesture === 'open_wheel') {
    drawSpiralPulse(ctx, anchor, gesture.effectIntensity, emotion, now)
    return
  }

  if (gesture.visualGesture === 'fist_shake' || gesture.visualGesture === 'paw_heart') {
    drawShakeAura(ctx, anchor, gesture.effectIntensity, emotion, now, gesture.visualGesture === 'paw_heart')
    return
  }

  if (gesture.visualGesture === 'push') {
    drawPushWave(ctx, anchor, gesture.effectIntensity, emotion, now)
    return
  }

  const emojis = ORBIT_EMOJIS[gesture.visualGesture] ?? []

  if (emojis.length) {
    drawEmojiOrbit(ctx, anchor, emojis, gesture.effectIntensity + audio.treble * 0.22, now)
  }
}

export function drawFaceIntentOverlay(
  ctx: CanvasRenderingContext2D,
  rect: CanvasRect,
  faceIntent: FaceIntent | undefined,
  audio: AudioFeatures,
  emotion: AudioEmotion,
  now: number,
  mirrored: boolean,
) {
  if (!faceIntent?.anchor || faceIntent.kind === 'none') {
    return
  }

  const anchor = landmarkToCanvas(faceIntent.anchor, rect, mirrored)
  const intensity = Math.max(0.12, Math.min(1, faceIntent.intensity + audio.mid * 0.18))

  if (faceIntent.kind === 'listen') {
    drawListenWaves(ctx, anchor, intensity, emotion, now)
    return
  }

  if (faceIntent.kind === 'shout') {
    drawShoutWaves(ctx, anchor, intensity, emotion, audio, now)
  }
}

export function shouldTriggerGestureBurst(
  previous: VisualGesture,
  next: VisualGesture,
  phase: GesturePhase,
) {
  return (
    phase === 'enter' &&
    previous !== next &&
    (next === 'finger_gun' ||
      next === 'punch' ||
      next === 'clap' ||
      next === 'push' ||
      next === 'two_hand_heart' ||
      next === 'finger_heart' ||
      next === 'open_wheel')
  )
}

function resolveGestureAnchor(
  gesture: GestureSnapshot,
  rect: CanvasRect,
  mirrored: boolean,
): Point2D | null {
  if (gesture.indexTip) {
    return landmarkToCanvas(gesture.indexTip, rect, mirrored)
  }

  if (gesture.palmCenter) {
    return landmarkToCanvas(gesture.palmCenter, rect, mirrored)
  }

  const firstTip = gesture.topology.activeTips[0]

  if (firstTip) {
    return topologyPointToCanvas(firstTip, rect, mirrored)
  }

  return null
}

function drawListenWaves(
  ctx: CanvasRenderingContext2D,
  center: Point2D,
  intensity: number,
  emotion: AudioEmotion,
  now: number,
) {
  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  ctx.lineCap = 'round'
  ctx.strokeStyle = colorWithAlpha(emotion.palette.glow, 0.24 + intensity * 0.28)
  ctx.lineWidth = 1.6 + intensity * 1.6
  ctx.shadowBlur = 20
  ctx.shadowColor = emotion.palette.glow

  const drift = (now * 0.045) % 18

  for (let index = 0; index < 4; index += 1) {
    const radius = 18 + index * 13 + drift
    const alpha = 1 - index * 0.16

    ctx.globalAlpha = Math.max(0.18, alpha)
    ctx.beginPath()
    ctx.arc(center.x, center.y, radius, -0.95, 0.95)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(center.x, center.y, radius, Math.PI - 0.95, Math.PI + 0.95)
    ctx.stroke()
  }

  ctx.restore()
}

function drawShoutWaves(
  ctx: CanvasRenderingContext2D,
  center: Point2D,
  intensity: number,
  emotion: AudioEmotion,
  audio: AudioFeatures,
  now: number,
) {
  ctx.save()
  ctx.globalCompositeOperation = 'screen'

  const pulse = (now * 0.065) % 34
  const radius = 24 + intensity * 34 + audio.volume * 42 + pulse
  const gradient = ctx.createRadialGradient(center.x, center.y, 3, center.x, center.y, radius)
  gradient.addColorStop(0, colorWithAlpha(emotion.palette.highlight, 0.34 + intensity * 0.2))
  gradient.addColorStop(0.48, colorWithAlpha(emotion.palette.accent, 0.16 + intensity * 0.18))
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')

  ctx.fillStyle = gradient
  ctx.fillRect(center.x - radius, center.y - radius, radius * 2, radius * 2)
  ctx.strokeStyle = colorWithAlpha(emotion.palette.highlight, 0.28 + intensity * 0.3)
  ctx.lineWidth = 2 + intensity * 1.8
  ctx.shadowBlur = 24
  ctx.shadowColor = emotion.palette.highlight

  for (let index = 0; index < 3; index += 1) {
    const ring = 18 + index * 22 + pulse

    ctx.globalAlpha = 0.75 - index * 0.16
    ctx.beginPath()
    ctx.arc(center.x, center.y, ring, 0, Math.PI * 2)
    ctx.stroke()
  }

  for (let ray = 0; ray < 7; ray += 1) {
    const angle = -0.68 + (ray / 6) * 1.36
    const length = 46 + intensity * 58 + audio.treble * 24

    ctx.globalAlpha = 0.28 + intensity * 0.28
    ctx.beginPath()
    ctx.moveTo(center.x + Math.cos(angle) * 12, center.y + Math.sin(angle) * 12)
    ctx.lineTo(center.x + Math.cos(angle) * length, center.y + Math.sin(angle) * length)
    ctx.stroke()
  }

  ctx.restore()
}

function drawEmojiOrbit(
  ctx: CanvasRenderingContext2D,
  center: Point2D,
  emojis: string[],
  intensity: number,
  now: number,
) {
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = '600 24px "Segoe UI Emoji", "Apple Color Emoji", system-ui, sans-serif'

  const radius = 34 + intensity * 26
  const spin = now * 0.003

  emojis.forEach((emoji, index) => {
    const depth = (Math.sin(spin + index * 1.7) + 1) * 0.5
    const angle = spin + (Math.PI * 2 * index) / emojis.length
    const x = center.x + Math.cos(angle) * radius * (0.75 + depth * 0.25)
    const y = center.y + Math.sin(angle) * radius * 0.52
    const scale = 0.72 + depth * 0.42

    ctx.globalAlpha = 0.58 + depth * 0.34
    ctx.setTransform(scale, 0, 0, scale, x - x * scale, y - y * scale)
    ctx.fillText(emoji, x, y)
  })

  ctx.restore()
}

function drawImpact(
  ctx: CanvasRenderingContext2D,
  center: Point2D,
  intensity: number,
  emotion: AudioEmotion,
  now: number,
) {
  ctx.save()
  ctx.globalCompositeOperation = 'screen'

  const pulse = (Math.sin(now * 0.02) + 1) * 0.5
  const radius = 36 + intensity * 72 + pulse * 20
  const gradient = ctx.createRadialGradient(center.x, center.y, 4, center.x, center.y, radius)
  gradient.addColorStop(0, colorWithAlpha(emotion.palette.highlight, 0.5))
  gradient.addColorStop(0.32, colorWithAlpha(emotion.palette.accent, 0.26))
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')

  ctx.fillStyle = gradient
  ctx.fillRect(center.x - radius, center.y - radius, radius * 2, radius * 2)
  ctx.strokeStyle = colorWithAlpha(emotion.palette.highlight, 0.46)
  ctx.lineWidth = 2.4

  for (let ray = 0; ray < 12; ray += 1) {
    const angle = (Math.PI * 2 * ray) / 12 + now * 0.001
    ctx.beginPath()
    ctx.moveTo(center.x + Math.cos(angle) * radius * 0.28, center.y + Math.sin(angle) * radius * 0.28)
    ctx.lineTo(center.x + Math.cos(angle) * radius, center.y + Math.sin(angle) * radius)
    ctx.stroke()
  }

  ctx.restore()
}

function drawFingerGun(
  ctx: CanvasRenderingContext2D,
  center: Point2D,
  direction: Point2D | null,
  intensity: number,
  emotion: AudioEmotion,
  now: number,
) {
  const aim = direction && Math.hypot(direction.x, direction.y) > 0.01 ? direction : { x: 1, y: 0 }
  const length = 120 + intensity * 80
  const flicker = 0.7 + Math.sin(now * 0.04) * 0.3

  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  ctx.strokeStyle = colorWithAlpha(emotion.palette.highlight, 0.52 * flicker)
  ctx.lineWidth = 3
  ctx.shadowBlur = 24
  ctx.shadowColor = emotion.palette.highlight
  ctx.beginPath()
  ctx.moveTo(center.x, center.y)
  ctx.lineTo(center.x + aim.x * length, center.y + aim.y * length)
  ctx.stroke()

  const burstCenter = {
    x: center.x + aim.x * 38,
    y: center.y + aim.y * 38,
  }

  for (let ray = 0; ray < 8; ray += 1) {
    const angle = Math.atan2(aim.y, aim.x) + (ray - 3.5) * 0.18
    ctx.beginPath()
    ctx.moveTo(burstCenter.x, burstCenter.y)
    ctx.lineTo(
      burstCenter.x + Math.cos(angle) * (22 + ray * 2),
      burstCenter.y + Math.sin(angle) * (22 + ray * 2),
    )
    ctx.stroke()
  }

  ctx.restore()
}

function drawSpiralPulse(
  ctx: CanvasRenderingContext2D,
  center: Point2D,
  intensity: number,
  emotion: AudioEmotion,
  now: number,
) {
  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  ctx.strokeStyle = colorWithAlpha(emotion.palette.glow, 0.32 + intensity * 0.24)
  ctx.lineWidth = 2
  ctx.shadowBlur = 18
  ctx.shadowColor = emotion.palette.glow
  ctx.beginPath()

  for (let step = 0; step < 90; step += 1) {
    const t = step / 89
    const angle = t * Math.PI * 6 + now * 0.004
    const radius = t * (42 + intensity * 86)
    const x = center.x + Math.cos(angle) * radius
    const y = center.y + Math.sin(angle) * radius

    if (step === 0) {
      ctx.moveTo(x, y)
    } else {
      ctx.lineTo(x, y)
    }
  }

  ctx.stroke()
  ctx.restore()
}

function drawShakeAura(
  ctx: CanvasRenderingContext2D,
  center: Point2D,
  intensity: number,
  emotion: AudioEmotion,
  now: number,
  hearts: boolean,
) {
  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  const scale = 1 + Math.sin(now * 0.035) * 0.06 * intensity
  const radius = 42 * scale + intensity * 24

  ctx.strokeStyle = colorWithAlpha(emotion.palette.accent, 0.32)
  ctx.lineWidth = 2
  ctx.shadowBlur = 20
  ctx.shadowColor = emotion.palette.accent
  ctx.beginPath()
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2)
  ctx.stroke()

  if (hearts) {
    drawEmojiOrbit(ctx, center, ['💗', '💞', '✨'], intensity, now)
  }

  ctx.restore()
}

function drawPushWave(
  ctx: CanvasRenderingContext2D,
  center: Point2D,
  intensity: number,
  emotion: AudioEmotion,
  now: number,
) {
  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  ctx.strokeStyle = colorWithAlpha(emotion.palette.glow, 0.28 + intensity * 0.24)
  ctx.lineWidth = 2
  ctx.shadowBlur = 22
  ctx.shadowColor = emotion.palette.glow

  for (let index = 0; index < 3; index += 1) {
    const radius = 28 + index * 24 + ((now * 0.04) % 24)
    ctx.beginPath()
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2)
    ctx.stroke()
  }

  ctx.restore()
}

function topologyPointToCanvas(point: TopologyPoint, rect: CanvasRect, mirrored: boolean) {
  return landmarkToCanvas(point.point, rect, mirrored)
}

function colorWithAlpha(hex: string, alpha: number) {
  const value = hex.replace('#', '')
  const r = Number.parseInt(value.slice(0, 2), 16)
  const g = Number.parseInt(value.slice(2, 4), 16)
  const b = Number.parseInt(value.slice(4, 6), 16)

  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`
}
