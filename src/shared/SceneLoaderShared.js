const PRELOAD_CONCURRENCY = 3;
const MAX_SCENE_CACHE_ENTRIES = 6;

export class SceneLoaderShared {
  constructor({ assetCache, hotspotLoader }) {
    this.assetCache = assetCache;
    this.hotspotLoader = hotspotLoader;
    this.sceneCache = new WeakMap();
    this.preloadJobs = new WeakMap();
  }

  async loadScene(tour, sceneId, cfg, options = {}) {
    if (!tour) {
      throw new Error("Cannot load scene without a tour.");
    }

    const requestedScene = tour.scenes.find((scene) => scene.id === sceneId) ?? tour.scenes[0];
    if (!requestedScene) {
      throw new Error(`Tour has no scenes: ${tour.id}`);
    }

    const shouldWarmAssets = options.preloadAssets === true
      ? true
      : options.preloadAssets === false
        ? false
        : cfg?.asset_cache?.preload_current_scene !== false;
    const cache = this.getOrCreateSceneCache(tour);
    const cachedEntry = cache.get(requestedScene.id);
    if (cachedEntry && (!shouldWarmAssets || cachedEntry.assetsWarmed)) {
      this.touchCacheEntry(cache, requestedScene.id, cachedEntry);
      return cachedEntry.promise;
    }

    const cacheEntry = {
      assetsWarmed: shouldWarmAssets,
      promise: this.buildScene(requestedScene, cfg, { warmAssets: shouldWarmAssets })
        .catch((error) => {
          const activeEntry = cache.get(requestedScene.id);
          if (activeEntry?.promise === cacheEntry.promise) {
            cache.delete(requestedScene.id);
          }
          throw error;
        })
    };

    cache.set(requestedScene.id, cacheEntry);
    this.trimSceneCache(cache, requestedScene.id);
    return cacheEntry.promise;
  }

  preloadTourScenes(tour, cfg, { prioritySceneId = null } = {}) {
    const allSceneIds = (tour?.scenes ?? []).map((scene) => scene.id);
    return this.preloadScenes(tour, allSceneIds, cfg, { prioritySceneId });
  }

  preloadScenes(tour, sceneIds = [], cfg, { prioritySceneId = null } = {}) {
    if (!tour?.scenes?.length) {
      return Promise.resolve([]);
    }

    const normalizedSceneIds = Array.from(new Set(
      (sceneIds ?? []).filter(Boolean).map((sceneId) => String(sceneId))
    ));
    if (normalizedSceneIds.length === 0) {
      return Promise.resolve([]);
    }

    const jobKey = JSON.stringify({
      sceneIds: normalizedSceneIds,
      prioritySceneId: prioritySceneId ? String(prioritySceneId) : null
    });
    const tourJobs = this.getOrCreatePreloadJobs(tour);
    const existingJob = tourJobs.get(jobKey);
    if (existingJob) {
      return existingJob;
    }

    const requestedSceneIds = new Set(normalizedSceneIds);
    const scenes = tour.scenes.filter((scene) => requestedSceneIds.has(String(scene.id)));
    if (prioritySceneId) {
      scenes.sort((left, right) => {
        if (left.id === prioritySceneId) {
          return -1;
        }
        if (right.id === prioritySceneId) {
          return 1;
        }
        return 0;
      });
    }

    let nextIndex = 0;
    const workerCount = Math.max(1, Math.min(PRELOAD_CONCURRENCY, scenes.length));
    const preloadErrors = [];
    const preloadJob = Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (nextIndex < scenes.length) {
          const currentIndex = nextIndex;
          nextIndex += 1;
          const scene = scenes[currentIndex];
          try {
            await this.loadScene(tour, scene.id, cfg, { preloadAssets: true });
          } catch (error) {
            preloadErrors.push({
              sceneId: scene.id,
              error
            });
          }
        }
      })
    )
      .then(() => preloadErrors)
      .finally(() => {
        if (tourJobs.get(jobKey) === preloadJob) {
          tourJobs.delete(jobKey);
        }
      });

    tourJobs.set(jobKey, preloadJob);
    return preloadJob;
  }

  getOrCreateSceneCache(tour) {
    let cache = this.sceneCache.get(tour);
    if (!cache) {
      cache = new Map();
      this.sceneCache.set(tour, cache);
    }
    return cache;
  }

  getOrCreatePreloadJobs(tour) {
    let jobs = this.preloadJobs.get(tour);
    if (!jobs) {
      jobs = new Map();
      this.preloadJobs.set(tour, jobs);
    }
    return jobs;
  }

  touchCacheEntry(cache, sceneId, entry) {
    cache.delete(sceneId);
    cache.set(sceneId, entry);
  }

  trimSceneCache(cache, preserveSceneId = null) {
    while (cache.size > MAX_SCENE_CACHE_ENTRIES) {
      const oldestKey = cache.keys().next().value;
      if (!oldestKey) {
        break;
      }
      if (oldestKey === preserveSceneId) {
        const entry = cache.get(oldestKey);
        this.touchCacheEntry(cache, oldestKey, entry);
        continue;
      }
      cache.delete(oldestKey);
    }
  }

  async buildScene(requestedScene, cfg, { warmAssets = true } = {}) {
    const scene = {
      ...requestedScene,
      hotspots: this.hotspotLoader.normalizeHotspots(requestedScene.hotspots, requestedScene),
      minimap_image: requestedScene.minimap_image || null
    };

    if (warmAssets) {
      const [mediaAsset, minimapAsset] = await Promise.all([
        this.assetCache.loadImage(scene.media?.src, { optional: true }),
        scene.minimap_image ? this.assetCache.loadImage(scene.minimap_image, { optional: true }) : Promise.resolve(null)
      ]);

      scene.media_available = Boolean(mediaAsset || !scene.media?.src);
      scene.minimap_image = minimapAsset ? scene.minimap_image : null;
      return scene;
    }

    scene.media_available = scene.media?.src ? true : false;
    return scene;
  }
}
