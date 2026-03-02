// js/map/MapController.js
const LS_MINIMAP = "tour_minimap_v1";

export default class MapController {
  constructor(mapRefs, {
    onOpenStateChanged = () => {},
  } = {}) {
    this.ui = mapRefs || {};
    this.cb = { onOpenStateChanged };

    this._open = false;
    this._mini = localStorage.getItem(LS_MINIMAP) === "1";
    this._mapImgLoaded = false;

    this._mapZoom = 1;
    this._mapZoomMin = 1;
    this._mapZoomMax = 6;

    this._wire();
    this._applyMiniUI();
    this.close({ notify: false });
  }

  // --- public ---

  isOpen() { return this._open; }
  isMiniMap() { return this._mini; }

  setAvailable(hasMap) {
    if (this.ui.btnMap) this.ui.btnMap.disabled = !hasMap;
  }

  setTourMap({ pngUrl, title }) {
    if (!this.ui.mapImg) return;
    if (this.ui.mapTitle) this.ui.mapTitle.textContent = title || "Planta Baixa";

    const png = String(pngUrl || "").trim();
    if (!png) return;

    // só troca src se mudou
    if (this.ui.mapImg.src && this.ui.mapImg.src.endsWith(png)) return;

    this._mapImgLoaded = false;
    this.ui.mapImg.src = png;
  }

  setMarkerPercent(pos) {
    const marker = this.ui.mapMarker;
    if (!marker) return;

    if (!pos) {
      marker.hidden = true;
      return;
    }

    marker.style.left = `${pos.x}%`;
    marker.style.top = `${pos.y}%`;
    marker.hidden = false;
  }

  open({ notify = true } = {}) {
    this._open = true;
    if (this.ui.mapOverlay) this.ui.mapOverlay.hidden = false;

    this._resetZoom();
    this._applyMiniUI();

    if (notify) this.cb.onOpenStateChanged(true);
  }

  close({ notify = true } = {}) {
    this._open = false;
    if (this.ui.mapOverlay) this.ui.mapOverlay.hidden = true;

    if (notify) this.cb.onOpenStateChanged(false);
  }

  toggle() {
    if (this._open) this.close();
    else this.open();
  }

  setMiniMap(on, { persist = true } = {}) {
    this._mini = !!on;
    if (persist) {
      try { localStorage.setItem(LS_MINIMAP, this._mini ? "1" : "0"); } catch {}
    }
    this._applyMiniUI();
  }

  toggleMiniMap() {
    this.setMiniMap(!this._mini, { persist: true });
  }

  // --- internal ---

  _wire() {
    // Close button
    this.ui.btnMapClose?.addEventListener("click", () => this.close());

    // MiniMap button (label alterna)
    this.ui.btnMiniMap?.addEventListener("click", () => {
      if (!this._open) return;
      this.toggleMiniMap();
    });

    // click outside closes (só no modo overlay full; no minimap o overlay é click-through)
    this.ui.mapOverlay?.addEventListener("click", (e) => {
      if (e.target === this.ui.mapOverlay) this.close();
    });

    // ESC fecha
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this._open) this.close();
    });

    // img load/error
    if (this.ui.mapImg) {
      this.ui.mapImg.addEventListener("load", () => { this._mapImgLoaded = true; });
      this.ui.mapImg.addEventListener("error", () => { this._mapImgLoaded = false; });
    }

    // zoom buttons + wheel
    const body = this.ui.mapBody || document.querySelector("#mapBody");
    const wrap = this.ui.mapWrap || document.querySelector("#mapWrap");

    const btnIn = document.querySelector("#btnMapZoomIn");
    const btnOut = document.querySelector("#btnMapZoomOut");
    const btnReset = document.querySelector("#btnMapZoomReset");

    btnIn?.addEventListener("click", () => {
      if (!this._open) return;
      const cx = (body?.scrollLeft ?? 0) + (body?.clientWidth ?? 0) * 0.5;
      const cy = (body?.scrollTop ?? 0) + (body?.clientHeight ?? 0) * 0.5;
      this._setZoom(this._mapZoom * 1.18, { body, wrap, anchorX: cx, anchorY: cy });
    });

    btnOut?.addEventListener("click", () => {
      if (!this._open) return;
      const cx = (body?.scrollLeft ?? 0) + (body?.clientWidth ?? 0) * 0.5;
      const cy = (body?.scrollTop ?? 0) + (body?.clientHeight ?? 0) * 0.5;
      this._setZoom(this._mapZoom / 1.18, { body, wrap, anchorX: cx, anchorY: cy });
    });

    btnReset?.addEventListener("click", () => {
      if (!this._open) return;
      this._resetZoom();
      if (body) { body.scrollLeft = 0; body.scrollTop = 0; }
    });

    if (body && wrap) {
      body.addEventListener("wheel", (e) => {
        if (!this._open) return;

        e.preventDefault();

        const delta = -Math.sign(e.deltaY);
        const factor = delta > 0 ? 1.12 : 1 / 1.12;

        const rect = body.getBoundingClientRect();
        const cx = e.clientX - rect.left + body.scrollLeft;
        const cy = e.clientY - rect.top + body.scrollTop;

        this._setZoom(this._mapZoom * factor, { body, wrap, anchorX: cx, anchorY: cy });
      }, { passive: false });
    }
  }

  _applyMiniUI() {
    if (this.ui.mapOverlay) this.ui.mapOverlay.classList.toggle("minimap", this._mini);
    if (this.ui.btnMiniMap) this.ui.btnMiniMap.textContent = this._mini ? "Expandir" : "MiniMap";
  }

  _setZoom(next, { body, wrap, anchorX, anchorY } = {}) {
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

  _resetZoom() {
    this._mapZoom = 1;
    const wrap = this.ui.mapWrap || document.querySelector("#mapWrap");
    if (wrap) wrap.style.transform = "scale(1)";
  }
}

function clamp(v, a, b) {
  v = Number(v);
  if (!Number.isFinite(v)) return a;
  return Math.max(a, Math.min(b, v));
}