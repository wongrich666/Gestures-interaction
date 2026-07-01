import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import { HAND_LANDMARKER_MODEL, MEDIAPIPE_WASM_PATH } from '../core/config'
import type { HandData, Handedness, Landmark } from '../core/types'

type MediaPipeCategory = {
  categoryName?: string
  score?: number
}

type MediaPipeHandResult = {
  landmarks?: Array<Array<{ x: number; y: number; z?: number }>>
  handednesses?: MediaPipeCategory[][]
}

export class HandTracker {
  private readonly landmarker: HandLandmarker

  private constructor(landmarker: HandLandmarker) {
    this.landmarker = landmarker
  }

  static async create() {
    const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_PATH)

    try {
      const gpuLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: HAND_LANDMARKER_MODEL,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.55,
        minHandPresenceConfidence: 0.55,
        minTrackingConfidence: 0.5,
      })

      return new HandTracker(gpuLandmarker)
    } catch {
      const cpuLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: HAND_LANDMARKER_MODEL,
          delegate: 'CPU',
        },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.55,
        minHandPresenceConfidence: 0.55,
        minTrackingConfidence: 0.5,
      })

      return new HandTracker(cpuLandmarker)
    }
  }

  detect(video: HTMLVideoElement, now: number): HandData[] {
    const result = this.landmarker.detectForVideo(video, now) as MediaPipeHandResult
    const landmarks = result.landmarks ?? []

    return landmarks.map((handLandmarks, index) => {
      const category = result.handednesses?.[index]?.[0]

      return {
        handedness: normalizeHandedness(category?.categoryName),
        confidence: category?.score ?? 0,
        landmarks: handLandmarks.map(normalizeLandmark),
      }
    })
  }

  close() {
    this.landmarker.close()
  }
}

function normalizeHandedness(value: string | undefined): Handedness {
  if (value === 'Left' || value === 'Right') {
    return value
  }

  return 'Unknown'
}

function normalizeLandmark(landmark: { x: number; y: number; z?: number }): Landmark {
  return {
    x: landmark.x,
    y: landmark.y,
    z: landmark.z ?? 0,
  }
}
