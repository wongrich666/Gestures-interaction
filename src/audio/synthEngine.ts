import { clamp, lerp } from '../core/math'
import type { FingerTopology, HarmonyFamily, HarmonyState } from '../core/types'

const BASE_FREQUENCY = 220

const CHORD_INTERVALS: Record<HarmonyFamily, number[]> = {
  silent: [],
  major: [0, 4, 7, 12],
  minor: [0, 3, 7, 10],
  sus: [0, 5, 7, 12],
  diminished: [0, 3, 6, 9],
  augmented: [0, 4, 8, 10],
  cluster: [0, 1, 5, 8, 11],
}

type Voice = {
  oscillator: OscillatorNode
  filter: BiquadFilterNode
  gain: GainNode
}

export class TopologySynthEngine {
  private readonly audioContext: AudioContext
  private readonly master: GainNode
  private readonly voices: Voice[] = []
  private started = false

  constructor() {
    const AudioContextCtor = window.AudioContext

    if (!AudioContextCtor) {
      throw new Error('当前浏览器不支持 Web Audio API。')
    }

    this.audioContext = new AudioContextCtor()
    this.master = this.audioContext.createGain()
    this.master.gain.value = 0
    this.master.connect(this.audioContext.destination)

    for (let index = 0; index < 5; index += 1) {
      const oscillator = this.audioContext.createOscillator()
      const filter = this.audioContext.createBiquadFilter()
      const gain = this.audioContext.createGain()

      oscillator.type = index % 2 === 0 ? 'sine' : 'triangle'
      oscillator.frequency.value = BASE_FREQUENCY
      filter.type = 'lowpass'
      filter.frequency.value = 1800
      filter.Q.value = 0.8
      gain.gain.value = 0
      oscillator.connect(filter)
      filter.connect(gain)
      gain.connect(this.master)
      oscillator.start()
      this.voices.push({ oscillator, filter, gain })
    }
  }

  async resume() {
    if (this.audioContext.state !== 'running') {
      await this.audioContext.resume()
    }

    this.started = true
  }

  update(harmony: HarmonyState, topology: FingerTopology, nowMs: number) {
    if (!this.started || this.audioContext.state === 'closed') {
      return
    }

    const now = this.audioContext.currentTime
    const muted = harmony.muted || topology.muted
    const targetMaster = muted ? 0 : 0.045 + topology.normalizedArea * 0.035
    const intervals = CHORD_INTERVALS[harmony.family]
    const rootOffset = Math.round(lerp(-5, 7, harmony.brightness))
    const detuneSpread = harmony.dissonance * 18

    this.master.gain.cancelScheduledValues(now)
    this.master.gain.setTargetAtTime(targetMaster, now, muted ? 0.025 : 0.08)

    this.voices.forEach((voice, index) => {
      const interval = intervals[index % Math.max(1, intervals.length)] ?? 0
      const active = !muted && index < Math.max(3, Math.min(5, harmony.activeNotes))
      const frequency = midiToFrequency(57 + rootOffset + interval)
      const shimmer = Math.sin(nowMs * 0.0014 + index * 1.7) * detuneSpread
      const voiceGain = active ? 0.22 / Math.max(3, harmony.activeNotes) : 0
      const cutoff = lerp(700, 4200, harmony.brightness) + harmony.dissonance * 1400

      voice.oscillator.frequency.setTargetAtTime(frequency, now, 0.06)
      voice.oscillator.detune.setTargetAtTime(shimmer, now, 0.08)
      voice.filter.frequency.setTargetAtTime(cutoff, now, 0.08)
      voice.filter.Q.setTargetAtTime(0.7 + harmony.dissonance * 4, now, 0.08)
      voice.gain.gain.setTargetAtTime(clamp(voiceGain, 0, 0.12), now, 0.055)
    })
  }

  silence() {
    if (this.audioContext.state === 'closed') {
      return
    }

    this.master.gain.setTargetAtTime(0, this.audioContext.currentTime, 0.025)
  }

  close() {
    this.silence()

    for (const voice of this.voices) {
      voice.oscillator.stop()
      voice.oscillator.disconnect()
      voice.filter.disconnect()
      voice.gain.disconnect()
    }

    this.master.disconnect()

    if (this.audioContext.state !== 'closed') {
      void this.audioContext.close()
    }
  }
}

function midiToFrequency(midi: number) {
  return 440 * 2 ** ((midi - 69) / 12)
}
