import { useCallback, useEffect, useRef, useState } from 'react'
import { createDefaultEmotion, inferAudioEmotion } from '../audio/audioEmotion'
import { TopologySynthEngine } from '../audio/synthEngine'
import { DEFAULT_PARTICLE_CONTROLS, EMPTY_AUDIO_FEATURES } from '../core/config'
import type {
  AudioEmotion,
  AudioFeatures,
  DebugMetrics,
  HandData,
  ParticleControls,
  RuntimeStatus,
  VisualStyle,
} from '../core/types'
import { MicAudioAnalyser } from '../audio/audioAnalyser'
import { requestCameraStream, stopMediaStream, waitForVideoReady } from '../input/cameraInput'
import { requestMicStream } from '../input/micInput'
import { emptyGestureSnapshot, GestureEngine } from '../interaction/gestureEngine'
import { HandTracker } from '../vision/handTracker'
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
  particleSpread: DEFAULT_PARTICLE_CONTROLS.spread,
  volume: 0,
  bass: 0,
  fps: 0,
}

export function RealtimeMode() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const stageRef = useRef<StageCanvasHandle | null>(null)
  const trackerRef = useRef<HandTracker | null>(null)
  const audioAnalyserRef = useRef<MicAudioAnalyser | null>(null)
  const synthRef = useRef<TopologySynthEngine | null>(null)
  const cameraStreamRef = useRef<MediaStream | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const runningRef = useRef(false)
  const visualStyleRef = useRef<VisualStyle>('normal')
  const particleControlsRef = useRef<ParticleControls>(DEFAULT_PARTICLE_CONTROLS)
  const emotionRef = useRef<AudioEmotion>(createDefaultEmotion())
  const gestureEngineRef = useRef(new GestureEngine())
  const debugTickRef = useRef({ lastUpdate: 0, lastFpsTime: 0, frames: 0, fps: 0 })
  const lastVisionErrorRef = useRef(0)
  const visionTickRef = useRef({ lastDetect: 0, hands: [] as HandData[] })

  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState<RuntimeStatus>('idle')
  const [message, setMessage] = useState('')
  const [visualStyle, setVisualStyle] = useState<VisualStyle>('normal')
  const [particleControls, setParticleControls] = useState<ParticleControls>(
    DEFAULT_PARTICLE_CONTROLS,
  )
  const [emotion, setEmotion] = useState<AudioEmotion>(createDefaultEmotion())
  const [debug, setDebug] = useState<DebugMetrics>(initialDebug)

  useEffect(() => {
    visualStyleRef.current = visualStyle
  }, [visualStyle])

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
        harmonyLabel: gesture.harmony.label,
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
      const targetHand = selectTargetHand(hands)
      const gesture = video ? gestureEngineRef.current.update(targetHand, now, hands) : emptyGestureSnapshot()
      synth?.update(gesture.harmony, gesture.topology, now)

      if (video) {
        stageRef.current?.renderFrame({
          video,
          hands,
          targetHand,
          gesture,
          audio,
          emotion: nextEmotion,
          particleControls: particleControlsRef.current,
          visualStyle: visualStyleRef.current,
          now,
        })
      }

      updateDebug(now, targetHand, audio, nextEmotion, gesture)
      animationFrameRef.current = window.requestAnimationFrame(renderLoop)
    },
    [updateDebug],
  )

  const startRealtime = useCallback(async () => {
    if (runningRef.current || status === 'starting') {
      return
    }

    setStatus('starting')
    setMessage('requesting camera and microphone')

    try {
      const [cameraStream, micStream] = await Promise.all([
        requestCameraStream(),
        requestMicStream(),
      ])
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

      setMessage('loading hand tracker')
      const tracker = await HandTracker.create()
      const audioAnalyser = new MicAudioAnalyser(micStream)
      const synth = new TopologySynthEngine()
      await audioAnalyser.resume()
      await synth.resume()

      trackerRef.current = tracker
      audioAnalyserRef.current = audioAnalyser
      synthRef.current = synth
      gestureEngineRef.current.reset()
      visionTickRef.current = { lastDetect: 0, hands: [] }
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
        debug={debug}
        emotion={emotion}
        particleControls={particleControls}
        onStart={startRealtime}
        onStop={stopRealtime}
        onVisualStyleChange={setVisualStyle}
        onParticleControlsChange={setParticleControls}
      />
    </main>
  )
}

function selectTargetHand(hands: HandData[]) {
  return hands.find((hand) => hand.handedness === 'Right') ?? hands[0] ?? null
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
