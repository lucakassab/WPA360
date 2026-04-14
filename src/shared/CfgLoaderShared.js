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
        ...cfg.ui,
        chrome: {
          show_brand_mark: true,
          show_brand_name: true,
          show_scene_select: true,
          show_pwa_install_button: true,
          show_platform_badge: true,
          show_webxr_badge: true,
          show_pwa_badge: true,
          show_service_worker_badge: true,
          show_input_badge: true,
          show_standalone_badge: true,
          ...cfg.ui?.chrome
        }
      },
      platform: {
        allow_runtime_switch: true,
        ...cfg.platform,
        vr: {
          hotspot_visibility_mode: "always",
          ...cfg.platform?.vr
        }
      },
      asset_cache: {
        preload_mode: "full",
        preload_current_scene: true,
        preload_tour_scene_media: true,
        preload_minimap_images: true,
        hybrid_download_concurrency: 2,
        hybrid_resident_scene_limit: 3,
        ...cfg.asset_cache
      }
    };
  }
}
