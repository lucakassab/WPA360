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

    // tours
    this._defaultTourId = null;
    this._tourOrder = [];
    this._toursById = new Map();
    this._scenesByTour = new Map();

    // current
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

    // VR
    this._vrDebugEnabled = false;
    this._vrConsoleEl = null;
    this._vrConsoleVisible = true;

    this._vrWidgetEl = null;
    this._vrWidgetHandlers = null;
    this._vrWidgetVisible = true;

    this._vrConsoleInputBound = false;
    this._onRightThumbstickDown = null;

    // ✅ Grip mapping (widget toggle)
    this._vrGripBound = false;
    this._onGripToggle = null;
    this._lastGripToggleMs = 0;

    // ✅ VR loading HUD (preso na câmera)
    this._vrLoadingHudEl = null;

    // Loading (DOM overlay)
    this._mediaLoading = false;
    this._loadingOverlayEl = null;
    this._loadingLabelEl = null;
    this._loadingToken = 0;

    // UI manager
    this.uiManager = new AppUI(this, this.ui);

    // misc
    this._canHover = false;
  }

  // ---------------- events ----------------
  on(type, handler) { this._events.addEventListener(type, handler); }
  emit(type, detail = {}) { this._events.dispatchEvent(new CustomEvent(type, { detail })); }

  // ---------------- getters / setters p/ UI ----------------
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

  // ---------------- UI passthroughs ----------------
  toast(msg, ms) { this.uiManager.toast(msg, ms); }
  showTooltip(text) { this.uiManager.showTooltip(text); }
  hideTooltip() { this.uiManager.hideTooltip(); }

  setVRButtonVisible(visible) { this.uiManager.setVRButtonVisible(visible); }
  setInstallButtonVisible(visible) { this.uiManager.setInstallButtonVisible(visible); }

  // ---------------- init ----------------
  async init({ debugHotspots = false, vrDebug = false } = {}) {
    await new Promise((resolve) => {
      if (this.sceneEl.hasLoaded) return resolve();
      this.sceneEl.addEventListener("loaded", resolve, { once: true });
    });

    this._vrDebugEnabled = !!vrDebug;

    // load tours
    const data = await loadTours();
    this._defaultTourId = data.defaultTourId;
    this._tourOrder = data.tourOrder;
    this._toursById = data.toursById;
    this._scenesByTour = data.scenesByTour;

    // prefs
    this._linkTours = localStorage.getItem(LS_LINK) === "1";

    // set current tour
    this._setCurrentTour(this._defaultTourId, { emit: false });

    // init UI
    this.uiManager.init();

    // loading overlay (DOM)
    this._createLoadingOverlay();

    // FOV from storage
    const savedFov = Number(localStorage.getItem(LS_FOV));
    const initialFov = Number.isFinite(savedFov) ? savedFov : 80;
    this.setFov(initialFov, { emit: true });

    // hover support
    this._canHover = window.matchMedia?.("(hover: hover) and (pointer: fine)")?.matches ?? false;

    // hotspot renderer
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

    // initial scene from hash
    const initial = this._getInitialFromHash();
    if (initial) {
      await this.goToScene(initial.sceneId, { tourId: initial.tourId, pushHash: false });
    } else {
      const firstScene = this._sceneOrder[0];
      await this.goToScene(firstScene, { tourId: this.currentTourId, pushHash: false });
    }

    // hash change
    window.addEventListener("hashchange", () => {
      const parsed = this._getInitialFromHash();
      if (!parsed) return;
      const same = parsed.tourId === this.currentTourId && parsed.sceneId === this.currentSceneId;
      if (!same) void this.goToScene(parsed.sceneId, { tourId: parsed.tourId, pushHash: false });
    });

    // VR enter/exit
    this.sceneEl.addEventListener("enter-vr", async () => {
      this.emit("vr:enter");
      await this._ensureVrUiIfImmersive();
    });

    this.sceneEl.addEventListener("exit-vr", () => {
      this.emit("vr:exit");
      this._destroyVrWidget();
      this._destroyVrConsole();
      this._destroyVrLoadingHud();
      this._unbindVrGripToggle();
    });

    // XR session lifecycle
    this._bindXRSessionLifecycle();

    // hotspot debug
    if (debugHotspots) {
      const mod = await import("./tour/HotspotDebug.js");
      this._debug = new mod.default(this);
      this._debug.init({ enabled: true });
    } else {
      const el = document.querySelector("#hsdebug");
      if (el) el.remove();
    }
  }

  // ---------------- loading overlay (DOM) ----------------
  _createLoadingOverlay() {
    const old = document.getElementById("loadingOverlay");
    if (old) { try { old.remove(); } catch {} }

    const existing = document.getElementById("mediaLoadingOverlay");
    if (existing) {
      this._loadingOverlayEl = existing;
      this._loadingLabelEl = existing.querySelector("[data-loading-label]") || null;
      return;
    }

    const wrap = document.createElement("div");
    wrap.id = "mediaLoadingOverlay";
    wrap.setAttribute("aria-hidden", "true");

    Object.assign(wrap.style, {
      position: "fixed",
      inset: "0",
      zIndex: "999999",
      background: "rgba(0,0,0,0.55)",
      backdropFilter: "blur(8px)",
      display: "none",
      alignItems: "center",
      justifyContent: "center",
      pointerEvents: "none",
      opacity: "0",
      transition: "opacity 120ms ease"
    });

    const box = document.createElement("div");
    Object.assign(box.style, {
      padding: "14px 16px",
      borderRadius: "14px",
      border: "1px solid rgba(255,255,255,0.14)",
      background: "rgba(15,15,15,0.88)",
      display: "flex",
      alignItems: "center",
      gap: "12px",
      color: "rgba(255,255,255,0.92)",
      font: "800 13px/1 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
      boxShadow: "0 18px 60px rgba(0,0,0,0.45)"
    });

    const spinner = document.createElement("div");
    Object.assign(spinner.style, {
      width: "18px",
      height: "18px",
      borderRadius: "999px",
      border: "3px solid rgba(255,255,255,0.18)",
      borderTopColor: "rgba(255,255,255,0.92)",
      animation: "spin 0.85s linear infinite"
    });

    const style = document.createElement("style");
    style.textContent = `@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`;
    document.head.appendChild(style);

    const label = document.createElement("div");
    label.dataset.loadingLabel = "1";
    label.textContent = "Carregando…";

    box.appendChild(spinner);
    box.appendChild(label);
    wrap.appendChild(box);
    document.body.appendChild(wrap);

    this._loadingOverlayEl = wrap;
    this._loadingLabelEl = label;
  }

  _setLoading(loading, label = "Carregando…", token = null) {
    if (token != null && token !== this._loadingToken) return;

    const next = !!loading;
    this._mediaLoading = next;

    // DOM overlay (desktop/mobile)
    const el = this._loadingOverlayEl;
    if (el) {
      if (next) {
        if (this._loadingLabelEl) this._loadingLabelEl.textContent = label || "Carregando…";
        el.style.display = "flex";
        el.style.pointerEvents = "auto";
        el.style.opacity = "1";
        el.setAttribute("aria-hidden", "false");
      } else {
        el.style.opacity = "0";
        el.style.pointerEvents = "none";
        el.setAttribute("aria-hidden", "true");
        setTimeout(() => {
          if (this._mediaLoading) return;
          el.style.display = "none";
        }, 140);
        if (this._loadingLabelEl) this._loadingLabelEl.textContent = "";
      }
    }

    // ✅ VR: HUD preso na câmera + badge do widget
    this._ensureVrLoadingHud();
    this._setVrLoadingHudVisible(this._mediaLoading, label);
    this._syncVrWidgetIfExists();
  }

  // ---------------- VR: loading HUD ----------------
  _ensureVrLoadingHud() {
    if (!this.sceneEl?.is?.("vr-mode")) return;
    if (this._vrLoadingHudEl) return;

    const hud = document.createElement("a-entity");
    hud.setAttribute("id", "vrLoadingHud");
    hud.setAttribute("visible", "false");
    hud.setAttribute("position", "0 0 -0.65"); // na cara, mas não tapa tudo
    this.cameraEl.appendChild(hud);

    const bg = document.createElement("a-plane");
    bg.setAttribute("width", "0.62");
    bg.setAttribute("height", "0.14");
    bg.setAttribute("material", "color:#000; opacity:0.72; transparent:true; shader:flat; depthTest:false; depthWrite:false");
    bg.setAttribute("position", "0 0 0");
    hud.appendChild(bg);

    const txt = document.createElement("a-entity");
    txt.setAttribute("text", [
      "value:Carregando…",
      "color:#fff",
      "opacity:1",
      "align:center",
      "anchor:center",
      "baseline:center",
      "width:2.6",
      "wrapCount:24"
    ].join(";"));
    // escala grande pra Quest
    txt.setAttribute("scale", "0.085 0.085 0.085");
    txt.setAttribute("position", "0 0 0.01");
    hud.appendChild(txt);

    // guarda refs
    hud._bg = bg;
    hud._txt = txt;

    this._vrLoadingHudEl = hud;
  }

  _setVrLoadingHudVisible(v, label = "Carregando…") {
    const hud = this._vrLoadingHudEl;
    if (!hud) return;

    const vis = !!v;
    hud.setAttribute("visible", vis ? "true" : "false");
    if (hud.object3D) hud.object3D.visible = vis;

    if (vis && hud._txt) {
      hud._txt.setAttribute("text", "value", label || "Carregando…");
    }
  }

  _destroyVrLoadingHud() {
    if (!this._vrLoadingHudEl) return;
    try { this._vrLoadingHudEl.remove(); } catch {}
    this._vrLoadingHudEl = null;
  }

  // ---------------- core: fov ----------------
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

  // ---------------- core: tour switching ----------------
  setCurrentTour(tourId) { return this._setCurrentTour(tourId, { emit: true }); }

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

  // ---------------- core: navigation ----------------
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

    const loadToken = ++this._loadingToken;
    const inVR = this.sceneEl.is("vr-mode");
    const panoComp = this.panoEl?.components?.["stereo-top-bottom"];

    this.hideTooltip();
    this._setHotspotsVisible(false);

    // ✅ VR feedback + DOM feedback
    this._setLoading(true, "Carregando mídia…", loadToken);

    try {
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

      // ✅ encerra loading assim que a mídia confirmou load
      this._setLoading(false, "", loadToken);

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
    } catch (e) {
      console.error("goToScene falhou:", e);
      this.toast("Falha ao carregar mídia.");
      this._setLoading(false, "", loadToken);
    } finally {
      this._setLoading(false, "", loadToken);

      this._isTransitioning = false;

      if (this._queuedNav) {
        const q = this._queuedNav;
        this._queuedNav = null;
        await this.goToScene(q.sceneId, q.opts);
      }
    }
  }

  _setHotspotsVisible(v) {
    if (!this.hotspotsEl) return;
    this.hotspotsEl.setAttribute("visible", v ? "true" : "false");
  }

  async _setPanoAndWait(src) {
    const comp = this.panoEl?.components?.["stereo-top-bottom"];
    if (comp?.setSrc) {
      await comp.setSrc(src);
      return;
    }

    this.panoEl.setAttribute("stereo-top-bottom", { src, radius: 5000 });

    await new Promise((resolve, reject) => {
      const onLoad = (e) => { if (e?.detail?.src === src) resolve(); };
      const onErr = () => { reject(new Error("stereo-error")); };

      this.panoEl.addEventListener("stereo-loaded", onLoad, { once: true });
      this.panoEl.addEventListener("stereo-error", onErr, { once: true });

      setTimeout(() => reject(new Error("timeout stereo-loaded")), 15000);
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

  // ---------------- hash parsing ----------------
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

  // ---------------- hotspot target resolve ----------------
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

  // ---------------- VR lifecycle + console/widget ----------------
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
      this._destroyVrLoadingHud();
      this._unbindVrGripToggle();
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

    // widget
    this._ensureVrWidget();
    this._applyVrWidgetVisibility();
    this._syncVrWidgetIfExists();

    // loading HUD (se estiver carregando)
    this._ensureVrLoadingHud();
    this._setVrLoadingHudVisible(this._mediaLoading, this._mediaLoading ? "Carregando mídia…" : "");

    // console
    if (this._vrDebugEnabled) {
      this._ensureVrConsole({ forceShow: true });
      this._bindVrConsoleInputs();
    }

    // ✅ grip toggle widget
    this._bindVrGripToggle();
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

  // ---- VR Console (mantém o teu comportamento anterior) ----
  _ensureVrConsole({ forceShow = false } = {}) {
    if (!this._vrDebugEnabled) return;

    if (this._vrConsoleEl) {
      if (forceShow) this._vrConsoleVisible = true;
      this._applyVrConsoleVisibility();
      this._bindVrConsoleInputs();
      return;
    }

    const el = document.createElement("a-entity");
    el.setAttribute("id", "vrConsole");
    el.setAttribute("position", "0 -0.12 -0.65");
    el.setAttribute("visible", "true");
    el.setAttribute("vr-debug-console", "");
    this.cameraEl.appendChild(el);
    this._vrConsoleEl = el;

    if (forceShow) this._vrConsoleVisible = true;
    this._applyVrConsoleVisibility();
    this._bindVrConsoleInputs();
  }

  _applyVrConsoleVisibility() {
    if (!this._vrConsoleEl) return;
    const v = !!this._vrConsoleVisible;
    this._vrConsoleEl.setAttribute("visible", v ? "true" : "false");
    if (this._vrConsoleEl.object3D) this._vrConsoleEl.object3D.visible = v;
  }

  _toggleVrConsoleVisible() {
    if (!this._vrConsoleEl) {
      this._ensureVrConsole({ forceShow: true });
      return;
    }
    this._vrConsoleVisible = !this._vrConsoleVisible;
    this._applyVrConsoleVisibility();
  }

  _bindVrConsoleInputs() {
    if (this._vrConsoleInputBound) return;
    if (!this._vrDebugEnabled) return;

    const right = this.rightHandEl;
    if (!right) return;

    this._onRightThumbstickDown = () => {
      if (!this.sceneEl.is("vr-mode")) return;
      this._toggleVrConsoleVisible();
    };

    right.addEventListener("thumbstickdown", this._onRightThumbstickDown);
    right.addEventListener("stickdown", this._onRightThumbstickDown);

    this._vrConsoleInputBound = true;
  }

  _unbindVrConsoleInputs() {
    if (!this._vrConsoleInputBound) return;

    const right = this.rightHandEl;
    if (right && this._onRightThumbstickDown) {
      right.removeEventListener("thumbstickdown", this._onRightThumbstickDown);
      right.removeEventListener("stickdown", this._onRightThumbstickDown);
    }

    this._onRightThumbstickDown = null;
    this._vrConsoleInputBound = false;
  }

  _destroyVrConsole() {
    this._unbindVrConsoleInputs();
    if (!this._vrConsoleEl) return;
    try { this._vrConsoleEl.remove(); } catch {}
    this._vrConsoleEl = null;
  }

  // ---- VR Widget + visibilidade ----
  _ensureVrWidget() {
    if (this._vrWidgetEl) return;

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

    const hSelectScene = (e) => {
      const sid = String(e?.detail?.sceneId || "");
      const tid = this._canonicalTourId(e?.detail?.tourId) ?? this.currentTourId;
      if (!sid) return;

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

  _applyVrWidgetVisibility() {
    const el = this._vrWidgetEl;
    if (!el) return;
    const v = !!this._vrWidgetVisible;
    el.setAttribute("visible", v ? "true" : "false");
    if (el.object3D) el.object3D.visible = v;
  }

  _toggleVrWidgetVisible() {
    this._vrWidgetVisible = !this._vrWidgetVisible;
    this._applyVrWidgetVisibility();
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
        el.removeEventListener("vrwidget:selecttour", hs.hSelectTour);
        el.removeEventListener("vrwidget:selectscene", hs.hSelectScene);
        el.removeEventListener("vrwidget:requestsync", hs.hReqSync);
      }
    } catch {}

    try { el.remove(); } catch {}
    this._vrWidgetEl = null;
    this._vrWidgetHandlers = null;
    this._vrWidgetVisible = true;
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
      marker: hasMap ? marker : null,
      loading: this._mediaLoading
    }, false);
  }

  // ✅ Grip toggle bind
  _bindVrGripToggle() {
    if (this._vrGripBound) return;

    const handler = () => {
      const now = performance.now();
      if (now - this._lastGripToggleMs < 250) return; // debounce
      this._lastGripToggleMs = now;

      if (!this.sceneEl.is("vr-mode")) return;
      this._toggleVrWidgetVisible();
    };

    this._onGripToggle = handler;

    const L = this.leftHandEl;
    const R = this.rightHandEl;

    // Meta Quest costuma emitir "gripdown" ou "squeezestart"
    if (L) {
      L.addEventListener("gripdown", handler);
      L.addEventListener("squeezestart", handler);
    }
    if (R) {
      R.addEventListener("gripdown", handler);
      R.addEventListener("squeezestart", handler);
    }

    this._vrGripBound = true;
  }

  _unbindVrGripToggle() {
    if (!this._vrGripBound) return;

    const handler = this._onGripToggle;
    const L = this.leftHandEl;
    const R = this.rightHandEl;

    if (handler) {
      if (L) {
        L.removeEventListener("gripdown", handler);
        L.removeEventListener("squeezestart", handler);
      }
      if (R) {
        R.removeEventListener("gripdown", handler);
        R.removeEventListener("squeezestart", handler);
      }
    }

    this._onGripToggle = null;
    this._vrGripBound = false;
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
