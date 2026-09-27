import type { HitEvent, Pattern, SoundId } from './config';

export class Recorder {
  private startAt = 0;
  private events: HitEvent[] = [];
  active = false;
  start(now = performance.now()) { this.startAt = now; this.events = []; this.active = true; }
  hit(soundId: SoundId, now = performance.now()) { if (this.active) this.events.push({ soundId, atMs: Math.max(0, now - this.startAt) }); }
  stop() { this.active = false; return this.snapshot(); }
  snapshot() { return this.events.map(event => ({ ...event })); }
}
export const serialize = (pattern: Pattern) => JSON.stringify(pattern);
export function deserialize(text: string): Pattern {
  const pattern = JSON.parse(text) as Pattern;
  if (!pattern || typeof pattern.id !== 'string' || typeof pattern.name !== 'string' || !Array.isArray(pattern.events)) throw new Error('Invalid pattern');
  return pattern;
}
