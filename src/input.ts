import type { Settings, SoundId } from './config';

export function eventKey(event: KeyboardEvent): string | null {
  if (event.repeat || event.ctrlKey || event.altKey || event.metaKey || !/^[a-z]$/i.test(event.key)) return null;
  return event.key.toUpperCase();
}

export function routeKey(event: KeyboardEvent, data: Settings, hit: (id: SoundId, key: string) => void): boolean {
  const key = eventKey(event); if (!key) return false;
  const sound = data.sounds.find(item => item.keys.includes(key)); if (!sound) return false;
  hit(sound.id, key); return true;
}
