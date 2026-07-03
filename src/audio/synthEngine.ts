import { clamp, lerp } from '../core/math'
import type { FingerTopology, HarmonyFamily, HarmonyState } from '../core/types'

const BASE_FREQUENCY = 220
const DEFAULT_SYNTH_VOLUME = 0.72

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
  private readonly bass: Voice
  private readonly pluck: Voice
  private readonly noiseSource: AudioBufferSourceNode
  private readonly noiseFilter: BiquadFilterNode
  private readonly noiseGain: GainNode
  private lastPulseAt = -Infinity
  private lastSignature = 'silent:0'
  private volume = DEFAULT_SYNTH_VOLUME
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

    this.bass = this.createVoice('sine', 1200, 0.9)
    this.pluck = this.createVoice('triangle', 2600, 1.4)
    this.noiseSource = this.createNoiseSource()
    this.noiseFilter = this.audioContext.createBiquadFilter()
    this.noiseGain = this.audioContext.createGain()
    this.noiseFilter.type = 'bandpass'
    this.noiseFilter.frequency.value = 1600
    this.noiseFilter.Q.value = 0.7
    this.noiseGain.gain.value = 0
    this.noiseSource.connect(this.noiseFilter)
    this.noiseFilter.connect(this.noiseGain)
    this.noiseGain.connect(this.master)
    this.noiseSource.start()
  }

  async resume() {
    if (this.audioContext.state !== 'running') {
      await this.audioContext.resume()
    }

    this.started = this.audioContext.state === 'running'
    return this.audioContext.state
  }

  getState() {
    return this.audioContext.state
  }

  async playTestTone() {
    const state = await this.resume()

    if (state !== 'running') {
      throw new Error('浏览器尚未允许音频输出，请点击页面上的解锁/测试声音按钮。')
    }

    const oscillator = this.audioContext.createOscillator()
    const gain = this.audioContext.createGain()
    const now = this.audioContext.currentTime

    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(440, now)
    oscillator.frequency.exponentialRampToValueAtTime(660, now + 0.18)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.12 * this.volume + 0.015, now + 0.025)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42)
    oscillator.connect(gain)
    gain.connect(this.audioContext.destination)
    oscillator.start(now)
    oscillator.stop(now + 0.46)
    oscillator.addEventListener(
      'ended',
      () => {
        oscillator.disconnect()
        gain.disconnect()
      },
      { once: true },
    )
  }

  setVolume(volume: number) {
    this.volume = clamp(volume, 0, 1)

    if (this.audioContext.state === 'closed') {
      return
    }

    if (this.volume === 0) {
      this.master.gain.setTargetAtTime(0, this.audioContext.currentTime, 0.025)
    }
  }

  update(harmony: HarmonyState, topology: FingerTopology, nowMs: number) {
    if (!this.started || this.audioContext.state === 'closed') {
      return
    }

    const now = this.audioContext.currentTime
    const muted = harmony.muted || topology.muted
    const targetMaster = muted ? 0 : (0.045 + topology.normalizedArea * 0.035) * this.volume
    const intervals = CHORD_INTERVALS[harmony.family]
    const rootOffset = Math.round(lerp(-5, 7, harmony.brightness))
    const detuneSpread = harmony.dissonance * 18
    const rootMidi = 57 + rootOffset
    const bassFrequency = midiToFrequency(rootMidi - 12)
    const pluckFrequency = midiToFrequency(rootMidi + (intervals[1] ?? 7) + 12)
    const cutoff = lerp(700, 4200, harmony.brightness) + harmony.dissonance * 1400
    const signature = `${harmony.family}:${harmony.activeNotes}:${Math.round(topology.crossDensity * 10)}`

    this.master.gain.cancelScheduledValues(now)
    this.master.gain.setTargetAtTime(targetMaster, now, muted ? 0.025 : 0.08)

    this.voices.forEach((voice, index) => {
      const interval = intervals[index % Math.max(1, intervals.length)] ?? 0
      const active = !muted && index < Math.max(3, Math.min(5, harmony.activeNotes))
      const frequency = midiToFrequency(57 + rootOffset + interval)
      const shimmer = Math.sin(nowMs * 0.0014 + index * 1.7) * detuneSpread
      const voiceGain = active ? 0.22 / Math.max(3, harmony.activeNotes) : 0

      voice.oscillator.frequency.setTargetAtTime(frequency, now, 0.06)
      voice.oscillator.detune.setTargetAtTime(shimmer, now, 0.08)
      voice.filter.frequency.setTargetAtTime(cutoff, now, 0.08)
      voice.filter.Q.setTargetAtTime(0.7 + harmony.dissonance * 4, now, 0.08)
      voice.gain.gain.setTargetAtTime(clamp(voiceGain, 0, 0.12), now, 0.055)
    })

    this.bass.oscillator.frequency.setTargetAtTime(bassFrequency, now, 0.08)
    this.bass.filter.frequency.setTargetAtTime(lerp(260, 920, harmony.brightness), now, 0.1)
    this.bass.gain.gain.setTargetAtTime(muted ? 0 : 0.035 + topology.normalizedArea * 0.025, now, 0.075)

    this.pluck.oscillator.frequency.setTargetAtTime(pluckFrequency, now, 0.04)
    this.pluck.filter.frequency.setTargetAtTime(cutoff + 1400, now, 0.06)
    this.pluck.filter.Q.setTargetAtTime(1.2 + harmony.dissonance * 5, now, 0.06)

    const pulseInterval = lerp(460, 190, clamp(topology.activeTips.length / 10 + harmony.dissonance * 0.35, 0, 1))
    const shouldPulse =
      !muted &&
      (signature !== this.lastSignature || nowMs - this.lastPulseAt > pulseInterval)

    if (shouldPulse) {
      this.lastPulseAt = nowMs
      this.lastSignature = signature
      this.pluck.gain.gain.cancelScheduledValues(now)
      this.pluck.gain.gain.setValueAtTime(0.0001, now)
      this.pluck.gain.gain.exponentialRampToValueAtTime(0.05 + harmony.dissonance * 0.025, now + 0.012)
      this.pluck.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18 + harmony.brightness * 0.08)
    } else if (muted) {
      this.pluck.gain.gain.setTargetAtTime(0, now, 0.018)
    }

    this.noiseFilter.frequency.setTargetAtTime(lerp(1200, 5200, harmony.dissonance), now, 0.12)
    this.noiseFilter.Q.setTargetAtTime(0.5 + harmony.dissonance * 3.5, now, 0.12)
    this.noiseGain.gain.setTargetAtTime(muted ? 0 : harmony.dissonance * 0.024, now, 0.1)
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

    this.bass.oscillator.stop()
    this.bass.oscillator.disconnect()
    this.bass.filter.disconnect()
    this.bass.gain.disconnect()
    this.pluck.oscillator.stop()
    this.pluck.oscillator.disconnect()
    this.pluck.filter.disconnect()
    this.pluck.gain.disconnect()
    this.noiseSource.stop()
    this.noiseSource.disconnect()
    this.noiseFilter.disconnect()
    this.noiseGain.disconnect()

    this.master.disconnect()

    if (this.audioContext.state !== 'closed') {
      void this.audioContext.close()
    }
  }

  private createVoice(type: OscillatorType, cutoff: number, q: number): Voice {
    const oscillator = this.audioContext.createOscillator()
    const filter = this.audioContext.createBiquadFilter()
    const gain = this.audioContext.createGain()

    oscillator.type = type
    oscillator.frequency.value = BASE_FREQUENCY
    filter.type = 'lowpass'
    filter.frequency.value = cutoff
    filter.Q.value = q
    gain.gain.value = 0
    oscillator.connect(filter)
    filter.connect(gain)
    gain.connect(this.master)
    oscillator.start()

    return { oscillator, filter, gain }
  }

  private createNoiseSource() {
    const sampleRate = this.audioContext.sampleRate
    const buffer = this.audioContext.createBuffer(1, sampleRate * 2, sampleRate)
    const channel = buffer.getChannelData(0)

    for (let index = 0; index < channel.length; index += 1) {
      channel[index] = Math.random() * 2 - 1
    }

    const source = this.audioContext.createBufferSource()
    source.buffer = buffer
    source.loop = true

    return source
  }
}

function midiToFrequency(midi: number) {
  return 440 * 2 ** ((midi - 69) / 12)
}
