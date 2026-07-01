import { formatNumber } from '../core/math'
import type { AudioEmotion, EmotionSummary } from '../core/types'

type EmotionPanelProps = {
  emotion: AudioEmotion
  summary?: EmotionSummary | null
}

export function EmotionPanel({ emotion, summary }: EmotionPanelProps) {
  const note = summary?.directorNote
  const keywords = summary?.keywords ?? []

  return (
    <div className={`emotion-panel mood-${emotion.mood}`}>
      <div className="emotion-header">
        <span>情绪</span>
        <strong>{summary?.label ?? emotion.label}</strong>
      </div>
      <div className="emotion-meters">
        <Meter label="能量" value={summary?.energy ?? emotion.energy} />
        <Meter label="张力" value={summary?.tension ?? emotion.tension} />
        <Meter label="明亮" value={summary?.brightness ?? emotion.brightness} />
        <Meter label="温度" value={summary?.warmth ?? emotion.warmth} />
      </div>
      {keywords.length ? (
        <div className="keyword-row">
          {keywords.slice(0, 4).map((keyword) => (
            <span key={keyword}>{keyword}</span>
          ))}
        </div>
      ) : null}
      {note ? <p className="director-note">{note}</p> : null}
      <p className="confidence-line">
        confidence {formatNumber(summary?.confidence ?? emotion.confidence)}
        {summary ? ` · ${summary.source}` : ''}
      </p>
    </div>
  )
}

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div className="emotion-meter">
      <div>
        <span>{label}</span>
        <strong>{formatNumber(value)}</strong>
      </div>
      <i style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  )
}
