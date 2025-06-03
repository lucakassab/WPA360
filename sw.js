// sw.js

const CACHE_NAME = 'tour360-cache-v3'; // versão incrementada

// Lista de arquivos a serem cacheados (caminhos relativos à raiz)
const ASSETS_TO_CACHE = [
  './index.html',
  './manifest.json',
  './js/core.js',
  './js/loader.js',
  './js/desktop.js',
  './js/mobile.js',
  './js/xr.js',
  './icons/icon-192x192.png', // nome real do arquivo
  './icons/icon-512x512.png', // nome real do arquivo
  './icons/favicon.ico'       // opcional, para cachear o favicon
];

self.addEventListener('install', event => {
  console.log('[sw.js] Instalando e cacheando ativos...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  console.log('[sw.js] Ativando e limpando caches antigos...');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            console.log('[sw.js] Deletando cache antigo:', key);
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
