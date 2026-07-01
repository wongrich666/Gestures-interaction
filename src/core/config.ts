import type {
  AudioFeatures,
  CameraQuality,
  ParticleControls,
  ParticlePreset,
  VisualStyle,
} from './types'

export const MEDIAPIPE_WASM_PATH =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'

export const HAND_LANDMARKER_MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task'

export const FACE_LANDMARKER_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task'

export const DEFAULT_CAMERA_QUALITY: CameraQuality = 'medium'

export const CAMERA_QUALITY_PRESETS: Record<
  CameraQuality,
  { label: string; width: number; height: number; frameRate: number }
> = {
  low: { label: 'Low', width: 640, height: 360, frameRate: 24 },
  medium: { label: 'Medium', width: 960, height: 540, frameRate: 30 },
  high: { label: 'High', width: 1280, height: 720, frameRate: 30 },
}

export const PINCH_THRESHOLD = 0.055
export const PINCH_DEBOUNCE_MS = 250
export const TRAIL_MIN_DISTANCE = 0.008

export const DEFAULT_PARTICLE_CONTROLS: ParticleControls = {
  preset: 'nebula',
  density: 360,
  spread: 1,
  color: '#5ee4ff',
  customShape: [],
}

export const PARTICLE_PRESETS: ParticlePreset[] = ['nebula', 'heart', 'sphere', 'ring', 'custom']

export const PARTICLE_PRESET_LABELS: Record<ParticlePreset, string> = {
  nebula: '星云',
  heart: '爱心',
  sphere: '星球',
  ring: '星环',
  custom: '手绘',
}

export const EMPTY_AUDIO_FEATURES: AudioFeatures = {
  volume: 0,
  bass: 0,
  mid: 0,
  treble: 0,
  beat: false,
}

export const VISUAL_STYLES: VisualStyle[] = [
  'normal',
  'binary',
  'mosaic',
  'blue_tears',
  'spotlight',
  'aurora',
  'ink',
  'pulse_grid',
]

export const VISUAL_STYLE_LABELS: Record<VisualStyle, string> = {
  normal: '原片',
  binary: '二值',
  mosaic: '马赛克',
  blue_tears: '蓝眼泪',
  spotlight: '聚光',
  aurora: '情绪光场',
  ink: '墨迹',
  pulse_grid: '节拍网格',
}

export const HAND_CONNECTIONS: Array<readonly [number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [0, 17],
]
