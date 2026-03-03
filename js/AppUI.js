// js/AppUI.js
const TOUR_CACHE_NAME = "tour-full-v1";

export default class AppUI {
  constructor(app, ui) {
    this.app = app;
    this.ui = ui;

    this._menuOpen = false;

    // tooltip follow mouse
    this._mouse = { x: 0, y: 0 };
    this._canHover = false;

    // fade
    this._fadeEl = null;

    // map overlay
    this._mapOpen = false;
    this._mapImgLoaded = false;

    // download
    this._downloadBusy = false;
    this._downloadAbort = null;
  }

  init() {
    this._canHover = window.matchMedia?.("(hover: hover) and (pointer: fine)")?.matches ?? false;

    this._createFadeOverlay();
    this._setupTopBar();
    this._setupFovUI();
    this._setupDownloadTourUI();
    this._setupMapOverlayUI();
    this._setupTooltipFollow();

    // bind app events -> sync UI
    this.app.on("tour:changed", () => {
      this._populateTourSelect();
      this._populateSceneSelect();
      this._syncTopBar();
      this._updateMapAvailability();
      if (this._mapOpen) this._ensureMapImageForTour();
    });

    this.app.on("scene:changed", () => {
      this._syncTopBar();
      this._updateMapMarker();
    });

    this.app.on("fov:changed", (e) => {
      const f = e?.detail?.fov ?? this.app._fov;
      this._syncFovUI(f);
    });

    this.app.on("link:changed", () => {
      if (this.ui.linkToursToggle) this.ui.linkToursToggle.checked = this.app.getLinkTours();
    });

    this.app.on("vr:enter", () => {
      if (this.ui.btnVR) this.ui.btnVR.textContent = "Sair VR";
      this.hideTooltip();
      this._setMenuOpen(false);
      this._setMapOpen(false);
    });

    this.app.on("vr:exit", () => {
      if (this.ui.btnVR) this.ui.btnVR.textContent = "VR";
    });

    // initial sync
    this._populateTourSelect();
    this._populateSceneSelect();
    this._syncTopBar();
    this._updateMapAvailability();
    this._updateMapMarker();
  }

  // ---------------- public UI helpers called by App ----------------
  toast(msg, ms = 1800) {
    const el = this.ui.toast;
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => (el.hidden = true), ms);
  }

  showTooltip(text) {
    if (!this._canHover) return;
    if (this.app.sceneEl.is("vr-mode")) return;
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

  setFade(alpha) {
    if (!this._fadeEl) return;
    this._fadeEl.style.transition = "none";
    this._fadeEl.style.opacity = String(alpha);
    void this._fadeEl.offsetHeight;
    this._fadeEl.style.transition = "opacity 200ms ease";
  }

  fadeTo(alpha, durationMs) {
    if (!this._fadeEl) return Promise.resolve();
    this._fadeEl.style.transition = `opacity ${durationMs}ms ease`;
    this._fadeEl.style.opacity = String(alpha);

    return new Promise((resolve) => {
      const onEnd = () => resolve();
      this._fadeEl.addEventListener("transitionend", onEnd, { once: true });
      setTimeout(resolve, durationMs + 40);
    });
  }

  setVRButtonVisible(visible) {
    if (this.ui.btnVR) this.ui.btnVR.hidden = !visible;
  }

  setInstallButtonVisible(visible) {
    if (this.ui.btnInstall) this.ui.btnInstall.hidden = !visible;
  }

  // ---------------- fade overlay ----------------
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

  // ---------------- top bar ----------------
  _setupTopBar() {
    this._setMenuOpen(false);

    // menu button
    if (this.ui.btnTopMenu && this.ui.topMenuBar) {
      this.ui.btnTopMenu.addEventListener("click", () => {
        this._setMenuOpen(!this._menuOpen);
        if (this._menuOpen) this._ensureTopBarPopulated();
      });

      window.addEventListener("resize", () => {
        if (this._menuOpen) this._applyTopBarLayoutNoOverlap();
      });
    }

    // tour change
    this.ui.topTourSelect?.addEventListener("change", () => {
      const tid = this.ui.topTourSelect.value;
      if (!tid || tid === this.app.currentTourId) return;

      this.app.setCurrentTour(tid);
      const start = this.app._getTourStartSceneId(tid);
      if (start) void this.app.goToScene(start, { tourId: tid });
    });

    // scene change
    this.ui.topSceneSelect?.addEventListener("change", () => {
      const id = this.ui.topSceneSelect.value;
      if (!id || id === this.app.currentSceneId) return;
      void this.app.goToScene(id, { tourId: this.app.currentTourId });
    });

    // link toggle
    if (this.ui.linkToursToggle) {
      this.ui.linkToursToggle.checked = this.app.getLinkTours();
      this.ui.linkToursToggle.addEventListener("change", () => {
        this.app.setLinkTours(!!this.ui.linkToursToggle.checked);
        this.toast(this.app.getLinkTours() ? "Link entre tours: ON" : "Link entre tours: OFF");
      });
    }

    // prev/next
    this.ui.btnPrev?.addEventListener("click", () => void this.app.prevScene());
    this.ui.btnNext?.addEventListener("click", () => void this.app.nextScene());

    // VR button
    this.ui.btnVR?.addEventListener("click", () => {
      if (this.app.sceneEl.is("vr-mode")) this.app.sceneEl.exitVR();
      else this.app.sceneEl.enterVR();
    });
  }

  _ensureTopBarPopulated() {
    const tSel = this.ui.topTourSelect;
    const sSel = this.ui.topSceneSelect;

    if (tSel && tSel.options.length === 0) this._populateTourSelect();
    if (sSel && sSel.options.length === 0) this._populateSceneSelect();
    this._syncTopBar();
  }

  _populateTourSelect() {
    const sel = this.ui.topTourSelect;
    if (!sel) return;

    sel.innerHTML = "";
    for (const tid of this.app.getTourOrder()) {
      const opt = document.createElement("option");
      opt.value = tid;
      opt.textContent = this.app.getTourTitle(tid);
      sel.appendChild(opt);
    }
    sel.value = this.app.currentTourId ?? "";
  }

  _populateSceneSelect() {
    const sel = this.ui.topSceneSelect;
    if (!sel) return;

    sel.innerHTML = "";
    for (const id of this.app.getSceneOrder()) {
      const sc = this.app._sceneById.get(id);
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = sc?.name ? sc.name : id;
      sel.appendChild(opt);
    }
    if (this.app.currentSceneId) sel.value = this.app.currentSceneId;
  }

  _syncTopBar() {
    const sc = this.app.getCurrentScene();
    if (this.ui.titleEl) this.ui.titleEl.textContent = sc?.name ?? sc?.id ?? "—";

    if (this.ui.topTourSelect) this.ui.topTourSelect.value = this.app.currentTourId ?? "";
    if (this.ui.topSceneSelect && sc?.id) this.ui.topSceneSelect.value = sc.id;
  }

  _applyTopBarLayoutNoOverlap() {
    const btn = this.ui.btnTopMenu;
    const bar = this.ui.topMenuBar;
    if (!btn || !bar) return;

    const leftBase = 10;
    const gap = 10;
    const r = btn.getBoundingClientRect();
    const left = Math.round(leftBase + r.width + gap);

    bar.style.left = `${left}px`;
    bar.style.right = "10px";
    bar.style.top = "10px";
  }

  _setMenuOpen(open) {
    this._menuOpen = !!open;
    if (this.ui.topMenuBar) this.ui.topMenuBar.hidden = !this._menuOpen;

    if (this._menuOpen) this._applyTopBarLayoutNoOverlap();
    else if (this.ui.topMenuBar) this.ui.topMenuBar.style.left = "10px";
  }

  // ---------------- FOV UI ----------------
  _setupFovUI() {
    const slider = this.ui.fovSlider;
    if (!slider) return;

    slider.addEventListener("input", () => {
      this.app.setFov(Number(slider.value), { emit: true });
    });

    // initial sync (o App vai disparar fov:changed quando setar)
    this._syncFovUI(this.app._fov);
  }

  _syncFovUI(fov) {
    if (this.ui.fovValue) this.ui.fovValue.textContent = String(fov);
    if (this.ui.fovSlider) this.ui.fovSlider.value = String(fov);
  }

  // ---------------- Tooltip follow mouse ----------------
  _setupTooltipFollow() {
    window.addEventListener("mousemove", (e) => {
      this._mouse.x = e.clientX;
      this._mouse.y = e.clientY;

      const tip = this.ui.tooltip;
      if (tip && !tip.hidden) {
        tip.style.left = `${this._mouse.x}px`;
        tip.style.top = `${this._mouse.y}px`;
      }
    });
  }

  // ---------------- Map overlay ----------------
  _setupMapOverlayUI() {
    if (this.ui.btnMap) this.ui.btnMap.addEventListener("click", () => this.toggleMap());
    if (this.ui.btnMapClose) this.ui.btnMapClose.addEventListener("click", () => this._setMapOpen(false));

    if (this.ui.mapOverlay) {
      this.ui.mapOverlay.addEventListener("click", (e) => {
        if (e.target === this.ui.mapOverlay) this._setMapOpen(false);
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
    const t = this.app.getCurrentTour();
    return !!(t?.map_png);
  }

  _ensureMapImageForTour() {
    const t = this.app.getCurrentTour();
    const png = (t?.map_png ?? "").toString().trim();
    if (!png || !this.ui.mapImg) return;

    if (this.ui.mapTitle) this.ui.mapTitle.textContent = `Planta Baixa — ${t?.title ?? this.app.currentTourId}`;
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

    const scene = this.app.getCurrentScene();
    const pos = parsePercentPair(scene?.scene_map_position);

    if (!this._hasCurrentTourMap() || !pos) {
      marker.hidden = true;
      return;
    }

    marker.style.left = `${pos.x}%`;
    marker.style.top = `${pos.y}%`;
    marker.hidden = false;
  }

  // ---------------- Download tour ----------------
  _setupDownloadTourUI() {
    const btn = this.ui.btnDownloadTour;
    if (!btn) return;

    btn.addEventListener("click", () => {
      if (this._downloadBusy) return;
      void this._downloadCurrentTourAll();
    });
  }

  async _downloadCurrentTourAll() {
    const btn = this.ui.btnDownloadTour;
    if (!btn) return;

    const panoComp = this.app.panoEl?.components?.["stereo-top-bottom"];
    const urls = this.app.getPanoUrlsForTour(this.app.currentTourId);
    if (!urls.length) { this.toast("Nenhuma imagem pra baixar."); return; }

    this._downloadBusy = true;
    btn.disabled = true;

    const total = urls.length;
    let done = 0, ok = 0, fail = 0;

    const controller = new AbortController();
    this._downloadAbort = controller;

    const tourLabel = this.app.getTourTitle(this.app.currentTourId);
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
