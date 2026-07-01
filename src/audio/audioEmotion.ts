import { clamp, lerp } from '../core/math'
import type {
  AudioEmotion,
  AudioFeatures,
  AudioTimelineFrame,
  EmotionSummary,
  MoodPalette,
  MusicMood,
} from '../core/types'

type AudioFrameBase = AudioFeatures & {
  time: number
}

export const moodPalettes: Record<MusicMood, MoodPalette> = {
  serene: {
    ink: '#05070a',
    shadow: '#0b1720',
    base: '#123b45',
    glow: '#73f3d4',
    accent: '#d6ffe7',
    highlight: '#fff0c7',
  },
  melancholy: {
    ink: '#05060d',
    shadow: '#101328',
    base: '#243a67',
    glow: '#72a7ff',
    accent: '#b7c8ff',
    highlight: '#f1d8ff',
  },
  euphoric: {
    ink: '#080608',
    shadow: '#27122b',
    base: '#b23383',
    glow: '#ff75d1',
    accent: '#ffe46f',
    highlight: '#ffffff',
  },
  tense: {
    ink: '#090707',
    shadow: '#2b1113',
    base: '#70332e',
    glow: '#ff6b4d',
    accent: '#ffd05e',
    highlight: '#fff5d6',
  },
  fierce: {
    ink: '#070605',
    shadow: '#20100a',
    base: '#8b2519',
    glow: '#ff3f2f',
    accent: '#ffb000',
    highlight: '#fff8d2',
  },
  ethereal: {
    ink: '#03080d',
    shadow: '#071d2b',
    base: '#103a76',
    glow: '#41dfff',
    accent: '#9effff',
    highlight: '#f3fbff',
  },
}

export const moodLabels: Record<MusicMood, string> = {
  serene: '静水',
  melancholy: '冷蓝',
  euphoric: '升腾',
  tense: '张力',
  fierce: '爆裂',
  ethereal: '空灵',
}

export function createDefaultEmotion(): AudioEmotion {
  return {
    mood: 'serene',
    label: moodLabels.serene,
    energy: 0,
    intensity: 0,
    warmth: 0.42,
    brightness: 0.2,
    tension: 0.12,
    motion: 0,
    pulse: 0,
    confidence: 0.35,
    palette: moodPalettes.serene,
  }
}

export function inferAudioEmotion(
  features: AudioFeatures,
  previous: AudioEmotion | null = null,
  responsiveness = 0.18,
): AudioEmotion {
  const rawEnergy = clamp(
    features.volume * 0.52 + features.bass * 0.34 + features.mid * 0.18 + (features.beat ? 0.14 : 0),
    0,
    1,
  )
  const rawBrightness = clamp(features.treble * 0.7 + features.mid * 0.24 - features.bass * 0.1, 0, 1)
  const rawWarmth = clamp(0.36 + features.bass * 0.42 + features.mid * 0.26 - features.treble * 0.18, 0, 1)
  const rawTension = clamp(
    features.treble * 0.36 +
      features.bass * 0.28 +
      Math.abs(features.treble - features.mid) * 0.26 +
      (features.beat ? 0.1 : 0),
    0,
    1,
  )
  const rawMotion = clamp(features.volume * 0.28 + features.mid * 0.44 + features.treble * 0.24, 0, 1)
  const rawPulse = features.beat ? 1 : (previous?.pulse ?? rawEnergy) * 0.88
  const rawIntensity = clamp(rawEnergy * 0.68 + rawTension * 0.2 + rawMotion * 0.16, 0, 1)

  const previousEmotion = previous ?? createDefaultEmotion()
  const amount = clamp(responsiveness, 0, 1)
  const energy = lerp(previousEmotion.energy, rawEnergy, amount)
  const brightness = lerp(previousEmotion.brightness, rawBrightness, amount)
  const warmth = lerp(previousEmotion.warmth, rawWarmth, amount)
  const tension = lerp(previousEmotion.tension, rawTension, amount)
  const motion = lerp(previousEmotion.motion, rawMotion, amount)
  const intensity = lerp(previousEmotion.intensity, rawIntensity, amount)
  const pulse = clamp(rawPulse, 0, 1)
  const mood = chooseMood({
    energy,
    brightness,
    warmth,
    tension,
    bass: features.bass,
    treble: features.treble,
    volume: features.volume,
  })

  return {
    mood,
    label: moodLabels[mood],
    energy,
    intensity,
    warmth,
    brightness,
    tension,
    motion,
    pulse,
    confidence: clamp(0.42 + intensity * 0.35 + Math.abs(brightness - 0.5) * 0.22, 0, 1),
    palette: moodPalettes[mood],
  }
}

export function attachAudioEmotions(frames: AudioFrameBase[]): AudioTimelineFrame[] {
  let previous = createDefaultEmotion()

  return frames.map((frame) => {
    previous = inferAudioEmotion(frame, previous, 0.34)

    return {
      ...frame,
      emotion: previous,
    }
  })
}

export function summarizeEmotionTimeline(
  frames: AudioTimelineFrame[],
  source: EmotionSummary['source'] = 'heuristic',
): EmotionSummary {
  if (!frames.length) {
    return {
      source,
      mood: 'serene',
      label: moodLabels.serene,
      confidence: 0,
      energy: 0,
      tension: 0,
      brightness: 0,
      warmth: 0,
      beatDensity: 0,
      keywords: ['留白', '柔光'],
      directorNote: '音乐能量较低，舞台以缓慢呼吸和手部光轨为主。',
    }
  }

  const moodCounts = new Map<MusicMood, number>()
  let energy = 0
  let tension = 0
  let brightness = 0
  let warmth = 0
  let beatCount = 0

  for (const frame of frames) {
    energy += frame.emotion.energy
    tension += frame.emotion.tension
    brightness += frame.emotion.brightness
    warmth += frame.emotion.warmth
    beatCount += frame.beat ? 1 : 0
    moodCounts.set(frame.emotion.mood, (moodCounts.get(frame.emotion.mood) ?? 0) + 1)
  }

  const mood = [...moodCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'serene'
  const count = frames.length
  const summary = {
    energy: energy / count,
    tension: tension / count,
    brightness: brightness / count,
    warmth: warmth / count,
    beatDensity: beatCount / count,
  }

  return {
    source,
    mood,
    label: moodLabels[mood],
    confidence: clamp((moodCounts.get(mood) ?? 0) / count + summary.energy * 0.18, 0, 1),
    ...summary,
    keywords: pickKeywords(mood, summary.energy, summary.tension, summary.brightness),
    directorNote: buildDirectorNote(mood, summary.energy, summary.tension, summary.brightness),
  }
}

function chooseMood(input: {
  energy: number
  brightness: number
  warmth: number
  tension: number
  bass: number
  treble: number
  volume: number
}): MusicMood {
  if (input.energy > 0.56 && input.bass > 0.5 && input.volume > 0.28) {
    return 'fierce'
  }

  if (input.energy > 0.42 && input.brightness > 0.52 && input.tension < 0.62) {
    return 'euphoric'
  }

  if (input.tension > 0.54) {
    return 'tense'
  }

  if (input.treble > 0.5 && input.bass < 0.34 && input.energy < 0.48) {
    return 'ethereal'
  }

  if (input.brightness < 0.28 && input.energy < 0.38) {
    return 'melancholy'
  }

  return 'serene'
}

function pickKeywords(mood: MusicMood, energy: number, tension: number, brightness: number) {
  const base: Record<MusicMood, string[]> = {
    serene: ['呼吸', '水面', '柔光'],
    melancholy: ['冷色', '慢速', '留白'],
    euphoric: ['上升', '闪烁', '开阔'],
    tense: ['切分', '压迫', '锐光'],
    fierce: ['爆点', '低频', '冲击'],
    ethereal: ['薄雾', '高频', '漂浮'],
  }
  const dynamic = [
    energy > 0.5 ? '高能量' : '低能量',
    tension > 0.48 ? '高张力' : '低张力',
    brightness > 0.5 ? '明亮' : '暗场',
  ]

  return [...base[mood], ...dynamic].slice(0, 6)
}

function buildDirectorNote(mood: MusicMood, energy: number, tension: number, brightness: number) {
  const energyText = energy > 0.5 ? '粒子密度和镜头脉冲可以更强' : '保持轨迹细腻，减少爆点频率'
  const tensionText = tension > 0.5 ? '用锐利边缘和短促闪光强调张力' : '用长尾光轨和缓慢扩散保持流动'
  const brightnessText = brightness > 0.5 ? '色彩向高亮和冷暖对比打开' : '保留暗部和局部手势高光'

  return `${moodLabels[mood]}：${energyText}；${tensionText}；${brightnessText}。`
}
