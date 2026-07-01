import type { CanvasRect, Landmark, Point2D } from './types'

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function lerp(start: number, end: number, amount: number) {
  return start + (end - start) * amount
}

export function distance2D(a: Point2D, b: Point2D) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function landmarkDistance(a: Landmark, b: Landmark) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function midpoint(a: Landmark, b: Landmark): Landmark {
  return {
    x: (a.x + b.x) * 0.5,
    y: (a.y + b.y) * 0.5,
    z: ((a.z ?? 0) + (b.z ?? 0)) * 0.5,
  }
}

export function normalizeVector(vector: Point2D): Point2D {
  const length = Math.hypot(vector.x, vector.y)

  if (length < 0.00001) {
    return { x: 0, y: 0 }
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
  }
}

export function containRect(
  outerWidth: number,
  outerHeight: number,
  innerWidth: number,
  innerHeight: number,
): CanvasRect {
  const safeInnerWidth = innerWidth || 16
  const safeInnerHeight = innerHeight || 9
  const outerAspect = outerWidth / outerHeight
  const innerAspect = safeInnerWidth / safeInnerHeight

  if (outerAspect > innerAspect) {
    const height = outerHeight
    const width = height * innerAspect

    return {
      x: (outerWidth - width) * 0.5,
      y: 0,
      width,
      height,
    }
  }

  const width = outerWidth
  const height = width / innerAspect

  return {
    x: 0,
    y: (outerHeight - height) * 0.5,
    width,
    height,
  }
}

export function landmarkToCanvas(
  landmark: Landmark,
  rect: CanvasRect,
  mirrored = true,
): Point2D {
  return {
    x: rect.x + (mirrored ? 1 - landmark.x : landmark.x) * rect.width,
    y: rect.y + landmark.y * rect.height,
  }
}

export function formatNumber(value: number, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : '0.00'
}
