import { clamp, distance2D, landmarkDistance } from '../core/math'
import type {
  FingerName,
  FingerState,
  FingerTopology,
  HandData,
  HandFingerState,
  HandPose,
  HarmonyFamily,
  HarmonyState,
  Landmark,
  TopologyIntersection,
  TopologyPoint,
  TopologySegment,
  VisualGesture,
} from '../core/types'

const FINGER_DEFS: Record<
  FingerName,
  { tip: number; dip: number; pip: number; mcp: number; label: string }
> = {
  thumb: { tip: 4, dip: 3, pip: 2, mcp: 1, label: 'T' },
  index: { tip: 8, dip: 7, pip: 6, mcp: 5, label: 'I' },
  middle: { tip: 12, dip: 11, pip: 10, mcp: 9, label: 'M' },
  ring: { tip: 16, dip: 15, pip: 14, mcp: 13, label: 'R' },
  pinky: { tip: 20, dip: 19, pip: 18, mcp: 17, label: 'P' },
}

const FINGER_NAMES: FingerName[] = ['thumb', 'index', 'middle', 'ring', 'pinky']

export type PreviousHandMotion = {
  palmCenter: Landmark
  rotation: number
  timestamp: number
}

export type GestureAnalysis = {
  handStates: HandFingerState[]
  topology: FingerTopology
  harmony: HarmonyState
  visualGesture: VisualGesture
  handPose: HandPose
  effectIntensity: number
}

export function analyzeHands(
  hands: HandData[],
  targetHand: HandData | null,
  previousMotion: Map<string, PreviousHandMotion>,
  now: number,
): GestureAnalysis {
  const handStates = hands.map((hand, index) =>
    buildHandFingerState(hand, `${hand.handedness}:${index}`, previousMotion, now),
  )
  const topology = buildFingerTopology(handStates)
  const harmony = resolveHarmony(topology)
  const targetIndex = targetHand ? hands.indexOf(targetHand) : -1
  const targetState = targetIndex >= 0 ? handStates[targetIndex] : handStates[0] ?? null
  const visualGesture = resolveVisualGesture(handStates, targetState, topology)
  const handPose = resolveHandPose(targetState, topology, visualGesture)
  const effectIntensity = resolveEffectIntensity(targetState, topology, visualGesture)

  return {
    handStates,
    topology,
    harmony,
    visualGesture,
    handPose,
    effectIntensity,
  }
}

export function createEmptyTopology(): FingerTopology {
  return {
    activeTips: [],
    segments: [],
    intersections: [],
    polygonArea: 0,
    normalizedArea: 0,
    crossDensity: 0,
    muted: true,
  }
}

export function createSilentHarmony(): HarmonyState {
  return {
    family: 'silent',
    label: '静音',
    brightness: 0,
    dissonance: 0,
    activeNotes: 0,
    muted: true,
  }
}

function buildHandFingerState(
  hand: HandData,
  motionKey: string,
  previousMotion: Map<string, PreviousHandMotion>,
  now: number,
): HandFingerState {
  const landmarks = hand.landmarks
  const wrist = landmarks[0]
  const middleMcp = landmarks[9]
  const palmCenter = averageLandmarks([wrist, landmarks[5], landmarks[9], landmarks[13], landmarks[17]])
  const handScale = Math.max(0.0001, landmarkDistance(wrist, middleMcp))
  const fingers = {} as Record<FingerName, FingerState>

  for (const name of FINGER_NAMES) {
    fingers[name] = buildFingerState(name, landmarks, handScale)
  }

  const palmOpenness =
    FINGER_NAMES.reduce((sum, name) => sum + fingers[name].extension, 0) / FINGER_NAMES.length
  const fingerSpread = calculateFingerSpread(landmarks, handScale)
  const rotation = Math.atan2(middleMcp.y - wrist.y, middleMcp.x - wrist.x)
  const previous = previousMotion.get(motionKey)
  const elapsedMs = previous ? Math.max(1, now - previous.timestamp) : 16.67
  const rotationVelocity = previous ? angleDelta(rotation, previous.rotation) / elapsedMs : 0
  const palmVelocity = previous ? distance2D(palmCenter, previous.palmCenter) / elapsedMs : 0
  const fist =
    palmOpenness < 0.33 &&
    !fingers.index.extended &&
    !fingers.middle.extended &&
    !fingers.ring.extended &&
    !fingers.pinky.extended
  const activeTips = fist
    ? []
    : FINGER_NAMES.filter((name) => fingers[name].extended).map((finger) => ({
        finger,
        handedness: hand.handedness,
        point: fingers[finger].tip,
      }))

  previousMotion.set(motionKey, {
    palmCenter,
    rotation,
    timestamp: now,
  })

  return {
    handedness: hand.handedness,
    confidence: hand.confidence,
    fingers,
    activeTips,
    palmCenter,
    palmOpenness,
    fingerSpread,
    handScale,
    rotation,
    rotationVelocity,
    palmVelocity,
    fist,
  }
}

function buildFingerState(
  name: FingerName,
  landmarks: Landmark[],
  handScale: number,
): FingerState {
  const def = FINGER_DEFS[name]
  const tip = landmarks[def.tip]
  const pip = landmarks[def.pip]
  const dip = landmarks[def.dip]
  const mcp = landmarks[def.mcp]
  const wrist = landmarks[0]
  const straightness =
    name === 'thumb'
      ? (angleAt(mcp, dip, tip) + angleAt(landmarks[def.mcp], landmarks[def.pip], landmarks[def.dip])) * 0.5
      : angleAt(mcp, pip, tip)
  const distanceRatio = landmarkDistance(wrist, tip) / handScale
  const distanceExtension =
    name === 'thumb'
      ? clamp((distanceRatio - 0.78) / 0.72, 0, 1)
      : clamp((distanceRatio - 1.06) / 0.86, 0, 1)
  const angleExtension = clamp((straightness - 104) / 68, 0, 1)
  const extension = clamp(angleExtension * 0.68 + distanceExtension * 0.32, 0, 1)

  return {
    name,
    tipIndex: def.tip,
    extended: extension > (name === 'thumb' ? 0.52 : 0.56),
    extension,
    curl: 1 - extension,
    tip,
  }
}

function buildFingerTopology(handStates: HandFingerState[]): FingerTopology {
  const activeTips: TopologyPoint[] = handStates.flatMap((hand) =>
    hand.activeTips.map((tip) => ({
      id: `${tip.handedness}:${tip.finger}`,
      finger: tip.finger,
      handedness: tip.handedness,
      point: tip.point,
    })),
  )
  const segments: TopologySegment[] = []

  for (let start = 0; start < activeTips.length; start += 1) {
    for (let end = start + 1; end < activeTips.length; end += 1) {
      const from = activeTips[start]
      const to = activeTips[end]
      segments.push({
        from,
        to,
        crossHand: from.handedness !== to.handedness,
      })
    }
  }

  const intersections: TopologyIntersection[] = []

  for (let firstIndex = 0; firstIndex < segments.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < segments.length; secondIndex += 1) {
      const first = segments[firstIndex]
      const second = segments[secondIndex]

      if (!first.crossHand && !second.crossHand) {
        continue
      }

      if (
        first.from.id === second.from.id ||
        first.from.id === second.to.id ||
        first.to.id === second.from.id ||
        first.to.id === second.to.id
      ) {
        continue
      }

      const intersection = segmentIntersection(
        first.from.point,
        first.to.point,
        second.from.point,
        second.to.point,
      )

      if (intersection) {
        intersections.push(intersection)
      }
    }
  }

  const polygonArea = calculatePolygonArea(activeTips.map((tip) => tip.point))
  const crossHandSegments = Math.max(1, segments.filter((segment) => segment.crossHand).length)
  const crossDensity = clamp(intersections.length / crossHandSegments, 0, 1)
  const muted =
    activeTips.length < 2 || (handStates.length > 0 && handStates.every((hand) => hand.fist))

  return {
    activeTips,
    segments,
    intersections,
    polygonArea,
    normalizedArea: clamp(polygonArea * 6.5, 0, 1),
    crossDensity,
    muted,
  }
}

function resolveHarmony(topology: FingerTopology): HarmonyState {
  if (topology.muted) {
    return createSilentHarmony()
  }

  let family: HarmonyFamily

  if (topology.crossDensity > 0.52) {
    family = 'cluster'
  } else if (topology.crossDensity > 0.3) {
    family = 'diminished'
  } else if (topology.crossDensity > 0.14) {
    family = 'augmented'
  } else if (topology.normalizedArea < 0.34) {
    family = 'minor'
  } else if (topology.normalizedArea < 0.66) {
    family = 'sus'
  } else {
    family = 'major'
  }

  const labels: Record<HarmonyFamily, string> = {
    silent: '静音',
    major: '大三和声',
    minor: '小三和声',
    sus: '挂留和声',
    diminished: '减七变化',
    augmented: '增六变化',
    cluster: '多音簇',
  }

  return {
    family,
    label: labels[family],
    brightness: topology.normalizedArea,
    dissonance: topology.crossDensity,
    activeNotes: topology.activeTips.length,
    muted: false,
  }
}

function resolveVisualGesture(
  handStates: HandFingerState[],
  target: HandFingerState | null,
  topology: FingerTopology,
): VisualGesture {
  if (handStates.length >= 2) {
    const [first, second] = handStates
    const twoHandDistance = landmarkDistance(first.palmCenter, second.palmCenter)
    const thumbIndexCrossDistance = Math.min(
      landmarkDistance(first.fingers.thumb.tip, second.fingers.index.tip),
      landmarkDistance(first.fingers.index.tip, second.fingers.thumb.tip),
    )

    if (thumbIndexCrossDistance < 0.11 && twoHandDistance < 0.34) {
      return 'two_hand_heart'
    }

    if (twoHandDistance < 0.16 && first.palmOpenness > 0.48 && second.palmOpenness > 0.48) {
      return first.palmVelocity + second.palmVelocity > 0.0005 ? 'clap' : 'prayer'
    }
  }

  if (!target) {
    return 'none'
  }

  const fingers = target.fingers
  const active = activeFingerNames(target)
  const thumbIndexDistance = landmarkDistance(fingers.thumb.tip, fingers.index.tip)

  if (target.fist) {
    if (target.palmVelocity > 0.00055) {
      return 'punch'
    }

    if (Math.abs(target.rotationVelocity) > 0.0011) {
      return target.handedness === 'Left' || target.handedness === 'Right' ? 'paw_heart' : 'fist_shake'
    }

    return 'none'
  }

  if (target.palmOpenness > 0.78 && Math.abs(target.rotationVelocity) > 0.0012) {
    return 'open_wheel'
  }

  if (isOnly(active, ['thumb', 'index']) || isOnly(active, ['thumb', 'index', 'middle'])) {
    if (thumbIndexDistance < 0.075) {
      return 'finger_heart'
    }

    if (!fingers.ring.extended && !fingers.pinky.extended) {
      return 'finger_gun'
    }
  }

  if (
    thumbIndexDistance < 0.085 &&
    fingers.middle.extended &&
    fingers.ring.extended &&
    fingers.pinky.extended
  ) {
    return 'ok_orbit'
  }

  if (isOnly(active, ['index', 'middle'])) {
    return 'victory_orbit'
  }

  if (isOnly(active, ['thumb', 'pinky'])) {
    return 'call_me'
  }

  if (isOnly(active, ['thumb'])) {
    const thumbVector = {
      x: fingers.thumb.tip.x - target.palmCenter.x,
      y: fingers.thumb.tip.y - target.palmCenter.y,
    }

    return thumbVector.y > 0.03 ? 'thumbs_down' : 'thumbs_up'
  }

  if (isOnly(active, ['index'])) {
    const direction = {
      x: fingers.index.tip.x - target.palmCenter.x,
      y: fingers.index.tip.y - target.palmCenter.y,
      z: fingers.index.tip.z - target.palmCenter.z,
    }

    if (direction.z < -0.07) {
      return 'point_forward'
    }

    if (Math.abs(direction.x) > Math.abs(direction.y)) {
      return direction.x > 0 ? 'point_right' : 'point_left'
    }

    return direction.y > 0 ? 'point_down' : 'point_up'
  }

  if (target.palmOpenness > 0.68 && target.palmVelocity > 0.00045) {
    return 'push'
  }

  return topology.crossDensity > 0.12 ? 'open_wheel' : 'none'
}

function resolveHandPose(
  target: HandFingerState | null,
  topology: FingerTopology,
  visualGesture: VisualGesture,
): HandPose {
  if (!target) {
    return 'none'
  }

  if (target.fist) {
    return 'fist'
  }

  if (visualGesture === 'finger_heart' || visualGesture === 'ok_orbit') {
    return 'pinch'
  }

  if (topology.activeTips.length >= 8 && topology.normalizedArea > 0.62) {
    return 'expand'
  }

  if (target.palmOpenness > 0.64 || target.fingerSpread > 0.64) {
    return 'open'
  }

  return target.palmOpenness < 0.34 ? 'contract' : 'draw'
}

function resolveEffectIntensity(
  target: HandFingerState | null,
  topology: FingerTopology,
  visualGesture: VisualGesture,
) {
  if (!target) {
    return 0
  }

  if (visualGesture === 'punch') {
    return clamp(target.palmVelocity * 1600, 0.25, 1)
  }

  if (visualGesture === 'open_wheel' || visualGesture === 'paw_heart') {
    return clamp(Math.abs(target.rotationVelocity) * 780, 0.25, 1)
  }

  if (visualGesture === 'finger_gun') {
    return 0.72
  }

  return clamp(0.28 + topology.normalizedArea * 0.42 + topology.crossDensity * 0.3, 0, 1)
}

function activeFingerNames(hand: HandFingerState) {
  return FINGER_NAMES.filter((name) => hand.fingers[name].extended)
}

function isOnly(active: FingerName[], expected: FingerName[]) {
  return active.length === expected.length && expected.every((name) => active.includes(name))
}

function calculateFingerSpread(landmarks: Landmark[], handScale: number) {
  const tipIndexes = [4, 8, 12, 16, 20]
  let spread = 0

  for (let index = 1; index < tipIndexes.length; index += 1) {
    spread += landmarkDistance(landmarks[tipIndexes[index - 1]], landmarks[tipIndexes[index]])
  }

  return clamp(spread / (tipIndexes.length - 1) / handScale, 0, 1.5) / 1.5
}

function calculatePolygonArea(points: Landmark[]) {
  if (points.length < 3) {
    return 0
  }

  const center = averageLandmarks(points)
  const ordered = [...points].sort(
    (a, b) => Math.atan2(a.y - center.y, a.x - center.x) - Math.atan2(b.y - center.y, b.x - center.x),
  )
  let area = 0

  for (let index = 0; index < ordered.length; index += 1) {
    const next = ordered[(index + 1) % ordered.length]
    area += ordered[index].x * next.y - next.x * ordered[index].y
  }

  return Math.abs(area) * 0.5
}

function segmentIntersection(
  a: Landmark,
  b: Landmark,
  c: Landmark,
  d: Landmark,
): TopologyIntersection | null {
  const denominator = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x)

  if (Math.abs(denominator) < 0.00001) {
    return null
  }

  const t = ((a.x - c.x) * (c.y - d.y) - (a.y - c.y) * (c.x - d.x)) / denominator
  const u = -((a.x - b.x) * (a.y - c.y) - (a.y - b.y) * (a.x - c.x)) / denominator

  if (t <= 0.04 || t >= 0.96 || u <= 0.04 || u >= 0.96) {
    return null
  }

  return {
    x: a.x + t * (b.x - a.x),
    y: a.y + t * (b.y - a.y),
  }
}

function angleAt(a: Landmark, b: Landmark, c: Landmark) {
  const ab = { x: a.x - b.x, y: a.y - b.y, z: (a.z ?? 0) - (b.z ?? 0) }
  const cb = { x: c.x - b.x, y: c.y - b.y, z: (c.z ?? 0) - (b.z ?? 0) }
  const dot = ab.x * cb.x + ab.y * cb.y + ab.z * cb.z
  const abLength = Math.hypot(ab.x, ab.y, ab.z)
  const cbLength = Math.hypot(cb.x, cb.y, cb.z)

  if (abLength < 0.00001 || cbLength < 0.00001) {
    return 0
  }

  return (Math.acos(clamp(dot / (abLength * cbLength), -1, 1)) * 180) / Math.PI
}

function angleDelta(next: number, previous: number) {
  let delta = next - previous

  while (delta > Math.PI) {
    delta -= Math.PI * 2
  }

  while (delta < -Math.PI) {
    delta += Math.PI * 2
  }

  return delta
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
