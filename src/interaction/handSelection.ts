import { clamp, landmarkDistance } from '../core/math'
import type { HandData, Landmark } from '../core/types'

export function selectInteractiveHand(hands: HandData[]) {
  if (hands.length === 0) {
    return null
  }

  if (hands.length === 1) {
    return hands[0]
  }

  return hands.reduce((best, hand) =>
    scoreInteractiveHand(hand) > scoreInteractiveHand(best) ? hand : best,
  )
}

function scoreInteractiveHand(hand: HandData) {
  const landmarks = hand.landmarks
  const wrist = landmarks[0]
  const middleMcp = landmarks[9]
  const scale = Math.max(0.0001, landmarkDistance(wrist, middleMcp))
  const palmCenter = averageLandmarks([wrist, landmarks[5], landmarks[9], landmarks[13], landmarks[17]])
  const tips = [landmarks[4], landmarks[8], landmarks[12], landmarks[16], landmarks[20]]
  const fingertipReach =
    tips.reduce((sum, tip) => sum + landmarkDistance(wrist, tip), 0) / tips.length / scale
  const fingerSpread = calculateTipSpread(tips, scale)
  const pinchDistance = landmarkDistance(landmarks[4], landmarks[8]) / scale
  const indexReach = landmarkDistance(wrist, landmarks[8]) / scale
  const forwardPoint = clamp((palmCenter.z - landmarks[8].z) * 6, 0, 1)
  const confidence = clamp(hand.confidence, 0, 1)

  return (
    confidence * 0.22 +
    clamp((fingertipReach - 1.05) / 0.85, 0, 1) * 0.24 +
    fingerSpread * 0.18 +
    clamp((0.5 - pinchDistance) / 0.5, 0, 1) * 0.16 +
    clamp((indexReach - 1) / 0.75, 0, 1) * 0.12 +
    forwardPoint * 0.08
  )
}

function calculateTipSpread(tips: Landmark[], scale: number) {
  let spread = 0

  for (let index = 1; index < tips.length; index += 1) {
    spread += landmarkDistance(tips[index - 1], tips[index])
  }

  return clamp(spread / (tips.length - 1) / scale / 1.5, 0, 1)
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
