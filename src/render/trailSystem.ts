import { distance2D } from '../core/math'
import type { AudioEmotion, AudioFeatures, Point2D, VisualStyle } from '../core/types'

type TrailPoint = Point2D & {
  time: number
  pressure: number
}

export class TrailSystem {
  private readonly points: TrailPoint[] = []
  private lastPoint: TrailPoint | null = null

  addPoint(point: Point2D, now: number, pressure: number) {
    if (this.lastPoint && distance2D(point, this.lastPoint) < 4) {
      return
    }

    const nextPoint = {
      ...point,
      time: now,
      pressure,
    }

    this.points.push(nextPoint)
    this.lastPoint = nextPoint
  }

  update(now: number) {
    while (this.points.length && now - this.points[0].time > 1500) {
      this.points.shift()
    }
  }

  draw(
    ctx: CanvasRenderingContext2D,
    style: VisualStyle,
    audio: AudioFeatures,
    now: number,
    emotion?: AudioEmotion,
  ) {
    if (this.points.length < 2) {
      return
    }

    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    for (let index = 1; index < this.points.length; index += 1) {
      const previous = this.points[index - 1]
      const current = this.points[index]
      const age = now - current.time
      const alpha = Math.max(0, 1 - age / 1500)
      const width = 4 + current.pressure * 16 + audio.mid * 10
      const hue = emotion ? moodHue(emotion.mood) : style === 'blue_tears' ? 192 : style === 'spotlight' ? 52 : 205

      ctx.beginPath()
      ctx.strokeStyle = `hsla(${hue}, 100%, ${58 + audio.treble * 24}%, ${alpha * 0.82})`
      ctx.shadowBlur = 18 + audio.bass * 28
      ctx.shadowColor = `hsla(${hue}, 100%, 62%, ${alpha})`
      ctx.lineWidth = width * alpha
      ctx.moveTo(previous.x, previous.y)
      ctx.lineTo(current.x, current.y)
      ctx.stroke()
    }

    ctx.restore()
  }

  clear() {
    this.points.length = 0
    this.lastPoint = null
  }
}

function moodHue(mood: AudioEmotion['mood']) {
  const hues: Record<AudioEmotion['mood'], number> = {
    serene: 168,
    melancholy: 220,
    euphoric: 318,
    tense: 24,
    fierce: 8,
    ethereal: 190,
  }

  return hues[mood]
}
