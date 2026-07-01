import { lerp } from '../core/math'
import type { Landmark } from '../core/types'

export function smoothLandmarks(
  previous: Landmark[] | null,
  next: Landmark[],
  amount = 0.42,
): Landmark[] {
  if (!previous || previous.length !== next.length) {
    return next
  }

  return next.map((landmark, index) => {
    const previousLandmark = previous[index]

    return {
      x: lerp(previousLandmark.x, landmark.x, amount),
      y: lerp(previousLandmark.y, landmark.y, amount),
      z: lerp(previousLandmark.z, landmark.z, amount),
    }
  })
}
