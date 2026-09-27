import { bind, defaults, type Pattern, type Settings, type SoundId } from './config';

export interface Actions {
  save(): void; changed(): void; hit(id: SoundId): void; record(): void; stopRecord(): void; savePattern(name: string): void;
  loadSound(id: SoundId, file: File): Promise<void>;
  removePattern(id: string): void; renamePattern(id: string, name: string): void; playPattern(pattern: Pattern, loop: boolean): void;
}

const esc = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
const groups: Array<[string, string, SoundId[]]> = [
  ['Cymbals', '◈', ['crash', 'ride']], ['Hi-hats', '◉', ['hihat-closed', 'hihat-open', 'hihat-foot']],
  ['Toms', '●', ['tom-high', 'tom-low', 'tom-floor']], ['Snare', '╳', ['snare', 'cross-stick']], ['Kick', '◉', ['kick']]
];
const iconFor = (id: SoundId) => ({ crash: '✧', ride: '◌', 'hihat-closed': '◉', 'hihat-open': '◎', 'hihat-foot': '⌁', 'tom-high': '●', 'tom-low': '●', 'tom-floor': '●', snare: '◉', 'cross-stick': '╳', kick: '◉' })[id];

export function mount(root: HTMLElement, data: Settings, actions: Actions) {
  let edit = false, paused = false, capturing: SoundId | null = null, query = '';
  let recent: string[] = [];
  const status = (message: string) => { const node = root.querySelector('#status'); if (node) node.textContent = message; };
  const soundTile = (sound: Settings['sounds'][number]) => `<article class="sound-tile${capturing === sound.id ? ' capturing' : ''}" data-id="${sound.id}"><div class="sound-icon" aria-hidden="true">${iconFor(sound.id)}</div><strong>${esc(sound.name)}</strong><div class="sound-keys">${sound.keys.map(key => `<kbd>${key}</kbd>`).join('') || '<span class="muted">--</span>'}</div>${edit ? `<div class="sound-actions"><button data-do="rename" data-id="${sound.id}">Rename</button><button data-do="capture" data-id="${sound.id}">+ Key</button>${sound.keys.map(key => `<button data-do="remove" data-id="${sound.id}" data-key="${key}">× ${key}</button>`).join('')}<label class="sample-upload" title="Load an audio file"><span>Audio</span><input class="sample-input" type="file" accept="audio/*" data-id="${sound.id}"></label></div>` : ''}${capturing === sound.id ? '<small>Press a letter · Esc cancels</small>' : ''}</article>`;
  const render = () => {
    root.innerHTML = `<header><div><p class="eyebrow">OFFLINE DRUM MACHINE</p><h1>Drum Keys</h1><span id="focus">Keyboard ready</span></div><div class="header-tools"><label class="volume-label">Volume <input id="volume" type="range" min="0" max="1" step=".01" value="${data.volume}"><output>${Math.round(data.volume * 100)}%</output></label><button id="edit">${edit ? 'Done' : 'Edit kit'}</button></div></header><p id="status" role="status"></p><main><section class="panel kit-panel"><div class="title"><div><p class="eyebrow">THE KIT</p><h2>Instrument matrix</h2></div><button class="plain" id="reset">Reset</button></div><div class="kit-groups">${groups.map(([name, groupIcon, ids]) => `<section class="kit-group"><div class="group-label"><span>${groupIcon}</span><h3>${name}</h3></div><div class="sound-grid">${ids.map(id => soundTile(data.sounds.find(sound => sound.id === id)!)).join('')}</div></section>`).join('')}</div></section><aside><section class="panel compact-panel"><div class="title"><h2>Recent hits</h2><div><button id="pause">${paused ? 'Resume' : 'Pause'}</button><button id="clear">Clear</button></div></div><ol id="recent">${recent.map(item => `<li>${esc(item)}</li>`).join('')}</ol></section><section class="panel compact-panel patterns-panel"><div class="title"><div><p class="eyebrow">CAPTURE A GROOVE</p><h2>Patterns</h2></div><span id="recstate">Not recording</span></div><div class="pattern-controls"><button id="record">Record</button><button id="stop">Stop</button><button id="save-pattern">Save</button><input id="search" type="search" placeholder="Search" value="${esc(query)}"></div><div>${data.patterns.filter(pattern => pattern.name.toLowerCase().includes(query.toLowerCase())).map(pattern => `<article class="pattern"><strong>${esc(pattern.name)}</strong><span>${pattern.events.length} hits</span><button data-do="play" data-id="${pattern.id}">Play</button><button data-do="loop" data-id="${pattern.id}">Loop</button><button data-do="rename-pattern" data-id="${pattern.id}">Rename</button><button data-do="delete-pattern" data-id="${pattern.id}">Delete</button></article>`).join('') || '<p class="muted">No patterns.</p>'}</div></section></aside></main>`;
    root.querySelector<HTMLInputElement>('#volume')!.oninput = event => { data.volume = Number((event.target as HTMLInputElement).value); actions.save(); root.querySelector('output')!.textContent = `${Math.round(data.volume * 100)}%`; };
  };
  render();
  root.addEventListener('input', event => { if ((event.target as HTMLElement).id === 'search') { query = (event.target as HTMLInputElement).value; render(); } });
  root.addEventListener('change', event => { const input = event.target as HTMLInputElement; if (!input.matches('.sample-input') || !input.files?.[0]) return; void actions.loadSound(input.dataset.id as SoundId, input.files[0]); input.value = ''; });
  root.addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button'); if (!button) return;
    const id = button.dataset.id as SoundId | undefined; const sound = data.sounds.find(item => item.id === id);
    if (button.dataset.do === 'rename' && sound) { const name = prompt('Sound name', sound.name); if (name?.trim()) { sound.name = name.trim().slice(0, 60); actions.changed(); actions.save(); render(); } }
    else if (button.dataset.do === 'capture' && sound) { capturing = sound.id; render(); }
    else if (button.dataset.do === 'remove' && sound) { sound.keys = sound.keys.filter(key => key !== button.dataset.key); actions.changed(); actions.save(); render(); }
    else if (button.dataset.do === 'rename-pattern') { const pattern = data.patterns.find(item => item.id === id); if (pattern) { const name = prompt('Pattern name', pattern.name); if (name?.trim()) actions.renamePattern(pattern.id, name.trim()); } }
    else if (button.dataset.do === 'delete-pattern' && id) actions.removePattern(id);
    else if ((button.dataset.do === 'play' || button.dataset.do === 'loop') && id) { const pattern = data.patterns.find(item => item.id === id); if (pattern) actions.playPattern(pattern, button.dataset.do === 'loop'); }
    else if (button.id === 'edit') { edit = !edit; render(); } else if (button.id === 'pause') { paused = !paused; render(); } else if (button.id === 'clear') { recent = []; render(); }
    else if (button.id === 'reset' && confirm('Reset sounds, keys, volume and patterns?')) { Object.assign(data, defaults()); actions.save(); render(); }
    else if (button.id === 'record') { actions.record(); root.querySelector('#recstate')!.textContent = 'Recording...'; }
    else if (button.id === 'stop') { actions.stopRecord(); root.querySelector('#recstate')!.textContent = 'Not recording'; }
    else if (button.id === 'save-pattern') { const name = prompt('Pattern name', 'My pattern'); if (name?.trim()) actions.savePattern(name.trim().slice(0, 60)); }
  });
  window.addEventListener('focus', () => { const node = root.querySelector('#focus'); if (node) node.textContent = 'Keyboard ready'; });
  window.addEventListener('blur', () => { const node = root.querySelector('#focus'); if (node) node.textContent = 'Click the page to re-enable keys'; });
  return {
    get capturing() { return capturing; },
    capture(event: KeyboardEvent) { event.preventDefault(); event.stopPropagation(); if (event.key === 'Escape') { capturing = null; render(); return; } if (event.repeat || event.ctrlKey || event.altKey || event.metaKey || !/^[a-z]$/i.test(event.key)) return; const key = event.key.toUpperCase(); const result = bind(data, capturing!, key); if (result.conflict) { if (!confirm(`${key} belongs to ${result.conflict.name}. Reassign?`)) { status(`${key} remains assigned to ${result.conflict.name}.`); capturing = null; render(); return; } bind(data, capturing!, key, true); } capturing = null; actions.changed(); actions.save(); render(); },
    log(key: string, name: string, id: SoundId) { if (!paused) { recent.unshift(`${key} · ${name}`); recent = recent.slice(0, 100); const list = root.querySelector('#recent'); if (list) list.innerHTML = recent.map(item => `<li>${esc(item)}</li>`).join(''); } const row = root.querySelector<HTMLElement>(`[data-id="${id}"]`); row?.classList.add('hit'); setTimeout(() => row?.classList.remove('hit'), 130); },
    status, refresh: render, recording(active: boolean) { root.querySelector('#recstate')!.textContent = active ? 'Recording...' : 'Not recording'; }
  };
}
