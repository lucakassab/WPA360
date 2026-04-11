import { AppStateStore } from "./AppStateStore.js";
import { PlatformRuntimeCoordinator } from "./PlatformRuntimeCoordinator.js";
import { PlatformSelector, PLATFORM_2D, PLATFORM_VR } from "./PlatformSelector.js";
import { AssetCacheShared } from "../shared/AssetCacheShared.js";
import { CfgLoaderShared } from "../shared/CfgLoaderShared.js";
import { HotspotLoaderShared } from "../shared/HotspotLoaderShared.js";
import { SceneLoaderShared } from "../shared/SceneLoaderShared.js";
import { TourLoaderShared } from "../shared/TourLoaderShared.js";
import { TourRegistryShared } from "../shared/TourRegistryShared.js";
import { MinimapWidget } from "../ui/MinimapWidget.js";
import { TwoDPlatformLauncher } from "../platform/2D_platform/TwoDPlatformLauncher.js";
import { VRPlatformLauncher } from "../platform/VR_platform/VRPlatformLauncher.js";

export class AppKernel {
  constructor(elements) {
    this.elements = elements;
    this.store = new AppStateStore();
    this.assetCache = new AssetCacheShared();
    this.platformSelector = new PlatformSelector();
    this.cfgLoader = new CfgLoaderShared({ assetCache: this.assetCache });
    this.registry = new TourRegistryShared({ assetCache: this.assetCache });
    this.hotspotLoader = new HotspotLoaderShared();
    this.tourLoader = new TourLoaderShared({
      assetCache: this.assetCache,
      hotspotLoader: this.hotspotLoader
    });
    this.navigationInFlight = null;
    this.sceneLoader = new SceneLoaderShared({
      assetCache: this.assetCache,
      hotspotLoader: this.hotspotLoader
    });

    this.context = {
      store: this.store,
      assetCache: this.assetCache,
      getInputProfile: () => this.platformSelector.getInputProfile(),
      goToScene: (sceneId) => this.goToScene(sceneId),
      goToRelativeScene: (step) => this.goToRelativeScene(step),
      goToRelativeTour: (step) => this.goToRelativeTour(step),
      switchPlatform: (platformId, options) => this.switchPlatform(platformId, options),
      exitVrMode: () => this.exitVrMode(),
      updateTourSettings: (patch) => this.updateTourSettings(patch),
      applyEditorDraft: (tour, sceneId) => this.applyEditorDraft(tour, sceneId),
      rerender: () => this.platformCoordinator.renderCurrent(),
      screenToWorldFromEvent: (event, options) => this.platformCoordinator.screenToWorldFromEvent(event, options),
      getActiveRenderer: () => this.platformCoordinator.getActiveRenderer(),
      getRuntimeRoot: () => this.elements.runtimeRoot,
      debugLog: (...args) => this.debugLog(...args),
      setStatus: (message, options) => this.setStatus(message, options)
    };

    this.platformCoordinator = new PlatformRuntimeCoordinator({
      root: elements.runtimeRoot,
      context: this.context,
      launchers: {
        [PLATFORM_2D]: TwoDPlatformLauncher,
        [PLATFORM_VR]: VRPlatformLauncher
      }
    });

    this.minimapWidget = new MinimapWidget({
      root: elements.minimapRoot,
      assetCache: this.assetCache
    });
  }

  async start() {
    this.assertDom();
    this.setStatus("Loading project configuration...");
    this.bindStaticUi();

    const [cfg, master] = await Promise.all([
      this.cfgLoader.load(),
      this.registry.load()
    ]);

    this.store.patch({ cfg, master });
    this.applyDocumentTitle(cfg);
    this.populateTourSelect(master, cfg);

    const initialTourId = this.getInitialTourId(master, cfg);
    await this.loadTour(initialTourId);

    const initialPlatform = await this.platformSelector.detectInitialPlatform(cfg);
    await this.platformCoordinator.switchPlatform(initialPlatform, { userInitiated: false });
    this.updatePlatformButtons(initialPlatform);

    this.store.subscribe((state) => {
      this.minimapWidget.render(state);
      this.updatePlatformButtons(state.platformId);
    });

    await this.maybeRegisterServiceWorker(cfg);
    await this.maybeLoadEditor(cfg);

    this.setStatus("Ready", { hideAfterMs: 1600 });
  }

  assertDom() {
    const required = ["root", "runtimeRoot", "statusRoot", "tourSelect"];
    for (const key of required) {
      if (!this.elements[key]) {
        throw new Error(`Missing DOM element: ${key}`);
      }
    }
  }

  bindStaticUi() {
    this.elements.tourSelect.addEventListener("change", (event) => {
      this.loadTour(event.target.value).catch((error) => this.handleError(error));
    });

    for (const button of this.elements.platformButtons) {
      button.addEventListener("click", () => {
        this.switchPlatform(button.dataset.platformSwitch, { userInitiated: true }).catch((error) => this.handleError(error));
      });
    }
  }

  populateTourSelect(master, cfg) {
    const selectedId = this.getInitialTourId(master, cfg);
    this.elements.tourSelect.replaceChildren(
      ...master.tours.map((tour) => {
        const option = document.createElement("option");
        option.value = tour.id;
        option.textContent = tour.title;
        option.selected = tour.id === selectedId;
        return option;
      })
    );
  }

  getInitialTourId(master, cfg) {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("tour");
    const fallback = cfg?.app?.default_tour_id;
    return this.registry.findTour(master, requested)?.id
      ?? this.registry.findTour(master, fallback)?.id
      ?? master.tours[0]?.id;
  }

  async loadTour(tourId) {
    const state = this.store.getSnapshot();
    const entry = this.registry.findTour(state.master, tourId);
    if (!entry) {
      throw new Error("No tour available in master.json.");
    }

    this.setStatus(`Loading ${entry.title}...`);
    this.store.patch({ isLoading: true, error: null });

    const tour = await this.tourLoader.load(entry);
    await this.assetCache.preloadTourSceneMedia(tour, state.cfg);
    const scene = await this.sceneLoader.loadScene(tour, tour.initial_scene, state.cfg);

    this.elements.tourSelect.value = entry.id;
    this.store.patch({
      currentTourEntry: entry,
      currentTour: tour,
      currentScene: scene,
      currentSceneId: scene.id,
      isLoading: false
    });

    this.applyTourTitle(tour, scene);
    await this.platformCoordinator.renderCurrent();
  }

  async goToScene(sceneId) {
    const state = this.store.getSnapshot();
    this.debugLog("navigation:request", {
      from: state.currentSceneId,
      to: sceneId,
      tour: state.currentTour?.id,
      platform: state.platformId
    });

    if (!state.currentTour) {
      this.debugLog("navigation:blocked:no-current-tour", { targetSceneId: sceneId });
      return;
    }

    if (state.currentSceneId === sceneId) {
      this.debugLog("navigation:blocked:same-scene", { sceneId });
      return;
    }

    const targetExists = state.currentTour.scenes?.some((scene) => scene.id === sceneId);
    if (!targetExists) {
      const message = `Hotspot target scene not found: ${sceneId}`;
      this.debugLog("navigation:blocked:missing-target", {
        targetSceneId: sceneId,
        availableScenes: state.currentTour.scenes?.map((scene) => scene.id) ?? []
      });
      this.setStatus(message, { hideAfterMs: 2200 });
      throw new Error(message);
    }

    if (this.navigationInFlight === sceneId) {
      this.debugLog("navigation:blocked:already-loading", { sceneId });
      return;
    }

    this.navigationInFlight = sceneId;

    try {
      this.setStatus(`Loading scene ${sceneId}...`);
      const scene = await this.sceneLoader.loadScene(state.currentTour, sceneId, state.cfg);
      this.store.patch({
        currentScene: scene,
        currentSceneId: scene.id
      });

      this.applyTourTitle(state.currentTour, scene);
      await this.platformCoordinator.renderCurrent();
      this.debugLog("navigation:complete", {
        from: state.currentSceneId,
        to: scene.id,
        title: scene.title
      });
      this.setStatus(`Scene: ${scene.title ?? scene.id}`, { hideAfterMs: 1200 });
    } catch (error) {
      this.debugLog("navigation:error", { targetSceneId: sceneId, error });
      throw error;
    } finally {
      if (this.navigationInFlight === sceneId) {
        this.navigationInFlight = null;
      }
    }
  }

  async goToRelativeScene(step = 1) {
    const state = this.store.getSnapshot();
    const scenes = state.currentTour?.scenes ?? [];
    if (scenes.length === 0) {
      return;
    }

    const currentIndex = scenes.findIndex((scene) => scene.id === state.currentSceneId);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = modulo(safeIndex + Number(step || 0), scenes.length);
    const nextScene = scenes[nextIndex];
    if (!nextScene) {
      return;
    }

    await this.goToScene(nextScene.id);
  }

  async goToRelativeTour(step = 1) {
    const state = this.store.getSnapshot();
    const tours = state.master?.tours ?? [];
    if (tours.length === 0) {
      return;
    }

    const currentIndex = tours.findIndex((tour) => tour.id === state.currentTourEntry?.id);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = modulo(safeIndex + Number(step || 0), tours.length);
    const nextTour = tours[nextIndex];
    if (!nextTour) {
      return;
    }

    await this.loadTour(nextTour.id);
  }

  async exitVrMode() {
    const renderer = this.platformCoordinator.getActiveRenderer();
    if (renderer?.isPresenting?.() && renderer?.exitImmersive) {
      await renderer.exitImmersive();
    }

    await this.switchPlatform(PLATFORM_2D, { userInitiated: true });
  }

  async switchPlatform(platformId, { userInitiated = false } = {}) {
    const cfg = this.store.getSnapshot().cfg;
    if (platformId === PLATFORM_VR && cfg?.features?.vr === false) {
      this.setStatus("VR is disabled in cfg.json.");
      return;
    }

    if (cfg?.platform?.allow_runtime_switch === false) {
      this.setStatus("Runtime platform switching is disabled in cfg.json.");
      return;
    }

    this.setStatus(`Switching to ${platformId}...`);
    await this.platformCoordinator.switchPlatform(platformId, { userInitiated });
    this.setStatus(`${platformId} active`, { hideAfterMs: 1200 });
  }

  updateTourSettings(patch) {
    const state = this.store.getSnapshot();
    if (!state.currentTour) {
      return;
    }

    const nextTour = {
      ...state.currentTour,
      ...patch,
      settings: {
        ...state.currentTour.settings,
        ...patch.settings
      }
    };

    this.store.patch({ currentTour: nextTour });
    this.applyTourTitle(nextTour, state.currentScene);
    this.platformCoordinator.renderCurrent();
  }

  async applyEditorDraft(tour, sceneId) {
    const state = this.store.getSnapshot();
    if (!tour) {
      return;
    }

    const nextScene = await this.sceneLoader.loadScene(
      tour,
      sceneId ?? tour.initial_scene,
      state.cfg
    );

    this.store.patch({
      currentTour: tour,
      currentScene: nextScene,
      currentSceneId: nextScene.id
    });
    this.applyTourTitle(tour, nextScene);
    await this.platformCoordinator.renderCurrent();
  }

  applyDocumentTitle(cfg) {
    document.title = cfg?.ui?.title ?? cfg?.app?.name ?? "WPA360";
  }

  applyTourTitle(tour, scene) {
    if (!this.elements.titleRoot || !tour) {
      return;
    }
    this.elements.titleRoot.textContent = scene?.title ? `${tour.title} / ${scene.title}` : tour.title;
  }

  updatePlatformButtons(platformId) {
    for (const button of this.elements.platformButtons) {
      button.classList.toggle("is-active", button.dataset.platformSwitch === platformId);
    }
  }

  async maybeRegisterServiceWorker(cfg) {
    if (cfg?.features?.service_worker === false || !("serviceWorker" in navigator)) {
      return;
    }

    try {
      await navigator.serviceWorker.register("./sw.js");
    } catch (error) {
      console.warn("[WPA360] service worker registration failed", error);
    }
  }

  async maybeLoadEditor(cfg) {
    const params = new URLSearchParams(window.location.search);
    if (params.get("editor") !== "1" || cfg?.features?.editor === false) {
      return;
    }

    const { mountEditor } = await import("../editor/EditorModule.js");
    mountEditor({
      root: this.elements.editorRoot,
      context: this.context
    });
  }

  setStatus(message, { hideAfterMs = 0 } = {}) {
    const root = this.elements.statusRoot;
    if (!root) {
      return;
    }

    root.textContent = message;
    root.classList.remove("is-hidden");
    window.clearTimeout(this.statusTimer);

    if (hideAfterMs > 0) {
      this.statusTimer = window.setTimeout(() => {
        root.classList.add("is-hidden");
      }, hideAfterMs);
    }
  }

  debugLog(eventName, payload = {}) {
    console.debug("[WPA360]", eventName, payload);
  }

  getDebugSnapshot() {
    const state = this.store.getSnapshot();
    const renderer = this.platformCoordinator.getActiveRenderer();

    return {
      platformId: state.platformId,
      tourId: state.currentTour?.id ?? null,
      sceneId: state.currentSceneId ?? null,
      presenting: renderer?.isPresenting?.() ?? false,
      performance: renderer?.getPerformanceSnapshot?.() ?? null
    };
  }

  handleError(error) {
    console.error("[WPA360]", error);
    this.store.patch({ error, isLoading: false });
    this.setStatus(error.message);
  }
}

function modulo(value, length) {
  return ((value % length) + length) % length;
}
