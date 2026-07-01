import { clamp } from '../core/math'
import type { AudioFeatures, AudioTimelineFrame } from '../core/types'
import { attachAudioEmotions } from '../audio/audioEmotion'

const BAND_FREQUENCIES = {
  bass: [60, 110, 180],
  mid: [360, 720, 1400],
  treble: [2600, 4200, 6200],
}

type AudioProgressCallback = (progress: number) => void

export async function buildAudioTimeline(
  file: File,
  fps: number,
  onProgress?: AudioProgressCallback,
): Promise<AudioTimelineFrame[]> {
  const AudioContextCtor = window.AudioContext

  if (!AudioContextCtor) {
    throw new Error('当前浏览器不支持 Web Audio API。')
  }

  const audioContext = new AudioContextCtor()
  const arrayBuffer = await file.arrayBuffer()

  try {
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
    const channelData = Array.from({ length: audioBuffer.numberOfChannels }, (_, index) =>
      audioBuffer.getChannelData(index),
    )
    const frameCount = Math.max(1, Math.ceil(audioBuffer.duration * fps))
    const windowSize = Math.min(4096, Math.max(1024, Math.floor(audioBuffer.sampleRate * 0.046)))
    const frames: Array<AudioFeatures & { time: number }> = []

    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      const time = frameIndex / fps
      const centerSample = Math.floor(time * audioBuffer.sampleRate)
      const startSample = Math.max(0, centerSample - Math.floor(windowSize * 0.5))
      const endSample = Math.min(audioBuffer.length, startSample + windowSize)
      const volume = calculateRms(channelData, startSample, endSample)

      frames.push({
        time,
        volume: clamp(volume * 3.5, 0, 1),
        bass: calculateBandEnergy(channelData, audioBuffer.sampleRate, startSample, endSample, BAND_FREQUENCIES.bass),
        mid: calculateBandEnergy(channelData, audioBuffer.sampleRate, startSample, endSample, BAND_FREQUENCIES.mid),
        treble: calculateBandEnergy(
          channelData,
          audioBuffer.sampleRate,
          startSample,
          endSample,
          BAND_FREQUENCIES.treble,
        ),
        beat: false,
      })

      if (frameIndex % 24 === 0) {
        onProgress?.(frameIndex / frameCount)
        await nextFrame()
      }
    }

    applyBeatFlags(frames)
    onProgress?.(1)

    return attachAudioEmotions(frames)
  } finally {
    if (audioContext.state !== 'closed') {
      void audioContext.close()
    }
  }
}

function calculateRms(channels: Float32Array[], startSample: number, endSample: number) {
  let total = 0
  let count = 0

  for (let sample = startSample; sample < endSample; sample += 1) {
    const value = readMono(channels, sample)
    total += value * value
    count += 1
  }

  return Math.sqrt(total / Math.max(1, count))
}

function calculateBandEnergy(
  channels: Float32Array[],
  sampleRate: number,
  startSample: number,
  endSample: number,
  frequencies: number[],
) {
  let total = 0

  for (const frequency of frequencies) {
    total += calculateFrequencyEnergy(channels, sampleRate, startSample, endSample, frequency)
  }

  return clamp((total / frequencies.length) * 28, 0, 1)
}

function calculateFrequencyEnergy(
  channels: Float32Array[],
  sampleRate: number,
  startSample: number,
  endSample: number,
  frequency: number,
) {
  const sampleCount = Math.max(1, endSample - startSample)
  const normalizedFrequency = frequency / sampleRate
  const coefficient = 2 * Math.cos(2 * Math.PI * normalizedFrequency)
  let previous = 0
  let previous2 = 0

  for (let sample = startSample; sample < endSample; sample += 1) {
    const current = readMono(channels, sample) + coefficient * previous - previous2
    previous2 = previous
    previous = current
  }

  const power = previous2 * previous2 + previous * previous - coefficient * previous * previous2

  return Math.sqrt(Math.max(0, power)) / sampleCount
}

function readMono(channels: Float32Array[], sample: number) {
  let total = 0

  for (const channel of channels) {
    total += channel[sample] ?? 0
  }

  return total / Math.max(1, channels.length)
}

function applyBeatFlags(frames: Array<AudioFeatures & { time: number }>) {
  const history: number[] = []
  let lastBeatTime = -Infinity

  for (const frame of frames) {
    const energy = frame.bass * 0.72 + frame.volume * 0.28
    history.push(energy)

    if (history.length > 42) {
      history.shift()
    }

    const average = history.reduce((total, value) => total + value, 0) / history.length
    const threshold = Math.max(0.18, average * 1.55)

    if (energy > threshold && frame.time * 1000 - lastBeatTime > 210) {
      frame.beat = true
      lastBeatTime = frame.time * 1000
    }
  }
}

function nextFrame() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve())
  })
}
