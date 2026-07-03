import { useCallback, useEffect, useRef, useState } from 'react'
import {
  attachAudioEmotions,
  createDefaultEmotion,
  summarizeEmotionTimeline,
} from '../audio/audioEmotion'
import { analyzeEmotionWithQwen, findLocalQwenModel } from '../audio/ollamaEmotion'
import {
  DEFAULT_LIQUID_CONTROLS,
  EMPTY_AUDIO_FEATURES,
  VISUAL_STYLES,
  VISUAL_STYLE_LABELS,
} from '../core/config'
import { landmarkDistance, midpoint, normalizeVector } from '../core/math'
import type {
  AudioTimelineFrame,
  DebugMetrics,
  EmotionSummary,
  GestureFrame,
  GestureSnapshot,
  HandData,
  LiquidControls,
  VideoProcessingStatus,
  VideoTimelines,
  VisualStyle,
} from '../core/types'
import { ffmpegWebmToMp4Command } from '../export/ffmpegExportGuide'
import { downloadBlob, downloadJson, recordCanvasToWebm } from '../export/mediaRecorderExport'
import { buildAudioTimeline } from '../input/audioFileInput'
import {
  createVideoObjectUrl,
  isSupportedVideoFile,
  revokeVideoObjectUrl,
  seekVideoTo,
  waitForVideoMetadata,
} from '../input/videoFileInput'
import { emptyGestureSnapshot as createEmptyGestureSnapshot, GestureEngine } from '../interaction/gestureEngine'
import { selectInteractiveHand } from '../interaction/handSelection'
import { StageCanvas, type StageCanvasHandle } from '../render/StageCanvas'
import { DebugPanel } from '../ui/DebugPanel'
import { EmotionPanel } from '../ui/EmotionPanel'
import { HandTracker } from '../vision/handTracker'

const TIMELINE_FPS = 15

export function VideoProcessMode() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const stageRef = useRef<StageCanvasHandle | null>(null)
  const trackerRef = useRef<HandTracker | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const timelinesRef = useRef<VideoTimelines | null>(null)
  const visualStyleRef = useRef<VisualStyle>('aurora')
  const statusRef = useRef<VideoProcessingStatus>('idle')
  const animationFrameRef = useRef<number | null>(null)
  const processTokenRef = useRef(0)
  const lastTimelineIndexRef = useRef(-1)
  const lastDebugUpdateRef = useRef(0)
  const gestureEngineRef = useRef(new GestureEngine())

  const [file, setFile] = useState<File | null>(null)
  const [fileName, setFileName] = useState('')
  const [status, setStatusState] = useState<VideoProcessingStatus>('idle')
  const [message, setMessage] = useState('选择一个本地 mp4 或视频文件。')
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [progress, setProgress] = useState(0)
  const [visualStyle, setVisualStyleState] = useState<VisualStyle>('aurora')
  const [liquidControls, setLiquidControls] = useState<LiquidControls>(DEFAULT_LIQUID_CONTROLS)
  const [timelines, setTimelinesState] = useState<VideoTimelines | null>(null)
  const [failedFrames, setFailedFrames] = useState(0)
  const [debugFrame, setDebugFrame] = useState<GestureFrame | null>(null)
  const [debugAudio, setDebugAudio] = useState<AudioTimelineFrame | null>(null)
  const [emotionSummary, setEmotionSummary] = useState<EmotionSummary | null>(null)
  const [qwenModel, setQwenModel] = useState<string | null>(null)
  const [qwenBusy, setQwenBusy] = useState(false)

  const setStatus = useCallback((nextStatus: VideoProcessingStatus) => {
    statusRef.current = nextStatus
    setStatusState(nextStatus)
  }, [])

  const setVisualStyle = useCallback((nextStyle: VisualStyle) => {
    visualStyleRef.current = nextStyle
    setVisualStyleState(nextStyle)

    if (nextStyle === 'liquid' || nextStyle === 'crystal') {
      setLiquidControls((controls) => ({
        ...controls,
        mode: nextStyle,
      }))
    }
  }, [])

  const setTimelines = useCallback((nextTimelines: VideoTimelines | null) => {
    timelinesRef.current = nextTimelines
    setTimelinesState(nextTimelines)
    setEmotionSummary(nextTimelines?.emotionSummary ?? null)
  }, [])

  const stopPreviewLoop = useCallback(() => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
  }, [])

  const renderCurrentVideoFrame = useCallback((now = performance.now()) => {
    const video = videoRef.current

    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return
    }

    const activeTimelines = timelinesRef.current
    const frameIndex = activeTimelines
      ? clampIndex(Math.round(video.currentTime * activeTimelines.fps), activeTimelines.gestureFrames)
      : -1
    const gestureFrame = frameIndex >= 0 ? activeTimelines?.gestureFrames[frameIndex] ?? null : null
    const previousGestureFrame =
      activeTimelines && frameIndex > 0 ? activeTimelines.gestureFrames[frameIndex - 1] : null
    const audioFrame = activeTimelines
      ? activeTimelines.audioFrames[
          clampIndex(Math.round(video.currentTime * activeTimelines.fps), activeTimelines.audioFrames)
        ] ?? null
      : null
    const isNewTimelineFrame = frameIndex !== lastTimelineIndexRef.current
    const gesture = gestureFrame
      ? buildGestureSnapshot(gestureFrame, previousGestureFrame, isNewTimelineFrame)
      : emptyGestureSnapshot()
    const targetHand = selectTargetHand(gestureFrame?.hands ?? [])

    if (frameIndex >= 0) {
      lastTimelineIndexRef.current = frameIndex
    }

    if (now - lastDebugUpdateRef.current > 120) {
      lastDebugUpdateRef.current = now
      setCurrentTime(video.currentTime)
      setDebugFrame(gestureFrame)
      setDebugAudio(audioFrame)
    }

    stageRef.current?.renderFrame({
      video,
      hands: gestureFrame?.hands ?? [],
      targetHand,
      gesture,
      audio: audioFrame ?? EMPTY_AUDIO_FEATURES,
      emotion: audioFrame?.emotion ?? createDefaultEmotion(),
      liquidControls,
      visualStyle: visualStyleRef.current,
      now,
      mirrored: false,
    })
  }, [liquidControls])

  const runPreviewLoop = useCallback(
    (now: number) => {
      renderCurrentVideoFrame(now)

      if (
        statusRef.current === 'playing' ||
        (statusRef.current === 'recording' && !videoRef.current?.ended)
      ) {
        animationFrameRef.current = window.requestAnimationFrame(runPreviewLoop)
      }
    },
    [renderCurrentVideoFrame],
  )

  const resetLoadedState = useCallback(() => {
    processTokenRef.current += 1
    stopPreviewLoop()
    videoRef.current?.pause()
    setTimelines(null)
    setProgress(0)
    setFailedFrames(0)
    setCurrentTime(0)
    setDebugFrame(null)
    setDebugAudio(null)
    setEmotionSummary(null)
    stageRef.current?.reset()
  }, [setTimelines, stopPreviewLoop])

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const nextFile = event.target.files?.[0] ?? null

      resetLoadedState()
      revokeVideoObjectUrl(objectUrlRef.current)
      objectUrlRef.current = null

      if (!nextFile) {
        setFile(null)
        setFileName('')
        setDuration(0)
        setStatus('idle')
        setMessage('选择一个本地 mp4 或视频文件。')
        return
      }

      if (!isSupportedVideoFile(nextFile)) {
        setFile(null)
        setFileName('')
        setDuration(0)
        setStatus('error')
        setMessage('请选择浏览器可播放的视频文件。')
        return
      }

      const objectUrl = createVideoObjectUrl(nextFile)
      const video = videoRef.current

      objectUrlRef.current = objectUrl
      setFile(nextFile)
      setFileName(nextFile.name)
      setStatus('loaded')
      setMessage('正在读取视频元数据。')

      if (!video) {
        setStatus('error')
        setMessage('视频元素尚未准备好。')
        return
      }

      try {
        video.src = objectUrl
        video.muted = false
        video.playsInline = true
        await waitForVideoMetadata(video)
        setDuration(video.duration)
        setMessage('视频已加载，可以生成 timeline。')
        await seekVideoTo(video, 0)
        renderCurrentVideoFrame()
      } catch (error) {
        setStatus('error')
        setMessage(toErrorMessage(error))
      }
    },
    [renderCurrentVideoFrame, resetLoadedState, setStatus],
  )

  const cancelProcessing = useCallback(() => {
    processTokenRef.current += 1
    stopPreviewLoop()
    videoRef.current?.pause()
    setProgress(0)
    setStatus(file ? 'loaded' : 'idle')
    setMessage('处理已取消。')
  }, [file, setStatus, stopPreviewLoop])

  const processVideo = useCallback(async () => {
    const video = videoRef.current
    const currentFile = file

    if (!video || !currentFile) {
      setMessage('请先上传视频。')
      return
    }

    const processToken = processTokenRef.current + 1
    processTokenRef.current = processToken
    stopPreviewLoop()
    video.pause()
    gestureEngineRef.current.reset()
    lastTimelineIndexRef.current = -1
    setTimelines(null)
    setStatus('processing')
    setProgress(0)
    setFailedFrames(0)
    setMessage('正在分析声音情绪。')

    try {
      await waitForVideoMetadata(video)
      const videoDuration = video.duration
      const audioFrames = await buildAudioFrames(currentFile, videoDuration, (audioProgress) => {
        if (processTokenRef.current === processToken) {
          setProgress(audioProgress * 0.24)
        }
      })

      if (processTokenRef.current !== processToken) {
        return
      }

      const heuristicSummary = summarizeEmotionTimeline(audioFrames)
      setEmotionSummary(heuristicSummary)
      setMessage('正在加载手势识别模型。')
      const tracker = trackerRef.current ?? (await HandTracker.create())
      trackerRef.current = tracker

      const frameCount = Math.max(1, Math.ceil(videoDuration * TIMELINE_FPS))
      const gestureFrames: GestureFrame[] = []
      const visionTimestampBase = performance.now()
      let failedFrameCount = 0

      for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
        if (processTokenRef.current !== processToken) {
          return
        }

        const time = frameIndex / TIMELINE_FPS
        let hands: HandData[] = []

        try {
          await seekVideoTo(video, time)
          hands = tracker.detect(video, visionTimestampBase + frameIndex * (1000 / TIMELINE_FPS))
        } catch {
          failedFrameCount += 1
        }

        const targetHand = selectTargetHand(hands)
        const gesture = gestureEngineRef.current.update(targetHand, time * 1000, hands)

        gestureFrames.push({
          time,
          detectedHands: hands.length,
          hands,
          pinch: gesture.pinch,
          pinchDistance: gesture.pinchDistance,
          indexTipPosition: gesture.indexTip,
          palmCenter: gesture.palmCenter,
          palmOpenness: gesture.palmOpenness,
          fingerSpread: gesture.fingerSpread,
          handScale: gesture.handScale,
          twoHandDistance: gesture.twoHandDistance,
          handPose: gesture.handPose,
          visualGesture: gesture.visualGesture,
          topology: gesture.topology,
          harmony: gesture.harmony,
        })

        if (frameIndex % 4 === 0) {
          setProgress(0.24 + (frameIndex / frameCount) * 0.76)
          setMessage(`正在识别手势 ${frameIndex + 1}/${frameCount}`)
          await nextFrame()
        }
      }

      const nextTimelines: VideoTimelines = {
        fps: TIMELINE_FPS,
        duration: videoDuration,
        gestureFrames,
        audioFrames,
        emotionSummary: heuristicSummary,
        generatedAt: new Date().toISOString(),
      }

      setTimelines(nextTimelines)
      setFailedFrames(failedFrameCount)
      setProgress(1)
      setStatus('ready')
      setMessage(
        failedFrameCount
          ? `timeline 已生成，${failedFrameCount} 帧识别失败并已容错。`
          : 'timeline 已生成，可以预览、导出或用 Qwen 细化情绪。',
      )
      await seekVideoTo(video, 0)
      lastTimelineIndexRef.current = -1
      renderCurrentVideoFrame()
    } catch (error) {
      setStatus('error')
      setMessage(toErrorMessage(error))
    }
  }, [file, renderCurrentVideoFrame, setStatus, setTimelines, stopPreviewLoop])

  const refineWithQwen = useCallback(async () => {
    const activeTimelines = timelinesRef.current

    if (!activeTimelines) {
      setMessage('请先生成 timeline。')
      return
    }

    try {
      setQwenBusy(true)
      setMessage('正在调用本地 Qwen 分析音乐情绪。')
      const refinedSummary = await analyzeEmotionWithQwen(
        activeTimelines.audioFrames,
        activeTimelines.emotionSummary,
      )
      const nextTimelines = {
        ...activeTimelines,
        emotionSummary: refinedSummary,
      }

      setTimelines(nextTimelines)
      setMessage('Qwen 情绪导演建议已更新。')
    } catch (error) {
      setMessage(`Qwen 不可用：${toErrorMessage(error)}。已保留浏览器端情绪分析。`)
    } finally {
      setQwenBusy(false)
    }
  }, [setTimelines])

  const playPreview = useCallback(async () => {
    const video = videoRef.current

    if (!video) {
      return
    }

    try {
      stopPreviewLoop()

      if (video.ended) {
        await seekVideoTo(video, 0)
      }

      lastTimelineIndexRef.current = -1
      setStatus('playing')
      await video.play()
      animationFrameRef.current = window.requestAnimationFrame(runPreviewLoop)
    } catch (error) {
      setStatus('error')
      setMessage(toErrorMessage(error))
    }
  }, [runPreviewLoop, setStatus, stopPreviewLoop])

  const pausePreview = useCallback(() => {
    videoRef.current?.pause()
    stopPreviewLoop()
    setStatus(timelinesRef.current ? 'ready' : 'loaded')
    renderCurrentVideoFrame()
  }, [renderCurrentVideoFrame, setStatus, stopPreviewLoop])

  const seekPreview = useCallback(
    async (value: number) => {
      const video = videoRef.current

      if (!video || !Number.isFinite(duration)) {
        return
      }

      try {
        video.pause()
        stopPreviewLoop()
        await seekVideoTo(video, value)
        lastTimelineIndexRef.current = -1
        setCurrentTime(value)
        setStatus(timelinesRef.current ? 'ready' : 'loaded')
        renderCurrentVideoFrame()
      } catch (error) {
        setStatus('error')
        setMessage(toErrorMessage(error))
      }
    },
    [duration, renderCurrentVideoFrame, setStatus, stopPreviewLoop],
  )

  const exportWebm = useCallback(async () => {
    const video = videoRef.current
    const canvas = stageRef.current?.getCanvas()

    if (!video || !canvas || !timelinesRef.current) {
      setMessage('请先生成 timeline。')
      return
    }

    try {
      stopPreviewLoop()
      lastTimelineIndexRef.current = -1
      setStatus('recording')
      setProgress(0)
      setMessage('正在录制 webm。')
      animationFrameRef.current = window.requestAnimationFrame(runPreviewLoop)
      const blob = await recordCanvasToWebm({
        canvas,
        video,
        onProgress: setProgress,
      })
      downloadBlob(blob, `${stripExtension(fileName || 'gesture-stage')}_processed.webm`)
      setStatus('ready')
      setMessage('webm 已导出。')
    } catch (error) {
      setStatus('error')
      setMessage(toErrorMessage(error))
    } finally {
      stopPreviewLoop()
      renderCurrentVideoFrame()
    }
  }, [fileName, renderCurrentVideoFrame, runPreviewLoop, setStatus, stopPreviewLoop])

  useEffect(() => {
    void findLocalQwenModel()
      .then(setQwenModel)
      .catch(() => setQwenModel(null))
  }, [])

  useEffect(() => {
    renderCurrentVideoFrame()
  }, [renderCurrentVideoFrame, visualStyle, timelines])

  useEffect(() => {
    return () => {
      processTokenRef.current += 1
      stopPreviewLoop()
      trackerRef.current?.close()
      revokeVideoObjectUrl(objectUrlRef.current)
    }
  }, [stopPreviewLoop])

  const debug: DebugMetrics = {
    detectedHand: Boolean(debugFrame?.detectedHands),
    handedness: selectTargetHand(debugFrame?.hands ?? [])?.handedness ?? 'None',
    pinch: debugFrame?.pinch ?? false,
    handPose: debugFrame?.handPose ?? 'none',
    visualGesture: debugFrame?.visualGesture ?? 'none',
    handOpenness: debugFrame?.palmOpenness ?? 0,
    activeFingers: debugFrame?.topology.activeTips.length ?? 0,
    topologyArea: debugFrame?.topology.normalizedArea ?? 0,
    topologyCrossings: debugFrame?.topology.intersections.length ?? 0,
    harmonyLabel: debugFrame?.harmony.label ?? '静音',
    gesturePhase: debugFrame?.visualGesture === 'none' ? 'idle' : 'hold',
    gestureConfidence: debugFrame?.visualGesture === 'none' ? 0 : 0.78,
    volume: debugAudio?.volume ?? 0,
    bass: debugAudio?.bass ?? 0,
    particleSpread: 1,
    fps: timelines?.fps ?? 0,
  }
  const processing = status === 'processing'
  const recording = status === 'recording'
  const canProcess = Boolean(file) && !processing && !recording
  const canPreview = Boolean(file) && !processing && !recording
  const canExport = Boolean(timelines) && !processing && !recording
  const activeEmotion = debugAudio?.emotion ?? createDefaultEmotion()

  return (
    <main className="app-shell">
      <section className="stage-area" aria-label="Video processing stage">
        <StageCanvas ref={stageRef} className="stage-canvas" />
        <video
          ref={videoRef}
          className="video-source"
          playsInline
          onEnded={() => {
            stopPreviewLoop()

            if (statusRef.current === 'playing') {
              setStatus('ready')
            }
          }}
        />
      </section>

      <aside className="control-panel">
        <header className="panel-header">
          <p className="eyebrow">video composition</p>
          <h1>Video Process</h1>
          <div className={`status-pill status-${status}`}>{status}</div>
        </header>

        <section className="control-block">
          <label className="file-picker">
            <span>上传视频</span>
            <input accept="video/*" type="file" onChange={handleFileChange} />
          </label>
          <p className="file-name">{fileName || '未选择文件'}</p>
          {duration > 0 ? <p className="meta-line">duration {duration.toFixed(2)}s</p> : null}
          <p className="message-line">{message}</p>
          <div className="progress-track" aria-label="Processing progress">
            <div className="progress-bar" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        </section>

        <section className="control-block">
          <div className="button-stack">
            <button className="primary-button" type="button" disabled={!canProcess} onClick={processVideo}>
              生成情绪 timeline
            </button>
            {processing ? (
              <button className="secondary-button" type="button" onClick={cancelProcessing}>
                取消处理
              </button>
            ) : null}
            <div className="button-row">
              <button className="secondary-button" type="button" disabled={!canPreview} onClick={playPreview}>
                预览
              </button>
              <button
                className="secondary-button"
                type="button"
                disabled={!canPreview}
                onClick={pausePreview}
              >
                暂停
              </button>
            </div>
          </div>
          <label className="timeline-scrubber">
            <span>
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
            <input
              type="range"
              min="0"
              max={Math.max(0.001, duration)}
              step="0.01"
              value={Math.min(currentTime, duration || 0)}
              disabled={!file || processing || recording}
              onChange={(event) => {
                void seekPreview(Number(event.currentTarget.value))
              }}
            />
          </label>
        </section>

        <section className="control-block">
          <h2>视觉</h2>
          <div className="style-grid" role="group" aria-label="Video visual style">
            {VISUAL_STYLES.map((style) => (
              <button
                className={style === visualStyle ? 'style-button active' : 'style-button'}
                key={style}
                type="button"
                onClick={() => setVisualStyle(style)}
              >
                {VISUAL_STYLE_LABELS[style]}
              </button>
            ))}
          </div>
          {(visualStyle === 'liquid' || visualStyle === 'crystal') ? (
            <div className="button-stack">
              <label className="slider-field">
                <span>
                  强度 <b>{liquidControls.intensity.toFixed(2)}</b>
                </span>
                <input
                  type="range"
                  min={0.1}
                  max={3}
                  step={0.05}
                  value={liquidControls.intensity}
                  onChange={(event) =>
                    setLiquidControls((controls) => ({
                      ...controls,
                      intensity: Number(event.currentTarget.value),
                    }))
                  }
                />
              </label>
              <label className="slider-field">
                <span>
                  半径 <b>{liquidControls.radius.toFixed(2)}</b>
                </span>
                <input
                  type="range"
                  min={0.2}
                  max={4}
                  step={0.05}
                  value={liquidControls.radius}
                  onChange={(event) =>
                    setLiquidControls((controls) => ({
                      ...controls,
                      radius: Number(event.currentTarget.value),
                    }))
                  }
                />
              </label>
              <label className="slider-field">
                <span>
                  衰减 <b>{liquidControls.decay.toFixed(3)}</b>
                </span>
                <input
                  type="range"
                  min={0.85}
                  max={0.995}
                  step={0.001}
                  value={liquidControls.decay}
                  onChange={(event) =>
                    setLiquidControls((controls) => ({
                      ...controls,
                      decay: Number(event.currentTarget.value),
                    }))
                  }
                />
              </label>
            </div>
          ) : null}
        </section>

        <section className="control-block">
          <h2>音乐情绪</h2>
          <EmotionPanel emotion={activeEmotion} summary={emotionSummary} />
          <button
            className="secondary-button full-width-button"
            type="button"
            disabled={!timelines || qwenBusy}
            onClick={refineWithQwen}
          >
            {qwenModel ? `Qwen 情绪导演 · ${qwenModel}` : '检测本地 Qwen'}
          </button>
        </section>

        <section className="control-block">
          <h2>export</h2>
          <div className="button-stack">
            <button
              className="secondary-button"
              type="button"
              disabled={!canExport}
              onClick={() =>
                timelinesRef.current &&
                downloadJson(timelinesRef.current.gestureFrames, 'gesture_timeline.json')
              }
            >
              gesture_timeline.json
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={!canExport}
              onClick={() =>
                timelinesRef.current && downloadJson(timelinesRef.current.audioFrames, 'audio_timeline.json')
              }
            >
              audio_timeline.json
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={!canExport}
              onClick={() =>
                timelinesRef.current && downloadJson(timelinesRef.current, 'gesture_stage_timeline.json')
              }
            >
              full_timeline.json
            </button>
            <button className="primary-button" type="button" disabled={!canExport} onClick={exportWebm}>
              导出 webm
            </button>
          </div>
          <code className="ffmpeg-command">{ffmpegWebmToMp4Command}</code>
        </section>

        <section className="control-block">
          <h2>debug</h2>
          <DebugPanel debug={debug} />
          {timelines ? (
            <p className="meta-line">
              frames {timelines.gestureFrames.length} · audio {timelines.audioFrames.length} · failed{' '}
              {failedFrames}
            </p>
          ) : null}
        </section>
      </aside>
    </main>
  )
}

async function buildAudioFrames(
  file: File,
  duration: number,
  onProgress: (progress: number) => void,
) {
  try {
    return await buildAudioTimeline(file, TIMELINE_FPS, onProgress)
  } catch {
    const frameCount = Math.max(1, Math.ceil(duration * TIMELINE_FPS))
    const fallbackFrames = Array.from({ length: frameCount }, (_, index) => ({
      ...EMPTY_AUDIO_FEATURES,
      time: index / TIMELINE_FPS,
    }))

    return attachAudioEmotions(fallbackFrames)
  }
}

function buildGestureSnapshot(
  frame: GestureFrame,
  previousFrame: GestureFrame | null,
  isNewTimelineFrame: boolean,
): GestureSnapshot {
  const targetHand = selectTargetHand(frame.hands)
  const previousPinch = previousFrame?.pinch ?? false
  const pinchEvent = !isNewTimelineFrame
    ? frame.pinch
      ? 'pinch_hold'
      : 'none'
    : frame.pinch && !previousPinch
      ? 'pinch_start'
      : frame.pinch
        ? 'pinch_hold'
        : previousPinch
          ? 'pinch_end'
          : 'none'
  const previousIndexTip = previousFrame?.indexTipPosition ?? null
  const indexVelocity =
    frame.indexTipPosition && previousIndexTip
      ? landmarkDistance(frame.indexTipPosition, previousIndexTip) / (1000 / TIMELINE_FPS)
      : 0
  const indexDirection = targetHand
    ? normalizeVector({
        x: targetHand.landmarks[8].x - targetHand.landmarks[5].x,
        y: targetHand.landmarks[8].y - targetHand.landmarks[5].y,
      })
    : null
  const gestureChanged = previousFrame?.visualGesture !== frame.visualGesture
  const gesturePhase =
    frame.visualGesture === 'none'
      ? 'idle'
      : isNewTimelineFrame && gestureChanged
        ? 'enter'
        : 'hold'
  const gestureState = {
    id: frame.visualGesture,
    phase: gesturePhase,
    confidence: frame.visualGesture === 'none' ? 0 : 0.78,
    intensity: frame.visualGesture === 'none' ? 0 : 0.7,
    anchor: frame.palmCenter ?? frame.indexTipPosition,
    direction: indexDirection,
    startedAt: frame.time * 1000,
    updatedAt: frame.time * 1000,
  } as const

  return {
    handCount: frame.detectedHands,
    detected: frame.detectedHands > 0,
    handedness: targetHand?.handedness ?? 'None',
    handPose: frame.handPose,
    visualGesture: frame.visualGesture,
    gestureState,
    effectIntensity: 0.7,
    pinch: frame.pinch,
    pinchDistance: frame.pinchDistance,
    pinchEvent,
    indexTip: frame.indexTipPosition,
    pinchCenter: targetHand ? midpoint(targetHand.landmarks[4], targetHand.landmarks[8]) : null,
    palmCenter: frame.palmCenter,
    palmOpenness: frame.palmOpenness,
    fingerSpread: frame.fingerSpread,
    handScale: frame.handScale,
    twoHandDistance: frame.twoHandDistance,
    handStates: [],
    topology: frame.topology,
    harmony: frame.harmony,
    indexDirection,
    indexVelocity,
  }
}

function emptyGestureSnapshot(): GestureSnapshot {
  return createEmptyGestureSnapshot()
}

function selectTargetHand(hands: HandData[]) {
  return selectInteractiveHand(hands)
}

function clampIndex<T>(index: number, items: T[]) {
  if (!items.length) {
    return -1
  }

  return Math.min(items.length - 1, Math.max(0, index))
}

function nextFrame() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve())
  })
}

function stripExtension(name: string) {
  return name.replace(/\.[^/.]+$/, '')
}

function formatTime(time: number) {
  if (!Number.isFinite(time)) {
    return '0:00'
  }

  const minutes = Math.floor(time / 60)
  const seconds = Math.floor(time % 60)

  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return '处理失败。'
}
