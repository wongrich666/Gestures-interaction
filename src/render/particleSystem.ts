import { DEFAULT_PARTICLE_CONTROLS } from '../core/config'
import { clamp, landmarkToCanvas, lerp } from '../core/math'
import type {
  AudioEmotion,
  AudioFeatures,
  CanvasRect,
  GestureSnapshot,
  HandFingerState,
  ParticleControls,
  ParticlePreset,
  Point2D,
  VisualStyle,
} from '../core/types'

type BurstParticle = {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  life: number
  maxLife: number
  hue: number
}

type FieldParticle = {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  seed: number
  radius: number
}

type FieldOptions = {
  surface: CanvasRect
  videoRect: CanvasRect
  mirrored: boolean
  focusPoint: Point2D | null
  palmPoint: Point2D | null
  gesture: GestureSnapshot
  audio: AudioFeatures
  emotion: AudioEmotion
  controls?: ParticleControls
  now: number
}

type FieldModel = {
  center: Point2D
  scale: number
  opacity: number
  handOpen: number
  activeFingers: number
  mode: 'gather' | 'star' | 'bezier' | 'euler' | 'lissajous' | 'scatter'
}

type ShapePoint = Point2D & {
  z: number
}

export class ParticleSystem {
  private readonly bursts: BurstParticle[] = []
  private readonly fieldParticles: FieldParticle[] = []
  private fieldSignature = ''
  private starSignature = ''
  private starCanvas: HTMLCanvasElement | null = null
  private lastHandsAt = -Infinity
  private lastCenter: Point2D | null = null
  private fieldOpacity = 0

  burst(origin: Point2D, style: VisualStyle, audio: AudioFeatures, emotion?: AudioEmotion) {
    const count = Math.round(24 + audio.bass * 42)
    const force = 2.1 + audio.volume * 3.2
    const hueBase = emotion ? moodHue(emotion.mood) : style === 'blue_tears' ? 196 : style === 'spotlight' ? 48 : 204
    const maxBurstParticles = 560

    if (this.bursts.length + count > maxBurstParticles) {
      this.bursts.splice(0, this.bursts.length + count - maxBurstParticles)
    }

    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * Math.PI * 2
      const speed = force * (0.45 + Math.random() * 1.35)

      this.bursts.push({
        x: origin.x,
        y: origin.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 1.5 + Math.random() * 4.5,
        life: 0,
        maxLife: 520 + Math.random() * 560,
        hue: hueBase + Math.random() * 34 - 17,
      })
    }
  }

  update(deltaMs: number, options: FieldOptions) {
    const controls = normalizeControls(options.controls)
    this.ensureField(controls)
    this.updateField(deltaMs, options, controls)
    this.updateBursts(deltaMs, options.audio)
  }

  drawBackground(
    ctx: CanvasRenderingContext2D,
    surface: CanvasRect,
    audio: AudioFeatures,
    emotion: AudioEmotion,
    now: number,
    controls?: ParticleControls,
  ) {
    const activeControls = normalizeControls(controls)
    this.ensureStarfield(surface, activeControls)

    if (!this.starCanvas) {
      return
    }

    ctx.save()
    ctx.globalCompositeOperation = 'screen'
    ctx.globalAlpha = 0.34 + audio.treble * 0.12 + emotion.motion * 0.08
    const driftX = Math.sin(now * 0.00003) * 8
    const driftY = Math.cos(now * 0.000025) * 5
    ctx.drawImage(this.starCanvas, surface.x + driftX, surface.y + driftY, surface.width, surface.height)
    ctx.globalAlpha *= 0.42
    ctx.drawImage(this.starCanvas, surface.x - driftX * 0.6, surface.y - driftY * 0.6, surface.width, surface.height)
    ctx.restore()
  }

  draw(ctx: CanvasRenderingContext2D, controls?: ParticleControls) {
    const activeControls = normalizeControls(controls)
    const color = hexToRgb(activeControls.color)

    ctx.save()
    ctx.globalCompositeOperation = 'lighter'

    if (this.fieldOpacity > 0.01) {
      for (const particle of this.fieldParticles) {
        const depth = clamp((particle.z + 1.25) / 2.5, 0, 1)
        const radius = particle.radius * (0.68 + depth * 1.15)
        const alpha = this.fieldOpacity * (0.35 + depth * 0.52)

        ctx.beginPath()
        ctx.shadowBlur = 10 + depth * 18
        ctx.shadowColor = `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha * 0.72})`
        ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`
        ctx.arc(particle.x, particle.y, radius, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    for (const particle of this.bursts) {
      const progress = particle.life / particle.maxLife
      const alpha = clamp(1 - progress, 0, 1)
      const radius = particle.radius * (1 + progress * 1.8)

      ctx.beginPath()
      ctx.shadowBlur = 16
      ctx.shadowColor = `hsla(${particle.hue}, 100%, 65%, ${alpha})`
      ctx.fillStyle = `hsla(${particle.hue}, 100%, 66%, ${alpha})`
      ctx.arc(particle.x, particle.y, radius, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.restore()
  }

  clear() {
    this.bursts.length = 0
    this.fieldParticles.length = 0
    this.fieldSignature = ''
    this.starSignature = ''
    this.starCanvas = null
    this.lastHandsAt = -Infinity
    this.lastCenter = null
    this.fieldOpacity = 0
  }

  private ensureField(controls: ParticleControls) {
    const targetCount = Math.round(clamp(controls.density, 1000, 3000))
    const signature = `${targetCount}`

    if (signature !== this.fieldSignature) {
      this.fieldSignature = signature
      this.fieldParticles.length = 0
    }

    while (this.fieldParticles.length < targetCount) {
      this.fieldParticles.push({
        x: 0,
        y: 0,
        z: Math.random() * 2 - 1,
        vx: 0,
        vy: 0,
        vz: 0,
        seed: Math.random() * 1000,
        radius: 0.8 + Math.random() * 1.85,
      })
    }

    if (this.fieldParticles.length > targetCount) {
      this.fieldParticles.splice(targetCount)
    }
  }

  private ensureStarfield(surface: CanvasRect, controls: ParticleControls) {
    const starCount = Math.round(clamp(controls.density, 1000, 70000))
    const signature = `${Math.round(surface.width)}x${Math.round(surface.height)}:${starCount}`

    if (signature === this.starSignature && this.starCanvas) {
      return
    }

    this.starSignature = signature
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(surface.width))
    canvas.height = Math.max(1, Math.round(surface.height))
    const ctx = canvas.getContext('2d')

    if (!ctx) {
      this.starCanvas = null
      return
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.globalCompositeOperation = 'lighter'

    for (let index = 0; index < starCount; index += 1) {
      const z = hash(index + 9)
      const x = hash(index * 3 + 1) * canvas.width
      const y = hash(index * 5 + 2) * canvas.height
      const radius = z > 0.985 ? 1.7 : z > 0.92 ? 1.05 : 0.55
      const alpha = 0.06 + z * 0.34
      const hue = 190 + (hash(index + 44) - 0.5) * 48

      ctx.beginPath()
      ctx.fillStyle = `hsla(${hue}, 90%, ${62 + z * 24}%, ${alpha})`
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.fill()
    }

    this.starCanvas = canvas
  }

  private updateField(deltaMs: number, options: FieldOptions, controls: ParticleControls) {
    const model = this.resolveFieldModel(options, controls)
    const dt = Math.min(2.2, deltaMs / 16.67)
    const stiffness = 0.16 + options.emotion.motion * 0.04
    const damping = 0.68 - options.emotion.tension * 0.04
    const count = Math.max(1, this.fieldParticles.length)

    for (let index = 0; index < this.fieldParticles.length; index += 1) {
      const particle = this.fieldParticles[index]
      const shape = sampleGestureShape(index, count, particle.seed, model, controls)
      const targetX = model.center.x + shape.x * model.scale
      const targetY = model.center.y + shape.y * model.scale
      const targetZ = shape.z

      particle.vx = (particle.vx + (targetX - particle.x) * stiffness) * damping
      particle.vy = (particle.vy + (targetY - particle.y) * stiffness) * damping
      particle.vz = (particle.vz + (targetZ - particle.z) * stiffness) * damping
      particle.x += particle.vx * dt
      particle.y += particle.vy * dt
      particle.z += particle.vz * dt

      if (options.audio.beat && model.mode === 'scatter') {
        particle.vx += (hash(index + options.now * 0.01) - 0.5) * 1.4
        particle.vy += (hash(index + 17 + options.now * 0.01) - 0.5) * 1.4
      }
    }
  }

  private resolveFieldModel(options: FieldOptions, controls: ParticleControls): FieldModel {
    const { gesture, surface, videoRect, mirrored, now } = options
    const visibleHands = gesture.handStates

    if (visibleHands.length) {
      this.lastHandsAt = now
    }

    const liveOpacity = visibleHands.length ? 1 : clamp(1 - (now - this.lastHandsAt) / 1000, 0, 1)
    this.fieldOpacity = lerp(this.fieldOpacity, liveOpacity, visibleHands.length ? 0.42 : 0.16)

    const center = visibleHands.length
      ? averagePoints(visibleHands.map((hand) => landmarkToCanvas(hand.palmCenter, videoRect, mirrored)))
      : this.lastCenter ?? {
          x: surface.x + surface.width * 0.5,
          y: surface.y + surface.height * 0.5,
        }

    this.lastCenter = center

    const strongestHand = resolveStrongestHand(visibleHands)
    const handOpen = visibleHands.length
      ? visibleHands.reduce((sum, hand) => sum + hand.palmOpenness, 0) / visibleHands.length
      : 0
    const activeFingers = strongestHand?.activeTips.length ?? 0
    const allFists = visibleHands.length > 0 && visibleHands.every((hand) => hand.fist)
    const handScale = strongestHand
      ? strongestHand.handScale * Math.min(videoRect.width, videoRect.height) * 3.2
      : Math.min(surface.width, surface.height) * 0.16
    const twoHandBoost =
      gesture.twoHandDistance === null ? 1 : clamp(gesture.twoHandDistance * 2.35, 0.7, 1.85)
    const opennessScale = allFists ? 0.18 : 0.52 + handOpen * 1.38
    const mode = resolveFieldMode(activeFingers, allFists)
    const scale =
      mode === 'scatter'
        ? Math.max(surface.width, surface.height) * clamp(controls.spread, 0.2, 3.5)
        : clamp(handScale, 42, 230) * opennessScale * twoHandBoost * clamp(controls.spread, 0.2, 3.5)

    return {
      center,
      scale,
      opacity: this.fieldOpacity,
      handOpen,
      activeFingers,
      mode,
    }
  }

  private updateBursts(deltaMs: number, audio: AudioFeatures) {
    const gravity = 0.0008 + audio.bass * 0.002

    for (let index = this.bursts.length - 1; index >= 0; index -= 1) {
      const particle = this.bursts[index]
      particle.life += deltaMs
      particle.vy += gravity * deltaMs
      particle.x += particle.vx * (deltaMs / 16.67)
      particle.y += particle.vy * (deltaMs / 16.67)
      particle.vx *= 0.992
      particle.vy *= 0.992

      if (particle.life >= particle.maxLife) {
        this.bursts.splice(index, 1)
      }
    }

    if (this.bursts.length > 560) {
      this.bursts.splice(0, this.bursts.length - 560)
    }
  }
}

function resolveFieldMode(activeFingers: number, allFists: boolean): FieldModel['mode'] {
  if (allFists || activeFingers <= 0) {
    return 'gather'
  }

  if (activeFingers === 1) {
    return 'star'
  }

  if (activeFingers === 2) {
    return 'bezier'
  }

  if (activeFingers === 3) {
    return 'euler'
  }

  if (activeFingers === 4) {
    return 'lissajous'
  }

  return 'scatter'
}

function resolveStrongestHand(hands: HandFingerState[]) {
  return hands.reduce<HandFingerState | null>((best, hand) => {
    if (!best) {
      return hand
    }

    const handScore = hand.activeTips.length + hand.palmOpenness * 1.2 + hand.fingerSpread
    const bestScore = best.activeTips.length + best.palmOpenness * 1.2 + best.fingerSpread

    return handScore > bestScore ? hand : best
  }, null)
}

function sampleGestureShape(
  index: number,
  count: number,
  seed: number,
  model: FieldModel,
  controls: ParticleControls,
): ShapePoint {
  const t = ((index / count) + hash(seed)) % 1
  const jitter = (hash(seed + 3) - 0.5) * (model.mode === 'gather' ? 0.08 : 0.12)
  const preset = samplePresetShape(index, count, seed, controls.preset, controls.customShape)
  let point: ShapePoint

  if (model.mode === 'gather') {
    const angle = Math.PI * 2 * goldenRatio(index)
    const radius = Math.sqrt(hash(seed + 6)) * (0.06 + model.handOpen * 0.08)
    point = {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      z: (hash(seed + 7) - 0.5) * 0.28,
    }
  } else if (model.mode === 'star') {
    point = sampleStarLine(t, jitter)
  } else if (model.mode === 'bezier') {
    point = sampleCubicBezier(t, jitter)
  } else if (model.mode === 'euler') {
    point = sampleEulerSpiral(t, jitter)
  } else if (model.mode === 'lissajous') {
    point = sampleLissajous(t, jitter)
  } else {
    const angle = Math.PI * 2 * goldenRatio(index)
    const radius = 0.2 + Math.sqrt(t) * 0.58 + hash(seed + 13) * 0.2
    point = {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      z: (hash(seed + 14) - 0.5) * 1.8,
    }
  }

  if (model.mode === 'scatter') {
    return point
  }

  const presetBlend = controls.preset === 'custom' ? 0.28 : 0.18

  return {
    x: lerp(point.x, preset.x, presetBlend),
    y: lerp(point.y, preset.y, presetBlend),
    z: lerp(point.z, preset.z, presetBlend),
  }
}

function sampleStarLine(t: number, jitter: number): ShapePoint {
  const points = Array.from({ length: 10 }, (_, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / 10
    const radius = index % 2 === 0 ? 0.72 : 0.32

    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    }
  })
  const segment = Math.floor(t * points.length)
  const local = t * points.length - segment
  const from = points[segment % points.length]
  const to = points[(segment + 1) % points.length]

  return {
    x: lerp(from.x, to.x, local) + jitter,
    y: lerp(from.y, to.y, local) + jitter * 0.6,
    z: (local - 0.5) * 0.6,
  }
}

function sampleCubicBezier(t: number, jitter: number): ShapePoint {
  const u = 1 - t
  const p0 = { x: -0.8, y: 0.34 }
  const p1 = { x: -0.35, y: -0.82 }
  const p2 = { x: 0.38, y: 0.82 }
  const p3 = { x: 0.84, y: -0.24 }

  return {
    x: u ** 3 * p0.x + 3 * u ** 2 * t * p1.x + 3 * u * t ** 2 * p2.x + t ** 3 * p3.x + jitter,
    y: u ** 3 * p0.y + 3 * u ** 2 * t * p1.y + 3 * u * t ** 2 * p2.y + t ** 3 * p3.y,
    z: Math.sin(t * Math.PI) * 0.7,
  }
}

function sampleEulerSpiral(t: number, jitter: number): ShapePoint {
  const s = (t - 0.5) * 2.4
  const angle = s * s * 4.2 * Math.sign(s || 1)
  const radius = Math.abs(s) * 0.52

  return {
    x: Math.cos(angle) * radius + jitter,
    y: Math.sin(angle) * radius + s * 0.18,
    z: s * 0.7,
  }
}

function sampleLissajous(t: number, jitter: number): ShapePoint {
  const angle = t * Math.PI * 2

  return {
    x: Math.sin(angle * 3 + Math.PI / 2) * 0.72 + jitter,
    y: Math.sin(angle * 4) * 0.52,
    z: Math.cos(angle * 2) * 0.75,
  }
}

function samplePresetShape(
  index: number,
  count: number,
  seed: number,
  preset: ParticlePreset,
  customShape: Point2D[],
): ShapePoint {
  if (preset === 'custom' && customShape.length > 1) {
    const point = customShape[index % customShape.length]

    return {
      x: (point.x - 0.5) * 1.4,
      y: (point.y - 0.5) * 1.4,
      z: (hash(seed + 21) - 0.5) * 0.7,
    }
  }

  const t = index / Math.max(1, count - 1)
  const angle = Math.PI * 2 * goldenRatio(index)
  const radius = Math.sqrt(t)

  if (preset === 'heart') {
    const x = 0.052 * 16 * Math.sin(angle) ** 3
    const y =
      -0.052 *
      (13 * Math.cos(angle) - 5 * Math.cos(2 * angle) - 2 * Math.cos(3 * angle) - Math.cos(4 * angle))

    return { x, y, z: (hash(seed + 11) - 0.5) * 0.82 }
  }

  if (preset === 'saturn') {
    const ring = 0.54 + hash(seed + 4) * 0.22

    return {
      x: Math.cos(angle) * ring,
      y: Math.sin(angle) * ring * 0.26,
      z: Math.sin(angle + hash(seed) * Math.PI) * 0.7,
    }
  }

  if (preset === 'firework') {
    const burst = radius * (0.45 + hash(seed + 12) * 0.55)

    return {
      x: Math.cos(angle) * burst,
      y: Math.sin(angle) * burst,
      z: (hash(seed + 17) - 0.5) * 1.4,
    }
  }

  const arm = index % 3
  const spiral = angle + arm * 2.1

  return {
    x: Math.cos(spiral) * radius * (0.45 + hash(seed + 2) * 0.58),
    y: Math.sin(spiral) * radius * (0.3 + hash(seed + 3) * 0.52),
    z: (hash(seed + 5) - 0.5) * 1.6,
  }
}

function normalizeControls(controls?: ParticleControls): ParticleControls {
  return controls ?? DEFAULT_PARTICLE_CONTROLS
}

function averagePoints(points: Point2D[]): Point2D {
  const total = points.reduce(
    (sum, point) => ({
      x: sum.x + point.x,
      y: sum.y + point.y,
    }),
    { x: 0, y: 0 },
  )

  return {
    x: total.x / points.length,
    y: total.y / points.length,
  }
}

function goldenRatio(index: number) {
  return (index * 0.618033988749895) % 1
}

function hash(value: number) {
  const result = Math.sin(value * 12.9898) * 43758.5453

  return result - Math.floor(result)
}

function moodHue(mood: AudioEmotion['mood']) {
  const hues: Record<AudioEmotion['mood'], number> = {
    serene: 170,
    melancholy: 218,
    euphoric: 318,
    tense: 22,
    fierce: 8,
    ethereal: 190,
  }

  return hues[mood]
}

function hexToRgb(hex: string) {
  const value = hex.replace('#', '')

  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  }
}
