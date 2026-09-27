import { describe, it, expect } from 'vitest';
import { defaults, bind, load, save, validate } from '../config';
import { eventKey, routeKey } from '../input';
import { Recorder, serialize, deserialize } from '../patterns';

describe('core', () => {
  it('has stable alternate mappings and rename leaves sample/bindings alone', () => { const settings = defaults(); const kick = settings.sounds.find(sound => sound.id === 'kick')!; expect(kick.keys).toEqual(['X', 'Z']); kick.name = 'Kick'; expect(kick.sample).toBe('kick'); expect(kick.keys).toEqual(['X', 'Z']); });
  it('rejects conflicts and supports confirmed reassignment', () => { const settings = defaults(); expect(bind(settings, 'kick', 'S').conflict?.id).toBe('snare'); bind(settings, 'kick', 'S', true); expect(settings.sounds.find(sound => sound.id === 'snare')!.keys).toEqual(['A']); });
  it('round trips and recovers malformed settings', () => { const map = new Map<string, string>(); const storage = { getItem: (key: string) => map.get(key) || null, setItem: (key: string, value: string) => { map.set(key, value); }, removeItem: (key: string) => { map.delete(key); }, clear: () => map.clear(), key: (index: number) => [...map.keys()][index] ?? null, get length() { return map.size; } } as Storage; save(defaults(), storage); expect(load(storage).sounds.length).toBe(11); map.set('drum-keys.settings', '{'); expect(load(storage).version).toBe(1); expect(validate(null).version).toBe(1); });
  it('filters modified/repeated keys and dispatches case-insensitively', () => { const event = (key: string, extra = {}) => ({ key, repeat: false, ctrlKey: false, altKey: false, metaKey: false, ...extra }) as KeyboardEvent; expect(eventKey(event('x'))).toBe('X'); expect(eventKey(event('x', { repeat: true }))).toBeNull(); expect(eventKey(event('x', { metaKey: true }))).toBeNull(); const hits: string[] = []; routeKey(event('z'), defaults(), id => hits.push(id)); expect(hits).toEqual(['kick']); });
  it('records relative timing and serializes events by sound id', () => { const recorder = new Recorder(); recorder.start(1000); recorder.hit('kick', 1020); recorder.hit('snare', 1150); const pattern = { id: 'p', name: 'Test', events: recorder.stop() }; expect(pattern.events.map(event => event.atMs)).toEqual([20, 150]); expect(deserialize(serialize(pattern))).toEqual(pattern); });
});
