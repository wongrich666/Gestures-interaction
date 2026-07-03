export type Handedness = 'Left' | 'Right' | 'Unknown'

export type Landmark = {
  x: number
  y: number
  z: number
}

export type Point2D = {
  x: number
  y: number
}

export type FingerName = 'thumb' | 'index' | 'middle' | 'ring' | 'pinky'

export type CameraQuality = 'low' | 'medium' | 'high'

export type CanvasRect = Point2D & {
  width: number
  height: number
}

export type HandData = {
  handedness: Handedness
  confidence: number
  landmarks: Landmark[]
}

export type FaceAnchors = {
  mouth: Landmark
  nose: Landmark
  leftEar: Landmark
  rightEar: Landmark
  leftEye: Landmark
  rightEye: Landmark
}

export type FaceData = {
  landmarks: Landmark[]
  anchors: FaceAnchors
  mouthOpen: number
  faceScale: number
}

export type FaceIntentKind = 'none' | 'listen' | 'shout'

export type FaceIntent = {
  kind: FaceIntentKind
  intensity: number
  anchor: Landmark | null
}

export type AudioFeatures = {
  volume: number
  bass: number
  mid: number
  treble: number
  beat: boolean
}

export type MusicMood =
  | 'serene'
  | 'melancholy'
  | 'euphoric'
  | 'tense'
  | 'fierce'
  | 'ethereal'

export type MoodPalette = {
  ink: string
  shadow: string
  base: string
  glow: string
  accent: string
  highlight: string
}

export type AudioEmotion = {
  mood: MusicMood
  label: string
  energy: number
  intensity: number
  warmth: number
  brightness: number
  tension: number
  motion: number
  pulse: number
  confidence: number
  palette: MoodPalette
}

export type EmotionSummary = {
  source: 'heuristic' | 'qwen'
  mood: MusicMood
  label: string
  confidence: number
  energy: number
  tension: number
  brightness: number
  warmth: number
  beatDensity: number
  keywords: string[]
  directorNote: string
}

export type GestureEvent =
  | 'none'
  | 'pinch_start'
  | 'pinch_hold'
  | 'pinch_end'

export type HandPose =
  | 'none'
  | 'open'
  | 'fist'
  | 'pinch'
  | 'draw'
  | 'expand'
  | 'contract'

export type VisualGesture =
  | 'none'
  | 'open_wheel'
  | 'punch'
  | 'fist_shake'
  | 'paw_heart'
  | 'finger_gun'
  | 'index_orbit'
  | 'victory_orbit'
  | 'ok_orbit'
  | 'finger_heart'
  | 'two_hand_heart'
  | 'clap'
  | 'thumbs_up'
  | 'thumbs_down'
  | 'call_me'
  | 'point_left'
  | 'point_right'
  | 'point_up'
  | 'point_down'
  | 'point_forward'
  | 'push'
  | 'prayer'

export type GesturePhase =
  | 'idle'
  | 'enter'
  | 'hold'
  | 'exit'

export type GestureState = {
  id: VisualGesture
  phase: GesturePhase
  confidence: number
  intensity: number
  anchor: Landmark | null
  direction: Point2D | null
  startedAt: number
  updatedAt: number
}

export type FingerState = {
  name: FingerName
  tipIndex: number
  extended: boolean
  extension: number
  curl: number
  tip: Landmark
}

export type HandFingerState = {
  handedness: Handedness
  confidence: number
  fingers: Record<FingerName, FingerState>
  activeTips: Array<{
    finger: FingerName
    handedness: Handedness
    point: Landmark
  }>
  palmCenter: Landmark
  palmOpenness: number
  fingerSpread: number
  handScale: number
  rotation: number
  rotationVelocity: number
  palmVelocity: number
  fist: boolean
}

export type TopologyPoint = {
  id: string
  finger: FingerName
  handedness: Handedness
  point: Landmark
}

export type TopologySegment = {
  from: TopologyPoint
  to: TopologyPoint
  crossHand: boolean
}

export type TopologyIntersection = {
  x: number
  y: number
}

export type FingerTopology = {
  activeTips: TopologyPoint[]
  segments: TopologySegment[]
  intersections: TopologyIntersection[]
  polygonArea: number
  normalizedArea: number
  crossDensity: number
  muted: boolean
}

export type HarmonyFamily =
  | 'silent'
  | 'major'
  | 'minor'
  | 'sus'
  | 'diminished'
  | 'augmented'
  | 'cluster'

export type PlayableHarmonyFamily = Exclude<HarmonyFamily, 'silent'>

export type HarmonyState = {
  family: HarmonyFamily
  label: string
  brightness: number
  dissonance: number
  activeNotes: number
  muted: boolean
}

export type HarmonyControlMode = 'auto' | 'sustain' | 'manual'

export type HarmonyControls = {
  mode: HarmonyControlMode
  family: PlayableHarmonyFamily
  brightness: number
  dissonance: number
  activeNotes: number
}

export type GestureSnapshot = {
  handCount: number
  detected: boolean
  handedness: Handedness | 'None'
  handPose: HandPose
  visualGesture: VisualGesture
  gestureState: GestureState
  effectIntensity: number
  pinch: boolean
  pinchDistance: number
  pinchEvent: GestureEvent
  indexTip: Landmark | null
  pinchCenter: Landmark | null
  palmCenter: Landmark | null
  palmOpenness: number
  fingerSpread: number
  handScale: number
  twoHandDistance: number | null
  handStates: HandFingerState[]
  topology: FingerTopology
  harmony: HarmonyState
  indexDirection: Point2D | null
  indexVelocity: number
}

export type VisualStyle =
  | 'normal'
  | 'binary'
  | 'mosaic'
  | 'blue_tears'
  | 'spotlight'
  | 'aurora'
  | 'ink'
  | 'pulse_grid'

export type ParticlePreset =
  | 'nebula'
  | 'heart'
  | 'sphere'
  | 'ring'
  | 'custom'

export type ParticleControls = {
  preset: ParticlePreset
  density: number
  spread: number
  color: string
  customShape: Point2D[]
}

export type RuntimeStatus =
  | 'idle'
  | 'starting'
  | 'running'
  | 'stopped'
  | 'error'

export type DebugMetrics = {
  detectedHand: boolean
  handedness: Handedness | 'None'
  pinch: boolean
  handPose?: HandPose
  visualGesture?: VisualGesture
  handOpenness?: number
  activeFingers?: number
  topologyArea?: number
  topologyCrossings?: number
  harmonyLabel?: string
  gesturePhase?: GesturePhase
  gestureConfidence?: number
  faceIntent?: FaceIntentKind
  mouthOpen?: number
  particleSpread?: number
  volume: number
  bass: number
  fps: number
}

export type AppMode = 'realtime' | 'video'

export type VideoProcessingStatus =
  | 'idle'
  | 'loaded'
  | 'processing'
  | 'ready'
  | 'playing'
  | 'recording'
  | 'error'

export type GestureFrame = {
  time: number
  detectedHands: number
  hands: HandData[]
  pinch: boolean
  pinchDistance: number
  indexTipPosition: Landmark | null
  palmCenter: Landmark | null
  palmOpenness: number
  fingerSpread: number
  handScale: number
  twoHandDistance: number | null
  handPose: HandPose
  visualGesture: VisualGesture
  topology: FingerTopology
  harmony: HarmonyState
}

export type AudioTimelineFrame = AudioFeatures & {
  time: number
  emotion: AudioEmotion
}

export type VideoTimelines = {
  fps: number
  duration: number
  gestureFrames: GestureFrame[]
  audioFrames: AudioTimelineFrame[]
  emotionSummary: EmotionSummary
  generatedAt: string
}
