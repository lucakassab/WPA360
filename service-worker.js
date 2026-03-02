const CACHE_VERSION = "v1";
const SHELL_CACHE = `shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`;

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/app.css",

  "./js/main.js",
  "./js/App.js",
  "./js/PlatformManager.js",

  "./js/platform/Desktop.js",
  "./js/platform/Mobile.js",
  "./js/platform/VR.js",

  "./js/xr/StereoTopBottom.js",
  "./js/xr/vr_widget.js",        // ✅ NOVO

  "./js/tour/TourLoader.js",
  "./js/tour/tours.json",
  "./js/tour/HotspotPlacement.js",
  "./js/tour/HotspotDebug.js",
  "./js/tour/FaceCamera.js",
  "./js/tour/RenderOnTop.js",

  "./js/hotspots/HotspotRenderer.js",

  "./js/pwa/pwa.js",

  "./vendor/aframe.min.js"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.allSettled(APP_SHELL.map((url) => cache.add(url)));
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((k) => ![SHELL_CACHE, RUNTIME_CACHE].includes(k))
      .map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req));
    return;
  }

  const dest = req.destination;
  if (dest === "script" || dest === "style" || dest === "manifest") {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  if (dest === "image" || dest === "video" || dest === "audio") {
    event.respondWith(cacheFirst(req));
    return;
  }

  event.respondWith(staleWhileRevalidate(req));
});

async function networkFirst(req) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const fresh = await fetch(req);
    cache.put("./index.html", fresh.clone());
    return fresh;
  } catch {
    const cached = await cache.match(req);
    return cached || cache.match("./index.html");
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req).then((res) => {
    cache.put(req, res.clone());
    return res;
  }).catch(() => cached);
  return cached || fetchPromise;
}
