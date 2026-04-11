export class CfgLoaderShared {
  constructor({ assetCache, path = "./data/cfg.json" }) {
    this.assetCache = assetCache;
    this.path = path;
  }

  async load() {
    const cfg = await this.assetCache.loadJson(this.path);
    return {
      app: {
        id: "wpa360",
        name: "WPA360",
        default_tour_id: null,
        default_platform: "auto",
        ...cfg.app
      },
      features: {
        minimap_widget: true,
        vr: true,
        editor: true,
        service_worker: true,
        ...cfg.features
      },
      ui: {
        title: "WPA360 Virtual Tour",
        hotspot_billboard: true,
        minimap_card_position: "bottom-right",
        ...cfg.ui
      },
      platform: {
        allow_runtime_switch: true,
        ...cfg.platform
      },
      asset_cache: {
        preload_current_scene: true,
        preload_tour_scene_media: false,
        preload_minimap_images: true,
        ...cfg.asset_cache
      }
    };
  }
}
