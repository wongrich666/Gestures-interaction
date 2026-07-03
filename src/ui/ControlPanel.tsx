import {
  CAMERA_QUALITY_PRESETS,
  HARMONY_CONTROL_MODES,
  HARMONY_FAMILY_LABELS,
  HARMONY_MODE_LABELS,
  PLAYABLE_HARMONY_FAMILIES,
  VISUAL_STYLES,
  VISUAL_STYLE_LABELS,
} from '../core/config'
import type {
  AudioEmotion,
  CameraQuality,
  DebugMetrics,
  HarmonyControls,
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
  synthVolume: number
  harmonyControls: HarmonyControls
  particleControls: ParticleControls
  debug: DebugMetrics
  emotion: AudioEmotion
  onStart: () => void
  onStop: () => void
  onVisualStyleChange: (style: VisualStyle) => void
  onCameraQualityChange: (quality: CameraQuality) => void
  onSynthVolumeChange: (volume: number) => void
  onHarmonyControlsChange: (controls: HarmonyControls) => void
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
  synthVolume,
  harmonyControls,
  particleControls,
  debug,
  emotion,
  onStart,
  onStop,
  onVisualStyleChange,
  onCameraQualityChange,
  onSynthVolumeChange,
  onHarmonyControlsChange,
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

      <section className="control-block">
        <h2>声音</h2>
        <div className="quality-grid" role="group" aria-label="Harmony mode">
          {HARMONY_CONTROL_MODES.map((mode) => (
            <button
              className={mode === harmonyControls.mode ? 'style-button active' : 'style-button'}
              key={mode}
              type="button"
              onClick={() => onHarmonyControlsChange({ ...harmonyControls, mode })}
            >
              {HARMONY_MODE_LABELS[mode]}
            </button>
          ))}
        </div>
        <p className="meta-line">
          {harmonyControls.mode === 'auto'
            ? '由指尖拓扑自动决定和声，手势不足时静音。'
            : harmonyControls.mode === 'sustain'
              ? '手势不足时保留上一次非静音和声。'
              : '直接使用下面选择的和声，不受当前静音状态限制。'}
        </p>
        <div className="style-grid" role="group" aria-label="Manual harmony family">
          {PLAYABLE_HARMONY_FAMILIES.map((family) => (
            <button
              className={family === harmonyControls.family ? 'style-button active' : 'style-button'}
              disabled={harmonyControls.mode !== 'manual'}
              key={family}
              type="button"
              onClick={() => onHarmonyControlsChange({ ...harmonyControls, family })}
              title={harmonyControls.mode !== 'manual' ? '切到手动模式后可选择和声' : undefined}
            >
              {HARMONY_FAMILY_LABELS[family]}
            </button>
          ))}
        </div>
        <label className="slider-field">
          <span>
            手动亮度 <b>{Math.round(harmonyControls.brightness * 100)}%</b>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            disabled={harmonyControls.mode !== 'manual'}
            value={Math.round(harmonyControls.brightness * 100)}
            onChange={(event) =>
              onHarmonyControlsChange({
                ...harmonyControls,
                brightness: Number(event.currentTarget.value) / 100,
              })
            }
          />
        </label>
        <label className="slider-field">
          <span>
            手动张力 <b>{Math.round(harmonyControls.dissonance * 100)}%</b>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            disabled={harmonyControls.mode !== 'manual'}
            value={Math.round(harmonyControls.dissonance * 100)}
            onChange={(event) =>
              onHarmonyControlsChange({
                ...harmonyControls,
                dissonance: Number(event.currentTarget.value) / 100,
              })
            }
          />
        </label>
        <label className="slider-field">
          <span>
            手动声部 <b>{harmonyControls.activeNotes}</b>
          </span>
          <input
            type="range"
            min={2}
            max={5}
            step={1}
            disabled={harmonyControls.mode !== 'manual'}
            value={harmonyControls.activeNotes}
            onChange={(event) =>
              onHarmonyControlsChange({
                ...harmonyControls,
                activeNotes: Number(event.currentTarget.value),
              })
            }
          />
        </label>
        <label className="slider-field">
          <span>
            和声音量 <b>{Math.round(synthVolume * 100)}%</b>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(synthVolume * 100)}
            onChange={(event) => onSynthVolumeChange(Number(event.currentTarget.value) / 100)}
          />
        </label>
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
