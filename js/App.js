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
const TOUR_CACHE_NAME = "tour-full-v1";

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

    // multi-tour store
    this._defaultTourId = null;
    this._tourOrder = [];
    this._toursById = new Map();
    this._scenesByTour = new Map();

    // current
    this.currentTourId = null;
    this._sceneOrder = [];
    this._sceneById = new Map();
    this.currentSceneId = null;

    this._mouse = { x: 0, y: 0 };
    this._canHover = false;

    this.hotspotAnchorEl = null;
    this.hotspotRenderer = null;

    this._pendingViewToken = 0;

    this._fadeEl = null;
    this._firstPaint = true;

    this._isTransitioning = false;
    this._queuedNav = null;

    this._debug = null;
    this._menuOpen = false;

    this._controlsVisible = { vr: true, install: false };

    this._fov = 80;
    this._downloadBusy = false;
    this._downloadAbort = null;

    this._linkTours = false;

    // Map overlay
    this._mapOpen = false;
    this._mapImgLoaded = false;

    // ✅ VR stuff
    this._vrDebugEnabled = false;
    this._vrConsoleEl = null;

    this._vrWidgetEl = null;
    this._vrWidgetHandlers = null;

    this._xrUnsub = null;
  }

  on(type, handler) { this._events.addEventListener(type, handler); }
  emit(type, detail = {}) { this._events.dispatchEvent(new CustomEvent(type, { detail })); }

  setVRButtonVisible(visible) {
    this._controlsVisible.vr = !!visible;
    if (this.ui.btnVR) this.ui.btnVR.hidden = !this._controlsVisible.vr;
  }

  setInstallButtonVisible(visible) {
    this._controlsVisible.install = !!visible;
    if (this.ui.btnInstall) this.ui.btnInstall.hidden = !this._controlsVisible.install;
  }

  getCurrentScene() {
    return this._sceneById.get(this.currentSceneId) ?? null;
  }

  async init({ debugHotspots = false, vrDebug = false } = {}) {
    await new Promise((resolve) => {
      if (this.sceneEl.hasLoaded) return resolve();
      this.sceneEl.addEventListener("loaded", resolve, { once: true });
    });

    this._createFadeOverlay();

    // ✅ guarda flag do VR debug
    this._vrDebugEnabled = !!vrDebug;

    // carrega tours
    const data = await loadTours();
    this._defaultTourId = data.defaultTourId;
    this._tourOrder = data.tourOrder;
    this._toursById = data.toursById;
    this._scenesByTour = data.scenesByTour;

    // prefs
    const savedLink = localStorage.getItem(LS_LINK);
    this._linkTours = savedLink === "1";

    // seta tour atual
    this._setCurrentTour(this._defaultTourId, { rebuildSceneSelect: false });

    // UI/topbar
    this._setupTopBar();
    this._setupFov();
    this._setupDownloadTour();
    this._setupMapOverlay();

    this.ui.btnPrev?.addEventListener("click", () => void this.prevScene());
    this.ui.btnNext?.addEventListener("click", () => void this.nextScene());

    this.ui.btnVR?.addEventListener("click", async () => {
      if (this.sceneEl.is("vr-mode")) this.sceneEl.exitVR();
      else this.sceneEl.enterVR();
    });

    this.sceneEl.addEventListener("enter-vr", async () => {
      if (this.ui.btnVR) this.ui.btnVR.textContent = "Sair VR";
      this.emit("vr:enter");
      this.hideTooltip();
      if (this._fadeEl) this._fadeEl.style.opacity = "0";
      this._setMenuOpen(false);
      this._setMapOpen(false);

      // ✅ fallback: se sessionstart demorar, garante criação
      await this._ensureVrUiIfImmersive();
    });

    this.sceneEl.addEventListener("exit-vr", () => {
      if (this.ui.btnVR) this.ui.btnVR.textContent = "VR";
      this.emit("vr:exit");

      // ✅ destrói tudo que é só VR
      this._destroyVrWidget();
      this._destroyVrConsole();
    });

    this._canHover = window.matchMedia?.("(hover: hover) and (pointer: fine)")?.matches ?? false;

    window.addEventListener("mousemove", (e) => {
      this._mouse.x = e.clientX;
      this._mouse.y = e.clientY;

      const tip = this.ui.tooltip;
      if (tip && !tip.hidden) {
        tip.style.left = `${this._mouse.x}px`;
        tip.style.top = `${this._mouse.y}px`;
      }
    });

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

    // hash
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

    if (debugHotspots) {
      const mod = await import("./tour/HotspotDebug.js");
      this._debug = new mod.default(this);
      this._debug.init({ enabled: true });
    } else {
      const el = document.querySelector("#hsdebug");
      if (el) el.remove();
    }

    this.setVRButtonVisible(this._controlsVisible.vr);
    this.setInstallButtonVisible(this._controlsVisible.install);

    this._updateMapAvailability();
    this._updateMapMarker();

    // ✅ fluxo definitivo: sessionstart/sessionend (three.js)
    this._bindXRSessionLifecycle();
  }

  // ============================================================
  // ✅ XR lifecycle: cria/destrói widget + console no VR imersivo
  // ============================================================

  _bindXRSessionLifecycle() {
    const xr = this.sceneEl?.renderer?.xr;
    if (!xr?.addEventListener) return;

    const onStart = async () => {
      // espera 1 frame pro A-Frame marcar vr-mode
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
    // só cria se A-Frame estiver em vr-mode (isso é o “imersivo” na prática)
    if (!this.sceneEl.is("vr-mode")) return;

    // garante session existe (evita criar cedo demais)
    const session = await this._waitXRSession(2000);
    if (!session) return;

    // ✅ widget
    this._ensureVrWidget();
    this._syncVrWidgetIfExists();

    // ✅ console (só se vrDebug true)
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
    if (this._vrConsoleEl) {
      this._vrConsoleEl.setAttribute("visible", "true");
      if (this._vrConsoleEl.object3D) this._vrConsoleEl.object3D.visible = true;
      return;
    }

    const el = document.createElement("a-entity");
    el.setAttribute("id", "vrConsole");
    el.setAttribute("position", "0 -0.12 -0.65");
    el.setAttribute("visible", "true");
    el.setAttribute("vr-debug-console", "");
    this.cameraEl.appendChild(el);
    this._vrConsoleEl = el;
  }

  _destroyVrConsole() {
    if (!this._vrConsoleEl) return;
    try { this._vrConsoleEl.remove(); } catch {}
    this._vrConsoleEl = null;
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
      this.setFov(this._fov + d);
      this._syncVrWidgetIfExists();
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

  _syncVrWidgetIfExists() {
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
    const start = this._getTourStartSceneId(next);
    if (start) void this.goToScene(start, { tourId: next });
  }

  _stepScene(delta) {
    const order = this._sceneOrder;
    const idx = Math.max(0, order.indexOf(this.currentSceneId));
    const next = order[(idx + delta + order.length) % order.length];
    if (!next || next === this.currentSceneId) return;
    void this.goToScene(next, { tourId: this.currentTourId });
  }

  // ============================================================
  // ✅ TOP BAR (Menu + dropdowns)
  // ============================================================

  _setupTopBar() {
    const btn = this.ui.btnTopMenu;
    const bar = this.ui.topMenuBar;

    this._setMenuOpen(false);

    this._populateTourSelect();
    this._populateSceneSelect();

    this.ui.topTourSelect?.addEventListener("change", () => {
      const tid = this.ui.topTourSelect.value;
      if (!tid || tid === this.currentTourId) return;

      this._setCurrentTour(tid);
      const start = this._getTourStartSceneId(tid);
      if (start) void this.goToScene(start, { tourId: tid });
    });

    this.ui.topSceneSelect?.addEventListener("change", () => {
      const id = this.ui.topSceneSelect.value;
      if (!id || id === this.currentSceneId) return;
      void this.goToScene(id, { tourId: this.currentTourId });
    });

    if (this.ui.linkToursToggle) {
      this.ui.linkToursToggle.checked = this._linkTours;
      this.ui.linkToursToggle.addEventListener("change", () => {
        this._linkTours = !!this.ui.linkToursToggle.checked;
        try { localStorage.setItem(LS_LINK, this._linkTours ? "1" : "0"); } catch {}
        this.toast(this._linkTours ? "Link entre tours: ON" : "Link entre tours: OFF");
      });
    }

    if (btn && bar) {
      btn.addEventListener("click", () => {
        this._setMenuOpen(!this._menuOpen);
        if (this._menuOpen) this._ensureTopBarPopulated();
      });

      window.addEventListener("resize", () => {
        if (this._menuOpen) this._applyTopBarLayoutNoOverlap();
      });
    }

    this._syncTopBarTitle();
  }

  _ensureTopBarPopulated() {
    const tSel = this.ui.topTourSelect;
    const sSel = this.ui.topSceneSelect;

    if (tSel && tSel.options.length === 0) this._populateTourSelect();
    if (sSel && sSel.options.length === 0) this._populateSceneSelect();

    this._syncTopBarTitle();
  }

  _populateTourSelect() {
    const sel = this.ui.topTourSelect;
    if (!sel) return;

    sel.innerHTML = "";
    for (const tid of this._tourOrder) {
      const opt = document.createElement("option");
      opt.value = tid;
      opt.textContent = this._getTourTitle(tid);
      sel.appendChild(opt);
    }
    sel.value = this.currentTourId ?? this._defaultTourId ?? "";
  }

  _populateSceneSelect() {
    const sel = this.ui.topSceneSelect;
    if (!sel) return;

    sel.innerHTML = "";
    for (const id of this._sceneOrder) {
      const sc = this._sceneById.get(id);
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = sc?.name ? sc.name : id;
      sel.appendChild(opt);
    }
    if (this.currentSceneId) sel.value = this.currentSceneId;
  }

  _applyTopBarLayoutNoOverlap() {
    const btn = this.ui.btnTopMenu;
    const bar = this.ui.topMenuBar;
    if (!btn || !bar) return;

    const leftBase = 10;
    const gap = 10;
    const btnRect = btn.getBoundingClientRect();
    const left = Math.round(leftBase + btnRect.width + gap);

    bar.style.left = `${left}px`;
    bar.style.right = `10px`;
    bar.style.top = `10px`;
  }

  _setMenuOpen(open) {
    this._menuOpen = !!open;
    if (this.ui.topMenuBar) this.ui.topMenuBar.hidden = !this._menuOpen;

    if (this._menuOpen) this._applyTopBarLayoutNoOverlap();
    else if (this.ui.topMenuBar) this.ui.topMenuBar.style.left = "10px";
  }

  _syncTopBarTitle() {
    const sc = this.getCurrentScene();
    if (this.ui.titleEl) this.ui.titleEl.textContent = sc?.name ?? sc?.id ?? "—";
    if (this.ui.topTourSelect) this.ui.topTourSelect.value = this.currentTourId ?? "";
    if (this.ui.topSceneSelect && sc?.id) this.ui.topSceneSelect.value = sc.id;
  }

  _getTourTitle(tourId) {
    const t = this._toursById.get(tourId);
    return t?.title ? t.title : tourId;
  }

  _getTourStartSceneId(tourId) {
    const pack = this._scenesByTour.get(tourId);
    return pack?.sceneOrder?.[0] ?? null;
  }

  // ============================================================
  // Map overlay
  // ============================================================

  _setupMapOverlay() {
    const btn = this.ui.btnMap;
    const overlay = this.ui.mapOverlay;
    const closeBtn = this.ui.btnMapClose;

    if (btn) btn.addEventListener("click", () => this.toggleMap());
    if (closeBtn) closeBtn.addEventListener("click", () => this._setMapOpen(false));

    if (overlay) {
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) this._setMapOpen(false);
      });
    }

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this._mapOpen) this._setMapOpen(false);
    });

    if (this.ui.mapImg) {
      this.ui.mapImg.addEventListener("load", () => {
        this._mapImgLoaded = true;
        this._updateMapMarker();
      });
      this.ui.mapImg.addEventListener("error", () => {
        this._mapImgLoaded = false;
        this.toast("Falha ao carregar planta (PNG).");
      });
    }
  }

  toggleMap() {
    if (!this._hasCurrentTourMap()) {
      this.toast("Esse tour não tem planta (map_png).");
      return;
    }
    this._setMapOpen(!this._mapOpen);
  }

  _setMapOpen(open) {
    this._mapOpen = !!open;
    if (this.ui.mapOverlay) this.ui.mapOverlay.hidden = !this._mapOpen;

    if (this._mapOpen) {
      this._ensureMapImageForTour();
      this._updateMapMarker();
    }
  }

  _hasCurrentTourMap() {
    const t = this._toursById.get(this.currentTourId);
    return !!(t?.map_png);
  }

  _ensureMapImageForTour() {
    const t = this._toursById.get(this.currentTourId);
    const png = (t?.map_png ?? "").toString().trim();
    if (!png || !this.ui.mapImg) return;

    if (this.ui.mapTitle) this.ui.mapTitle.textContent = `Planta Baixa — ${t?.title ?? this.currentTourId}`;
    if (this.ui.mapImg.src && this.ui.mapImg.src.endsWith(png)) return;

    this._mapImgLoaded = false;
    this.ui.mapImg.src = png;
  }

  _updateMapAvailability() {
    if (!this.ui.btnMap) return;
    this.ui.btnMap.disabled = !this._hasCurrentTourMap();
  }

  _updateMapMarker() {
    const marker = this.ui.mapMarker;
    if (!marker) return;

    const scene = this.getCurrentScene();
    const pos = parsePercentPair(scene?.scene_map_position);

    if (!this._hasCurrentTourMap() || !pos) {
      marker.hidden = true;
      return;
    }

    marker.style.left = `${pos.x}%`;
    marker.style.top = `${pos.y}%`;
    marker.hidden = false;
  }

  // ============================================================
  // Tour switching
  // ============================================================

  _setCurrentTour(tourId, { rebuildSceneSelect = true } = {}) {
    const tid = this._canonicalTourId(tourId);
    if (!tid) return false;

    const pack = this._scenesByTour.get(tid);
    if (!pack) return false;

    this.currentTourId = tid;
    this._sceneOrder = pack.sceneOrder;
    this._sceneById = pack.sceneById;

    if (rebuildSceneSelect) this._populateSceneSelect();
    this._syncTopBarTitle();

    this._updateMapAvailability();
    if (this._mapOpen) this._ensureMapImageForTour();

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

  // ============================================================
  // FOV
  // ============================================================

  _setupFov() {
    const slider = this.ui.fovSlider;
    const valueEl = this.ui.fovValue;

    const saved = Number(localStorage.getItem(LS_FOV));
    const initial = Number.isFinite(saved) ? saved : 80;

    this.setFov(initial);

    if (slider) {
      slider.value = String(this._fov);
      slider.addEventListener("input", () => this.setFov(Number(slider.value)));
    }
    if (valueEl) valueEl.textContent = String(this._fov);
  }

  setFov(fov) {
    const v = Math.max(30, Math.min(140, Number(fov) || 80));
    this._fov = Math.round(v);

    if (this.ui.fovValue) this.ui.fovValue.textContent = String(this._fov);
    if (this.ui.fovSlider) this.ui.fovSlider.value = String(this._fov);

    try { localStorage.setItem(LS_FOV, String(this._fov)); } catch {}

    if (this.cameraEl) {
      this.cameraEl.setAttribute("camera", "fov", this._fov);
      const cam = this.cameraEl.getObject3D("camera");
      if (cam) { cam.fov = this._fov; cam.updateProjectionMatrix?.(); }
    }

    // ✅ se widget existir, atualiza
    this._syncVrWidgetIfExists();
  }

  // ============================================================
  // Download / cache
  // ============================================================

  _setupDownloadTour() {
    const btn = this.ui.btnDownloadTour;
    if (!btn) return;
    btn.addEventListener("click", () => {
      if (this._downloadBusy) return;
      void this._downloadCurrentTourAll();
    });
  }

  _getPanoUrlsForTour(tourId) {
    const pack = this._scenesByTour.get(tourId);
    const out = [];
    for (const id of (pack?.sceneOrder ?? [])) {
      const sc = pack.sceneById.get(id);
      if (sc?.pano) out.push(new URL(sc.pano, window.location.href).toString());
    }
    return Array.from(new Set(out));
  }

  async _downloadCurrentTourAll() {
    const btn = this.ui.btnDownloadTour;
    if (!btn) return;

    const panoComp = this.panoEl?.components?.["stereo-top-bottom"];
    const urls = this._getPanoUrlsForTour(this.currentTourId);
    if (!urls.length) { this.toast("Nenhuma imagem pra baixar."); return; }

    this._downloadBusy = true;
    btn.disabled = true;

    const total = urls.length;
    let done = 0, ok = 0, fail = 0;

    const controller = new AbortController();
    this._downloadAbort = controller;

    const tourLabel = this._getTourTitle(this.currentTourId);
    const updateLabel = () => { btn.textContent = `Baixando ${done}/${total}`; };
    updateLabel();

    let cacheStore = null;
    if ("caches" in window) {
      try { cacheStore = await caches.open(TOUR_CACHE_NAME); } catch { cacheStore = null; }
    }

    const worker = async (url) => {
      if (controller.signal.aborted) return;
      try {
        if (cacheStore) {
          const hit = await cacheStore.match(url);
          if (hit) { ok++; done++; updateLabel(); return; }
        }

        const res = await fetch(url, { cache: "force-cache", signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        if (cacheStore) await cacheStore.put(url, res.clone());
        try { await panoComp?.preload?.(url); } catch {}

        ok++;
      } catch {
        fail++;
      } finally {
        done++;
        updateLabel();
      }
    };

    const CONCURRENCY = 3;
    const queue = [...urls];
    const runners = Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length && !controller.signal.aborted) {
        await worker(queue.shift());
      }
    });

    await Promise.all(runners);

    btn.textContent = "Baixar Tour Completo";
    btn.disabled = false;
    this._downloadBusy = false;
    this._downloadAbort = null;

    this.toast(`Download "${tourLabel}": ${ok}/${total} (falhas ${fail})`);
  }

  // ============================================================
  // Hotspot resolution
  // ============================================================

  _resolveHotspotTarget(hs) {
    if (!hs) return null;

    const rawTo = (hs.to ?? "").toString().trim();
    const rawTour = (hs.toTour ?? "").toString().trim();

    if (rawTour && rawTo) {
      const tid = this._canonicalTourId(rawTour);
      if (tid && this._scenesByTour.get(tid)?.sceneById?.has(rawTo)) {
        return { tourId: tid, sceneId: rawTo };
      }
    }

    if (rawTo) {
      const m = rawTo.match(/^([^:\/]+)[:\/](.+)$/);
      if (m) {
        const tid = this._canonicalTourId(m[1]);
        const sid = m[2];
        if (tid && this._scenesByTour.get(tid)?.sceneById?.has(sid)) {
          return { tourId: tid, sceneId: sid };
        }
      }
    }

    if (rawTo) {
      const tid = this._canonicalTourId(rawTo);
      if (tid) {
        const start = this._getTourStartSceneId(tid);
        if (start) return { tourId: tid, sceneId: start };
      }
    }

    if (rawTo && this._sceneById.has(rawTo)) {
      return { tourId: this.currentTourId, sceneId: rawTo };
    }

    if (!this._linkTours || !rawTo) return null;

    for (const tid of this._tourOrder) {
      const pack = this._scenesByTour.get(tid);
      if (pack?.sceneById?.has(rawTo)) return { tourId: tid, sceneId: rawTo };
    }

    return null;
  }

  // ============================================================
  // Navigation
  // ============================================================

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

    if (tourId !== this.currentTourId) this._setCurrentTour(tourId);

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
      if (this._firstPaint) this._setFade(1);
      else await this._fadeTo(1, fadeOutMs);
    }

    this.currentSceneId = sceneId;
    this._syncTopBarTitle();

    if (pushHash) history.replaceState(null, "", `#${this.currentTourId}:${sceneId}`);

    await this._setPanoAndWait(scene.pano);

    this._applyViewForScene(scene, fromHotspot);

    this._ensureHotspotAnchor();
    this._renderHotspots(scene);
    this._setHotspotsVisible(true);

    if (!inVR) {
      const fadeInMs = alreadyCached ? 120 : 220;
      await this._fadeTo(0, this._firstPaint ? 220 : fadeInMs);
    }

    this._firstPaint = false;
    this._preloadNeighbors(scene);

    this._updateMapMarker();

    // ✅ VR widget update
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

      const el = this.hotspotRenderer.createHotspot({
        hs,
        sceneStyle,
        position: basePos
      });

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

  _createFadeOverlay() {
    let el = document.querySelector("#sceneFade");
    if (!el) {
      el = document.createElement("div");
      el.id = "sceneFade";
      el.style.position = "fixed";
      el.style.left = "0";
      el.style.top = "0";
      el.style.right = "0";
      el.style.bottom = "0";
      el.style.background = "#000";
      el.style.opacity = "1";
      el.style.pointerEvents = "none";
      el.style.zIndex = "1200";
      el.style.transition = "opacity 200ms ease";
      document.body.appendChild(el);
    }
    this._fadeEl = el;
  }

  _setFade(alpha) {
    if (!this._fadeEl) return;
    this._fadeEl.style.transition = "none";
    this._fadeEl.style.opacity = String(alpha);
    void this._fadeEl.offsetHeight;
    this._fadeEl.style.transition = "opacity 200ms ease";
  }

  _fadeTo(alpha, durationMs) {
    if (!this._fadeEl) return Promise.resolve();
    this._fadeEl.style.transition = `opacity ${durationMs}ms ease`;
    this._fadeEl.style.opacity = String(alpha);

    return new Promise((resolve) => {
      const onEnd = () => resolve();
      this._fadeEl.addEventListener("transitionend", onEnd, { once: true });
      setTimeout(resolve, durationMs + 40);
    });
  }

  showTooltip(text) {
    if (!this._canHover) return;
    if (this.sceneEl.is("vr-mode")) return;
    const el = this.ui.tooltip;
    if (!el) return;
    el.textContent = text || "";
    el.style.left = `${this._mouse.x}px`;
    el.style.top = `${this._mouse.y}px`;
    el.hidden = !text;
  }

  hideTooltip() {
    const el = this.ui.tooltip;
    if (!el) return;
    el.hidden = true;
  }

  toast(msg, ms = 1800) {
    const el = this.ui.toast;
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => (el.hidden = true), ms);
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
