const CACHE='drum-keys-v1';
const SHELL=['/','/index.html','/manifest.webmanifest'];
const SAMPLES=['crash','ride','hihat-closed','hihat-open','hihat-foot','tom-high','tom-low','tom-floor','snare','cross-stick','kick'].map(name=>`/samples/default/${name}.wav`);
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);await cache.addAll([...SHELL,...SAMPLES]);await self.skipWaiting()})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key!==CACHE)await caches.delete(key);await self.clients.claim()})()));
self.addEventListener('fetch',event=>{if(event.request.method==='GET'&&new URL(event.request.url).origin===location.origin)event.respondWith(caches.match(event.request).then(response=>response||fetch(event.request)))});
