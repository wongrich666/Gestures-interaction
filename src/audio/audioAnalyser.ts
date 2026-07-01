import { EMPTY_AUDIO_FEATURES } from '../core/config'
import { clamp } from '../core/math'
import type { AudioFeatures } from '../core/types'
import { BeatDetector } from './beatDetector'

export class MicAudioAnalyser {
  private readonly audioContext: AudioContext
  private readonly analyser: AnalyserNode
  private readonly source: MediaStreamAudioSourceNode
  private readonly timeData: Uint8Array<ArrayBuffer>
  private readonly frequencyData: Uint8Array<ArrayBuffer>
  private readonly beatDetector = new BeatDetector()

  constructor(stream: MediaStream) {
    const AudioContextCtor = window.AudioContext

    if (!AudioContextCtor) {
      throw new Error('当前浏览器不支持 Web Audio API。')
    }

    this.audioContext = new AudioContextCtor()
    this.analyser = this.audioContext.createAnalyser()
    this.analyser.fftSize = 1024
    this.analyser.smoothingTimeConstant = 0.78
    this.source = this.audioContext.createMediaStreamSource(stream)
    this.source.connect(this.analyser)
    this.timeData = new Uint8Array(this.analyser.fftSize)
    this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount)
  }

  async resume() {
    if (this.audioContext.state !== 'running') {
      await this.audioContext.resume()
    }
  }

  getFeatures(now: number): AudioFeatures {
    if (this.audioContext.state === 'closed') {
      return EMPTY_AUDIO_FEATURES
    }

    this.analyser.getByteTimeDomainData(this.timeData)
    this.analyser.getByteFrequencyData(this.frequencyData)

    let squareTotal = 0

    for (const value of this.timeData) {
      const centered = (value - 128) / 128
      squareTotal += centered * centered
    }

    const volume = clamp(Math.sqrt(squareTotal / this.timeData.length) * 2.4, 0, 1)
    const bass = this.averageFrequencyRange(20, 250)
    const mid = this.averageFrequencyRange(250, 2000)
    const treble = this.averageFrequencyRange(2000, 8000)

    return {
      volume,
      bass,
      mid,
      treble,
      beat: this.beatDetector.update(bass, volume, now),
    }
  }

  close() {
    this.beatDetector.reset()
    this.source.disconnect()
    this.analyser.disconnect()

    if (this.audioContext.state !== 'closed') {
      void this.audioContext.close()
    }
  }

  private averageFrequencyRange(minHz: number, maxHz: number) {
    const binHz = this.audioContext.sampleRate / this.analyser.fftSize
    const startIndex = clamp(Math.floor(minHz / binHz), 0, this.frequencyData.length - 1)
    const endIndex = clamp(Math.ceil(maxHz / binHz), startIndex + 1, this.frequencyData.length)
    let total = 0

    for (let index = startIndex; index < endIndex; index += 1) {
      total += this.frequencyData[index]
    }

    return clamp(total / Math.max(1, endIndex - startIndex) / 255, 0, 1)
  }
}
