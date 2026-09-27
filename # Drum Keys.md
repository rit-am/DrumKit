# Drum Keys

Offline keyboard-playable drum soundboard MVP specification and implementation
draft. TypeScript, Vite, plain HTML/CSS, Web Audio API and localStorage; no backend,
external resources, network features, or telemetry. Suitable for a future Tauri 2
wrapper.

## Plan

1. Implement typed defaults/settings, input filtering, Web Audio, patterns, and UI.
2. Add PWA precaching and licensed sample slots.
3. Run tests/build after placing this draft into a Vite project; verify offline.

## Layout

```text
index.html  package.json  vite.config.ts
public/manifest.webmanifest  public/sw.js  public/samples/default/*.wav
src/main.ts  src/config.ts  src/audio.ts  src/input.ts  src/patterns.ts
src/ui.ts  src/styles.css  src/test/core.test.ts  SAMPLE_CREDITS.md
```

## Core modules

### `src/config.ts`

```ts
export type SoundId = 'crash'|'ride'|'hihat-closed'|'hihat-open'|'hihat-foot'|'tom-high'|'tom-low'|'tom-floor'|'snare'|'cross-stick'|'kick';
export interface Sound { id: SoundId; name: string; keys: string[]; sample: string }
export interface HitEvent { soundId: SoundId; atMs: number }
export interface Pattern { id: string; name: string; events: HitEvent[] }
export interface Settings { version: 1; sounds: Sound[]; volume: number; patterns: Pattern[] }
export const STORAGE_KEY = 'drum-keys.settings';
const kit: Array<[SoundId,string,string[]]> = [
  ['crash','Crash cymbal',['Y']],['ride','Ride cymbal',['U']],['hihat-closed','Hi-hat (closed)',['R','T']],
  ['hihat-open','Hi-hat (open)',['E','W']],['hihat-foot','Hi-hat (foot)',['C']],['tom-high','High tom-tom',['G']],
  ['tom-low','Low tom-tom',['H']],['tom-floor','Floor tom',['J']],['snare','Snare drum',['S','A']],
  ['cross-stick','Snare drum (cross stick)',['D','F']],['kick','Bass drum',['X','Z']],
];
export const defaults = (): Settings => ({version:1,sounds:kit.map(([id,name,keys])=>({id,name,keys:[...keys],sample:id})),volume:.8,patterns:[]});
const isKey = (v: unknown): v is string => typeof v === 'string' && /^[a-z]$/i.test(v);
export function validate(value: unknown): Settings {
  const base=defaults();
  if (!value || typeof value!=='object' || (value as Settings).version!==1 || !Array.isArray((value as Settings).sounds)) return base;
  const raw=value as Partial<Settings>;
  const sounds=base.sounds.map(s=>{
    const saved=raw.sounds!.find(x=>x?.id===s.id);
    if(!saved)return s;
    return {...s,name:typeof saved.name==='string'&&saved.name.trim()?saved.name.trim().slice(0,60):s.name,
      keys:Array.isArray(saved.keys)?[...new Set(saved.keys.filter(isKey).map(k=>k.toUpperCase()))]:s.keys};
  });
  const claimed=new Set<string>();
  for(const sound of sounds)sound.keys=sound.keys.filter(k=>{if(claimed.has(k))return false;claimed.add(k);return true;});
  const patterns=Array.isArray(raw.patterns)?raw.patterns.flatMap(p=>{
    if(!p||typeof p.id!=='string'||typeof p.name!=='string'||!Array.isArray(p.events))return[];
    return [{id:p.id,name:p.name.slice(0,60),events:p.events.filter(e=>e&&base.sounds.some(s=>s.id===e.soundId)&&Number.isFinite(e.atMs)&&e.atMs>=0).map(e=>({soundId:e.soundId,atMs:e.atMs}))}];
  }):[];
  return {version:1,sounds,volume:typeof raw.volume==='number'&&Number.isFinite(raw.volume)?Math.max(0,Math.min(1,raw.volume)):.8,patterns};
}
export function load(storage:Storage=localStorage):Settings {try{const raw=storage.getItem(STORAGE_KEY);return raw?validate(JSON.parse(raw)):defaults();}catch{return defaults();}}
export function save(data:Settings,storage:Storage=localStorage):void {storage.setItem(STORAGE_KEY,JSON.stringify(validate(data)));}
export function bind(data:Settings,id:SoundId,key:string,reassign=false):{conflict?:Sound} {
  const target=data.sounds.find(s=>s.id===id);if(!target||!isKey(key))return{};key=key.toUpperCase();
  const conflict=data.sounds.find(s=>s.id!==id&&s.keys.includes(key));if(conflict&&!reassign)return{conflict};
  if(conflict)conflict.keys=conflict.keys.filter(k=>k!==key);if(!target.keys.includes(key))target.keys.push(key);return{};
}
```

### `src/input.ts`

```ts
import type {Settings,SoundId} from './config';
export function eventKey(e:KeyboardEvent):string|null {
  if(e.repeat||e.ctrlKey||e.altKey||e.metaKey||!/^[a-z]$/i.test(e.key))return null;
  return e.key.toUpperCase();
}
export function routeKey(e:KeyboardEvent,data:Settings,hit:(id:SoundId,key:string)=>void):boolean {
  const key=eventKey(e);if(!key)return false;const sound=data.sounds.find(s=>s.keys.includes(key));
  if(!sound)return false;hit(sound.id,key);return true;
}
```

### `src/patterns.ts`

```ts
import type {HitEvent,Pattern,SoundId} from './config';
export class Recorder {
  private startAt=0;private events:HitEvent[]=[];active=false;
  start(now=performance.now()){this.startAt=now;this.events=[];this.active=true;}
  hit(soundId:SoundId,now=performance.now()){if(this.active)this.events.push({soundId,atMs:Math.max(0,now-this.startAt)});}
  stop(){this.active=false;return this.snapshot();}
  snapshot(){return this.events.map(e=>({...e}));}
}
export const serialize=(p:Pattern)=>JSON.stringify(p);
export function deserialize(text:string):Pattern {
  const p=JSON.parse(text) as Pattern;
  if(!p||typeof p.id!=='string'||typeof p.name!=='string'||!Array.isArray(p.events))throw new Error('Invalid pattern');
  return p;
}
```

### `src/audio.ts`

```ts
import type {Sound,SoundId} from './config';
export class DrumAudio {
  readonly context=new AudioContext();private master=this.context.createGain();private buffers=new Map<SoundId,AudioBuffer>();
  private open=new Set<AudioBufferSourceNode>();private loaded=false;
  constructor(private error:(message:string)=>void){this.master.connect(this.context.destination);}
  volume(value:number){this.master.gain.setTargetAtTime(value,this.context.currentTime,.01);}
  async load(sounds:Sound[]){const missing:string[]=[];await Promise.all(sounds.map(async s=>{try{
    const r=await fetch(`/samples/default/${s.sample}.wav`);if(!r.ok)throw Error();
    this.buffers.set(s.id,await this.context.decodeAudioData(await r.arrayBuffer()));
  }catch{missing.push(s.name);}}));this.loaded=true;
    if(missing.length)this.error(`Missing or unreadable samples: ${missing.join(', ')}. Add licensed WAV files under public/samples/default/.`);
  }
  async resume(){if(this.context.state!=='running')await this.context.resume();}
  hit(id:SoundId,when=this.context.currentTime):boolean {
    const buffer=this.buffers.get(id);if(!buffer||!this.loaded)return false;
    if(id==='hihat-closed'||id==='hihat-foot'){for(const source of this.open)try{source.stop(when);}catch{}this.open.clear();}
    const source=this.context.createBufferSource();source.buffer=buffer;source.connect(this.master);
    if(id==='hihat-open'){this.open.add(source);source.onended=()=>this.open.delete(source);}
    source.start(when);return true;
  }
}
```

### `src/main.ts`

```ts
import './styles.css';
import {defaults,load,save,type SoundId} from './config';
import {eventKey,routeKey} from './input';
import {Recorder} from './patterns';
import {DrumAudio} from './audio';
import {mount} from './ui';
const settings=load(),root=document.querySelector<HTMLElement>('#app')!;
const recorder=new Recorder();let ui:ReturnType<typeof mount>;
const audio=new DrumAudio(message=>ui?.status(message));
const persist=()=>save(settings);
function hit(id:SoundId,key?:string){audio.hit(id);recorder.hit(id);if(key)ui.log(key,settings.sounds.find(s=>s.id===id)!.name,id);}
ui=mount(root,settings,{
  save:persist,changed:()=>ui.refresh(),hit:(id)=>hit(id),record:()=>{recorder.start();ui.recording(true)},stopRecord:()=>{recorder.stop();ui.recording(false)},
  savePattern:name=>{settings.patterns.push({id:crypto.randomUUID(),name,events:recorder.stop()});persist();ui.refresh();},
  removePattern:id=>{settings.patterns=settings.patterns.filter(p=>p.id!==id);persist();ui.refresh();},
  renamePattern:(id,name)=>{const p=settings.patterns.find(p=>p.id===id);if(p)p.name=name;persist();ui.refresh();},
  playPattern:(pattern,loop)=>{
    const schedule=()=>{const start=audio.context.currentTime+.05;for(const e of pattern.events)audio.hit(e.soundId,start+e.atMs/1000);
      if(loop&&pattern.events.length)window.setTimeout(schedule,Math.max(100,pattern.events.at(-1)!.atMs+100));};schedule();
  }
});
audio.volume(settings.volume);void audio.load(settings.sounds);
window.addEventListener('keydown',async e=>{
  if(ui.capturing){ui.capture(e);return;}
  if((e.target instanceof HTMLElement&&e.target.closest('input,textarea,select,[contenteditable=true]'))||
    (document.activeElement!==document.body&&document.activeElement!==document.documentElement))return;
  const key=eventKey(e);if(!key)return;await audio.resume();
  routeKey(e,settings,(id,k)=>{e.preventDefault();hit(id,k);});
});
root.addEventListener('pointerdown',()=>void audio.resume());
if('serviceWorker'in navigator&&import.meta.env.PROD)window.addEventListener('load',()=>void navigator.serviceWorker.register('/sw.js'));
```

### `src/ui.ts`

```ts
import {bind,defaults,type Pattern,type Settings,type SoundId} from './config';
export interface Actions {
  save():void;changed():void;hit(id:SoundId):void;record():void;stopRecord():void;savePattern(name:string):void;
  removePattern(id:string):void;renamePattern(id:string,name:string):void;playPattern(p:Pattern,loop:boolean):void;
}
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function mount(root:HTMLElement,data:Settings,a:Actions){
 let edit=false,paused=false,capturing:SoundId|null=null,query='';let recent:string[]=[];
 const status=(s:string)=>{const n=root.querySelector('#status');if(n)n.textContent=s;};
 const render=()=>{root.innerHTML=`<header><div><p class="eyebrow">OFFLINE DRUM MACHINE</p><h1>Drum Keys</h1><span id="focus">Keyboard ready</span></div><label>Master volume <input id="volume" type="range" min="0" max="1" step=".01" value="${data.volume}"><output>${Math.round(data.volume*100)}%</output></label></header><p id="status" role="status"></p><main><section class="panel"><div class="title"><div><p class="eyebrow">THE KIT</p><h2>Sounds &amp; keys</h2></div><button id="edit">${edit?'Done':'Edit sounds & keys'}</button></div>${data.sounds.map(s=>`<article class="sound" data-id="${s.id}"><strong>${esc(s.name)}</strong><div>${s.keys.map(k=>`<kbd>${k}</kbd>`).join(' / ')||'No keys'}</div>${edit?`<div><button data-do="rename" data-id="${s.id}">Rename</button><button data-do="capture" data-id="${s.id}">Add key</button>${s.keys.map(k=>`<button data-do="remove" data-id="${s.id}" data-key="${k}">× ${k}</button>`).join('')}</div>`:''}${capturing===s.id?'<small>Press a key · Esc cancels</small>':''}</article>`).join('')}<button class="plain" id="reset">Reset defaults</button></section><aside><section class="panel"><div class="title"><h2>Recent hits</h2><button id="pause">${paused?'Resume log':'Pause log'}</button><button id="clear">Clear</button></div><ol id="recent">${recent.map(x=>`<li>${esc(x)}</li>`).join('')}</ol></section><section class="panel"><p class="eyebrow">CAPTURE A GROOVE</p><h2>Patterns</h2><button id="record">Record</button><button id="stop">Stop</button><button id="save-pattern">Save pattern</button><span id="recstate">Not recording</span><input id="search" type="search" placeholder="Search patterns" value="${esc(query)}"><div>${data.patterns.filter(p=>p.name.toLowerCase().includes(query.toLowerCase())).map(p=>`<article class="pattern"><strong>${esc(p.name)}</strong> · ${p.events.length} hits <button data-do="play" data-id="${p.id}">Play</button><button data-do="loop" data-id="${p.id}">Loop</button><button data-do="rename-pattern" data-id="${p.id}">Rename</button><button data-do="delete-pattern" data-id="${p.id}">Delete</button></article>`).join('')||'<p>No patterns.</p>'}</div></section></aside></main>`;
  root.querySelector<HTMLInputElement>('#volume')!.oninput=e=>{data.volume=Number((e.target as HTMLInputElement).value);a.save();root.querySelector('output')!.textContent=`${Math.round(data.volume*100)}%`;};
 };
 render();
 root.addEventListener('input',e=>{if((e.target as HTMLElement).id==='search'){query=(e.target as HTMLInputElement).value;render();}});
 root.addEventListener('click',e=>{const b=(e.target as HTMLElement).closest<HTMLButtonElement>('button');if(!b)return;const id=b.dataset.id as SoundId|undefined,sound=data.sounds.find(s=>s.id===id);
   if(b.dataset.do==='rename'&&sound){const n=prompt('Sound name',sound.name);if(n?.trim()){sound.name=n.trim().slice(0,60);a.changed();a.save();}}
   else if(b.dataset.do==='capture'&&sound){capturing=sound.id;render();}
   else if(b.dataset.do==='remove'&&sound){sound.keys=sound.keys.filter(k=>k!==b.dataset.key);a.changed();a.save();}
   else if(b.dataset.do==='rename-pattern'){const p=data.patterns.find(x=>x.id===id);if(p){const n=prompt('Pattern name',p.name);if(n?.trim())a.renamePattern(p.id,n.trim());}}
   else if(b.dataset.do==='delete-pattern'&&id)a.removePattern(id);
   else if((b.dataset.do==='play'||b.dataset.do==='loop')&&id){const p=data.patterns.find(x=>x.id===id);if(p)a.playPattern(p,b.dataset.do==='loop');}
   else if(b.id==='edit'){edit=!edit;render();}else if(b.id==='pause'){paused=!paused;render();}else if(b.id==='clear'){recent=[];render();}
   else if(b.id==='reset'&&confirm('Reset sounds, keys, volume and patterns?')){Object.assign(data,defaults());a.save();render();}
   else if(b.id==='record'){a.record();root.querySelector('#recstate')!.textContent='Recording…';}
   else if(b.id==='stop'){a.stopRecord();root.querySelector('#recstate')!.textContent='Not recording';}
   else if(b.id==='save-pattern'){const n=prompt('Pattern name','My pattern');if(n?.trim())a.savePattern(n.trim().slice(0,60));}
 });
 window.addEventListener('focus',()=>{const n=root.querySelector('#focus');if(n)n.textContent='Keyboard ready';});
 window.addEventListener('blur',()=>{const n=root.querySelector('#focus');if(n)n.textContent='Click the page to re-enable keys';});
 return {get capturing(){return capturing;},capture(e:KeyboardEvent){e.preventDefault();e.stopPropagation();if(e.key==='Escape'){capturing=null;render();return;}if(e.repeat||e.ctrlKey||e.altKey||e.metaKey||!/^[a-z]$/i.test(e.key))return;const key=e.key.toUpperCase();const result=bind(data,capturing!,key);if(result.conflict){if(!confirm(`${key} belongs to ${result.conflict.name}. Reassign?`)){status(`${key} remains assigned to ${result.conflict.name}.`);capturing=null;render();return;}bind(data,capturing!,key,true);}capturing=null;a.changed();a.save();},
 log(key:string,name:string,id:SoundId){if(!paused){recent.unshift(`${key} · ${name}`);recent=recent.slice(0,100);const list=root.querySelector('#recent');if(list)list.innerHTML=recent.map(x=>`<li>${esc(x)}</li>`).join('');}const row=root.querySelector<HTMLElement>(`[data-id="${id}"]`);row?.classList.add('hit');setTimeout(()=>row?.classList.remove('hit'),130);},status,refresh:render,recording(active:boolean){root.querySelector('#recstate')!.textContent=active?'Recording…':'Not recording';}};
}
```

### `src/styles.css`

```css
:root{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#f5f4f0;background:#10131a;font-synthesis:none}*{box-sizing:border-box}body{margin:0;min-width:320px;background:radial-gradient(ellipse at top left,#202839,transparent 45%),#10131a}button,input{font:inherit}button{border:0;border-radius:8px;padding:8px 11px;background:#d7ff61;color:#171b10;font-weight:700;cursor:pointer;margin:3px}button:focus-visible,input:focus-visible{outline:3px solid #d7ff61}header,main,#status{max-width:1120px;margin:auto}header{padding:42px 26px 26px;display:flex;justify-content:space-between;align-items:center;gap:20px}h1{font-size:clamp(2.6rem,7vw,4.4rem);letter-spacing:-.07em;line-height:1;margin:0 0 10px}h2{font-size:1.2rem;margin:0}.eyebrow{font-size:.65rem;letter-spacing:.16em;font-weight:800;color:#a9b1bf;margin:0 0 8px}#focus{font-size:.85rem;color:#b9bfca}header label{color:#c4c9d2}header input{display:block;width:240px;accent-color:#d7ff61;margin-top:8px}output{margin-left:10px}.status,#status{color:#ffc56d;min-height:20px;padding:0 26px}main{padding:0 26px 50px;display:grid;grid-template-columns:1.1fr .9fr;gap:18px;align-items:start}.panel{background:#191e28;border:1px solid #2c3340;border-radius:16px;padding:20px;margin-bottom:18px}.title{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:15px}.title button{font-size:.75rem}.sound{display:grid;grid-template-columns:1fr auto;gap:9px;align-items:center;padding:13px 8px;border-top:1px solid #2c3340;border-radius:8px}.sound.hit{background:#38442b}.sound>div:last-of-type{grid-column:1/-1}kbd{font:700 .8rem ui-monospace,monospace;color:#eaffbb;background:#303b25;border:1px solid #53633d;border-radius:6px;padding:5px 8px}.sound small{grid-column:1/-1;color:#d7ff61}#recent{height:260px;overflow:auto;padding:0;list-style:none}#recent li{padding:8px;border-bottom:1px solid #2c3340;font:.82rem ui-monospace,monospace}#search{display:block;width:100%;padding:9px;background:#10131a;border:1px solid #363d4a;color:white;border-radius:8px;margin:12px 0}.pattern{padding:12px 0;border-bottom:1px solid #2c3340}.plain{background:none;color:#bbb}@media(max-width:720px){header{padding:28px 18px;align-items:flex-start;flex-direction:column}main{grid-template-columns:1fr;padding:0 14px 35px}#status{padding:0 18px}.panel{padding:15px}}
```

## Shell and PWA

### `index.html`

```html
<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#10131a"><link rel="manifest" href="/manifest.webmanifest"><title>Drum Keys</title></head><body><div id="app"></div><script type="module" src="/src/main.ts"></script></body></html>
```

### `public/manifest.webmanifest`

```json
{"name":"Drum Keys","short_name":"Drum Keys","start_url":"/","scope":"/","display":"standalone","background_color":"#10131a","theme_color":"#10131a","icons":[]}
```

### `public/sw.js`

```js
const CACHE='drum-keys-v1';
const SHELL=['/','/index.html','/manifest.webmanifest'];
const SAMPLES=['crash','ride','hihat-closed','hihat-open','hihat-foot','tom-high','tom-low','tom-floor','snare','cross-stick','kick'].map(n=>`/samples/default/${n}.wav`);
self.addEventListener('install',e=>e.waitUntil((async()=>{const c=await caches.open(CACHE);await c.addAll([...SHELL,...SAMPLES]);await self.skipWaiting()})()));
self.addEventListener('activate',e=>e.waitUntil((async()=>{for(const k of await caches.keys())if(k!==CACHE)await caches.delete(k);await self.clients.claim()})()));
self.addEventListener('fetch',e=>{if(e.request.method==='GET'&&new URL(e.request.url).origin===location.origin)e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)))});
```

### `vite.config.ts`

```ts
import {defineConfig} from 'vite';
export default defineConfig({});
```

### `package.json`

```json
{"name":"drum-keys","private":true,"version":"1.0.0","type":"module","scripts":{"dev":"vite","build":"tsc --noEmit && vite build","test":"vitest run","preview":"vite preview"},"devDependencies":{"typescript":"^5.7.3","vite":"^6.0.7","vitest":"^2.1.8","jsdom":"^25.0.1"}}
```

## Tests (`src/test/core.test.ts`)

```ts
import {describe,it,expect} from 'vitest';
import {defaults,bind,load,save,validate} from '../config';
import {eventKey,routeKey} from '../input';
import {Recorder,serialize,deserialize} from '../patterns';
describe('core',()=>{
 it('has stable alternate mappings and rename leaves sample/bindings alone',()=>{const s=defaults(),k=s.sounds.find(x=>x.id==='kick')!;expect(k.keys).toEqual(['X','Z']);k.name='Kick';expect(k.sample).toBe('kick');expect(k.keys).toEqual(['X','Z']);});
 it('rejects conflicts and supports confirmed reassignment',()=>{const s=defaults();expect(bind(s,'kick','S').conflict?.id).toBe('snare');bind(s,'kick','S',true);expect(s.sounds.find(x=>x.id==='snare')!.keys).toEqual(['A']);});
 it('round trips and recovers malformed settings',()=>{const map=new Map<string,string>();const st={getItem:(k:string)=>map.get(k)||null,setItem:(k:string,v:string)=>map.set(k,v)} as Storage;save(defaults(),st);expect(load(st).sounds.length).toBe(11);map.set('drum-keys.settings','{');expect(load(st).version).toBe(1);expect(validate(null).version).toBe(1);});
 it('filters modified/repeated keys and dispatches case-insensitively',()=>{const e=(key:string,extra={})=>({key,repeat:false,ctrlKey:false,altKey:false,metaKey:false,...extra}) as KeyboardEvent;expect(eventKey(e('x'))).toBe('X');expect(eventKey(e('x',{repeat:true}))).toBeNull();expect(eventKey(e('x',{metaKey:true}))).toBeNull();const hits:string[]=[];routeKey(e('z'),defaults(),id=>hits.push(id));expect(hits).toEqual(['kick']);});
 it('records relative timing and serializes events by sound id',()=>{const r=new Recorder();r.start(1000);r.hit('kick',1020);r.hit('snare',1150);const p={id:'p',name:'Test',events:r.stop()};expect(p.events.map(e=>e.atMs)).toEqual([20,150]);expect(deserialize(serialize(p))).toEqual(p);});
});
```

## `SAMPLE_CREDITS.md`

```md
# Sample credits

This draft includes no audio. Add all eleven WAV files under
`public/samples/default/` before release. Use samples with clear redistribution
rights (prefer CC0); record title, creator, URL, license, and acquisition date.
Never copy audio from Musicca.

| File | Title | Creator | URL | License | Date acquired |
|---|---|---|---|---|---|
```

## Manual acceptance

- [ ] Verify latency, overlapping hits, rapid presses, focus changes, and volume.
- [ ] Confirm closed/foot hi-hat choke open hi-hat.
- [ ] Confirm X/Z play the same Bass drum and log the pressed key.
- [ ] Rename Bass drum to Kick; verify only display/log text changes.
- [ ] Save a binding and pattern; reload and verify persistence.
- [ ] Install, disconnect network, and relaunch with licensed samples present.

## Run/package

Create the files above, then `npm install`, `npm run dev`, `npm test`, and
`npm run build`. Serve `dist/` via localhost/HTTPS to test installation and
service-worker behavior. The WAVs are intentionally not included; until licensed
samples are added the app reports a useful missing-sample warning, and precaching
will fail as expected. No audio from Musicca is used.