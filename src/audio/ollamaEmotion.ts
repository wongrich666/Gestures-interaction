import { moodLabels, summarizeEmotionTimeline } from './audioEmotion'
import type { AudioTimelineFrame, EmotionSummary, MusicMood } from '../core/types'

type OllamaTagsResponse = {
  models?: Array<{
    name?: string
    model?: string
  }>
}

type OllamaGenerateResponse = {
  response?: string
}

type QwenEmotionPayload = {
  mood?: MusicMood
  confidence?: number
  keywords?: string[]
  directorNote?: string
}

const OLLAMA_BASE_URL = 'http://127.0.0.1:11434'

export async function findLocalQwenModel() {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`)

  if (!response.ok) {
    throw new Error(`Ollama tags failed: ${response.status}`)
  }

  const data = (await response.json()) as OllamaTagsResponse
  const models = data.models ?? []
  const qwenModel = models.find((model) => {
    const name = model.name ?? model.model ?? ''
    return name.toLowerCase().includes('qwen')
  })

  return qwenModel?.name ?? qwenModel?.model ?? null
}

export async function analyzeEmotionWithQwen(
  frames: AudioTimelineFrame[],
  currentSummary: EmotionSummary,
) {
  const model = await findLocalQwenModel()

  if (!model) {
    throw new Error('Ollama 中没有找到 Qwen 模型。')
  }

  const compactSamples = sampleFrames(frames)
  const prompt = [
    '你是一个音乐剧和互动视觉导演。根据下面的音频特征摘要判断音乐情绪。',
    '只返回 JSON，不要 Markdown，不要解释。',
    'JSON schema: {"mood":"serene|melancholy|euphoric|tense|fierce|ethereal","confidence":0-1,"keywords":["词1","词2","词3"],"directorNote":"一句中文导演提示"}',
    `启发式初判: ${JSON.stringify(currentSummary)}`,
    `抽样帧: ${JSON.stringify(compactSamples)}`,
  ].join('\n')
  const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      options: {
        temperature: 0.2,
        top_p: 0.8,
      },
    }),
  })

  if (!response.ok) {
    throw new Error(`Qwen emotion failed: ${response.status}`)
  }

  const data = (await response.json()) as OllamaGenerateResponse
  const parsed = parseQwenPayload(data.response ?? '')
  const fallback = summarizeEmotionTimeline(frames, 'qwen')
  const mood = normalizeMood(parsed.mood) ?? currentSummary.mood

  return {
    ...fallback,
    source: 'qwen',
    mood,
    label: moodLabels[mood],
    confidence: clampConfidence(parsed.confidence ?? currentSummary.confidence),
    keywords: Array.isArray(parsed.keywords) && parsed.keywords.length
      ? parsed.keywords.slice(0, 6)
      : currentSummary.keywords,
    directorNote: parsed.directorNote || currentSummary.directorNote,
  } satisfies EmotionSummary
}

function sampleFrames(frames: AudioTimelineFrame[]) {
  if (!frames.length) {
    return []
  }

  const sampleCount = Math.min(36, frames.length)
  const step = Math.max(1, Math.floor(frames.length / sampleCount))
  const samples = []

  for (let index = 0; index < frames.length; index += step) {
    const frame = frames[index]
    samples.push({
      t: Number(frame.time.toFixed(2)),
      v: Number(frame.volume.toFixed(2)),
      b: Number(frame.bass.toFixed(2)),
      m: Number(frame.mid.toFixed(2)),
      tr: Number(frame.treble.toFixed(2)),
      beat: frame.beat ? 1 : 0,
      mood: frame.emotion.mood,
    })

    if (samples.length >= sampleCount) {
      break
    }
  }

  return samples
}

function parseQwenPayload(text: string): QwenEmotionPayload {
  const jsonText = text.match(/\{[\s\S]*\}/)?.[0] ?? ''

  if (!jsonText) {
    return {}
  }

  try {
    return JSON.parse(jsonText) as QwenEmotionPayload
  } catch {
    return {}
  }
}

function normalizeMood(value: unknown): MusicMood | null {
  const moods: MusicMood[] = ['serene', 'melancholy', 'euphoric', 'tense', 'fierce', 'ethereal']

  return typeof value === 'string' && moods.includes(value as MusicMood)
    ? (value as MusicMood)
    : null
}

function clampConfidence(value: number) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0.5))
}
