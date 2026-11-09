/* Offline application shell. Never cache personal API responses or user data. */
const CACHE='trenirovki-v2-shell-2026-11-09-main';
const FILES=['./','./index.html','./style.css','./js/core.mjs','./js/app.mjs','./legacy-plan.json','./manifest.webmanifest','./assets/icon.svg','./assets/icon-180.png','./assets/icon-192.png','./assets/icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)))});
self.addEventListener('activate',e=>{e.waitUntil((async()=>{for(const k of await caches.keys())if(k!==CACHE&&k.startsWith('trenirovki-v2-'))await caches.delete(k);await self.clients.claim()})())});
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET'||new URL(r.url).origin!==self.location.origin)return;e.respondWith((async()=>{const c=await caches.open(CACHE);const hit=await c.match(r);if(hit)return hit;try{return await fetch(r)}catch{return Response.error()}})())});
/* No skipWaiting on install: active workout cannot be interrupted by newly fetched code. */
