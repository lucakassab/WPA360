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
const LS_MINIMAP = "tour_minimap_v1";
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
    this._toursById = new Map();       // tourId -> {title, scenes[], map_png?}
    this._scenesByTour = new Map();    // tourId -> {sceneOrder, sceneById}

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

    // MiniMap
    this._miniMap = false;

    // zoom/pan
    this._mapZoom = 1;
    this._mapZoomMin = 1;
    this._mapZoomMax = 6;

    // VR debug console
    this._vrDebugEnabled = false;
    this._vrConsoleEl = null;
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

    const data = await loadTours();
    this._defaultTourId = data.defaultTourId;
    this._tourOrder = data.tourOrder;
    this._toursById = data.toursById;
    this._scenesByTour = data.scenesByTour;

    this._linkTours = localStorage.getItem(LS_LINK) === "1";
    this._miniMap = localStorage.getItem(LS_MINIMAP) === "1";

    this._setCurrentTour(this._defaultTourId, { rebuildSceneSelect: false });

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

    // ===== VR Debug Console (dentro do VR) =====
    this._vrDebugEnabled = !!vrDebug;
    if (this._vrDebugEnabled) {
      this._vrConsoleEl = document.createElement("a-entity");
      this._vrConsoleEl.setAttribute("id", "vrConsole");
      this._vrConsoleEl.setAttribute("position", "0 -0.25 -1.2");
      this._vrConsoleEl.setAttribute("visible", "false");
      this._vrConsoleEl.setAttribute("vr-debug-console", "");
      this.cameraEl.appendChild(this._vrConsoleEl);
    }

    this.sceneEl.addEventListener("enter-vr", () => {
      if (this.ui.btnVR) this.ui.btnVR.textContent = "Sair VR";
      this.emit("vr:enter");

      this.hideTooltip();
      if (this._fadeEl) this._fadeEl.style.opacity = "0";

      this._setMenuOpen(false);
      this._setMapOpen(false, { updateHash: true });

      if (this._vrConsoleEl) this._vrConsoleEl.setAttribute("visible", "true");
    });

    this.sceneEl.addEventListener("exit-vr", () => {
      if (this.ui.btnVR) this.ui.btnVR.textContent = "VR";
      this.emit("vr:exit");

      if (this._vrConsoleEl) this._vrConsoleEl.setAttribute("visible", "false");
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

    // ===== Init from hash (Tour:Scene|Map) =====
    const initial = this._getInitialFromHash();

    if (initial?.tourId && initial?.sceneId) {
      await this.goToScene(initial.sceneId, { tourId: initial.tourId, pushHash: false });
      if (initial.mapOpen) this._setMapOpen(true, { updateHash: false });
    } else {
      const firstScene = this._sceneOrder[0];
      await this.goToScene(firstScene, { tourId: this.currentTourId, pushHash: false });
    }

    this._syncHashWithState();

    window.addEventListener("hashchange", () => {
      const parsed = this._getInitialFromHash();
      if (!parsed?.tourId || !parsed?.sceneId) return;

      const sameScene = parsed.tourId === this.currentTourId && parsed.sceneId === this.currentSceneId;

      if (!sameScene) {
        void this.goToScene(parsed.sceneId, { tourId: parsed.tourId, pushHash: false })
          .then(() => {
            this._setMapOpen(!!parsed.mapOpen, { updateHash: false });
            this._syncHashWithState();
          });
        return;
      }

      this._setMapOpen(!!parsed.mapOpen, { updateHash: false });
      this._syncHashWithState();
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
  }

  // ===== Hash helpers =====

  _makeSceneHash({ tourId, sceneId, mapOpen }) {
    const base = `${tourId}:${sceneId}`;
    return mapOpen ? `${base}|Map` : base;
  }

  _syncHashWithState() {
    if (!this.currentTourId || !this.currentSceneId) return;
    const h = this._makeSceneHash({
      tourId: this.currentTourId,
      sceneId: this.currentSceneId,
      mapOpen: this._mapOpen
    });
    history.replaceState(null, "", `#${h}`);
  }

  _getInitialFromHash() {
    const raw = (location.hash || "").replace("#", "").trim();
    if (!raw) return null;

    const parts = raw.split("|").map(s => s.trim()).filter(Boolean);
    const mapOpen = parts.some(p => p.toLowerCase() === "map");
    const base = parts.find(p => p.toLowerCase() !== "map") || "";
    if (!base) return null;

    // Tour:Scene
    const m = base.match(/^([^:\/]+)[:\/](.+)$/);
    if (m) {
      const tid = this._canonicalTourId(m[1]);
      const sid = m[2];
      if (tid && this._scenesByTour.get(tid)?.sceneById?.has(sid)) {
        return { tourId: tid, sceneId: sid, mapOpen };
      }
    }

    // só SceneId (tour atual)
    const sid = base;
    if (this._sceneById.has(sid)) return { tourId: this.currentTourId, sceneId: sid, mapOpen };

    // linkTours: procura em todos
    if (this._linkTours) {
      for (const tid of this._tourOrder) {
        const pack = this._scenesByTour.get(tid);
        if (pack?.sceneById?.has(sid)) return { tourId: tid, sceneId: sid, mapOpen };
      }
    }

    // fallback: default
    if (this._scenesByTour.get(this._defaultTourId)?.sceneById?.has(sid)) {
      return { tourId: this._defaultTourId, sceneId: sid, mapOpen };
    }

    return null;
  }

  // ===== Map Overlay / MiniMap =====

  _setupMapOverlay() {
    const btn = this.ui.btnMap;
    const overlay = this.ui.mapOverlay;
    const closeBtn = this.ui.btnMapClose;

    if (btn) btn.addEventListener("click", () => this.toggleMap());
    if (closeBtn) closeBtn.addEventListener("click", () => this._setMapOpen(false));

    // MiniMap toggle
    this.ui.btnMiniMap?.addEventListener("click", () => {
      if (!this._mapOpen) return;
      this._setMiniMap(!this._miniMap, { persist: true });
    });

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

    // zoom buttons + wheel
    const btnIn = document.querySelector("#btnMapZoomIn");
    const btnOut = document.querySelector("#btnMapZoomOut");
    const btnReset = document.querySelector("#btnMapZoomReset");
    const body = document.querySelector("#mapBody");
    const wrap = document.querySelector("#mapWrap");

    if (btnIn) btnIn.addEventListener("click", () => {
      if (!this._mapOpen) return;
      const cx = (body?.scrollLeft ?? 0) + (body?.clientWidth ?? 0) * 0.5;
      const cy = (body?.scrollTop ?? 0) + (body?.clientHeight ?? 0) * 0.5;
      this._setMapZoom(this._mapZoom * 1.18, { anchorX: cx, anchorY: cy, body, wrap });
    });

    if (btnOut) btnOut.addEventListener("click", () => {
      if (!this._mapOpen) return;
      const cx = (body?.scrollLeft ?? 0) + (body?.clientWidth ?? 0) * 0.5;
      const cy = (body?.scrollTop ?? 0) + (body?.clientHeight ?? 0) * 0.5;
      this._setMapZoom(this._mapZoom / 1.18, { anchorX: cx, anchorY: cy, body, wrap });
    });

    if (btnReset) btnReset.addEventListener("click", () => {
      if (!this._mapOpen) return;
      this._resetMapZoom();
      if (body) { body.scrollLeft = 0; body.scrollTop = 0; }
    });

    if (body && wrap) {
      body.addEventListener("wheel", (e) => {
        if (!this._mapOpen) return;

        e.preventDefault();

        const delta = -Math.sign(e.deltaY);
        const factor = delta > 0 ? 1.12 : 1 / 1.12;

        const rect = body.getBoundingClientRect();
        const cx = e.clientX - rect.left + body.scrollLeft;
        const cy = e.clientY - rect.top + body.scrollTop;

        this._setMapZoom(this._mapZoom * factor, { anchorX: cx, anchorY: cy, body, wrap });
      }, { passive: false });
    }

    this._applyMiniMapUI();
  }

  toggleMap() {
    if (!this._hasCurrentTourMap()) {
      this.toast("Esse tour não tem planta (map_png).");
      return;
    }
    this._setMapOpen(!this._mapOpen);
  }

  _setMapOpen(open, { updateHash = true } = {}) {
    this._mapOpen = !!open;
    if (this.ui.mapOverlay) this.ui.mapOverlay.hidden = !this._mapOpen;

    if (this._mapOpen) {
      this._ensureMapImageForTour();
      this._resetMapZoom();
      this._updateMapMarker();
      this._applyMiniMapUI();
    }

    if (updateHash) this._syncHashWithState();
  }

  _setMiniMap(on, { persist = true } = {}) {
    this._miniMap = !!on;
    if (persist) {
      try { localStorage.setItem(LS_MINIMAP, this._miniMap ? "1" : "0"); } catch {}
    }
    this._applyMiniMapUI();
  }

  _applyMiniMapUI() {
    const overlay = this.ui.mapOverlay;
    if (overlay) overlay.classList.toggle("minimap", this._miniMap);

    if (this.ui.btnMiniMap) {
      this.ui.btnMiniMap.textContent = this._miniMap ? "Expandir" : "MiniMap";
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

  _setMapZoom(next, { anchorX, anchorY, body, wrap } = {}) {
    const z0 = this._mapZoom;
    const z1 = clamp(next, this._mapZoomMin, this._mapZoomMax);
    if (Math.abs(z1 - z0) < 1e-6) return;

    this._mapZoom = z1;

    if (!wrap) wrap = document.querySelector("#mapWrap");
    if (!wrap) return;

    wrap.style.transform = `scale(${this._mapZoom})`;

    if (body && Number.isFinite(anchorX) && Number.isFinite(anchorY)) {
      const ratio = z1 / z0;

      const newScrollLeft = anchorX * ratio - (anchorX - body.scrollLeft);
      const newScrollTop  = anchorY * ratio - (anchorY - body.scrollTop);

      body.scrollLeft = newScrollLeft;
      body.scrollTop  = newScrollTop;
    }
  }

  _resetMapZoom() {
    this._mapZoom = 1;
    const wrap = document.querySelector("#mapWrap");
    if (wrap) wrap.style.transform = "scale(1)";
  }

  // ===== Tour switching =====

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

  _getTourTitle(tourId) {
    const t = this._toursById.get(tourId);
    return t?.title ? t.title : tourId;
  }

  _getTourStartSceneId(tourId) {
    const pack = this._scenesByTour.get(tourId);
    return pack?.sceneOrder?.[0] ?? null;
  }

  // ===== Top bar =====

  _setupTopBar() {
    const btn = this.ui.btnTopMenu;
    const bar = this.ui.topMenuBar;

    this._setMenuOpen(false);

    // tour dropdown
    if (this.ui.topTourSelect) {
      this.ui.topTourSelect.innerHTML = "";
      for (const tid of this._tourOrder) {
        const opt = document.createElement("option");
        opt.value = tid;
        opt.textContent = this._getTourTitle(tid);
        this.ui.topTourSelect.appendChild(opt);
      }
      this.ui.topTourSelect.value = this.currentTourId;

      this.ui.topTourSelect.addEventListener("change", () => {
        const tid = this.ui.topTourSelect.value;
        if (!tid || tid === this.currentTourId) return;

        this._setCurrentTour(tid);
        const start = this._getTourStartSceneId(tid);
        if (start) void this.goToScene(start, { tourId: tid });
      });
    }

    // scene dropdown
    this._populateSceneSelect();
    this.ui.topSceneSelect?.addEventListener("change", () => {
      const id = this.ui.topSceneSelect.value;
      if (!id || id === this.currentSceneId) return;
      void this.goToScene(id, { tourId: this.currentTourId });
    });

    // link toggle
    if (this.ui.linkToursToggle) {
      this.ui.linkToursToggle.checked = this._linkTours;
      this.ui.linkToursToggle.addEventListener("change", () => {
        this._linkTours = !!this.ui.linkToursToggle.checked;
        try { localStorage.setItem(LS_LINK, this._linkTours ? "1" : "0"); } catch {}
        this.toast(this._linkTours ? "Link entre tours: ON" : "Link entre tours: OFF");
      });
    }

    // menu show/hide
    if (btn && bar) {
      btn.addEventListener("click", () => this._setMenuOpen(!this._menuOpen));
      window.addEventListener("resize", () => {
        if (this._menuOpen) this._applyTopBarLayoutNoOverlap();
      });
    }
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

  // ===== FOV =====

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
  }

  // ===== Download / Cache (tour atual) =====

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

  // ===== Hotspot resolution (multi-tour) =====

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

  // ===== Navigation =====

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

    if (pushHash) this._syncHashWithState();

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

  // ===== Fade/Toast/Tooltip =====

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

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
