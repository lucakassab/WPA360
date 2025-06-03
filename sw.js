// sw.js

const CACHE_NAME = 'tour360-cache-v2'; // se for atualizar, muda a versão

// Lista de arquivos que vai ser cacheada (use caminhos relativos a partir da raiz)
const ASSETS_TO_CACHE = [
  './index.html',
  './manifest.json',
  './js/core.js',
  './js/loader.js',
  './js/desktop.js',
  './js/mobile.js',
  './js/xr.js',
  // Se tiver CSS ou outras imagens pousa aqui
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request)
        .then(networkResponse => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
          return networkResponse;
        })
        .catch(() => {
          return new Response(
            '<h1>Você está offline</h1>',
            { headers: { 'Content-Type': 'text/html' } }
          );
        });
    })
  );
});
