import { CAMERA_QUALITY_PRESETS, VISUAL_STYLES, VISUAL_STYLE_LABELS } from '../core/config'
import type {
  AudioEmotion,
  CameraQuality,
  DebugMetrics,
  ParticleControls,
  RuntimeStatus,
  VisualStyle,
} from '../core/types'
import { DebugPanel } from './DebugPanel'
import { EmotionPanel } from './EmotionPanel'
import { InteractionStatusPanel } from './InteractionStatusPanel'
import { ParticlePanel } from './ParticlePanel'

type ControlPanelProps = {
  running: boolean
  status: RuntimeStatus
  message: string
  visualStyle: VisualStyle
  cameraQuality: CameraQuality
  particleControls: ParticleControls
  debug: DebugMetrics
  emotion: AudioEmotion
  onStart: () => void
  onStop: () => void
  onVisualStyleChange: (style: VisualStyle) => void
  onCameraQualityChange: (quality: CameraQuality) => void
  onParticleControlsChange: (controls: ParticleControls) => void
}

const statusLabels: Record<RuntimeStatus, string> = {
  idle: 'idle',
  starting: 'starting',
  running: 'live',
  stopped: 'stopped',
  error: 'error',
}

export function ControlPanel({
  running,
  status,
  message,
  visualStyle,
  cameraQuality,
  particleControls,
  debug,
  emotion,
  onStart,
  onStop,
  onVisualStyleChange,
  onCameraQualityChange,
  onParticleControlsChange,
}: ControlPanelProps) {
  const starting = status === 'starting'
  const cameraOptions = Object.entries(CAMERA_QUALITY_PRESETS) as Array<
    [CameraQuality, (typeof CAMERA_QUALITY_PRESETS)[CameraQuality]]
  >

  return (
    <aside className="control-panel">
      <header className="panel-header">
        <p className="eyebrow">live performance</p>
        <h1>Gesture Stage</h1>
        <div className={`status-pill status-${status}`}>{statusLabels[status]}</div>
      </header>

      <section className="control-block">
        <div className="button-row">
          <button
            className="primary-button"
            type="button"
            onClick={onStart}
            disabled={running || starting}
          >
            启动实时
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={onStop}
            disabled={!running && !starting}
          >
            停止
          </button>
        </div>
        {message ? <p className="message-line">{message}</p> : null}
      </section>

      <section className="control-block">
        <h2>Performance</h2>
        <div className="quality-grid" role="group" aria-label="Camera quality">
          {cameraOptions.map(([quality, preset]) => (
            <button
              className={quality === cameraQuality ? 'style-button active' : 'style-button'}
              key={quality}
              type="button"
              onClick={() => onCameraQualityChange(quality)}
              disabled={running || starting}
              title={running || starting ? '停止实时模式后可切换摄像头档位' : undefined}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <p className="meta-line">
          {CAMERA_QUALITY_PRESETS[cameraQuality].width}×
          {CAMERA_QUALITY_PRESETS[cameraQuality].height} @{' '}
          {CAMERA_QUALITY_PRESETS[cameraQuality].frameRate}fps
        </p>
      </section>

      <section className="control-block">
        <h2>Interaction</h2>
        <InteractionStatusPanel debug={debug} />
      </section>

      <section className="control-block particle-block">
        <h2>粒子形态</h2>
        <ParticlePanel controls={particleControls} onChange={onParticleControlsChange} />
      </section>

      <section className="control-block">
        <h2>视觉风格</h2>
        <div className="style-grid" role="group" aria-label="Visual style">
          {VISUAL_STYLES.map((style) => (
            <button
              className={style === visualStyle ? 'style-button active' : 'style-button'}
              key={style}
              type="button"
              onClick={() => onVisualStyleChange(style)}
            >
              {VISUAL_STYLE_LABELS[style]}
            </button>
          ))}
        </div>
      </section>

      <section className="control-block">
        <h2>音乐情绪</h2>
        <EmotionPanel emotion={emotion} />
      </section>

      <section className="control-block">
        <h2>Debug</h2>
        <DebugPanel debug={debug} />
      </section>
    </aside>
  )
}
