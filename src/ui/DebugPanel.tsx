import { formatNumber } from '../core/math'
import type { DebugMetrics } from '../core/types'

type DebugPanelProps = {
  debug: DebugMetrics
}

export function DebugPanel({ debug }: DebugPanelProps) {
  return (
    <dl className="debug-grid">
      <div>
        <dt>Hand</dt>
        <dd>{debug.detectedHand ? debug.handedness : 'none'}</dd>
      </div>
      <div>
        <dt>Pose</dt>
        <dd>{debug.handPose ?? 'none'}</dd>
      </div>
      <div>
        <dt>Effect</dt>
        <dd>{debug.visualGesture ?? 'none'}</dd>
      </div>
      <div>
        <dt>Phase</dt>
        <dd>{debug.gesturePhase ?? 'idle'}</dd>
      </div>
      <div>
        <dt>Stable</dt>
        <dd>{formatNumber(debug.gestureConfidence ?? 0)}</dd>
      </div>
      <div>
        <dt>Pinch</dt>
        <dd>{debug.pinch ? 'true' : 'false'}</dd>
      </div>
      <div>
        <dt>Open</dt>
        <dd>{formatNumber(debug.handOpenness ?? 0)}</dd>
      </div>
      <div>
        <dt>Tips</dt>
        <dd>{debug.activeFingers ?? 0}</dd>
      </div>
      <div>
        <dt>Area</dt>
        <dd>{formatNumber(debug.topologyArea ?? 0)}</dd>
      </div>
      <div>
        <dt>Cross</dt>
        <dd>{debug.topologyCrossings ?? 0}</dd>
      </div>
      <div>
        <dt>Harmony</dt>
        <dd>{debug.harmonyLabel ?? 'silent'}</dd>
      </div>
      <div>
        <dt>Face</dt>
        <dd>{debug.faceIntent ?? 'none'}</dd>
      </div>
      <div>
        <dt>Mouth</dt>
        <dd>{formatNumber(debug.mouthOpen ?? 0)}</dd>
      </div>
      <div>
        <dt>Volume</dt>
        <dd>{formatNumber(debug.volume)}</dd>
      </div>
      <div>
        <dt>Bass</dt>
        <dd>{formatNumber(debug.bass)}</dd>
      </div>
      <div>
        <dt>FPS</dt>
        <dd>{Math.round(debug.fps)}</dd>
      </div>
    </dl>
  )
}
