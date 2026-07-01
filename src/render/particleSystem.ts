import { DEFAULT_PARTICLE_CONTROLS } from '../core/config'
import { clamp } from '../core/math'
import type {
  AudioEmotion,
  AudioFeatures,
  CanvasRect,
  GestureSnapshot,
  ParticleControls,
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
  sx: number
  sy: number
  sz: number
  seed: number
  radius: number
  hueShift: number
}

type BackgroundParticle = {
  x: number
  y: number
  z: number
  drift: number
  hueShift: number
}

type FieldOptions = {
  surface: CanvasRect
  focusPoint: Point2D | null
  palmPoint: Point2D | null
  gesture: GestureSnapshot
  audio: AudioFeatures
  emotion: AudioEmotion
  controls?: ParticleControls
  now: number
}

export class ParticleSystem {
  private readonly bursts: BurstParticle[] = []
  private readonly fieldParticles: FieldParticle[] = []
  private readonly backgroundParticles: BackgroundParticle[] = []
  private fieldSignature = ''
  private backgroundSignature = ''

  burst(origin: Point2D, style: VisualStyle, audio: AudioFeatures, emotion?: AudioEmotion) {
    const count = Math.round(30 + audio.bass * 48)
    const force = 2.1 + audio.volume * 3.2
    const hueBase = emotion ? moodHue(emotion.mood) : style === 'blue_tears' ? 196 : style === 'spotlight' ? 48 : 204

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
    this.ensureBackground(options.surface)
    this.ensureField(controls, options.surface)
    this.updateField(deltaMs, options, controls)
    this.updateBursts(deltaMs, options.audio)
  }

  drawBackground(
    ctx: CanvasRenderingContext2D,
    surface: CanvasRect,
    audio: AudioFeatures,
    emotion: AudioEmotion,
    now: number,
  ) {
    this.ensureBackground(surface)

    ctx.save()
    ctx.globalCompositeOperation = 'lighter'

    for (const particle of this.backgroundParticles) {
      const depth = clamp(particle.z, 0, 1)
      const driftX = Math.sin(now * 0.00008 + particle.drift) * 18 * depth
      const driftY = Math.cos(now * 0.00006 + particle.drift) * 8 * depth
      const radius = 0.55 + depth * 1.9 + audio.treble * 1.1
      const alpha = 0.12 + depth * 0.34 + audio.bass * 0.14
      const hue = moodHue(emotion.mood) + particle.hueShift

      ctx.beginPath()
      ctx.fillStyle = `hsla(${hue}, 94%, ${58 + depth * 24}%, ${alpha})`
      ctx.shadowBlur = 8 + depth * 18
      ctx.shadowColor = `hsla(${hue}, 100%, 68%, ${alpha})`
      ctx.arc(particle.x + driftX, particle.y + driftY, radius, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.restore()
  }

  draw(ctx: CanvasRenderingContext2D, controls?: ParticleControls) {
    const activeControls = normalizeControls(controls)
    const hue = hexToHue(activeControls.color)

    ctx.save()
    ctx.globalCompositeOperation = 'lighter'

    for (const particle of this.fieldParticles) {
      const depth = clamp((particle.z + 1.4) / 2.8, 0, 1)
      const radius = particle.radius * (0.62 + (1 - depth) * 1.25)
      const alpha = 0.38 + (1 - depth) * 0.42
      const lightness = 58 + (1 - depth) * 20
      const particleHue = hue + particle.hueShift

      ctx.beginPath()
      ctx.shadowBlur = 14 + (1 - depth) * 28
      ctx.shadowColor = `hsla(${particleHue}, 100%, 68%, ${alpha * 0.72})`
      ctx.fillStyle = `hsla(${particleHue}, 96%, ${lightness}%, ${alpha})`
      ctx.arc(particle.x, particle.y, radius, 0, Math.PI * 2)
      ctx.fill()
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
    this.backgroundParticles.length = 0
    this.fieldSignature = ''
    this.backgroundSignature = ''
  }

  private ensureField(controls: ParticleControls, surface: CanvasRect) {
    const targetCount = Math.round(clamp(controls.density, 120, 1200))
    const signature = `${controls.preset}:${targetCount}:${Math.round(surface.width)}x${Math.round(surface.height)}:${shapeSignature(controls)}`

    if (signature !== this.fieldSignature) {
      this.fieldSignature = signature
      this.fieldParticles.length = 0
    }

    while (this.fieldParticles.length < targetCount) {
      const index = this.fieldParticles.length
      const shape = sampleShapePoint(index, targetCount, controls)

      this.fieldParticles.push({
        x: surface.x + surface.width * (0.35 + Math.random() * 0.3),
        y: surface.y + surface.height * (0.35 + Math.random() * 0.3),
        z: Math.random() * 2 - 1,
        vx: 0,
        vy: 0,
        vz: 0,
        sx: shape.x,
        sy: shape.y,
        sz: shape.z,
        seed: Math.random() * 1000,
        radius: 0.8 + Math.random() * 2.2,
        hueShift: Math.random() * 34 - 17,
      })
    }

    if (this.fieldParticles.length > targetCount) {
      this.fieldParticles.splice(targetCount)
    }
  }

  private ensureBackground(surface: CanvasRect) {
    const signature = `${Math.round(surface.width)}x${Math.round(surface.height)}`

    if (signature === this.backgroundSignature && this.backgroundParticles.length) {
      return
    }

    this.backgroundSignature = signature
    this.backgroundParticles.length = 0

    for (let index = 0; index < 180; index += 1) {
      this.backgroundParticles.push({
        x: surface.x + Math.random() * surface.width,
        y: surface.y + Math.random() * surface.height,
        z: Math.random(),
        drift: Math.random() * Math.PI * 2,
        hueShift: Math.random() * 40 - 20,
      })
    }
  }

  private updateField(deltaMs: number, options: FieldOptions, controls: ParticleControls) {
    const { surface, focusPoint, palmPoint, gesture, audio, emotion, now } = options
    const center = palmPoint ?? focusPoint ?? {
      x: surface.x + surface.width * 0.5,
      y: surface.y + surface.height * 0.48,
    }
    const handOpen = gesture.detected ? gesture.palmOpenness : 0.58
    const twoHandBoost =
      gesture.twoHandDistance === null ? 1 : clamp(gesture.twoHandDistance * 2.3, 0.58, 1.85)
    const poseBoost =
      gesture.visualGesture === 'open_wheel'
        ? 1.85
        : gesture.visualGesture === 'finger_gun' || gesture.visualGesture === 'punch'
          ? 1.38
          : gesture.visualGesture === 'finger_heart' || gesture.visualGesture === 'two_hand_heart'
            ? 0.82
            : gesture.handPose === 'expand' || gesture.handPose === 'open'
        ? 1.28
        : gesture.handPose === 'fist' || gesture.handPose === 'contract'
          ? 0.55
          : gesture.handPose === 'pinch'
            ? 0.44
            : 1
    const baseScale =
      Math.min(surface.width, surface.height) *
      0.18 *
      clamp(controls.spread, 0.25, 2.5) *
      (0.48 + handOpen * 1.28 + audio.bass * 0.34) *
      twoHandBoost *
      poseBoost
    const gather = gesture.detected ? 1 - handOpen : 0.16
    const dt = Math.min(2.4, deltaMs / 16.67)
    const stiffness = 0.024 + emotion.motion * 0.012
    const damping = 0.82 - emotion.tension * 0.04

    for (const particle of this.fieldParticles) {
      const orbit = now * 0.00016 * (0.45 + emotion.motion) + particle.seed
      const wave = Math.sin(orbit * 2.2) * (8 + audio.mid * 18)
      const depth = particle.sz + Math.cos(orbit) * 0.18 + audio.bass * 0.2
      const parallax = 1 + depth * 0.16
      const gatherJitter = gather * (18 + audio.treble * 28)
      const targetX =
        center.x +
        particle.sx * baseScale * parallax +
        Math.cos(orbit) * wave +
        Math.sin(particle.seed * 1.7) * gatherJitter
      const targetY =
        center.y +
        particle.sy * baseScale * parallax +
        Math.sin(orbit * 0.8) * wave +
        Math.cos(particle.seed * 1.3) * gatherJitter
      const targetZ = depth * clamp(controls.spread, 0.4, 2.5)

      particle.vx = (particle.vx + (targetX - particle.x) * stiffness) * damping
      particle.vy = (particle.vy + (targetY - particle.y) * stiffness) * damping
      particle.vz = (particle.vz + (targetZ - particle.z) * stiffness) * damping
      particle.x += particle.vx * dt
      particle.y += particle.vy * dt
      particle.z += particle.vz * dt

      if (audio.beat) {
        particle.vx += (Math.random() - 0.5) * 0.7
        particle.vy += (Math.random() - 0.5) * 0.7
      }
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

    if (this.bursts.length > 720) {
      this.bursts.splice(0, this.bursts.length - 720)
    }
  }
}

function normalizeControls(controls?: ParticleControls): ParticleControls {
  return controls ?? DEFAULT_PARTICLE_CONTROLS
}

function sampleShapePoint(index: number, count: number, controls: ParticleControls) {
  if (controls.preset === 'custom' && controls.customShape.length > 1) {
    const point = controls.customShape[index % controls.customShape.length]
    const jitter = (hash(index + 7) - 0.5) * 0.07

    return {
      x: (point.x - 0.5) * 2 + jitter,
      y: (point.y - 0.5) * 2 + jitter,
      z: (hash(index + 17) - 0.5) * 0.7,
    }
  }

  const t = index / Math.max(1, count - 1)
  const angle = Math.PI * 2 * goldenRatio(index)
  const radius = Math.sqrt(t)

  if (controls.preset === 'heart') {
    const a = angle
    const x = 0.055 * 16 * Math.sin(a) ** 3
    const y =
      -0.055 *
      (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a))
    const shell = 0.72 + hash(index) * 0.34

    return { x: x * shell, y: y * shell, z: (hash(index + 11) - 0.5) * 0.82 }
  }

  if (controls.preset === 'sphere') {
    const z = 1 - 2 * t
    const r = Math.sqrt(Math.max(0, 1 - z * z))

    return {
      x: Math.cos(angle) * r,
      y: Math.sin(angle) * r * 0.82,
      z,
    }
  }

  if (controls.preset === 'ring') {
    const ringRadius = 0.78 + (hash(index + 4) - 0.5) * 0.18
    const ySquash = 0.38 + hash(index + 9) * 0.12

    return {
      x: Math.cos(angle) * ringRadius,
      y: Math.sin(angle) * ringRadius * ySquash,
      z: Math.sin(angle + hash(index) * Math.PI) * 0.56,
    }
  }

  const arm = index % 3
  const spiral = angle + arm * 2.1

  return {
    x: Math.cos(spiral) * radius * (0.45 + hash(index + 2) * 0.58),
    y: Math.sin(spiral) * radius * (0.3 + hash(index + 3) * 0.52),
    z: (hash(index + 5) - 0.5) * 1.6,
  }
}

function shapeSignature(controls: ParticleControls) {
  if (controls.preset !== 'custom') {
    return controls.preset
  }

  return `${controls.customShape.length}:${controls.customShape.slice(0, 12).map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join('|')}`
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

function hexToHue(hex: string) {
  const value = hex.replace('#', '')
  const r = Number.parseInt(value.slice(0, 2), 16) / 255
  const g = Number.parseInt(value.slice(2, 4), 16) / 255
  const b = Number.parseInt(value.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min

  if (delta === 0) {
    return 196
  }

  if (max === r) {
    return normalizeHue(60 * (((g - b) / delta) % 6))
  }

  if (max === g) {
    return normalizeHue(60 * ((b - r) / delta + 2))
  }

  return normalizeHue(60 * ((r - g) / delta + 4))
}

function normalizeHue(hue: number) {
  return ((hue % 360) + 360) % 360
}
