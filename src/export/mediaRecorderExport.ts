type CanvasWithCapture = HTMLCanvasElement & {
  captureStream?: (frameRate?: number) => MediaStream
}

type VideoWithCapture = HTMLVideoElement & {
  captureStream?: () => MediaStream
  mozCaptureStream?: () => MediaStream
}

type RecordOptions = {
  canvas: HTMLCanvasElement
  video: HTMLVideoElement
  frameRate?: number
  onProgress?: (progress: number) => void
}

export async function recordCanvasToWebm({
  canvas,
  video,
  frameRate = 30,
  onProgress,
}: RecordOptions) {
  const canvasStream = (canvas as CanvasWithCapture).captureStream?.(frameRate)

  if (!canvasStream) {
    throw new Error('当前浏览器不支持 canvas.captureStream。')
  }

  const outputStream = new MediaStream(canvasStream.getVideoTracks())
  const videoStream = getVideoCaptureStream(video)

  videoStream?.getAudioTracks().forEach((track) => {
    outputStream.addTrack(track)
  })

  if (!window.MediaRecorder) {
    throw new Error('当前浏览器不支持 MediaRecorder。')
  }

  const mimeType = selectWebmMimeType()
  const chunks: BlobPart[] = []
  const recorder = new MediaRecorder(outputStream, mimeType ? { mimeType } : undefined)

  recorder.addEventListener('dataavailable', (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data)
    }
  })

  await seekMediaTo(video, 0)

  const blob = await new Promise<Blob>((resolve, reject) => {
    let progressTimer = 0

    const cleanup = () => {
      window.clearInterval(progressTimer)
      video.removeEventListener('ended', stopRecording)
      video.removeEventListener('error', handleError)
      outputStream.getTracks().forEach((track) => track.stop())
      videoStream?.getTracks().forEach((track) => track.stop())
    }

    const stopRecording = () => {
      if (recorder.state !== 'inactive') {
        recorder.stop()
      }
    }

    const handleError = () => {
      cleanup()
      reject(new Error('录制时视频播放失败。'))
    }

    recorder.addEventListener(
      'stop',
      () => {
        cleanup()
        resolve(new Blob(chunks, { type: mimeType || 'video/webm' }))
      },
      { once: true },
    )

    recorder.addEventListener(
      'error',
      () => {
        cleanup()
        reject(new Error('MediaRecorder 录制失败。'))
      },
      { once: true },
    )

    video.addEventListener('ended', stopRecording, { once: true })
    video.addEventListener('error', handleError, { once: true })
    recorder.start(250)
    progressTimer = window.setInterval(() => {
      onProgress?.(Math.min(1, video.currentTime / Math.max(0.001, video.duration)))
    }, 250)

    void video.play().catch((error: unknown) => {
      cleanup()
      reject(error instanceof Error ? error : new Error('视频播放失败。'))
    })
  })

  onProgress?.(1)

  return blob
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json;charset=utf-8',
  })
  downloadBlob(blob, filename)
}

function getVideoCaptureStream(video: HTMLVideoElement) {
  const videoWithCapture = video as VideoWithCapture

  return videoWithCapture.captureStream?.() ?? videoWithCapture.mozCaptureStream?.() ?? null
}

function selectWebmMimeType() {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ]

  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? ''
}

function seekMediaTo(video: HTMLVideoElement, time: number) {
  const targetTime = Math.min(Math.max(time, 0), Math.max(0, video.duration - 0.001))

  if (
    Math.abs(video.currentTime - targetTime) < 0.015 &&
    video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
  ) {
    video.pause()
    return Promise.resolve()
  }

  return new Promise<void>((resolve, reject) => {
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

    video.pause()
    video.addEventListener('seeked', handleSeeked, { once: true })
    video.addEventListener('error', handleError, { once: true })
    video.currentTime = targetTime
  })
}
