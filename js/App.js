// js/App.js
import { loadTours } from "./tour/TourLoader.js";
import {
  applySceneOffsets,
  yawPitchToDirection,
  applyHotspotOffset,
  resolveDistance
} from "./tour/HotspotPlacement.js";
import HotspotRenderer from "./hotspots/HotspotRenderer.js";

const LS_FOV = "tour_fov_v1";
const LS_LINK = "tour_link_mode_v1";

export default class App {
  constructor(refs) {
    this.sceneEl = refs.sceneEl;
    this.panoEl = refs.panoEl;
    this.cameraRigEl = refs.cameraRigEl;
    this.cameraEl = refs.cameraEl;
    this.cursorEl = refs.cursorEl;
    this.hotspotsEl = refs.hotspotsEl;
    this.leftHandEl = refs.leftHandEl;
    this.rightHandEl = refs.rightHandEl;
    this.ui = refs.ui;

    this._events = new EventTarget();

    this._defaultTourId = null;
    this._tourOrder = [];
    this._toursById = new Map();
    this._scenesByTour = new Map();

    this.currentTourId = null;
    this._sceneOrder = [];
    this._sceneById = new Map();
    this.currentSceneId = null;

    this._linkTours = false;
    this._fov = 80;

    this.hotspotAnchorEl = null;
    this.hotspotRenderer = null;

    this._pendingViewToken = 0;
    this._isTransitioning = false;
    this._queuedNav = null;

    this._vrDebugEnabled = false;
    this._vrConsoleEl = null;

    // ✅ VR widget: agora só existe DURANTE immersive-vr
    this._vrWidgetEl = null;
    this._vrWidgetHandlers = null;

    this.vrConfig = {};
  }

  on(type, handler) { this._events.addEventListener(type, handler); }
  emit(type, detail = {}) { this._events.dispatchEvent(new CustomEvent(type, { detail })); }

  setVRButtonVisible(visible) {
    if (this.ui.btnVR) this.ui.btnVR.hidden = !visible;
  }

  setInstallButtonVisible(visible) {
    if (this.ui.btnInstall) this.ui.btnInstall.hidden = !visible;
  }

  getCurrentScene() {
    return this._sceneById.get(this.currentSceneId) ?? null;
  }

  async init({ debugHotspots = false, vrDebug = false } = {}) {
    await new Promise((resolve) => {
      if (this.sceneEl.hasLoaded) return resolve();
      this.sceneEl.addEventListener("loaded", resolve, { once: true });
    });

    const data = await loadTours();
    this._defaultTourId = data.defaultTourId;
    this._tourOrder = data.tourOrder;
    this._toursById = data.toursById;
    this._scenesByTour = data.scenesByTour;

    this._linkTours = localStorage.getItem(LS_LINK) === "1";

    const savedFov = Number(localStorage.getItem(LS_FOV));
    this._fov = Number.isFinite(savedFov) ? savedFov : 80;
    this._applyFov(this._fov);

    this._wireDomUI();

    this._vrDebugEnabled = !!vrDebug;
    if (this._vrDebugEnabled) this._setupVrDebugConsole();

    // tour inicial
    this._setCurrentTour(this._defaultTourId);

    // hotspot renderer
    this.hotspotRenderer = new HotspotRenderer({
      showTooltip: () => {},
      hideTooltip: () => {},
      canHover: () => false,
      isVR: () => this.sceneEl.is("vr-mode"),
      onNavigate: (hs) => {
        const target = this._resolveHotspotTarget(hs);
        if (!target) return;
        void this.goToScene(target.sceneId, { tourId: target.tourId, fromHotspot: hs });
      }
    });

    // cena inicial
    const firstScene = this._sceneOrder[0];
    await this.goToScene(firstScene, { tourId: this.currentTourId, pushHash: false });

    // ✅ ENTER/EXIT VR: cria/destrói widget só em immersive-vr
    this.sceneEl.addEventListener("enter-vr", async () => {
      // A-Frame pode entrar em "vr-mode" sem session pronta ainda, então espera um tiquinho
      const session = await this._waitXRSession(600);
      const isImmersive = session?.mode === "immersive-vr";

      if (isImmersive) {
        this._ensureVrWidget();
        this._syncVrWidget();
      } else {
        // se não é immersive, garante que não existe
        this._destroyVrWidget();
      }

      if (this._vrConsoleEl) {
        this._vrConsoleEl.setAttribute("visible", (this._vrDebugEnabled && isImmersive) ? "true" : "false");
      }
    });

    this.sceneEl.addEventListener("exit-vr", () => {
      // ✅ sai da sessão: remove do DOM
      this._destroyVrWidget();
      if (this._vrConsoleEl) this._vrConsoleEl.setAttribute("visible", "false");
    });

    if (debugHotspots) {
      const mod = await import("./tour/HotspotDebug.js");
      this._debug = new mod.default(this);
      this._debug.init({ enabled: true });
    } else {
      const el = document.querySelector("#hsdebug");
      if (el) el.remove();
    }
  }

  // ---------------- DOM UI ----------------

  _wireDomUI() {
    this.ui.btnPrev?.addEventListener("click", () => void this.prevScene());
    this.ui.btnNext?.addEventListener("click", () => void this.nextScene());
    this.ui.btnVR?.addEventListener("click", () => {
      if (this.sceneEl.is("vr-mode")) this.sceneEl.exitVR();
      else this.sceneEl.enterVR();
    });

    this.ui.fovSlider?.addEventListener("input", () => {
      const v = Number(this.ui.fovSlider.value);
      this._applyFov(v);
      try { localStorage.setItem(LS_FOV, String(Math.round(v))); } catch {}
    });
  }

  // ---------------- VR Debug console ----------------

  _setupVrDebugConsole() {
    this._vrConsoleEl = document.createElement("a-entity");
    this._vrConsoleEl.setAttribute("id", "vrConsole");
    this._vrConsoleEl.setAttribute("position", "0 -0.12 -0.65");
    this._vrConsoleEl.setAttribute("visible", "false");
    this._vrConsoleEl.setAttribute("vr-debug-console", "");
    this.cameraEl.appendChild(this._vrConsoleEl);
  }

  // ---------------- VR Widget lifecycle (NEW) ----------------

  async _waitXRSession(timeoutMs = 600) {
    const start = performance.now();
    while (performance.now() - start < timeoutMs) {
      const s = this.sceneEl?.renderer?.xr?.getSession?.() || null;
      if (s) return s;
      await new Promise(r => setTimeout(r, 30));
    }
    return this.sceneEl?.renderer?.xr?.getSession?.() || null;
  }

  _ensureVrWidget() {
    if (this._vrWidgetEl) {
      // garante visível (dentro da session)
      this._vrWidgetEl.setAttribute("visible", "true");
      return;
    }

    const el = document.createElement("a-entity");
    el.setAttribute("id", "vrWidget");
    el.setAttribute("visible", "true");
    el.setAttribute("vr-widget", "");

    // ancorado na câmera (mas só existe em immersive-vr agora)
    this.cameraEl.appendChild(el);
    this._vrWidgetEl = el;

    // Handlers guardados pra remover depois
    const hPrev = () => void this.prevScene();
    const hNext = () => void this.nextScene();
    const hFov = (e) => {
      const d = Number(e?.detail?.delta || 0);
      this._applyFov(this._fov + d);
      try { localStorage.setItem(LS_FOV, String(this._fov)); } catch {}
      this._syncVrWidget();
    };
    const hTour = (e) => this._stepTour(Number(e?.detail?.delta || 0));
    const hScene = (e) => this._stepScene(Number(e?.detail?.delta || 0));

    el.addEventListener("vrwidget:prevscene", hPrev);
    el.addEventListener("vrwidget:nextscene", hNext);
    el.addEventListener("vrwidget:fovdelta", hFov);
    el.addEventListener("vrwidget:tourstep", hTour);
    el.addEventListener("vrwidget:scenestep", hScene);

    this._vrWidgetHandlers = { hPrev, hNext, hFov, hTour, hScene };
  }

  _destroyVrWidget() {
    const el = this._vrWidgetEl;
    if (!el) return;

    try {
      const hs = this._vrWidgetHandlers;
      if (hs) {
        el.removeEventListener("vrwidget:prevscene", hs.hPrev);
        el.removeEventListener("vrwidget:nextscene", hs.hNext);
        el.removeEventListener("vrwidget:fovdelta", hs.hFov);
        el.removeEventListener("vrwidget:tourstep", hs.hTour);
        el.removeEventListener("vrwidget:scenestep", hs.hScene);
      }
    } catch {}

    try { el.remove(); } catch {}
    this._vrWidgetEl = null;
    this._vrWidgetHandlers = null;
  }

  _syncVrWidget() {
    const el = this._vrWidgetEl;
    if (!el) return;

    const tour = this._toursById.get(this.currentTourId);
    const scene = this.getCurrentScene();

    const hasMap = !!tour?.map_png;
    const marker = parsePercentPair(scene?.scene_map_position);

    el.emit("vrwidget:update", {
      tourTitle: tour?.title ?? this.currentTourId ?? "—",
      sceneTitle: scene?.name ?? scene?.id ?? "—",
      fov: this._fov,
      hasMap,
      mapSrc: tour?.map_png ?? "",
      marker: hasMap ? marker : null
    }, false);
  }

  _stepTour(delta) {
    const order = this._tourOrder;
    const idx = Math.max(0, order.indexOf(this.currentTourId));
    const next = order[(idx + delta + order.length) % order.length];
    if (!next || next === this.currentTourId) return;

    this._setCurrentTour(next);
    const start = this._sceneOrder[0];
    if (start) void this.goToScene(start, { tourId: next });
  }

  _stepScene(delta) {
    const order = this._sceneOrder;
    const idx = Math.max(0, order.indexOf(this.currentSceneId));
    const next = order[(idx + delta + order.length) % order.length];
    if (!next || next === this.currentSceneId) return;
    void this.goToScene(next, { tourId: this.currentTourId });
  }

  // ---------------- Tour switching ----------------

  _setCurrentTour(tourId) {
    const tid = this._canonicalTourId(tourId);
    if (!tid) return false;

    const pack = this._scenesByTour.get(tid);
    if (!pack) return false;

    this.currentTourId = tid;
    this._sceneOrder = pack.sceneOrder;
    this._sceneById = pack.sceneById;

    return true;
  }

  _canonicalTourId(tourId) {
    const raw = String(tourId || "").trim();
    if (!raw) return null;
    if (this._toursById.has(raw)) return raw;
    const low = raw.toLowerCase();
    for (const k of this._toursById.keys()) {
      if (String(k).toLowerCase() === low) return k;
    }
    return null;
  }

  // ---------------- Navigation ----------------

  prevScene() {
    const idx = Math.max(0, this._sceneOrder.indexOf(this.currentSceneId));
    const prev = this._sceneOrder[(idx - 1 + this._sceneOrder.length) % this._sceneOrder.length];
    return this.goToScene(prev, { tourId: this.currentTourId });
  }

  nextScene() {
    const idx = Math.max(0, this._sceneOrder.indexOf(this.currentSceneId));
    const next = this._sceneOrder[(idx + 1) % this._sceneOrder.length];
    return this.goToScene(next, { tourId: this.currentTourId });
  }

  async goToScene(sceneId, opts = {}) {
    const { fromHotspot = null } = opts;
    const tourId = this._canonicalTourId(opts.tourId) ?? this.currentTourId ?? this._defaultTourId;

    if (this._isTransitioning) {
      this._queuedNav = { sceneId, opts: { ...opts, tourId } };
      return;
    }

    if (tourId !== this.currentTourId) this._setCurrentTour(tourId);

    const scene = this._sceneById.get(sceneId);
    if (!scene) return;

    this._isTransitioning = true;
    this._queuedNav = null;

    this.currentSceneId = sceneId;

    await this._setPanoAndWait(scene.pano);

    this._applyViewForScene(scene, fromHotspot);

    this._ensureHotspotAnchor();
    this._renderHotspots(scene);

    // ✅ atualiza widget se existir (em VR immersive)
    this._syncVrWidget();

    this._isTransitioning = false;

    if (this._queuedNav) {
      const q = this._queuedNav;
      this._queuedNav = null;
      await this.goToScene(q.sceneId, q.opts);
    }
  }

  async _setPanoAndWait(src) {
    const comp = this.panoEl?.components?.["stereo-top-bottom"];
    if (comp?.setSrc) { await comp.setSrc(src); return; }

    this.panoEl.setAttribute("stereo-top-bottom", { src, radius: 5000 });
    await new Promise((resolve) => {
      const onLoad = (e) => { if (e?.detail?.src === src) resolve(); };
      this.panoEl.addEventListener("stereo-loaded", onLoad, { once: true });
    });
  }

  _ensureHotspotAnchor() {
    const THREE = window.AFRAME.THREE;

    if (!this.hotspotAnchorEl) {
      this.hotspotAnchorEl = document.createElement("a-entity");
      this.hotspotAnchorEl.setAttribute("id", "hotspotAnchor");
      this.sceneEl.appendChild(this.hotspotAnchorEl);
      this.hotspotAnchorEl.appendChild(this.hotspotsEl);
    }

    const rigWorld = new THREE.Vector3();
    (this.cameraRigEl?.object3D ?? this.cameraEl.object3D).getWorldPosition(rigWorld);
    this.hotspotAnchorEl.setAttribute("position", `${rigWorld.x} ${rigWorld.y} ${rigWorld.z}`);
  }

  _renderHotspots(scene) {
    if (!this.hotspotRenderer) return;
    while (this.hotspotsEl.firstChild) this.hotspotsEl.removeChild(this.hotspotsEl.firstChild);

    const sceneStyle = scene.hotspotStyle ?? {};

    for (const hs of (scene.hotspots ?? [])) {
      const yawIn = Number(hs.yaw ?? 0);
      const pitchIn = Number(hs.pitch ?? 0);

      const { yaw, pitch } = applySceneOffsets(yawIn, pitchIn, scene);
      const distance = resolveDistance(hs, scene, 4.0);
      const dir = yawPitchToDirection(yaw, pitch);

      const basePos = applyHotspotOffset(
        { x: dir.x * distance, y: dir.y * distance, z: dir.z * distance },
        hs
      );

      const el = this.hotspotRenderer.createHotspot({
        hs,
        sceneStyle,
        position: basePos
      });

      this.hotspotsEl.appendChild(el);
    }
  }

  _applyViewForScene(_scene, _fromHotspot) {
    // no VR ignora (mantém teu comportamento antigo se tiver)
  }

  _applyFov(fov) {
    const v = Math.max(50, Math.min(110, Number(fov) || 80));
    this._fov = Math.round(v);

    if (this.ui.fovSlider) this.ui.fovSlider.value = String(this._fov);
    if (this.ui.fovValue) this.ui.fovValue.textContent = String(this._fov);

    if (this.cameraEl) {
      this.cameraEl.setAttribute("camera", "fov", this._fov);
      const cam = this.cameraEl.getObject3D("camera");
      if (cam) { cam.fov = this._fov; cam.updateProjectionMatrix?.(); }
    }
  }

  _resolveHotspotTarget(hs) {
    if (!hs) return null;
    const rawTo = (hs.to ?? "").toString().trim();
    if (!rawTo) return null;

    if (this._sceneById.has(rawTo)) return { tourId: this.currentTourId, sceneId: rawTo };

    if (this._linkTours) {
      for (const tid of this._tourOrder) {
        const pack = this._scenesByTour.get(tid);
        if (pack?.sceneById?.has(rawTo)) return { tourId: tid, sceneId: rawTo };
      }
    }

    return null;
  }
}

function parsePercentPair(v) {
  if (v == null) return null;

  let x, y;

  if (typeof v === "string") {
    const parts = v.split(",").map(s => Number(String(s).trim()));
    x = parts[0];
    y = parts[1];
  } else if (Array.isArray(v)) {
    x = Number(v[0]);
    y = Number(v[1]);
  } else if (typeof v === "object") {
    x = Number(v.x);
    y = Number(v.y);
  }

  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  x = Math.max(0, Math.min(100, x));
  y = Math.max(0, Math.min(100, y));

  return { x, y };
}
