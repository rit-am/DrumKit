import type { Sound, SoundId } from './config';

export class DrumAudio {
  readonly context = new AudioContext();
  private master = this.context.createGain();
  private buffers = new Map<SoundId, AudioBuffer>();
  private open = new Set<AudioBufferSourceNode>();
  private loaded = false;
  constructor(private error: (message: string) => void) { this.master.connect(this.context.destination); }
  volume(value: number) { this.master.gain.setTargetAtTime(value, this.context.currentTime, .01); }
  async load(sounds: Sound[]) {
    const missing: string[] = [];
    await Promise.all(sounds.map(async sound => { try {
      const response = await fetch(`/samples/default/${sound.sample}.wav`); if (!response.ok) throw Error();
      this.buffers.set(sound.id, await this.context.decodeAudioData(await response.arrayBuffer()));
    } catch { missing.push(sound.name); } }));
    this.loaded = true;
    if (missing.length) this.error(`Missing or unreadable samples: ${missing.join(', ')}. Add licensed WAV files under public/samples/default/.`);
  }
  async loadFile(id: SoundId, file: File) {
    try {
      this.buffers.set(id, await this.context.decodeAudioData(await file.arrayBuffer()));
      this.loaded = true;
    } catch {
      throw new Error(`Could not read ${file.name} as an audio file.`);
    }
  }
  async resume() { if (this.context.state !== 'running') await this.context.resume(); }
  hit(id: SoundId, when = this.context.currentTime): boolean {
    const buffer = this.buffers.get(id); if (!buffer || !this.loaded) return false;
    if (id === 'hihat-closed' || id === 'hihat-foot') { for (const source of this.open) try { source.stop(when); } catch { /* source may already be stopped */ } this.open.clear(); }
    const source = this.context.createBufferSource(); source.buffer = buffer; source.connect(this.master);
    if (id === 'hihat-open') { this.open.add(source); source.onended = () => this.open.delete(source); }
    source.start(when); return true;
  }
}
