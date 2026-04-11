export class SceneLoaderShared {
  constructor({ assetCache, hotspotLoader }) {
    this.assetCache = assetCache;
    this.hotspotLoader = hotspotLoader;
  }

  async loadScene(tour, sceneId, cfg) {
    if (!tour) {
      throw new Error("Cannot load scene without a tour.");
    }

    const requestedScene = tour.scenes.find((scene) => scene.id === sceneId) ?? tour.scenes[0];
    if (!requestedScene) {
      throw new Error(`Tour has no scenes: ${tour.id}`);
    }

    const scene = {
      ...requestedScene,
      hotspots: this.hotspotLoader.normalizeHotspots(requestedScene.hotspots, requestedScene),
      minimap_image: requestedScene.minimap_image || null
    };

    if (cfg?.asset_cache?.preload_current_scene !== false) {
      const [mediaAsset, minimapAsset] = await Promise.all([
        this.assetCache.loadImage(scene.media?.src, { optional: true }),
        scene.minimap_image ? this.assetCache.loadImage(scene.minimap_image, { optional: true }) : Promise.resolve(null)
      ]);

      scene.media_available = Boolean(mediaAsset || !scene.media?.src);
      scene.minimap_image = minimapAsset ? scene.minimap_image : null;
    } else {
      await this.assetCache.preloadScene(scene, cfg);
    }

    return scene;
  }
}
