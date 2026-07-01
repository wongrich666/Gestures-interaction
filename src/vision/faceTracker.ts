import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import { FACE_LANDMARKER_MODEL, MEDIAPIPE_WASM_PATH } from '../core/config'
import { clamp, landmarkDistance, midpoint } from '../core/math'
import type { FaceData, Landmark } from '../core/types'

type MediaPipeFaceResult = {
  faceLandmarks?: Array<Array<{ x: number; y: number; z?: number }>>
}

export class FaceTracker {
  private readonly landmarker: FaceLandmarker

  private constructor(landmarker: FaceLandmarker) {
    this.landmarker = landmarker
  }

  static async create() {
    const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_PATH)

    try {
      const gpuLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: FACE_LANDMARKER_MODEL,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numFaces: 1,
        minFaceDetectionConfidence: 0.55,
        minFacePresenceConfidence: 0.55,
        minTrackingConfidence: 0.5,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
      })

      return new FaceTracker(gpuLandmarker)
    } catch {
      const cpuLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: FACE_LANDMARKER_MODEL,
          delegate: 'CPU',
        },
        runningMode: 'VIDEO',
        numFaces: 1,
        minFaceDetectionConfidence: 0.55,
        minFacePresenceConfidence: 0.55,
        minTrackingConfidence: 0.5,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
      })

      return new FaceTracker(cpuLandmarker)
    }
  }

  detect(video: HTMLVideoElement, now: number): FaceData | null {
    const result = this.landmarker.detectForVideo(video, now) as MediaPipeFaceResult
    const landmarks = result.faceLandmarks?.[0]?.map(normalizeLandmark)

    if (!landmarks?.length) {
      return null
    }

    const leftEar = landmarks[234] ?? landmarks[127] ?? landmarks[0]
    const rightEar = landmarks[454] ?? landmarks[356] ?? landmarks[0]
    const leftEye = midpoint(landmarks[33] ?? landmarks[0], landmarks[133] ?? landmarks[0])
    const rightEye = midpoint(landmarks[263] ?? landmarks[0], landmarks[362] ?? landmarks[0])
    const mouth = midpoint(landmarks[13] ?? landmarks[0], landmarks[14] ?? landmarks[0])
    const nose = landmarks[1] ?? landmarks[4] ?? landmarks[0]
    const faceScale = Math.max(0.0001, landmarkDistance(leftEar, rightEar))
    const mouthOpen = clamp(landmarkDistance(landmarks[13] ?? mouth, landmarks[14] ?? mouth) / faceScale * 4.8, 0, 1)

    return {
      landmarks,
      anchors: {
        mouth,
        nose,
        leftEar,
        rightEar,
        leftEye,
        rightEye,
      },
      mouthOpen,
      faceScale,
    }
  }

  close() {
    this.landmarker.close()
  }
}

function normalizeLandmark(landmark: { x: number; y: number; z?: number }): Landmark {
  return {
    x: landmark.x,
    y: landmark.y,
    z: landmark.z ?? 0,
  }
}
