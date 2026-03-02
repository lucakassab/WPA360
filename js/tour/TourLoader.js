// js/tour/TourLoader.js
export async function loadTours() {
  const res = await fetch("./tours.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`Falha ao carregar tours.json (HTTP ${res.status})`);
  const root = await res.json();

  const toursObj = root?.tours ?? {};
  const tourIds = Object.keys(toursObj);
  if (!tourIds.length) throw new Error("tours.json sem tours.");

  const defaultTourId = root?.defaultTour && toursObj[root.defaultTour]
    ? root.defaultTour
    : tourIds[0];

  const toursById = new Map();
  const scenesByTour = new Map();
  const tourOrder = [...tourIds];

  for (const tid of tourOrder) {
    const tour = toursObj[tid];
    toursById.set(tid, tour);

    const scenes = Array.isArray(tour?.scenes) ? tour.scenes : [];
    const sceneOrder = scenes.map(s => String(s.id));
    const sceneById = new Map(scenes.map(s => [String(s.id), s]));

    scenesByTour.set(tid, { sceneOrder, sceneById });
  }

  // compat: mantém os campos “antigos” apontando pro defaultTour
  const def = scenesByTour.get(defaultTourId);

  return {
    defaultTourId,
    tourOrder,
    toursById,
    scenesByTour,

    // compat
    tour: toursById.get(defaultTourId),
    sceneOrder: def.sceneOrder,
    sceneById: def.sceneById,
  };
}