export class TourLoaderShared {
  constructor({ assetCache, hotspotLoader }) {
    this.assetCache = assetCache;
    this.hotspotLoader = hotspotLoader;
  }

  async load(tourEntry) {
    const tour = await this.assetCache.loadJson(tourEntry.tour_json);
    const scenes = Array.isArray(tour.scenes) ? tour.scenes : [];

    return {
      id: tour.id ?? tourEntry.id,
      title: tour.title ?? tourEntry.title ?? tourEntry.id,
      initial_scene: tour.initial_scene ?? scenes[0]?.id ?? null,
      media_type: tour.media_type ?? "equirectangular-image",
      settings: {
        rotation: { yaw: 0, pitch: 0, roll: 0, ...tour.settings?.rotation },
        scale: Number(tour.settings?.scale ?? 1),
        billboard: tour.settings?.billboard !== false,
        ...tour.settings
      },
      scenes: scenes.map((scene) => this.normalizeScene(scene, tour)),
      raw: tour
    };
  }

  normalizeScene(scene, tour) {
    const source = scene && typeof scene === "object" ? scene : {};
    const {
      media: sourceMedia,
      hotspots: _sourceHotspots,
      labels: _sourceLabels,
      rotation: sourceRotation,
      ...sceneRest
    } = source;
    const media = typeof source.media === "string"
      ? { type: "image", src: source.media, projection: "equirectangular" }
      : { type: "image", projection: "equirectangular", ...sourceMedia };

    return {
      ...sceneRest,
      media,
      media_type: source.media_type ?? tour.media_type ?? "equirectangular-image",
      scale: Number(source.scale ?? tour.settings?.scale ?? 1),
      billboard: source.billboard ?? tour.settings?.billboard ?? true,
      rotation: {
        yaw: 0,
        pitch: 0,
        roll: 0,
        ...tour.settings?.rotation,
        ...sourceRotation
      },
      hotspots: this.hotspotLoader?.normalizeHotspots(source.hotspots, source) ?? []
    };
  }
}
