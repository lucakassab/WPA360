// js/xr/vr_widget.js
export function registerVrWidget(AFRAME) {
  if (!AFRAME) throw new Error("AFRAME não carregou.");

  AFRAME.registerComponent("vr-widget", {
    schema: {
      width: { type: "number", default: 1.30 },
      height: { type: "number", default: 0.84 },
      distance: { type: "number", default: 0.85 },
      mapHeight: { type: "number", default: 0.46 },
      uiScale: { type: "number", default: 1.0 },

      // ✅ texto maior e estável
      textScale: { type: "number", default: 0.24 },     // antes ~0.14–0.20
      buttonTextScale: { type: "number", default: 0.24 },
      titleTextScale: { type: "number", default: 0.30 }
    },

    init() {
      this.state = {
        tourTitle: "—",
        sceneTitle: "—",
        currentTourId: "",
        currentSceneId: "",
        tourList: [],   // [{id,title}]
        sceneList: [],  // [{id,name}]
        fov: 80,

        hasMap: false,
        mapSrc: "",
        marker: null, // {x,y}

        mapVisible: false,
        mapZoom: 1.0,

        dropdown: null // "tour" | "scene" | null
      };

      this._buildUI();

      this.el.addEventListener("vrwidget:update", (e) => {
        this._applyUpdate(e?.detail || {});
      });
    },

    // ============================= UI BUILD =============================

    _buildUI() {
      const w = this.data.width;
      const h = this.data.height;

      this.el.setAttribute("position", `0 -0.10 -${this.data.distance}`);
      this.el.setAttribute("visible", "true");
      this.el.object3D.scale.set(this.data.uiScale, this.data.uiScale, this.data.uiScale);

      // BG
      const bg = document.createElement("a-plane");
      bg.setAttribute("width", w);
      bg.setAttribute("height", h);
      bg.setAttribute("material", "color:#000; opacity:0.78; transparent:true; shader:flat; depthTest:false; depthWrite:false");
      bg.setAttribute("position", "0 0 0");
      bg.setAttribute("render-on-top", "");
      this.el.appendChild(bg);

      // Title (scene)
      this.titleEl = this._makeText({
        value: "—",
        width: 3.2,
        wrapCount: 30,
        align: "center",
        scale: this.data.titleTextScale,
        x: 0,
        y: (h / 2) - 0.08,
        z: 0.06
      });
      this.el.appendChild(this.titleEl);

      // Row 1: Tour dropdown + Scene dropdown
      const row1Y = (h / 2) - 0.20;

      // ✅ sem glyph “▼” (às vezes some). A gente mostra “Tour” e abre lista.
      this.btnTourDrop = this._makeButton({ label: "Tour", x: (-w/2) + 0.22, y: row1Y, w: 0.30, h: 0.11 });
      this.tourValueText = this._makeText({
        value: "—",
        width: 2.8,
        wrapCount: 34,
        align: "left",
        scale: this.data.textScale,
        x: (-w/2) + 0.58,
        y: row1Y,
        z: 0.06
      });

      this.btnSceneDrop = this._makeButton({ label: "Scene", x: (w/2) - 0.52, y: row1Y, w: 0.34, h: 0.11 });
      this.sceneValueText = this._makeText({
        value: "—",
        width: 2.8,
        wrapCount: 34,
        align: "right",
        scale: this.data.textScale,
        x: (w/2) - 0.90,
        y: row1Y,
        z: 0.06
      });

      this.el.appendChild(this.btnTourDrop);
      this.el.appendChild(this.tourValueText);
      this.el.appendChild(this.btnSceneDrop);
      this.el.appendChild(this.sceneValueText);

      this._onClick(this.btnTourDrop, () => this._toggleDropdown("tour"));
      this._onClick(this.btnSceneDrop, () => this._toggleDropdown("scene"));

      // Row 2: Prev / Next / Map / FOV- / FOV+
      const row2Y = (h / 2) - 0.34;

      this.btnPrev = this._makeButton({ label: "Prev", x: (-w/2) + 0.17, y: row2Y, w: 0.22, h: 0.11 });
      this.btnNext = this._makeButton({ label: "Next", x: (-w/2) + 0.41, y: row2Y, w: 0.22, h: 0.11 });
      this.btnMap  = this._makeButton({ label: "Map",  x: (-w/2) + 0.65, y: row2Y, w: 0.20, h: 0.11 });

      this.btnFovMinus = this._makeButton({ label: "FOV -", x: (w/2) - 0.58, y: row2Y, w: 0.20, h: 0.11 });
      this.btnFovPlus  = this._makeButton({ label: "FOV +", x: (w/2) - 0.36, y: row2Y, w: 0.20, h: 0.11 });
      this.fovText = this._makeText({
        value: "FOV 80",
        width: 2.0,
        wrapCount: 14,
        align: "left",
        scale: this.data.textScale,
        x: (w/2) - 0.12,
        y: row2Y,
        z: 0.06
      });

      this.el.appendChild(this.btnPrev);
      this.el.appendChild(this.btnNext);
      this.el.appendChild(this.btnMap);
      this.el.appendChild(this.btnFovMinus);
      this.el.appendChild(this.btnFovPlus);
      this.el.appendChild(this.fovText);

      this._onClick(this.btnPrev, () => this._emit("vrwidget:prevscene", {}));
      this._onClick(this.btnNext, () => this._emit("vrwidget:nextscene", {}));
      this._onClick(this.btnFovMinus, () => this._emit("vrwidget:fovdelta", { delta: -5 }));
      this._onClick(this.btnFovPlus,  () => this._emit("vrwidget:fovdelta", { delta: +5 }));
      this._onClick(this.btnMap, () => this._toggleMapVisible());

      // Dropdown panel (hidden by default)
      this.dropdownPanel = document.createElement("a-entity");
      this.dropdownPanel.setAttribute("visible", "false");
      this.dropdownPanel.setAttribute("position", `0 ${row2Y - 0.02} 0.06`);
      this.el.appendChild(this.dropdownPanel);

      this._buildDropdownPanel();

      // Map group (hidden by default)
      const mapYTop = row2Y - 0.12;
      const mapH = this.data.mapHeight;
      const mapW = w - 0.10;

      this.mapGroup = document.createElement("a-entity");
      this.mapGroup.setAttribute("position", `0 ${mapYTop - mapH/2 - 0.02} 0.05`);
      this.el.appendChild(this.mapGroup);

      this.mapPlane = document.createElement("a-plane");
      this.mapPlane.setAttribute("width", mapW);
      this.mapPlane.setAttribute("height", mapH);
      this.mapPlane.setAttribute("material", "color:#111; opacity:0.95; transparent:true; shader:flat; depthTest:false; depthWrite:false");
      this.mapPlane.setAttribute("position", "0 0 0");
      this.mapPlane.setAttribute("render-on-top", "");
      this.mapGroup.appendChild(this.mapPlane);

      this.markerEl = document.createElement("a-circle");
      this.markerEl.setAttribute("radius", 0.020);
      this.markerEl.setAttribute("material", "color:#ff3b30; shader:flat; depthTest:false; depthWrite:false");
      this.markerEl.setAttribute("position", `0 0 0.06`);
      this.markerEl.setAttribute("render-on-top", "");
      this.mapGroup.appendChild(this.markerEl);

      const zy = -(mapH/2) - 0.09;
      this.btnZoomOut = this._makeButton({ label: "Zoom -", x: -0.20, y: zy, w: 0.22, h: 0.11, z: 0.08, parent: this.mapGroup });
      this.btnZoomIn  = this._makeButton({ label: "Zoom +", x: +0.04, y: zy, w: 0.22, h: 0.11, z: 0.08, parent: this.mapGroup });
      this.btnZoomReset = this._makeButton({ label: "Reset", x: +0.30, y: zy, w: 0.18, h: 0.11, z: 0.08, parent: this.mapGroup });

      this._onClick(this.btnZoomOut, () => this._setMapZoom(this.state.mapZoom / 1.15));
      this._onClick(this.btnZoomIn,  () => this._setMapZoom(this.state.mapZoom * 1.15));
      this._onClick(this.btnZoomReset, () => this._setMapZoom(1.0));

      this._setMapVisible(false);
      this._applyMarker(null);
    },

    _buildDropdownPanel() {
      while (this.dropdownPanel.firstChild) this.dropdownPanel.removeChild(this.dropdownPanel.firstChild);

      const w = this.data.width - 0.10;
      const h = 0.48;

      const bg = document.createElement("a-plane");
      bg.setAttribute("width", w);
      bg.setAttribute("height", h);
      bg.setAttribute("material", "color:#050505; opacity:0.92; transparent:true; shader:flat; depthTest:false; depthWrite:false");
      bg.setAttribute("position", `0 ${-h/2} 0`);
      bg.setAttribute("render-on-top", "");
      this.dropdownPanel.appendChild(bg);

      this.dropdownTitle = this._makeText({
        value: "Select",
        width: 3.0,
        wrapCount: 28,
        align: "left",
        scale: this.data.textScale,
        x: (-w/2) + 0.08,
        y: -0.06,
        z: 0.06,
        parent: this.dropdownPanel
      });

      this.dropdownList = document.createElement("a-entity");
      this.dropdownList.setAttribute("position", `0 -0.12 0.06`);
      this.dropdownPanel.appendChild(this.dropdownList);

      const btnClose = this._makeButton({ label: "Close", x: (w/2) - 0.18, y: -0.06, w: 0.18, h: 0.10, z: 0.06, parent: this.dropdownPanel });
      this._onClick(btnClose, () => this._setDropdown(null));
    },

    // ============================= UPDATE =============================

    _applyUpdate(d) {
      if (d.tourTitle != null) this.state.tourTitle = String(d.tourTitle);
      if (d.sceneTitle != null) this.state.sceneTitle = String(d.sceneTitle);

      if (d.currentTourId != null) this.state.currentTourId = String(d.currentTourId);
      if (d.currentSceneId != null) this.state.currentSceneId = String(d.currentSceneId);

      if (d.tourList != null) this.state.tourList = Array.isArray(d.tourList) ? d.tourList : [];
      if (d.sceneList != null) this.state.sceneList = Array.isArray(d.sceneList) ? d.sceneList : [];

      if (d.fov != null) this.state.fov = Math.round(Number(d.fov) || 80);

      if (d.hasMap != null) this.state.hasMap = !!d.hasMap;
      if (d.mapSrc != null) this.state.mapSrc = String(d.mapSrc || "");
      if (d.marker != null) this.state.marker = d.marker;

      this.titleEl?.setAttribute("text", "value", this.state.sceneTitle || "—");
      this.tourValueText?.setAttribute("text", "value", this.state.tourTitle || "—");
      this.sceneValueText?.setAttribute("text", "value", this.state.sceneTitle || "—");
      this.fovText?.setAttribute("text", "value", `FOV ${this.state.fov}`);

      if (this.btnMap) this.btnMap.setAttribute("material", "color", this.state.hasMap ? "#111" : "#330");

      if (this.mapPlane && this.state.mapSrc) {
        this.mapPlane.setAttribute(
          "material",
          `src:${this.state.mapSrc}; shader:flat; transparent:true; opacity:1.0; depthTest:false; depthWrite:false`
        );
      }

      this._applyMarker(this.state.hasMap ? this.state.marker : null);
      if (!this.state.hasMap) this._setMapVisible(false);

      if (this.state.dropdown) this._renderDropdownList();
    },

    // ============================= DROPDOWNS =============================

    _toggleDropdown(kind) {
      if (this.state.dropdown === kind) this._setDropdown(null);
      else this._setDropdown(kind);
    },

    _setDropdown(kind) {
      this.state.dropdown = kind; // "tour"|"scene"|null
      this.dropdownPanel.setAttribute("visible", kind ? "true" : "false");
      if (kind) this._renderDropdownList();
    },

    _renderDropdownList() {
      while (this.dropdownList.firstChild) this.dropdownList.removeChild(this.dropdownList.firstChild);

      const kind = this.state.dropdown;
      if (!kind) return;

      const items = (kind === "tour") ? this.state.tourList : this.state.sceneList;
      this.dropdownTitle?.setAttribute("text", "value", kind === "tour" ? "Select Tour" : "Select Scene");

      const panelW = this.data.width - 0.18;
      const rowH = 0.10;

      // ✅ layout 2 colunas (até 10 itens) – sem scroll por enquanto
      const colW = (panelW - 0.06) / 2;
      const colX = [-colW/2 - 0.03, colW/2 + 0.03];
      const maxRows = 5;
      const maxItems = 10;
      const shown = items.slice(0, maxItems);

      for (let i = 0; i < shown.length; i++) {
        const it = shown[i];
        const label = kind === "tour"
          ? (it.title ?? it.id ?? String(it))
          : (it.name ?? it.id ?? String(it));

        const col = (i < maxRows) ? 0 : 1;
        const row = (i < maxRows) ? i : (i - maxRows);

        const x = colX[col];
        const y = -(row * (rowH + 0.012));

        const btn = this._makeButton({
          label,
          x,
          y,
          w: colW,
          h: rowH,
          z: 0.08,
          parent: this.dropdownList
        });

        const isSel = (kind === "tour")
          ? (String(it.id) === String(this.state.currentTourId))
          : (String(it.id) === String(this.state.currentSceneId));

        if (isSel) btn.setAttribute("material", "color", "#1f3a52");

        this._onClick(btn, () => {
          if (kind === "tour") this._emit("vrwidget:selecttour", { tourId: it.id });
          else this._emit("vrwidget:selectscene", { sceneId: it.id });
          this._setDropdown(null);
        });
      }

      if (items.length > maxItems) {
        const more = this._makeText({
          value: `(+${items.length - maxItems} more…)`,
          width: 2.2,
          wrapCount: 22,
          align: "center",
          scale: this.data.textScale,
          x: 0,
          y: -(maxRows * (rowH + 0.012)) + 0.01,
          z: 0.08,
          parent: this.dropdownList
        });
        more.setAttribute("opacity", "0.85");
      }
    },

    // ============================= MAP =============================

    _toggleMapVisible() {
      if (!this.state.hasMap) return;
      this._setMapVisible(!this.state.mapVisible);
    },

    _setMapVisible(v) {
      this.state.mapVisible = !!v;
      this.mapGroup?.setAttribute("visible", this.state.mapVisible ? "true" : "false");
    },

    _setMapZoom(z) {
      const nz = Math.max(0.7, Math.min(3.5, Number(z) || 1));
      this.state.mapZoom = nz;
      if (this.mapPlane?.object3D) this.mapPlane.object3D.scale.set(nz, nz, 1);
      this._applyMarker(this.state.hasMap ? this.state.marker : null);
    },

    _applyMarker(pos) {
      if (!this.markerEl) return;

      if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) {
        this.markerEl.setAttribute("visible", "false");
        return;
      }

      const mapW = this.data.width - 0.10;
      const mapH = this.data.mapHeight;

      const x = ((pos.x / 100) - 0.5) * mapW * this.state.mapZoom;
      const y = (0.5 - (pos.y / 100)) * mapH * this.state.mapZoom;

      this.markerEl.setAttribute("position", `${x} ${y} 0.07`);
      this.markerEl.setAttribute("visible", "true");
    },

    // ============================= HELPERS =============================

    _emit(name, detail) {
      this.el.emit(name, detail || {}, false);
    },

    _makeText({ value, width, wrapCount, align, scale, x, y, z, parent = null }) {
      const t = document.createElement("a-entity");
      t.setAttribute("text", [
        `value:${escapeText(value)}`,
        "color:#fff",
        `align:${align || "left"}`,
        "baseline:center",
        "anchor:center",
        `width:${width || 2.0}`,
        `wrapCount:${wrapCount || 24}`,
        "side:double"
      ].join(";"));
      t.setAttribute("position", `${x || 0} ${y || 0} ${z || 0.06}`);
      t.setAttribute("scale", `${scale || this.data.textScale} ${scale || this.data.textScale} ${scale || this.data.textScale}`);
      t.setAttribute("render-on-top", "");
      (parent || this.el).appendChild(t);
      return t;
    },

    _makeButton({ label, x, y, w, h, z = 0.06, parent = null }) {
      const btn = document.createElement("a-plane");
      btn.classList.add("clickable");
      btn.setAttribute("width", w);
      btn.setAttribute("height", h);
      btn.setAttribute("position", `${x} ${y} ${z}`);
      btn.setAttribute("material", "color:#111; opacity:0.95; transparent:true; shader:flat; depthTest:false; depthWrite:false");
      btn.setAttribute("render-on-top", "");

      const txt = document.createElement("a-entity");
      txt.setAttribute("text", [
        `value:${escapeText(label || "—")}`,
        "color:#fff",
        "align:center",
        "baseline:center",
        "anchor:center",
        "width:2.8",
        "wrapCount:28",
        "side:double"
      ].join(";"));

      // ✅ mais à frente do plano (evita sumir)
      txt.setAttribute("position", "0 0 0.08");
      txt.setAttribute("scale", `${this.data.buttonTextScale} ${this.data.buttonTextScale} ${this.data.buttonTextScale}`);
      txt.setAttribute("render-on-top", "");
      btn.appendChild(txt);

      // hover highlight
      const hi = () => btn.setAttribute("material", "color", "#2a2a2a");
      const lo = () => btn.setAttribute("material", "color", "#111");

      btn.addEventListener("raycaster-intersected", hi);
      btn.addEventListener("raycaster-intersected-cleared", lo);

      (parent || this.el).appendChild(btn);
      return btn;
    },

    _onClick(btn, fn) {
      if (!btn) return;

      btn.__lastClickTs = 0;

      btn.addEventListener("click", (e) => {
        e?.stopPropagation?.();

        // ✅ debounce (mata o "abre no down / fecha no up")
        const now = performance.now();
        if (now - (btn.__lastClickTs || 0) < 250) return;
        btn.__lastClickTs = now;

        fn?.();
      });
    }
  });

  function escapeText(s) {
    return String(s || "").replace(/;/g, ",").replace(/\n/g, " ");
  }
}
