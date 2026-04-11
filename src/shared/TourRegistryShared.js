export class TourRegistryShared {
  constructor({ assetCache, path = "./data/master.json" }) {
    this.assetCache = assetCache;
    this.path = path;
  }

  async load() {
    const master = await this.assetCache.loadJson(this.path);
    const tours = Array.isArray(master.tours) ? master.tours : [];
    return {
      version: master.version ?? 1,
      tours: tours.map((tour) => ({
        id: tour.id,
        title: tour.title ?? tour.id,
        description: tour.description ?? "",
        thumbnail: tour.thumbnail ?? null,
        tour_json: tour.tour_json
      })).filter((tour) => tour.id && tour.tour_json)
    };
  }

  findTour(master, tourId) {
    return master.tours.find((tour) => tour.id === tourId) ?? master.tours[0] ?? null;
  }
}
