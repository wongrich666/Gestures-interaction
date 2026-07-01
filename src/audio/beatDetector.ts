export class BeatDetector {
  private readonly history: number[] = []
  private lastBeatTime = 0

  update(bass: number, volume: number, now: number) {
    const energy = bass * 0.72 + volume * 0.28
    this.history.push(energy)

    if (this.history.length > 42) {
      this.history.shift()
    }

    const average =
      this.history.reduce((total, current) => total + current, 0) /
      Math.max(1, this.history.length)
    const threshold = Math.max(0.18, average * 1.55)
    const enoughGap = now - this.lastBeatTime > 210
    const beat = energy > threshold && enoughGap

    if (beat) {
      this.lastBeatTime = now
    }

    return beat
  }

  reset() {
    this.history.length = 0
    this.lastBeatTime = 0
  }
}
