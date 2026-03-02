// js/ui/UIController.js
const LS_FOV = "tour_fov_v1";
const LS_LINK = "tour_link_mode_v1";

export default class UIController {
  constructor(uiRefs, {
    onTourChange = () => {},
    onSceneChange = () => {},
    onPrev = () => {},
    onNext = () => {},
    onToggleVR = () => {},
    onToggleLinkTours = () => {},
    onFovChange = () => {},
    onDownloadTour = () => {},
    onToggleMap = () => {},
  } = {}) {
    this.ui = uiRefs || {};
    this.cb = { onTourChange, onSceneChange, onPrev, onNext, onToggleVR, onToggleLinkTours, onFovChange, onDownloadTour, onToggleMap };

    this._mouse = { x: 0, y: 0 };
    this._canHover = false;
    this._menuOpen = false;

    this._initHoverCapability();
    this._initMouseTracking();
    this._wireControls();
    this._setupFovFromStorage();
    this._setupLinkToggleFromStorage();

    this.setMenuOpen(false);
  }

  // ---------- public API ----------

  canHover() { return this._canHover; }

  setMenuOpen(open) {
    this._menuOpen = !!open;
    if (this.ui.topMenuBar) this.ui.topMenuBar.hidden = !this._menuOpen;

    if (this._menuOpen) this._applyTopBarLayoutNoOverlap();
    else if (this.ui.topMenuBar) this.ui.topMenuBar.style.left = "10px";
  }

  setSceneTitle(text) {
    if (this.ui.titleEl) this.ui.titleEl.textContent = text ?? "—";
  }

  setVRButtonText(text) {
    if (this.ui.btnVR) this.ui.btnVR.textContent = text;
  }

  setVRButtonVisible(visible) {
    if (this.ui.btnVR) this.ui.btnVR.hidden = !visible;
  }

  setInstallButtonVisible(visible) {
    if (this.ui.btnInstall) this.ui.btnInstall.hidden = !visible;
  }

  setTourOptions(tourOrder, getTitleFn, currentTourId) {
    const sel = this.ui.topTourSelect;
    if (!sel) return;

    sel.innerHTML = "";
    for (const tid of (tourOrder || [])) {
      const opt = document.createElement("option");
      opt.value = tid;
      opt.textContent = getTitleFn ? getTitleFn(tid) : tid;
      sel.appendChild(opt);
    }
    if (currentTourId) sel.value = currentTourId;
  }

  setSceneOptions(sceneOrder, sceneById, currentSceneId) {
    const sel = this.ui.topSceneSelect;
    if (!sel) return;

    sel.innerHTML = "";
    for (const id of (sceneOrder || [])) {
      const sc = sceneById?.get?.(id);
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = sc?.name ? sc.name : id;
      sel.appendChild(opt);
    }
    if (currentSceneId) sel.value = currentSceneId;
  }

  setTourValue(tourId) {
    if (this.ui.topTourSelect) this.ui.topTourSelect.value = tourId ?? "";
  }

  setSceneValue(sceneId) {
    if (this.ui.topSceneSelect) this.ui.topSceneSelect.value = sceneId ?? "";
  }

  setFovUI(value) {
    const v = Math.round(Number(value) || 80);
    if (this.ui.fovSlider) this.ui.fovSlider.value = String(v);
    if (this.ui.fovValue) this.ui.fovValue.textContent = String(v);
  }

  setDownloadButtonState({ disabled, label }) {
    const btn = this.ui.btnDownloadTour;
    if (!btn) return;
    if (typeof disabled === "boolean") btn.disabled = disabled;
    if (typeof label === "string") btn.textContent = label;
  }

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

  getLinkToursFromStorage() {
    return localStorage.getItem(LS_LINK) === "1";
  }

  // ---------- internal ----------

  _initHoverCapability() {
    this._canHover = window.matchMedia?.("(hover: hover) and (pointer: fine)")?.matches ?? false;
  }

  _initMouseTracking() {
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

  _wireControls() {
    // Menu
    if (this.ui.btnTopMenu && this.ui.topMenuBar) {
      this.ui.btnTopMenu.addEventListener("click", () => this.setMenuOpen(!this._menuOpen));
      window.addEventListener("resize", () => {
        if (this._menuOpen) this._applyTopBarLayoutNoOverlap();
      });
    }

    // Tour / Scene
    this.ui.topTourSelect?.addEventListener("change", () => {
      const tid = this.ui.topTourSelect.value;
      this.cb.onTourChange(tid);
    });

    this.ui.topSceneSelect?.addEventListener("change", () => {
      const sid = this.ui.topSceneSelect.value;
      this.cb.onSceneChange(sid);
    });

    // Prev / Next
    this.ui.btnPrev?.addEventListener("click", () => this.cb.onPrev());
    this.ui.btnNext?.addEventListener("click", () => this.cb.onNext());

    // VR
    this.ui.btnVR?.addEventListener("click", () => this.cb.onToggleVR());

    // Download
    this.ui.btnDownloadTour?.addEventListener("click", () => this.cb.onDownloadTour());

    // Map
    this.ui.btnMap?.addEventListener("click", () => this.cb.onToggleMap());

    // Link toggle
    if (this.ui.linkToursToggle) {
      this.ui.linkToursToggle.addEventListener("change", () => {
        const v = !!this.ui.linkToursToggle.checked;
        try { localStorage.setItem(LS_LINK, v ? "1" : "0"); } catch {}
        this.cb.onToggleLinkTours(v);
      });
    }

    // FOV slider
    if (this.ui.fovSlider) {
      this.ui.fovSlider.addEventListener("input", () => {
        const v = Number(this.ui.fovSlider.value);
        this.setFovUI(v);
        try { localStorage.setItem(LS_FOV, String(Math.round(v))); } catch {}
        this.cb.onFovChange(v);
      });
    }
  }

  _setupFovFromStorage() {
    const saved = Number(localStorage.getItem(LS_FOV));
    const initial = Number.isFinite(saved) ? saved : 80;
    this.setFovUI(initial);
    this.cb.onFovChange(initial);
  }

  _setupLinkToggleFromStorage() {
    const v = this.getLinkToursFromStorage();
    if (this.ui.linkToursToggle) this.ui.linkToursToggle.checked = v;
    this.cb.onToggleLinkTours(v);
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
}