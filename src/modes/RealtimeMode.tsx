import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'
import { createDefaultEmotion, inferAudioEmotion } from '../audio/audioEmotion'
import { TopologySynthEngine } from '../audio/synthEngine'
import {
  DEFAULT_CAMERA_QUALITY,
  DEFAULT_HARMONY_CONTROLS,
  DEFAULT_PARTICLE_CONTROLS,
  EMPTY_AUDIO_FEATURES,
  HARMONY_FAMILY_LABELS,
} from '../core/config'
import type {
  AudioEmotion,
  AudioFeatures,
  CameraQuality,
  DebugMetrics,
  FaceData,
  FaceIntent,
  FingerTopology,
  HandData,
  HarmonyControls,
  HarmonyState,
  ParticleControls,
  RuntimeStatus,
  VisualStyle,
} from '../core/types'
import { MicAudioAnalyser } from '../audio/audioAnalyser'
import { requestCameraStream, stopMediaStream, waitForVideoReady } from '../input/cameraInput'
import { requestMicStream } from '../input/micInput'
import { analyzeFaceIntent } from '../interaction/faceIntentEngine'
import { emptyGestureSnapshot, GestureEngine } from '../interaction/gestureEngine'
import { selectInteractiveHand } from '../interaction/handSelection'
import { HandTracker } from '../vision/handTracker'
import { FaceTracker } from '../vision/faceTracker'
import { StageCanvas, type StageCanvasHandle } from '../render/StageCanvas'
import { ControlPanel } from '../ui/ControlPanel'

const initialDebug: DebugMetrics = {
  detectedHand: false,
  handedness: 'None',
  pinch: false,
  handPose: 'none',
  visualGesture: 'none',
  handOpenness: 0,
  activeFingers: 0,
  topologyArea: 0,
  topologyCrossings: 0,
  harmonyLabel: '静音',
  gesturePhase: 'idle',
  gestureConfidence: 0,
  faceIntent: 'none',
  mouthOpen: 0,
  particleSpread: DEFAULT_PARTICLE_CONTROLS.spread,
  volume: 0,
  bass: 0,
  fps: 0,
}

const DEFAULT_SYNTH_VOLUME = 0.72

export function RealtimeMode() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const stageRef = useRef<StageCanvasHandle | null>(null)
  const trackerRef = useRef<HandTracker | null>(null)
  const faceTrackerRef = useRef<FaceTracker | null>(null)
  const audioAnalyserRef = useRef<MicAudioAnalyser | null>(null)
  const synthRef = useRef<TopologySynthEngine | null>(null)
  const cameraStreamRef = useRef<MediaStream | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const autoStartRef = useRef(false)
  const runningRef = useRef(false)
  const visualStyleRef = useRef<VisualStyle>('normal')
  const cameraQualityRef = useRef<CameraQuality>(DEFAULT_CAMERA_QUALITY)
  const synthVolumeRef = useRef(DEFAULT_SYNTH_VOLUME)
  const harmonyControlsRef = useRef<HarmonyControls>(DEFAULT_HARMONY_CONTROLS)
  const lastPlayableHarmonyRef = useRef<HarmonyState | null>(null)
  const particleControlsRef = useRef<ParticleControls>(DEFAULT_PARTICLE_CONTROLS)
  const emotionRef = useRef<AudioEmotion>(createDefaultEmotion())
  const gestureEngineRef = useRef(new GestureEngine())
  const debugTickRef = useRef({ lastUpdate: 0, lastFpsTime: 0, frames: 0, fps: 0 })
  const lastVisionErrorRef = useRef(0)
  const visionTickRef = useRef({ lastDetect: 0, hands: [] as HandData[] })
  const faceTickRef = useRef({ lastDetect: 0, face: null as FaceData | null })
  const faceIntentRef = useRef<FaceIntent>({ kind: 'none', intensity: 0, anchor: null })

  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState<RuntimeStatus>('idle')
  const [message, setMessage] = useState('')
  const [visualStyle, setVisualStyle] = useState<VisualStyle>('normal')
  const [cameraQuality, setCameraQuality] = useState<CameraQuality>(DEFAULT_CAMERA_QUALITY)
  const [synthVolume, setSynthVolume] = useState(DEFAULT_SYNTH_VOLUME)
  const [harmonyControls, setHarmonyControls] = useState<HarmonyControls>(
    DEFAULT_HARMONY_CONTROLS,
  )
  const [particleControls, setParticleControls] = useState<ParticleControls>(
    DEFAULT_PARTICLE_CONTROLS,
  )
  const [emotion, setEmotion] = useState<AudioEmotion>(createDefaultEmotion())
  const [debug, setDebug] = useState<DebugMetrics>(initialDebug)

  useEffect(() => {
    visualStyleRef.current = visualStyle
  }, [visualStyle])

  useEffect(() => {
    cameraQualityRef.current = cameraQuality
  }, [cameraQuality])

  useEffect(() => {
    synthVolumeRef.current = synthVolume
    synthRef.current?.setVolume(synthVolume)
  }, [synthVolume])

  useEffect(() => {
    harmonyControlsRef.current = harmonyControls
  }, [harmonyControls])

  useEffect(() => {
    particleControlsRef.current = particleControls
  }, [particleControls])

  const releaseResources = useCallback(() => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    trackerRef.current?.close()
    trackerRef.current = null
    faceTrackerRef.current?.close()
    faceTrackerRef.current = null
    audioAnalyserRef.current?.close()
    audioAnalyserRef.current = null
    synthRef.current?.close()
    synthRef.current = null
    stopMediaStream(cameraStreamRef.current)
    stopMediaStream(micStreamRef.current)
    cameraStreamRef.current = null
    micStreamRef.current = null

    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.srcObject = null
    }
  }, [])

  const stopRealtime = useCallback(() => {
    runningRef.current = false
    releaseResources()
    gestureEngineRef.current.reset()
    stageRef.current?.reset()
    emotionRef.current = createDefaultEmotion()
    lastPlayableHarmonyRef.current = null
    faceTickRef.current = { lastDetect: 0, face: null }
    faceIntentRef.current = { kind: 'none', intensity: 0, anchor: null }
    setEmotion(emotionRef.current)
    setRunning(false)
    setStatus('stopped')
    setMessage('')
    setDebug(initialDebug)
  }, [releaseResources])

  const updateDebug = useCallback(
    (
      now: number,
      targetHand: HandData | null,
      audio: AudioFeatures,
      nextEmotion: AudioEmotion,
      gesture: ReturnType<GestureEngine['update']>,
      playbackHarmony: HarmonyState,
      face: FaceData | null,
      faceIntent: FaceIntent,
    ) => {
      const fpsState = debugTickRef.current
      fpsState.frames += 1

      if (!fpsState.lastFpsTime) {
        fpsState.lastFpsTime = now
      }

      if (now - fpsState.lastFpsTime >= 500) {
        fpsState.fps = (fpsState.frames * 1000) / (now - fpsState.lastFpsTime)
        fpsState.frames = 0
        fpsState.lastFpsTime = now
      }

      if (now - fpsState.lastUpdate < 120) {
        return
      }

      fpsState.lastUpdate = now
      setEmotion(nextEmotion)
      setDebug({
        detectedHand: Boolean(targetHand),
        handedness: targetHand?.handedness ?? 'None',
        pinch: gesture.pinch,
        handPose: gesture.handPose,
        visualGesture: gesture.visualGesture,
        handOpenness: gesture.palmOpenness,
        activeFingers: gesture.topology.activeTips.length,
        topologyArea: gesture.topology.normalizedArea,
        topologyCrossings: gesture.topology.intersections.length,
        harmonyLabel: playbackHarmony.label,
        gesturePhase: gesture.gestureState.phase,
        gestureConfidence: gesture.gestureState.confidence,
        faceIntent: faceIntent.kind,
        mouthOpen: face?.mouthOpen ?? 0,
        particleSpread: particleControlsRef.current.spread,
        volume: audio.volume,
        bass: audio.bass,
        fps: fpsState.fps,
      })
    },
    [],
  )

  const renderLoop = useCallback(
    (now: number) => {
      if (!runningRef.current) {
        return
      }

      const video = videoRef.current
      const tracker = trackerRef.current
      const faceTracker = faceTrackerRef.current
      const audioAnalyser = audioAnalyserRef.current
      const synth = synthRef.current
      let hands: HandData[] = []
      let audio = EMPTY_AUDIO_FEATURES

      if (audioAnalyser) {
        audio = audioAnalyser.getFeatures(now)
      }

      const nextEmotion = inferAudioEmotion(audio, emotionRef.current, 0.16)
      emotionRef.current = nextEmotion

      if (
        video &&
        tracker &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        now - visionTickRef.current.lastDetect >= 41
      ) {
        try {
          visionTickRef.current.hands = tracker.detect(video, now)
          visionTickRef.current.lastDetect = now
        } catch (error) {
          if (now - lastVisionErrorRef.current > 2000) {
            lastVisionErrorRef.current = now
            setMessage(`hand tracker: ${toErrorMessage(error)}`)
          }
        }
      }

      hands = visionTickRef.current.hands
      if (
        video &&
        faceTracker &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        now - faceTickRef.current.lastDetect >= 100
      ) {
        try {
          faceTickRef.current.face = faceTracker.detect(video, now)
          faceTickRef.current.lastDetect = now
        } catch (error) {
          faceTickRef.current.face = null
          faceTickRef.current.lastDetect = now

          if (now - lastVisionErrorRef.current > 2000) {
            lastVisionErrorRef.current = now
            setMessage(`face tracker: ${toErrorMessage(error)}`)
          }
        }
      }

      const face = faceTickRef.current.face
      const targetHand = selectTargetHand(hands)
      const gesture = video ? gestureEngineRef.current.update(targetHand, now, hands) : emptyGestureSnapshot()
      const faceIntent = analyzeFaceIntent(hands, face)
      faceIntentRef.current = faceIntent
      const playback = resolvePlaybackHarmony(
        gesture.harmony,
        gesture.topology,
        harmonyControlsRef.current,
        lastPlayableHarmonyRef,
      )
      synth?.update(playback.harmony, playback.topology, now)

      if (video) {
        stageRef.current?.renderFrame({
          video,
          hands,
          targetHand,
          gesture,
          audio,
          emotion: nextEmotion,
          face,
          faceIntent,
          particleControls: particleControlsRef.current,
          visualStyle: visualStyleRef.current,
          now,
        })
      }

      updateDebug(now, targetHand, audio, nextEmotion, gesture, playback.harmony, face, faceIntent)
      animationFrameRef.current = window.requestAnimationFrame(renderLoop)
    },
    [updateDebug],
  )

  const startRealtime = useCallback(async () => {
    if (runningRef.current || status === 'starting') {
      return
    }

    setStatus('starting')
    setMessage('正在请求摄像头')

    try {
      const cameraStream = await requestCameraStream(cameraQualityRef.current)
      let micStream: MediaStream | null = null

      try {
        micStream = await requestMicStream()
      } catch (error) {
        console.warn('Microphone unavailable; continuing with camera-only mode.', error)
      }

      cameraStreamRef.current = cameraStream
      micStreamRef.current = micStream

      const video = videoRef.current

      if (!video) {
        throw new Error('video element is not ready')
      }

      video.srcObject = cameraStream
      video.muted = true
      video.playsInline = true
      await video.play()
      await waitForVideoReady(video)

      setMessage('正在加载手部识别')
      const tracker = await HandTracker.create()
      setMessage('正在加载五官锚点')
      let faceTracker: FaceTracker | null = null

      try {
        faceTracker = await FaceTracker.create()
      } catch (error) {
        console.warn('Face tracker unavailable; continuing without face anchors.', error)
      }

      let audioAnalyser: MicAudioAnalyser | null = null
      const synth = new TopologySynthEngine()
      synth.setVolume(synthVolumeRef.current)

      if (micStream) {
        audioAnalyser = new MicAudioAnalyser(micStream)
        await audioAnalyser.resume()
      }

      await synth.resume()

      trackerRef.current = tracker
      faceTrackerRef.current = faceTracker
      audioAnalyserRef.current = audioAnalyser
      synthRef.current = synth
      gestureEngineRef.current.reset()
      visionTickRef.current = { lastDetect: 0, hands: [] }
      lastPlayableHarmonyRef.current = null
      faceTickRef.current = { lastDetect: 0, face: null }
      faceIntentRef.current = { kind: 'none', intensity: 0, anchor: null }
      emotionRef.current = createDefaultEmotion()
      setEmotion(emotionRef.current)
      debugTickRef.current = { lastUpdate: 0, lastFpsTime: 0, frames: 0, fps: 0 }
      runningRef.current = true
      setRunning(true)
      setStatus('running')
      setMessage('')
      animationFrameRef.current = window.requestAnimationFrame(renderLoop)
    } catch (error) {
      runningRef.current = false
      releaseResources()
      setRunning(false)
      setStatus('error')
      setMessage(toErrorMessage(error))
      setDebug(initialDebug)
    }
  }, [releaseResources, renderLoop, status])

  useEffect(() => {
    if (autoStartRef.current) {
      return
    }

    autoStartRef.current = true
    const timeoutId = window.setTimeout(() => {
      void startRealtime()
    }, 250)

    return () => window.clearTimeout(timeoutId)
  }, [startRealtime])

  useEffect(() => {
    return () => {
      runningRef.current = false
      releaseResources()
    }
  }, [releaseResources])

  return (
    <main className="app-shell">
      <section className="stage-area" aria-label="Realtime stage">
        <StageCanvas ref={stageRef} className="stage-canvas" />
        <video ref={videoRef} className="camera-feed" playsInline muted />
      </section>
      <ControlPanel
        running={running}
        status={status}
        message={message}
        visualStyle={visualStyle}
        cameraQuality={cameraQuality}
        synthVolume={synthVolume}
        harmonyControls={harmonyControls}
        debug={debug}
        emotion={emotion}
        particleControls={particleControls}
        onStart={startRealtime}
        onStop={stopRealtime}
        onVisualStyleChange={setVisualStyle}
        onCameraQualityChange={setCameraQuality}
        onSynthVolumeChange={setSynthVolume}
        onHarmonyControlsChange={setHarmonyControls}
        onParticleControlsChange={setParticleControls}
      />
    </main>
  )
}

function selectTargetHand(hands: HandData[]) {
  return selectInteractiveHand(hands)
}

function resolvePlaybackHarmony(
  harmony: HarmonyState,
  topology: FingerTopology,
  controls: HarmonyControls,
  lastPlayableHarmonyRef: MutableRefObject<HarmonyState | null>,
) {
  if (controls.mode === 'auto') {
    if (!harmony.muted) {
      lastPlayableHarmonyRef.current = harmony
    }

    return { harmony, topology }
  }

  if (controls.mode === 'sustain' && !harmony.muted) {
    lastPlayableHarmonyRef.current = harmony
    return { harmony, topology }
  }

  const fallbackHarmony =
    controls.mode === 'manual'
      ? createManualHarmony(controls)
      : lastPlayableHarmonyRef.current ?? createManualHarmony(controls)
  const playbackTopology = createPlaybackTopology(topology, fallbackHarmony)

  return {
    harmony: fallbackHarmony,
    topology: playbackTopology,
  }
}

function createManualHarmony(controls: HarmonyControls): HarmonyState {
  return {
    family: controls.family,
    label: `手动 · ${HARMONY_FAMILY_LABELS[controls.family]}`,
    brightness: controls.brightness,
    dissonance: controls.dissonance,
    activeNotes: controls.activeNotes,
    muted: false,
  }
}

function createPlaybackTopology(topology: FingerTopology, harmony: HarmonyState): FingerTopology {
  return {
    ...topology,
    normalizedArea: harmony.brightness,
    crossDensity: harmony.dissonance,
    muted: false,
  }
}

function toErrorMessage(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') {
      return '摄像头或麦克风权限被拒绝。'
    }

    if (error.name === 'NotFoundError') {
      return '没有找到可用摄像头或麦克风。'
    }

    if (error.name === 'NotReadableError') {
      return '摄像头或麦克风正在被其他应用占用。'
    }

    return `${error.name}: ${error.message}`
  }

  if (error instanceof Error) {
    return error.message
  }

  return '启动失败。'
}
