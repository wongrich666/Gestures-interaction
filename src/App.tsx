import { useState } from 'react'
import type { AppMode } from './core/types'
import { RealtimeMode } from './modes/RealtimeMode'
import { VideoProcessMode } from './modes/VideoProcessMode'
import './App.css'

function App() {
  const [mode, setMode] = useState<AppMode>('realtime')

  return (
    <>
      <nav className="mode-switcher" aria-label="Mode switcher">
        <button
          className={mode === 'realtime' ? 'active' : ''}
          type="button"
          onClick={() => setMode('realtime')}
        >
          实时演出
        </button>
        <button
          className={mode === 'video' ? 'active' : ''}
          type="button"
          onClick={() => setMode('video')}
        >
          视频处理
        </button>
      </nav>
      {mode === 'realtime' ? <RealtimeMode /> : <VideoProcessMode />}
    </>
  )
}

export default App
