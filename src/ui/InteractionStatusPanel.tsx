import { formatNumber } from '../core/math'
import type { DebugMetrics } from '../core/types'

type InteractionStatusPanelProps = {
  debug: DebugMetrics
}

export function InteractionStatusPanel({ debug }: InteractionStatusPanelProps) {
  return (
    <div className="interaction-status">
      <div className="status-row">
        <span>手势特效</span>
        <strong>
          {debug.visualGesture ?? 'none'}
          {debug.gesturePhase ? ` · ${debug.gesturePhase}` : ''}
        </strong>
      </div>
      <div className="status-row">
        <span>和声映射</span>
        <strong>{debug.harmonyLabel ?? 'silent'}</strong>
      </div>
      <div className="metric-strip">
        <div>
          <span>指尖</span>
          <b>{debug.activeFingers ?? 0}</b>
        </div>
        <div>
          <span>面积</span>
          <b>{formatNumber(debug.topologyArea ?? 0)}</b>
        </div>
        <div>
          <span>交叉</span>
          <b>{debug.topologyCrossings ?? 0}</b>
        </div>
        <div>
          <span>稳定</span>
          <b>{formatNumber(debug.gestureConfidence ?? 0)}</b>
        </div>
      </div>
    </div>
  )
}
