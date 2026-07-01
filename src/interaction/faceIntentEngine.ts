import { clamp, landmarkDistance } from '../core/math'
import type { FaceData, FaceIntent, HandData, Landmark } from '../core/types'

export function analyzeFaceIntent(hands: HandData[], face: FaceData | null): FaceIntent {
  if (!face || !hands.length) {
    return {
      kind: 'none',
      intensity: 0,
      anchor: null,
    }
  }

  const handPoints = hands.flatMap((hand) => [
    averageLandmarks([hand.landmarks[0], hand.landmarks[5], hand.landmarks[9], hand.landmarks[13], hand.landmarks[17]]),
    hand.landmarks[4],
    hand.landmarks[8],
    hand.landmarks[12],
    hand.landmarks[16],
    hand.landmarks[20],
  ])
  const mouthDistance = minDistanceToAnchor(handPoints, face.anchors.mouth) / face.faceScale
  const leftEarDistance = minDistanceToAnchor(handPoints, face.anchors.leftEar) / face.faceScale
  const rightEarDistance = minDistanceToAnchor(handPoints, face.anchors.rightEar) / face.faceScale
  const earDistance = Math.min(leftEarDistance, rightEarDistance)

  if (mouthDistance < 0.42 && face.mouthOpen > 0.18) {
    return {
      kind: 'shout',
      intensity: clamp((0.42 - mouthDistance) * 2.1 + face.mouthOpen * 0.72, 0, 1),
      anchor: face.anchors.mouth,
    }
  }

  if (earDistance < 0.42) {
    return {
      kind: 'listen',
      intensity: clamp((0.42 - earDistance) * 2.4, 0, 1),
      anchor: leftEarDistance < rightEarDistance ? face.anchors.leftEar : face.anchors.rightEar,
    }
  }

  return {
    kind: 'none',
    intensity: 0,
    anchor: null,
  }
}

function minDistanceToAnchor(points: Landmark[], anchor: Landmark) {
  return points.reduce((minimum, point) => Math.min(minimum, landmarkDistance(point, anchor)), Infinity)
}

function averageLandmarks(points: Landmark[]): Landmark {
  const total = points.reduce(
    (sum, point) => ({
      x: sum.x + point.x,
      y: sum.y + point.y,
      z: sum.z + (point.z ?? 0),
    }),
    { x: 0, y: 0, z: 0 },
  )

  return {
    x: total.x / points.length,
    y: total.y / points.length,
    z: total.z / points.length,
  }
}
