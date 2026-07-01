import { distance2D, landmarkDistance, midpoint, normalizeVector } from '../core/math'
import type { GestureEvent, GestureSnapshot, HandData, Landmark } from '../core/types'
import { gestureRules } from './gestureRules'
import { smoothLandmarks } from './smoothing'
import {
  analyzeHands,
  createEmptyTopology,
  createSilentHarmony,
  type PreviousHandMotion,
} from './topologyEngine'

export class GestureEngine {
  private pinching = false
  private lastPinchStart = -Infinity
  private previousIndexTip: Landmark | null = null
  private previousTimestamp = 0
  private previousLandmarks: Landmark[] | null = null
  private readonly previousHandMotion = new Map<string, PreviousHandMotion>()

  update(targetHand: HandData | null, now: number, hands: HandData[] | number): GestureSnapshot {
    const allHands = Array.isArray(hands) ? hands : []
    const handCount = Array.isArray(hands) ? hands.length : hands
    const analysis = analyzeHands(allHands, targetHand, this.previousHandMotion, now)

    if (!targetHand) {
      const pinchEvent: GestureEvent = this.pinching ? 'pinch_end' : 'none'
      this.pinching = false
      this.previousIndexTip = null
      this.previousLandmarks = null

      return {
        handCount,
        detected: false,
        handedness: 'None',
        handPose: 'none',
        visualGesture: 'none',
        effectIntensity: 0,
        pinch: false,
        pinchDistance: 0,
        pinchEvent,
        indexTip: null,
        pinchCenter: null,
        palmCenter: null,
        palmOpenness: 0,
        fingerSpread: 0,
        handScale: 0,
        twoHandDistance: null,
        handStates: analysis.handStates,
        topology: analysis.topology,
        harmony: analysis.harmony,
        indexDirection: null,
        indexVelocity: 0,
      }
    }

    const landmarks = smoothLandmarks(this.previousLandmarks, targetHand.landmarks)
    this.previousLandmarks = landmarks

    const targetState =
      analysis.handStates.find((state) => state.handedness === targetHand.handedness) ??
      analysis.handStates[0] ??
      null
    const thumbTip = landmarks[4]
    const indexMcp = landmarks[5]
    const indexTip = landmarks[8]
    const pinchDistance = landmarkDistance(thumbTip, indexTip)
    const pinch = pinchDistance < gestureRules.pinchThreshold
    const pinchEvent = this.resolvePinchEvent(pinch, now)
    const deltaTime = Math.max(1, now - this.previousTimestamp)
    const indexVelocity = this.previousIndexTip
      ? distance2D(indexTip, this.previousIndexTip) / deltaTime
      : 0
    const indexDirection = normalizeVector({
      x: indexTip.x - indexMcp.x,
      y: indexTip.y - indexMcp.y,
    })

    this.previousTimestamp = now
    this.previousIndexTip = indexTip

    return {
      handCount,
      detected: true,
      handedness: targetHand.handedness,
      handPose: analysis.handPose,
      visualGesture: analysis.visualGesture,
      effectIntensity: analysis.effectIntensity,
      pinch,
      pinchDistance,
      pinchEvent,
      indexTip,
      pinchCenter: midpoint(thumbTip, indexTip),
      palmCenter: targetState?.palmCenter ?? null,
      palmOpenness: targetState?.palmOpenness ?? 0,
      fingerSpread: targetState?.fingerSpread ?? 0,
      handScale: targetState?.handScale ?? 0,
      twoHandDistance: resolveTwoHandDistance(analysis.handStates),
      handStates: analysis.handStates,
      topology: analysis.topology,
      harmony: analysis.harmony,
      indexDirection,
      indexVelocity,
    }
  }

  reset() {
    this.pinching = false
    this.lastPinchStart = -Infinity
    this.previousIndexTip = null
    this.previousTimestamp = 0
    this.previousLandmarks = null
    this.previousHandMotion.clear()
  }

  private resolvePinchEvent(pinch: boolean, now: number): GestureEvent {
    if (pinch && !this.pinching) {
      this.pinching = true

      if (now - this.lastPinchStart >= gestureRules.pinchDebounceMs) {
        this.lastPinchStart = now
        return 'pinch_start'
      }

      return 'pinch_hold'
    }

    if (pinch) {
      return 'pinch_hold'
    }

    if (this.pinching) {
      this.pinching = false
      return 'pinch_end'
    }

    return 'none'
  }
}

export function emptyGestureSnapshot(): GestureSnapshot {
  return {
    handCount: 0,
    detected: false,
    handedness: 'None',
    handPose: 'none',
    visualGesture: 'none',
    effectIntensity: 0,
    pinch: false,
    pinchDistance: 0,
    pinchEvent: 'none',
    indexTip: null,
    pinchCenter: null,
    palmCenter: null,
    palmOpenness: 0,
    fingerSpread: 0,
    handScale: 0,
    twoHandDistance: null,
    handStates: [],
    topology: createEmptyTopology(),
    harmony: createSilentHarmony(),
    indexDirection: null,
    indexVelocity: 0,
  }
}

function resolveTwoHandDistance(handStates: GestureSnapshot['handStates']) {
  if (handStates.length < 2) {
    return null
  }

  return distance2D(handStates[0].palmCenter, handStates[1].palmCenter)
}
