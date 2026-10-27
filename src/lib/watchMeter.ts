/**
 * Counts real playback time for the Cinara Share. It only counts the video moving forward at
 * about real speed: seeks, scrubbing, stalls and paused time count nothing. The server checks again
 * against its own clock (record_watch), so this just keeps honest viewers' numbers accurate.
 */
export class WatchMeter {
  private lastPos: number | null = null;
  private lastAt = 0;
  private pending = 0;
  private seq = 0;

  /** Feed every player time update: the video position (s) and the wall clock (ms). */
  feed(positionSec: number, nowMs: number): void {
    if (this.lastPos !== null) {
      const moved = positionSec - this.lastPos;
      const wall = (nowMs - this.lastAt) / 1000;
      // Forward, and no faster than real time (+ a little jitter). A jump is a seek: skip it.
      if (moved > 0 && wall > 0 && moved <= wall * 1.1 + 0.1) this.pending += moved;
    }
    this.lastPos = positionSec;
    this.lastAt = nowMs;
  }

  /** Playback stopped (pause, buffering, backgrounded): the next update starts a fresh stretch. */
  pause(): void {
    this.lastPos = null;
  }

  /** Seconds counted since the last take, and the tick number to send with them. */
  take(): { seconds: number; seq: number } {
    const seconds = Math.round(this.pending * 100) / 100;
    this.pending = 0;
    return { seconds, seq: this.seq++ };
  }

  get pendingSeconds(): number {
    return this.pending;
  }
}

/** A random v4 UUID for a viewing session. */
export function newSessionId(): string {
  const h = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) s += '-';
    else if (i === 14) s += '4';
    else if (i === 19) s += h[(Math.random() * 4) | 8];
    else s += h[(Math.random() * 16) | 0];
  }
  return s;
}
