export class AssetCacheShared {
  constructor() {
    this.jsonCache = new Map();
    this.imageCache = new Map();
    this.assetPromises = new Map();
  }

  async loadJson(url) {
    const key = this.normalizeUrl(url);
    if (!this.jsonCache.has(key)) {
      this.jsonCache.set(key, this.fetchJson(key));
    }
    return this.jsonCache.get(key);
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

  async loadImage(src, { optional = false } = {}) {
    if (!src) {
      return null;
    }

    const key = this.normalizeUrl(src);
    if (!this.imageCache.has(key)) {
      this.imageCache.set(key, new Promise((resolve, reject) => {
        const image = new Image();
        image.decoding = "async";
        image.onload = () => resolve({ src: key, image });
        image.onerror = () => {
          const error = new Error(`Could not load image: ${key}`);
          if (optional) {
            resolve(null);
          } else {
            reject(error);
          }
        };
        image.src = key;
      }));
    }

    return this.imageCache.get(key);
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

  normalizeUrl(url) {
    return new URL(url, document.baseURI).toString();
  }
}
