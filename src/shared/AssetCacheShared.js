const DEFAULT_MAX_JSON_ENTRIES = 32;
const DEFAULT_MAX_IMAGE_ENTRIES = 12;
const DEFAULT_WARM_CONCURRENCY = 2;

export class AssetCacheShared {
  constructor({
    maxJsonEntries = DEFAULT_MAX_JSON_ENTRIES,
    maxImageEntries = DEFAULT_MAX_IMAGE_ENTRIES,
    xrDebug = null
  } = {}) {
    this.maxJsonEntries = Math.max(4, Number(maxJsonEntries) || DEFAULT_MAX_JSON_ENTRIES);
    this.maxImageEntries = Math.max(4, Number(maxImageEntries) || DEFAULT_MAX_IMAGE_ENTRIES);
    this.jsonCache = new Map();
    this.imageCache = new Map();
    this.pinnedImageKeys = new Set();
    this.networkWarmPromises = new Map();
    this.warmedUrlKeys = new Set();
    this.xrDebug = xrDebug;
  }

  async loadJson(url) {
    const key = this.normalizeUrl(url);
    const cachedEntry = this.jsonCache.get(key);
    if (cachedEntry) {
      this.touchEntry(this.jsonCache, key, cachedEntry);
      return cachedEntry.promise;
    }

    const entry = {
      promise: this.fetchJson(key).catch((error) => {
        this.jsonCache.delete(key);
        throw error;
      })
    };
    this.jsonCache.set(key, entry);
    this.evictJsonEntries();
    return entry.promise;
  }

  async fetchJson(url) {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "force-cache"
    });

    if (!response.ok) {
      throw new Error(`Could not load JSON: ${url}`);
    }

    return response.json();
  }

  async loadImage(src, { optional = false, transitionId = null, sceneId = null } = {}) {
    if (!src) {
      return null;
    }

    const key = this.normalizeUrl(src);
    const cachedEntry = this.imageCache.get(key);
    if (cachedEntry) {
      this.touchEntry(this.imageCache, key, cachedEntry);
      this.xrDebug?.log("image-load-start", {
        transitionId,
        sceneId,
        src: key,
        details: {
          mode: cachedEntry.image ? "cache-hit" : "cache-pending",
          optional
        }
      });
      cachedEntry.promise.finally(() => {
        this.xrDebug?.log("image-load-complete", {
          transitionId,
          sceneId,
          src: key,
          details: {
            mode: cachedEntry.image ? "cache-hit" : "cache-pending",
            optional,
            success: cachedEntry.image != null
          }
        });
      });
      return cachedEntry.promise;
    }

    const entry = this.createImageEntry(key, optional, { transitionId, sceneId });
    this.imageCache.set(key, entry);
    this.evictImageEntries([key]);
    return entry.promise;
  }

  preloadAssets(urls, options = {}) {
    return Promise.allSettled(urls.filter(Boolean).map((url) => this.loadImage(url, options)));
  }

  preloadScene(scene, cfg) {
    if (!scene || cfg?.asset_cache?.preload_current_scene === false) {
      return Promise.resolve([]);
    }

    const urls = [scene.media?.src];
    if (cfg?.asset_cache?.preload_minimap_images !== false && scene.minimap_image) {
      urls.push(scene.minimap_image);
    }

    return this.preloadAssets(urls, { optional: true });
  }

  preloadTourSceneMedia(tour, cfg) {
    if (!tour || cfg?.asset_cache?.preload_tour_scene_media !== true) {
      return Promise.resolve([]);
    }

    const urls = tour.scenes.flatMap((scene) => {
      const sceneUrls = [scene.media?.src];
      if (cfg?.asset_cache?.preload_minimap_images !== false && scene.minimap_image) {
        sceneUrls.push(scene.minimap_image);
      }
      return sceneUrls;
    });

    return this.preloadAssets(urls, { optional: true });
  }

  async warmUrl(url, { optional = false } = {}) {
    if (!url) {
      return null;
    }

    const key = this.normalizeUrl(url);
    if (this.warmedUrlKeys.has(key)) {
      return { src: key, warmed: true, cached: true };
    }

    const cachedImageEntry = this.imageCache.get(key);
    if (cachedImageEntry) {
      this.touchEntry(this.imageCache, key, cachedImageEntry);
      return cachedImageEntry.promise
        .then(() => {
          this.warmedUrlKeys.add(key);
          return { src: key, warmed: true, decoded: true };
        })
        .catch((error) => {
          if (optional) {
            return null;
          }
          throw error;
        });
    }

    const existingPromise = this.networkWarmPromises.get(key);
    if (existingPromise) {
      return existingPromise;
    }

    const warmPromise = fetch(key, { cache: "force-cache" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Could not warm image: ${key}`);
        }
        await drainResponse(response);
        this.warmedUrlKeys.add(key);
        return { src: key, warmed: true };
      })
      .catch((error) => {
        if (optional) {
          return null;
        }
        throw error;
      })
      .finally(() => {
        this.networkWarmPromises.delete(key);
      });

    this.networkWarmPromises.set(key, warmPromise);
    return warmPromise;
  }

  warmAssets(urls, { optional = true, concurrency = DEFAULT_WARM_CONCURRENCY } = {}) {
    const normalizedUrls = Array.from(new Set(urls.filter(Boolean)));
    if (normalizedUrls.length === 0) {
      return Promise.resolve([]);
    }

    let nextIndex = 0;
    const workerCount = Math.max(1, Math.min(Number(concurrency) || DEFAULT_WARM_CONCURRENCY, normalizedUrls.length));
    const results = [];

    return Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (nextIndex < normalizedUrls.length) {
          const currentIndex = nextIndex;
          nextIndex += 1;
          const url = normalizedUrls[currentIndex];
          try {
            const warmedAsset = await this.warmUrl(url, { optional });
            results[currentIndex] = { status: "fulfilled", value: warmedAsset };
          } catch (error) {
            results[currentIndex] = { status: "rejected", reason: error };
          }
        }
      })
    ).then(() => results);
  }

  setPinnedImages(urls = []) {
    const nextPinnedKeys = new Set(
      urls
        .filter(Boolean)
        .map((url) => this.normalizeUrl(url))
    );
    this.pinnedImageKeys = nextPinnedKeys;
    this.evictImageEntries();
    return this.pinnedImageKeys.size;
  }

  releaseImage(src, { force = false } = {}) {
    if (!src) {
      return false;
    }

    const key = this.normalizeUrl(src);
    if (!force && this.pinnedImageKeys.has(key)) {
      return false;
    }

    const entry = this.imageCache.get(key);
    if (!entry) {
      return false;
    }

    this.disposeImageEntry(entry);
    this.imageCache.delete(key);
    return true;
  }

  getStats() {
    return {
      jsonCacheSize: this.jsonCache.size,
      imageCacheSize: this.imageCache.size,
      pinnedImageCount: this.pinnedImageKeys.size,
      warmedUrlCount: this.warmedUrlKeys.size,
      pendingWarmCount: this.networkWarmPromises.size,
      maxJsonEntries: this.maxJsonEntries,
      maxImageEntries: this.maxImageEntries
    };
  }

  trimImageCache({ preserveUrls = [], maxEntries = this.maxImageEntries } = {}) {
    const safeMaxEntries = Math.max(1, Number(maxEntries) || this.maxImageEntries);
    const preserve = new Set(this.pinnedImageKeys);
    for (const url of preserveUrls.filter(Boolean)) {
      preserve.add(this.normalizeUrl(url));
    }

    while (this.imageCache.size > safeMaxEntries) {
      const oldestKey = this.findEvictableKey(this.imageCache, preserve);
      if (!oldestKey) {
        break;
      }
      const entry = this.imageCache.get(oldestKey);
      this.disposeImageEntry(entry);
      this.imageCache.delete(oldestKey);
    }

    return this.imageCache.size;
  }

  normalizeUrl(url) {
    return new URL(url, document.baseURI).toString();
  }

  createImageEntry(key, optional, { transitionId = null, sceneId = null } = {}) {
    const entry = {
      image: null,
      settled: false,
      promise: null
    };
    const startedAt = performance.now();

    this.xrDebug?.log("image-load-start", {
      transitionId,
      sceneId,
      src: key,
      details: {
        mode: "decode-start",
        optional
      }
    });

    entry.promise = this.decodeImageAsset(key, { transitionId, sceneId })
      .then((image) => {
        entry.image = image;
        entry.settled = true;
        this.xrDebug?.log("image-load-complete", {
          transitionId,
          sceneId,
          src: key,
          details: {
            mode: image && "close" in image ? "createImageBitmap" : "Image",
            optional,
            success: true,
            durationMs: Number((performance.now() - startedAt).toFixed(3))
          }
        });
        return { src: key, image };
      })
      .catch((error) => {
        entry.settled = true;
        this.imageCache.delete(key);
        this.xrDebug?.log("image-load-complete", {
          transitionId,
          sceneId,
          src: key,
          details: {
            mode: "error",
            optional,
            success: false,
            durationMs: Number((performance.now() - startedAt).toFixed(3)),
            message: error?.message ?? String(error)
          }
        });
        if (optional) {
          return null;
        }
        throw error;
      });

    return entry;
  }

  async decodeImageAsset(key, { transitionId = null, sceneId = null } = {}) {
    if (typeof createImageBitmap === "function" && shouldUseImageBitmapDecode() === true) {
      try {
        const response = await fetch(key, { cache: "force-cache" });
        if (!response.ok) {
          throw new Error(`Could not load image: ${key}`);
        }
        const blob = await response.blob();
        this.xrDebug?.log("image-decode-mode", {
          transitionId,
          sceneId,
          src: key,
          details: {
            mode: "createImageBitmap"
          }
        });
        return await createImageBitmap(blob, {
          imageOrientation: "flipY"
        });
      } catch (error) {
        this.xrDebug?.log("image-decode-mode", {
          transitionId,
          sceneId,
          src: key,
          details: {
            mode: "Image-fallback",
            message: error?.message ?? String(error)
          }
        });
        return this.loadDomImage(key, error);
      }
    }

    this.xrDebug?.log("image-decode-mode", {
      transitionId,
      sceneId,
      src: key,
      details: {
        mode: shouldUseImageBitmapDecode() ? "Image" : "Image-forced"
      }
    });
    return this.loadDomImage(key);
  }

  loadDomImage(key, previousError = null) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => resolve(image);
      image.onerror = () => reject(previousError ?? new Error(`Could not load image: ${key}`));
      image.src = key;
    });
  }

  evictJsonEntries() {
    while (this.jsonCache.size > this.maxJsonEntries) {
      const oldestKey = this.jsonCache.keys().next().value;
      if (!oldestKey) {
        break;
      }
      this.jsonCache.delete(oldestKey);
    }
  }

  evictImageEntries(preserveKeys = []) {
    const preserve = new Set(this.pinnedImageKeys);
    for (const key of preserveKeys.filter(Boolean).map((candidate) => this.normalizeUrl(candidate))) {
      preserve.add(key);
    }
    while (this.imageCache.size > this.maxImageEntries) {
      const oldestKey = this.findEvictableKey(this.imageCache, preserve);
      if (!oldestKey) {
        break;
      }
      const entry = this.imageCache.get(oldestKey);
      this.disposeImageEntry(entry);
      this.imageCache.delete(oldestKey);
    }
  }

  findEvictableKey(map, preserve) {
    for (const key of map.keys()) {
      if (!preserve.has(key)) {
        return key;
      }
    }
    return null;
  }

  touchEntry(map, key, entry) {
    map.delete(key);
    map.set(key, entry);
  }

  disposeImageEntry(entry) {
    const image = entry?.image;
    if (!image) {
      return;
    }
    if ("close" in image && typeof image.close === "function") {
      try {
        image.close();
      } catch {}
    } else {
      image.onload = null;
      image.onerror = null;
    }
    entry.image = null;
  }
}

async function drainResponse(response) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    await response.arrayBuffer();
    return;
  }

  while (true) {
    const { done } = await reader.read();
    if (done) {
      break;
    }
  }
}

function shouldUseImageBitmapDecode() {
  const userAgent = String(globalThis.navigator?.userAgent ?? "");
  return !/OculusBrowser|Meta Quest|Quest 2|Quest 3/i.test(userAgent);
}
