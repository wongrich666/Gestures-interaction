import { CAMERA_QUALITY_PRESETS, DEFAULT_CAMERA_QUALITY } from '../core/config'
import type { CameraQuality } from '../core/types'

export async function requestCameraStream(quality: CameraQuality = DEFAULT_CAMERA_QUALITY) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('当前浏览器不支持摄像头访问。')
  }

  const preset = CAMERA_QUALITY_PRESETS[quality]

  return navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: preset.width },
      height: { ideal: preset.height },
      facingMode: 'user',
      frameRate: { ideal: preset.frameRate, max: preset.frameRate },
    },
    audio: false,
  })
}

export function stopMediaStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => {
    track.stop()
  })
}

export async function waitForVideoReady(video: HTMLVideoElement) {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA && video.videoWidth) {
    return
  }

  await new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      cleanup()
      reject(new Error('摄像头画面加载超时。'))
    }, 10_000)

    const cleanup = () => {
      window.clearTimeout(timeoutId)
      video.removeEventListener('loadedmetadata', handleReady)
      video.removeEventListener('error', handleError)
    }

    const handleReady = () => {
      cleanup()
      resolve()
    }

    const handleError = () => {
      cleanup()
      reject(new Error('摄像头画面加载失败。'))
    }

    video.addEventListener('loadedmetadata', handleReady, { once: true })
    video.addEventListener('error', handleError, { once: true })
  })
}
