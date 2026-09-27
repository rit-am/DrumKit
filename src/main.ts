import './styles.css';
import { load, save, type SoundId } from './config';
import { eventKey, routeKey } from './input';
import { Recorder } from './patterns';
import { DrumAudio } from './audio';
import { mount } from './ui';

const settings = load();
const root = document.querySelector<HTMLElement>('#app')!;
const recorder = new Recorder();
let ui: ReturnType<typeof mount>;
const audio = new DrumAudio(message => ui?.status(message));
const persist = () => save(settings);
function hit(id: SoundId, key?: string) { audio.hit(id); recorder.hit(id); if (key) ui.log(key, settings.sounds.find(sound => sound.id === id)!.name, id); }
ui = mount(root, settings, {
  save: persist, changed: () => ui.refresh(), hit: id => hit(id), record: () => { recorder.start(); ui.recording(true); }, stopRecord: () => { recorder.stop(); ui.recording(false); },
  savePattern: name => { settings.patterns.push({ id: crypto.randomUUID(), name, events: recorder.stop() }); persist(); ui.refresh(); },
  loadSound: async (id, file) => { try { await audio.loadFile(id, file); ui.status(`${file.name} loaded for ${settings.sounds.find(sound => sound.id === id)!.name}.`); } catch (error) { ui.status(error instanceof Error ? error.message : 'Could not load that audio file.'); } },
  removePattern: id => { settings.patterns = settings.patterns.filter(pattern => pattern.id !== id); persist(); ui.refresh(); },
  renamePattern: (id, name) => { const pattern = settings.patterns.find(item => item.id === id); if (pattern) pattern.name = name; persist(); ui.refresh(); },
  playPattern: (pattern, loop) => { const schedule = () => { const start = audio.context.currentTime + .05; for (const event of pattern.events) audio.hit(event.soundId, start + event.atMs / 1000); if (loop && pattern.events.length) window.setTimeout(schedule, Math.max(100, pattern.events.at(-1)!.atMs + 100)); }; schedule(); }
});
audio.volume(settings.volume); void audio.load(settings.sounds);
window.addEventListener('keydown', async event => {
  if (ui.capturing) { ui.capture(event); return; }
  if ((event.target instanceof HTMLElement && event.target.closest('input,textarea,select,[contenteditable=true]')) || (document.activeElement !== document.body && document.activeElement !== document.documentElement)) return;
  const key = eventKey(event); if (!key) return; await audio.resume(); routeKey(event, settings, (id, pressedKey) => { event.preventDefault(); hit(id, pressedKey); });
});
root.addEventListener('pointerdown', () => void audio.resume());
if ('serviceWorker' in navigator && import.meta.env.PROD) window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js'));
