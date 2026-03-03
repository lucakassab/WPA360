// js/App.js
import AppUI from "./AppUI.js";
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

    this._firstPaint = true;
    this._isTransitioning = false;
    this._queuedNav = null;

    this._linkTours = false;
    this._fov = 80;

    this._pendingViewToken = 0;
    this.hotspotAnchorEl = null;
    this.hotspotRenderer = null;

    this._vrDebugEnabled = false;
    this._vrConsoleEl = null;
    this._vrWidgetEl = null;
    this._vrWidgetHandlers = null;

    this._vrConsoleInputBound = false;
    this._onRightThumbstickDown = null;

    this.uiManager = new AppUI(this, this.ui);
    this._canHover = false;
  }

  on(type, handler) { this._events.addEventListener(type, handler); }
  emit(type, detail = {}) { this._events.dispatchEvent(new CustomEvent(type, { detail })); }

  getTourOrder() { return [...this._tourOrder]; }
  getSceneOrder() { return [...this._sceneOrder]; }
  getTourTitle(tourId) {
    const t = this._toursById.get(tourId);
    return t?.title ? t.title : tourId;
  }
  getCurrentTour() { return this._toursById.get(this.currentTourId) ?? null; }
  getCurrentScene() { return this._sceneById.get(this.currentSceneId) ?? null; }
  getLinkTours() { return !!this._linkTours; }
  setLinkTours(v) {
    this._linkTours = !!v;
    try { localStorage.setItem(LS_LINK, this._linkTours ? "1" : "0"); } catch {}
    this.emit("link:changed", { value: this._linkTours });
  }

  toast(msg, ms) { this.uiManager.toast(msg, ms); }
  showTooltip(text) { this.uiManager.showTooltip(text); }
  hideTooltip() { this.uiManager.hideTooltip(); }

  setVRButtonVisible(visible) { this.uiManager.setVRButtonVisible(visible); }
  setInstallButtonVisible(visible) { this.uiManager.setInstallButtonVisible(visible); }

  async init({ debugHotspots = false, vrDebug = false } = {}) {
    await new Promise((resolve) => {
      if (this.sceneEl.hasLoaded) return resolve();
      this.sceneEl.addEventListener("loaded", resolve, { once: true });
    });

    this._vrDebugEnabled = !!vrDebug;

    const data = await loadTours();
    this._defaultTourId = data.defaultTourId;
    this._tourOrder = data.tourOrder;
    this._toursById = data.toursById;
    this._scenesByTour = data.scenesByTour;

    this._linkTours = localStorage.getItem(LS_LINK) === "1";

    this._setCurrentTour(this._defaultTourId, { emit: false });

    this.uiManager.init();

    const savedFov = Number(localStorage.getItem(LS_FOV));
    const initialFov = Number.isFinite(savedFov) ? savedFov : 80;
    this.setFov(initialFov, { emit: true });

    this._canHover = window.matchMedia?.("(hover: hover) and (pointer: fine)")?.matches ?? false;

    this.hotspotRenderer = new HotspotRenderer({
      showTooltip: (t) => this.showTooltip(t),
      hideTooltip: () => this.hideTooltip(),
      canHover: () => this._canHover,
      isVR: () => this.sceneEl.is("vr-mode"),
      onNavigate: (hs) => {
        const target = this._resolveHotspotTarget(hs);
        if (!target) return;
        void this.goToScene(target.sceneId, { tourId: target.tourId, fromHotspot: hs });
      }
    });

    const initial = this._getInitialFromHash();
    if (initial) {
      await this.goToScene(initial.sceneId, { tourId: initial.tourId, pushHash: false });
    } else {
      const firstScene = this._sceneOrder[0];
      await this.goToScene(firstScene, { tourId: this.currentTourId, pushHash: false });
    }

    window.addEventListener("hashchange", () => {
      const parsed = this._getInitialFromHash();
      if (!parsed) return;
      const same = parsed.tourId === this.currentTourId && parsed.sceneId === this.currentSceneId;
      if (!same) void this.goToScene(parsed.sceneId, { tourId: parsed.tourId, pushHash: false });
    });

    this.sceneEl.addEventListener("enter-vr", async () => {
      this.emit("vr:enter");
      await this._ensureVrUiIfImmersive();
    });

    this.sceneEl.addEventListener("exit-vr", () => {
      this.emit("vr:exit");
      this._destroyVrWidget();
      this._destroyVrConsole();
    });

    this._bindXRSessionLifecycle();

    if (debugHotspots) {
      const mod = await import("./tour/HotspotDebug.js");
      this._debug = new mod.default(this);
      this._debug.init({ enabled: true });
    } else {
      const el = document.querySelector("#hsdebug");
      if (el) el.remove();
    }
  }

  setFov(fov, { emit = true } = {}) {
    const v = Math.max(30, Math.min(140, Number(fov) || 80));
    this._fov = Math.round(v);

    try { localStorage.setItem(LS_FOV, String(this._fov)); } catch {}

    if (this.cameraEl) {
      this.cameraEl.setAttribute("camera", "fov", this._fov);
      const cam = this.cameraEl.getObject3D("camera");
      if (cam) { cam.fov = this._fov; cam.updateProjectionMatrix?.(); }
    }

    if (emit) this.emit("fov:changed", { fov: this._fov });
    this._syncVrWidgetIfExists();
  }

  setCurrentTour(tourId) {
    const ok = this._setCurrentTour(tourId, { emit: true });
    return ok;
  }

  _setCurrentTour(tourId, { emit = true } = {}) {
    const tid = this._canonicalTourId(tourId);
    if (!tid) return false;

    const pack = this._scenesByTour.get(tid);
    if (!pack) return false;

    this.currentTourId = tid;
    this._sceneOrder = pack.sceneOrder;
    this._sceneById = pack.sceneById;

    if (emit) this.emit("tour:changed", { tourId: tid, tour: this._toursById.get(tid) });
    this._syncVrWidgetIfExists();
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

  _getTourStartSceneId(tourId) {
    const pack = this._scenesByTour.get(tourId);
    return pack?.sceneOrder?.[0] ?? null;
  }

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
    const { pushHash = true, fromHotspot = null } = opts;
    const tourId = this._canonicalTourId(opts.tourId) ?? this.currentTourId ?? this._defaultTourId;

    if (this._isTransitioning) {
      this._queuedNav = { sceneId, opts: { ...opts, tourId } };
      return;
    }

    if (tourId !== this.currentTourId) this._setCurrentTour(tourId, { emit: true });

    const scene = this._sceneById.get(sceneId);
    if (!scene) return;

    this._isTransitioning = true;
    this._queuedNav = null;

    const inVR = this.sceneEl.is("vr-mode");
    const panoComp = this.panoEl?.components?.["stereo-top-bottom"];

    this.hideTooltip();
    this._setHotspotsVisible(false);

    const alreadyCached = panoComp?.isCached?.(scene.pano) ?? false;
    try { await (panoComp?.preload?.(scene.pano) ?? Promise.resolve(null)); } catch {}

    if (!inVR) {
      const fadeOutMs = alreadyCached ? 90 : 170;
      if (this._firstPaint) this.uiManager.setFade(1);
      else await this.uiManager.fadeTo(1, fadeOutMs);
    }

    this.currentSceneId = sceneId;
    this.emit("scene:changed", { tourId: this.currentTourId, sceneId, scene });

    if (pushHash) history.replaceState(null, "", `#${this.currentTourId}:${sceneId}`);

    await this._setPanoAndWait(scene.pano);
    this._applyViewForScene(scene, fromHotspot);

    this._ensureHotspotAnchor();
    this._renderHotspots(scene);
    this._setHotspotsVisible(true);

    if (!inVR) {
      const fadeInMs = alreadyCached ? 120 : 220;
      await this.uiManager.fadeTo(0, this._firstPaint ? 220 : fadeInMs);
    }

    this._firstPaint = false;
    this._preloadNeighbors(scene);

    this._syncVrWidgetIfExists();

    this._isTransitioning = false;

    if (this._queuedNav) {
      const q = this._queuedNav;
      this._queuedNav = null;
      await this.goToScene(q.sceneId, q.opts);
    }
  }

  _setHotspotsVisible(v) {
    if (!this.hotspotsEl) return;
    this.hotspotsEl.setAttribute("visible", v ? "true" : "false");
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

  _preloadNeighbors(scene) {
    const comp = this.panoEl?.components?.["stereo-top-bottom"];
    if (!comp?.preload) return;

    const targets = new Set();
    for (const hs of (scene.hotspots ?? [])) {
      const target = this._resolveHotspotTarget(hs);
      if (!target) continue;
      const pack = this._scenesByTour.get(target.tourId);
      const sc = pack?.sceneById?.get(target.sceneId);
      if (sc?.pano) targets.add(sc.pano);
    }
    for (const pano of targets) comp.preload(pano);
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
    this.hotspotRenderer.clear(this.hotspotsEl);

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

      const el = this.hotspotRenderer.createHotspot({ hs, sceneStyle, position: basePos });
      this.hotspotsEl.appendChild(el);
    }
  }

  _applyViewForScene(scene, fromHotspot) {
    if (this.sceneEl.is("vr-mode")) return;

    const yaw =
      (fromHotspot?.toYaw ?? fromHotspot?.cameraYaw ?? null) ??
      (scene?.yaw ?? scene?.cameraYaw ?? null);

    const pitch =
      (fromHotspot?.toPitch ?? fromHotspot?.cameraPitch ?? null) ??
      (scene?.pitch ?? scene?.cameraPitch ?? null);

    if (yaw === null && pitch === null) return;

    const token = ++this._pendingViewToken;
    const maxTries = 30;
    let tries = 0;

    const attempt = () => {
      if (token !== this._pendingViewToken) return;
      if (this.sceneEl.is("vr-mode")) return;

      const ok = this._setCameraYawPitchOnce({
        yaw: yaw !== null ? Number(yaw) : null,
        pitch: pitch !== null ? Number(pitch) : null
      });

      tries++;
      if (ok) return;
      if (tries >= maxTries) return;
      requestAnimationFrame(attempt);
    };

    requestAnimationFrame(attempt);
  }

  _setCameraYawPitchOnce({ yaw = null, pitch = null }) {
    const AFRAME = window.AFRAME;
    if (!AFRAME) return false;

    const THREE = AFRAME.THREE;
    const lc = this.cameraEl?.components?.["look-controls"];
    if (!lc?.yawObject || !lc?.pitchObject) return false;

    const startYaw = THREE.MathUtils.radToDeg(lc.yawObject.rotation.y);
    const startPitch = THREE.MathUtils.radToDeg(lc.pitchObject.rotation.x);

    const targetYaw = (yaw === null || Number.isNaN(yaw)) ? startYaw : yaw;
    const targetPitch = (pitch === null || Number.isNaN(pitch)) ? startPitch : pitch;

    const endYaw = startYaw + shortestDeltaDeg(startYaw, targetYaw);
    lc.yawObject.rotation.y = THREE.MathUtils.degToRad(endYaw);
    lc.pitchObject.rotation.x = THREE.MathUtils.degToRad(targetPitch);
    return true;
  }

  _getInitialFromHash() {
    const h = (location.hash || "").replace("#", "").trim();
    if (!h) return null;

    const m = h.match(/^([^:\/]+)[:\/](.+)$/);
    if (m) {
      const tid = this._canonicalTourId(m[1]);
      const sid = m[2];
      if (tid && this._scenesByTour.get(tid)?.sceneById?.has(sid)) return { tourId: tid, sceneId: sid };
    }

    const sid = h;
    if (this._sceneById.has(sid)) return { tourId: this.currentTourId, sceneId: sid };

    if (this._linkTours) {
      for (const tid of this._tourOrder) {
        const pack = this._scenesByTour.get(tid);
        if (pack?.sceneById?.has(sid)) return { tourId: tid, sceneId: sid };
      }
    }

    if (this._scenesByTour.get(this._defaultTourId)?.sceneById?.has(sid)) {
      return { tourId: this._defaultTourId, sceneId: sid };
    }

    return null;
  }

  _resolveHotspotTarget(hs) {
    if (!hs) return null;

    const rawTo = (hs.to ?? "").toString().trim();
    const rawTour = (hs.toTour ?? "").toString().trim();

    if (rawTour && rawTo) {
      const tid = this._canonicalTourId(rawTour);
      if (tid && this._scenesByTour.get(tid)?.sceneById?.has(rawTo)) return { tourId: tid, sceneId: rawTo };
    }

    if (rawTo) {
      const m = rawTo.match(/^([^:\/]+)[:\/](.+)$/);
      if (m) {
        const tid = this._canonicalTourId(m[1]);
        const sid = m[2];
        if (tid && this._scenesByTour.get(tid)?.sceneById?.has(sid)) return { tourId: tid, sceneId: sid };
      }
    }

    if (rawTo) {
      const tid = this._canonicalTourId(rawTo);
      if (tid) {
        const start = this._getTourStartSceneId(tid);
        if (start) return { tourId: tid, sceneId: start };
      }
    }

    if (rawTo && this._sceneById.has(rawTo)) return { tourId: this.currentTourId, sceneId: rawTo };

    if (!this._linkTours || !rawTo) return null;

    for (const tid of this._tourOrder) {
      const pack = this._scenesByTour.get(tid);
      if (pack?.sceneById?.has(rawTo)) return { tourId: tid, sceneId: rawTo };
    }

    return null;
  }

  _bindXRSessionLifecycle() {
    const xr = this.sceneEl?.renderer?.xr;
    if (!xr?.addEventListener) return;

    const onStart = async () => {
      requestAnimationFrame(async () => {
        await this._ensureVrUiIfImmersive();
      });
    };

    const onEnd = () => {
      this._destroyVrWidget();
      this._destroyVrConsole();
    };

    xr.addEventListener("sessionstart", onStart);
    xr.addEventListener("sessionend", onEnd);

    this._xrUnsub = () => {
      xr.removeEventListener("sessionstart", onStart);
      xr.removeEventListener("sessionend", onEnd);
    };
  }

  async _ensureVrUiIfImmersive() {
    if (!this.sceneEl.is("vr-mode")) return;

    const session = await this._waitXRSession(2000);
    if (!session) return;

    this._ensureVrWidget();
    this._syncVrWidgetIfExists();

    if (this._vrDebugEnabled) this._ensureVrConsole();
  }

  async _waitXRSession(timeoutMs = 2000) {
    const start = performance.now();
    while (performance.now() - start < timeoutMs) {
      const s = this.sceneEl?.renderer?.xr?.getSession?.() || null;
      if (s) return s;
      await new Promise(r => setTimeout(r, 50));
    }
    return this.sceneEl?.renderer?.xr?.getSession?.() || null;
  }

  _ensureVrConsole() {
    // (mantém o seu)
  }

  _destroyVrConsole() {
    // (mantém o seu)
  }

  _ensureVrWidget() {
    if (this._vrWidgetEl) {
      this._vrWidgetEl.setAttribute("visible", "true");
      if (this._vrWidgetEl.object3D) this._vrWidgetEl.object3D.visible = true;
      return;
    }

    const el = document.createElement("a-entity");
    el.setAttribute("id", "vrWidget");
    el.setAttribute("visible", "true");
    el.setAttribute("vr-widget", "");
    this.cameraEl.appendChild(el);
    this._vrWidgetEl = el;

    const hPrev = () => void this.prevScene();
    const hNext = () => void this.nextScene();
    const hFov = (e) => {
      const d = Number(e?.detail?.delta || 0);
      this.setFov(this._fov + d, { emit: true });
    };

    const hSelectTour = (e) => {
      const tid = String(e?.detail?.tourId || "");
      if (!tid || tid === this.currentTourId) return;
      this.setCurrentTour(tid);
      const start = this._getTourStartSceneId(tid);
      if (start) void this.goToScene(start, { tourId: tid });
    };

    // ✅ AQUI a correção: usa o tourId vindo do widget
    const hSelectScene = (e) => {
      const sid = String(e?.detail?.sceneId || "");
      const tid = this._canonicalTourId(e?.detail?.tourId) ?? this.currentTourId;
      if (!sid) return;

      // se for mesma cena no mesmo tour, ignora
      const same = (tid === this.currentTourId) && (sid === this.currentSceneId);
      if (same) return;

      void this.goToScene(sid, { tourId: tid });
    };

    const hReqSync = () => this._syncVrWidgetIfExists();

    el.addEventListener("vrwidget:prevscene", hPrev);
    el.addEventListener("vrwidget:nextscene", hNext);
    el.addEventListener("vrwidget:fovdelta", hFov);
    el.addEventListener("vrwidget:selecttour", hSelectTour);
    el.addEventListener("vrwidget:selectscene", hSelectScene);
    el.addEventListener("vrwidget:requestsync", hReqSync);

    el.addEventListener("loaded", () => this._syncVrWidgetIfExists());
    requestAnimationFrame(() => this._syncVrWidgetIfExists());
    queueMicrotask(() => this._syncVrWidgetIfExists());

    this._vrWidgetHandlers = { hPrev, hNext, hFov, hSelectTour, hSelectScene, hReqSync };
  }

  _destroyVrWidget() {
    // (mantém o seu, só garantindo remover selectscene etc.)
  }

  _syncVrWidgetIfExists() {
    const el = this._vrWidgetEl;
    if (!el) return;

    const tour = this.getCurrentTour();
    const scene = this.getCurrentScene();

    const hasMap = !!tour?.map_png;
    const marker = parsePercentPair(scene?.scene_map_position);

    const tourList = this._tourOrder.map(tid => ({ id: tid, title: this.getTourTitle(tid) }));
    const sceneList = this._sceneOrder.map(sid => {
      const sc = this._sceneById.get(sid);
      return { id: sid, name: sc?.name ?? sid };
    });

    el.emit("vrwidget:update", {
      tourTitle: tour?.title ?? this.currentTourId ?? "—",
      sceneTitle: scene?.name ?? scene?.id ?? "—",
      currentTourId: this.currentTourId ?? "",
      currentSceneId: this.currentSceneId ?? "",
      tourList,
      sceneList,
      fov: this._fov,
      hasMap,
      mapSrc: tour?.map_png ?? "",
      marker: hasMap ? marker : null
    }, false);
  }
}

function shortestDeltaDeg(from, to) {
  return ((to - from + 540) % 360) - 180;
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
