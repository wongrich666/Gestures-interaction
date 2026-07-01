import { clamp, distance2D, landmarkDistance, midpoint, normalizeVector } from '../core/math'
import type {
  GestureEvent,
  GestureSnapshot,
  GestureState,
  HandData,
  Landmark,
  Point2D,
  VisualGesture,
} from '../core/types'
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
  private stableGesture: VisualGesture = 'none'
  private pendingGesture: VisualGesture = 'none'
  private pendingSince = 0
  private stableStartedAt = 0
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
      const gestureState = this.resolveGestureState('none', 0, null, null, now)

      return {
        handCount,
        detected: false,
        handedness: 'None',
        handPose: 'none',
        visualGesture: gestureState.id,
        gestureState,
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
    const gestureAnchor = targetState?.palmCenter ?? indexTip
    const gestureState = this.resolveGestureState(
      analysis.visualGesture,
      analysis.effectIntensity,
      gestureAnchor,
      indexDirection,
      now,
    )

    this.previousTimestamp = now
    this.previousIndexTip = indexTip

    return {
      handCount,
      detected: true,
      handedness: targetHand.handedness,
      handPose: analysis.handPose,
      visualGesture: gestureState.id,
      gestureState,
      effectIntensity: gestureState.intensity,
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
    this.stableGesture = 'none'
    this.pendingGesture = 'none'
    this.pendingSince = 0
    this.stableStartedAt = 0
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

  private resolveGestureState(
    candidate: VisualGesture,
    intensity: number,
    anchor: Landmark | null,
    direction: Point2D | null,
    now: number,
  ): GestureState {
    if (candidate !== this.pendingGesture) {
      this.pendingGesture = candidate
      this.pendingSince = now
    }

    const confirmMs = candidate === 'none' ? 72 : isBurstGesture(candidate) ? 48 : 96
    const pendingAge = now - this.pendingSince
    const changed = candidate !== this.stableGesture && pendingAge >= confirmMs
    let phase: GestureState['phase']

    if (changed) {
      this.stableGesture = candidate
      this.stableStartedAt = now
      phase = candidate === 'none' ? 'exit' : 'enter'
    } else if (this.stableGesture === 'none') {
      phase = 'idle'
    } else {
      phase = 'hold'
    }

    const dwell = Math.max(0, now - this.stableStartedAt)
    const confidence =
      this.stableGesture === 'none'
        ? 0
        : candidate === this.stableGesture
          ? clamp(0.52 + dwell / 360, 0, 1)
          : clamp(0.46 - pendingAge / Math.max(1, confirmMs) * 0.28, 0.18, 0.46)

    return {
      id: this.stableGesture,
      phase,
      confidence,
      intensity: this.stableGesture === 'none' ? 0 : clamp(intensity * (0.72 + confidence * 0.38), 0, 1),
      anchor,
      direction,
      startedAt: this.stableStartedAt,
      updatedAt: now,
    }
  }
}

export function emptyGestureSnapshot(): GestureSnapshot {
  const gestureState = createEmptyGestureState()

  return {
    handCount: 0,
    detected: false,
    handedness: 'None',
    handPose: 'none',
    visualGesture: 'none',
    gestureState,
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

function createEmptyGestureState(): GestureState {
  return {
    id: 'none',
    phase: 'idle',
    confidence: 0,
    intensity: 0,
    anchor: null,
    direction: null,
    startedAt: 0,
    updatedAt: 0,
  }
}

function isBurstGesture(gesture: VisualGesture) {
  return (
    gesture === 'finger_gun' ||
    gesture === 'punch' ||
    gesture === 'clap' ||
    gesture === 'push' ||
    gesture === 'two_hand_heart' ||
    gesture === 'finger_heart'
  )
}

function resolveTwoHandDistance(handStates: GestureSnapshot['handStates']) {
  if (handStates.length < 2) {
    return null
  }

  return distance2D(handStates[0].palmCenter, handStates[1].palmCenter)
}
