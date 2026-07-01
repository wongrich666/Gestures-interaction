export function isSupportedVideoFile(file: File) {
  return file.type.startsWith('video/')
}

export function createVideoObjectUrl(file: File) {
  return URL.createObjectURL(file)
}

export function revokeVideoObjectUrl(url: string | null) {
  if (url) {
    URL.revokeObjectURL(url)
  }
}

export async function waitForVideoMetadata(video: HTMLVideoElement) {
  if (Number.isFinite(video.duration) && video.videoWidth > 0) {
    return
  }

  await new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      cleanup()
      reject(new Error('视频元数据加载超时。'))
    }, 15_000)

    const cleanup = () => {
      window.clearTimeout(timeoutId)
      video.removeEventListener('loadedmetadata', handleLoaded)
      video.removeEventListener('error', handleError)
    }

    const handleLoaded = () => {
      cleanup()
      resolve()
    }

    const handleError = () => {
      cleanup()
      reject(new Error('视频文件加载失败。'))
    }

    video.addEventListener('loadedmetadata', handleLoaded, { once: true })
    video.addEventListener('error', handleError, { once: true })
  })
}

export async function seekVideoTo(video: HTMLVideoElement, time: number) {
  const targetTime = Math.min(Math.max(time, 0), Math.max(0, video.duration - 0.001))

  if (
    Math.abs(video.currentTime - targetTime) < 0.015 &&
    video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
  ) {
    return
  }

  await new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      cleanup()
      reject(new Error('视频 seek 超时。'))
    }, 8_000)

    const cleanup = () => {
      window.clearTimeout(timeoutId)
      video.removeEventListener('seeked', handleSeeked)
      video.removeEventListener('error', handleError)
    }

    const handleSeeked = () => {
      cleanup()
      resolve()
    }

    const handleError = () => {
      cleanup()
      reject(new Error('视频 seek 失败。'))
    }

    video.addEventListener('seeked', handleSeeked, { once: true })
    video.addEventListener('error', handleError, { once: true })
    video.currentTime = targetTime
  })
}
