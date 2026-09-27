export type SoundId = 'crash' | 'ride' | 'hihat-closed' | 'hihat-open' | 'hihat-foot' | 'tom-high' | 'tom-low' | 'tom-floor' | 'snare' | 'cross-stick' | 'kick';
export interface Sound { id: SoundId; name: string; keys: string[]; sample: string }
export interface HitEvent { soundId: SoundId; atMs: number }
export interface Pattern { id: string; name: string; events: HitEvent[] }
export interface Settings { version: 1; sounds: Sound[]; volume: number; patterns: Pattern[] }
export const STORAGE_KEY = 'drum-keys.settings';
const kit: Array<[SoundId, string, string[]]> = [
  ['crash', 'Crash cymbal', ['Y']], ['ride', 'Ride cymbal', ['U']], ['hihat-closed', 'Hi-hat (closed)', ['R', 'T']],
  ['hihat-open', 'Hi-hat (open)', ['E', 'W']], ['hihat-foot', 'Hi-hat (foot)', ['C']], ['tom-high', 'High tom-tom', ['G']],
  ['tom-low', 'Low tom-tom', ['H']], ['tom-floor', 'Floor tom', ['J']], ['snare', 'Snare drum', ['S', 'A']],
  ['cross-stick', 'Snare drum (cross stick)', ['D', 'F']], ['kick', 'Bass drum', ['X', 'Z']],
];
export const defaults = (): Settings => ({ version: 1, sounds: kit.map(([id, name, keys]) => ({ id, name, keys: [...keys], sample: id })), volume: .8, patterns: [] });
const isKey = (v: unknown): v is string => typeof v === 'string' && /^[a-z]$/i.test(v);
export function validate(value: unknown): Settings {
  const base = defaults();
  if (!value || typeof value !== 'object' || (value as Settings).version !== 1 || !Array.isArray((value as Settings).sounds)) return base;
  const raw = value as Partial<Settings>;
  const sounds = base.sounds.map(sound => {
    const saved = raw.sounds!.find(item => item?.id === sound.id);
    if (!saved) return sound;
    return { ...sound, name: typeof saved.name === 'string' && saved.name.trim() ? saved.name.trim().slice(0, 60) : sound.name,
      keys: Array.isArray(saved.keys) ? [...new Set(saved.keys.filter(isKey).map(key => key.toUpperCase()))] : sound.keys };
  });
  const claimed = new Set<string>();
  for (const sound of sounds) sound.keys = sound.keys.filter(key => { if (claimed.has(key)) return false; claimed.add(key); return true; });
  const patterns = Array.isArray(raw.patterns) ? raw.patterns.flatMap(pattern => {
    if (!pattern || typeof pattern.id !== 'string' || typeof pattern.name !== 'string' || !Array.isArray(pattern.events)) return [];
    return [{ id: pattern.id, name: pattern.name.slice(0, 60), events: pattern.events.filter(event => event && base.sounds.some(sound => sound.id === event.soundId) && Number.isFinite(event.atMs) && event.atMs >= 0).map(event => ({ soundId: event.soundId, atMs: event.atMs })) }];
  }) : [];
  return { version: 1, sounds, volume: typeof raw.volume === 'number' && Number.isFinite(raw.volume) ? Math.max(0, Math.min(1, raw.volume)) : .8, patterns };
}
export function load(storage: Storage = localStorage): Settings { try { const raw = storage.getItem(STORAGE_KEY); return raw ? validate(JSON.parse(raw)) : defaults(); } catch { return defaults(); } }
export function save(data: Settings, storage: Storage = localStorage): void { storage.setItem(STORAGE_KEY, JSON.stringify(validate(data))); }
export function bind(data: Settings, id: SoundId, key: string, reassign = false): { conflict?: Sound } {
  const target = data.sounds.find(sound => sound.id === id); if (!target || !isKey(key)) return {}; key = key.toUpperCase();
  const conflict = data.sounds.find(sound => sound.id !== id && sound.keys.includes(key)); if (conflict && !reassign) return { conflict };
  if (conflict) conflict.keys = conflict.keys.filter(item => item !== key); if (!target.keys.includes(key)) target.keys.push(key); return {};
}
