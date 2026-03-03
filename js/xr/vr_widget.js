// js/xr/vr_widget.js
export function registerVrWidget(AFRAME) {
  if (!AFRAME) throw new Error("AFRAME não carregou.");

  AFRAME.registerComponent("vr-widget", {
    schema: {
      width: { type: "number", default: 1.32 },
      height: { type: "number", default: 0.88 },
      distance: { type: "number", default: 0.85 },
      mapHeight: { type: "number", default: 0.46 },
      uiScale: { type: "number", default: 1.0 },

      // Texto: escala estável (não gigante pra não invadir layout)
      titleScale: { type: "number", default: 0.26 },
      textScale: { type: "number", default: 0.18 },
      btnTextScale: { type: "number", default: 0.18 }
    },

    init() {
      this.state = {
        tourTitle: "—",
        sceneTitle: "—",
        currentTourId: "",
        currentSceneId: "",
        tourList: [],
        sceneList: [],
        fov: 80,

        hasMap: false,
        mapSrc: "",
        marker: null,

        mapVisible: false,
        mapZoom: 1.0,

        dropdown: null // "tour" | "scene" | null
      };

      this._buildUI();

      this.el.addEventListener("vrwidget:update", (e) => {
        this._applyUpdate(e?.detail || {});
      });
    },

    // ============================ BUILD ============================

    _buildUI() {
      const w = this.data.width;
      const h = this.data.height;

      // Layers (Z): espaçados pra evitar z-fighting
      this.Z = {
        BG: 0.00,
        BTN: 0.05,
        TXT: 0.10,
        PANEL: 0.14,
        PANEL_TXT: 0.19,
        MAP: 0.12,
        MAP_TXT: 0.17
      };

      // Grid config (linhas fixas e espaçamento)
      this.L = {
        padX: 0.06,
        topY: h / 2,
        rowGap: 0.13,
        rowH: 0.11
      };

      this.el.setAttribute("position", `0 -0.10 -${this.data.distance}`);
      this.el.setAttribute("visible", "true");
      this.el.object3D.scale.set(this.data.uiScale, this.data.uiScale, this.data.uiScale);

      // BG
      this.bg = document.createElement("a-plane");
      this.bg.setAttribute("width", w);
      this.bg.setAttribute("height", h);
      this.bg.setAttribute("material", "color:#000; opacity:0.78; transparent:true; shader:flat; depthTest:false; depthWrite:false");
      this.bg.setAttribute("position", `0 0 ${this.Z.BG}`);
      this.bg.setAttribute("render-on-top", "");
      this.el.appendChild(this.bg);

      // Row Y positions
      const yTitle = this.L.topY - 0.09;
      const yRow1 = yTitle - this.L.rowGap;
      const yRow2 = yRow1 - this.L.rowGap;
      const yPanelTop = yRow2 - 0.04;

      // Title
      this.titleEl = this._makeText({
        value: "—",
        x: 0,
        y: yTitle,
        z: this.Z.TXT,
        width: 3.2,
        wrapCount: 28,
        align: "center",
        scale: this.data.titleScale
      });

      // === Row 1: Tour / Scene dropdown triggers + values ===
      const leftX = (-w / 2) + this.L.padX;
      const rightX = (w / 2) - this.L.padX;

      // Botões fixos nas bordas
      this.btnTourDrop = this._makeButton({
        label: "Tour",
        x: leftX + 0.14,
        y: yRow1,
        z: this.Z.BTN,
        w: 0.28,
        h: this.L.rowH
      });

      this.btnSceneDrop = this._makeButton({
        label: "Scene",
        x: rightX - 0.16,
        y: yRow1,
        z: this.Z.BTN,
        w: 0.32,
        h: this.L.rowH
      });

      // Textos de valor (ficam no miolo, sem invadir botões)
      this.tourValueText = this._makeText({
        value: "—",
        x: leftX + 0.48,
        y: yRow1,
        z: this.Z.TXT,
        width: 2.4,
        wrapCount: 26,
        align: "left",
        scale: this.data.textScale
      });

      this.sceneValueText = this._makeText({
        value: "—",
        x: rightX - 0.56,
        y: yRow1,
        z: this.Z.TXT,
        width: 2.4,
        wrapCount: 26,
        align: "right",
        scale: this.data.textScale
      });

      this._onClick(this.btnTourDrop, () => this._toggleDropdown("tour"));
      this._onClick(this.btnSceneDrop, () => this._toggleDropdown("scene"));

      // === Row 2: Prev / Next / Map / FOV - / FOV + / FOV text ===
      this.btnPrev = this._makeButton({ label: "Prev", x: leftX + 0.12, y: yRow2, z: this.Z.BTN, w: 0.22, h: this.L.rowH });
      this.btnNext = this._makeButton({ label: "Next", x: leftX + 0.36, y: yRow2, z: this.Z.BTN, w: 0.22, h: this.L.rowH });
      this.btnMap  = this._makeButton({ label: "Map",  x: leftX + 0.60, y: yRow2, z: this.Z.BTN, w: 0.20, h: this.L.rowH });

      this.btnFovMinus = this._makeButton({ label: "FOV-", x: rightX - 0.58, y: yRow2, z: this.Z.BTN, w: 0.18, h: this.L.rowH });
      this.btnFovPlus  = this._makeButton({ label: "FOV+", x: rightX - 0.38, y: yRow2, z: this.Z.BTN, w: 0.18, h: this.L.rowH });

      this.fovText = this._makeText({
        value: "FOV 80",
        x: rightX - 0.14,
        y: yRow2,
        z: this.Z.TXT,
        width: 1.8,
        wrapCount: 12,
        align: "left",
        scale: this.data.textScale
      });

      this._onClick(this.btnPrev, () => this._emit("vrwidget:prevscene", {}));
      this._onClick(this.btnNext, () => this._emit("vrwidget:nextscene", {}));
      this._onClick(this.btnFovMinus, () => this._emit("vrwidget:fovdelta", { delta: -5 }));
      this._onClick(this.btnFovPlus,  () => this._emit("vrwidget:fovdelta", { delta: +5 }));
      this._onClick(this.btnMap, () => this._toggleMapVisible());

      // ==================== Dropdown Panel ====================
      this.dropdownPanel = document.createElement("a-entity");
      this.dropdownPanel.setAttribute("visible", "false");
      this.dropdownPanel.setAttribute("position", `0 ${yPanelTop} ${this.Z.PANEL}`);
      this.el.appendChild(this.dropdownPanel);

      this._buildDropdownPanel();

      // ==================== Map Panel ====================
      this._buildMapPanel(yPanelTop);

      // Start hidden
      this._setDropdown(null);
      this._setMapVisible(false);
      this._applyMarker(null);
    },

    _buildDropdownPanel() {
      // clear
      while (this.dropdownPanel.firstChild) this.dropdownPanel.removeChild(this.dropdownPanel.firstChild);

      const w = this.data.width - 0.10;
      const h = 0.52;

      // background
      this.ddBg = document.createElement("a-plane");
      this.ddBg.setAttribute("width", w);
      this.ddBg.setAttribute("height", h);
      this.ddBg.setAttribute("material", "color:#050505; opacity:0.92; transparent:true; shader:flat; depthTest:false; depthWrite:false");
      this.ddBg.setAttribute("position", `0 ${-h/2} 0`);
      this.ddBg.setAttribute("render-on-top", "");
      this.dropdownPanel.appendChild(this.ddBg);

      // title
      this.dropdownTitle = this._makeText({
        value: "Select",
        x: (-w/2) + 0.12,
        y: -0.06,
        z: this.Z.PANEL_TXT,
        width: 2.8,
        wrapCount: 24,
        align: "left",
        scale: this.data.textScale,
        parent: this.dropdownPanel
      });

      // list container
      this.dropdownList = document.createElement("a-entity");
      this.dropdownList.setAttribute("position", `0 -0.14 ${this.Z.PANEL_TXT}`);
      this.dropdownPanel.appendChild(this.dropdownList);

      // close
      const btnClose = this._makeButton({
        label: "Close",
        x: (w/2) - 0.16,
        y: -0.06,
        z: this.Z.PANEL_TXT,
        w: 0.18,
        h: 0.10,
        parent: this.dropdownPanel
      });
      this._onClick(btnClose, () => this._setDropdown(null));
    },

    _buildMapPanel(yPanelTop) {
      const w = this.data.width - 0.10;
      const mapH = this.data.mapHeight;

      this.mapGroup = document.createElement("a-entity");
      this.mapGroup.setAttribute("position", `0 ${yPanelTop - 0.02} ${this.Z.MAP}`);
      this.el.appendChild(this.mapGroup);

      this.mapPlane = document.createElement("a-plane");
      this.mapPlane.setAttribute("width", w);
      this.mapPlane.setAttribute("height", mapH);
      this.mapPlane.setAttribute("material", "color:#111; opacity:0.95; transparent:true; shader:flat; depthTest:false; depthWrite:false");
      this.mapPlane.setAttribute("position", `0 ${-mapH/2} 0`);
      this.mapPlane.setAttribute("render-on-top", "");
      this.mapGroup.appendChild(this.mapPlane);

      this.markerEl = document.createElement("a-circle");
      this.markerEl.setAttribute("radius", 0.020);
      this.markerEl.setAttribute("material", "color:#ff3b30; shader:flat; depthTest:false; depthWrite:false");
      this.markerEl.setAttribute("position", `0 ${-mapH/2} ${this.Z.MAP_TXT}`);
      this.markerEl.setAttribute("render-on-top", "");
      this.mapGroup.appendChild(this.markerEl);

      // zoom buttons (embaixo do mapa)
      const yBtns = -mapH - 0.10;
      this.btnZoomOut = this._makeButton({ label: "Zoom-", x: -0.22, y: yBtns, z: this.Z.MAP_TXT, w: 0.22, h: 0.11, parent: this.mapGroup });
      this.btnZoomIn  = this._makeButton({ label: "Zoom+", x: +0.02, y: yBtns, z: this.Z.MAP_TXT, w: 0.22, h: 0.11, parent: this.mapGroup });
      this.btnZoomReset = this._makeButton({ label: "Reset", x: +0.28, y: yBtns, z: this.Z.MAP_TXT, w: 0.18, h: 0.11, parent: this.mapGroup });

      this._onClick(this.btnZoomOut, () => this._setMapZoom(this.state.mapZoom / 1.15));
      this._onClick(this.btnZoomIn,  () => this._setMapZoom(this.state.mapZoom * 1.15));
      this._onClick(this.btnZoomReset, () => this._setMapZoom(1.0));
    },

    // ============================ UPDATE ============================

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

      // ✅ truncar pra não invadir (VR wrap é zoado)
      const tourLabel = truncateOneLine(this.state.tourTitle || "—", 28);
      const sceneLabel = truncateOneLine(this.state.sceneTitle || "—", 28);

      this.titleEl?.setAttribute("text", "value", sceneLabel);
      this.tourValueText?.setAttribute("text", "value", tourLabel);
      this.sceneValueText?.setAttribute("text", "value", sceneLabel);
      this.fovText?.setAttribute("text", "value", `FOV ${this.state.fov}`);

      // map button visual
      if (this.btnMap) this.btnMap.setAttribute("material", "color", this.state.hasMap ? "#111" : "#330");

      // map texture
      if (this.mapPlane && this.state.mapSrc) {
        this.mapPlane.setAttribute(
          "material",
          `src:${this.state.mapSrc}; shader:flat; transparent:true; opacity:1.0; depthTest:false; depthWrite:false`
        );
      }

      // marker
      this._applyMarker(this.state.hasMap ? this.state.marker : null);

      // se não tem map, fecha map
      if (!this.state.hasMap) this._setMapVisible(false);

      // se dropdown tá aberto, rerender
      if (this.state.dropdown) this._renderDropdownList();
    },

    // ============================ DROPDOWNS ============================

    _toggleDropdown(kind) {
      // abrir dropdown fecha map pra evitar sobreposição
      if (this.state.mapVisible) this._setMapVisible(false);

      if (this.state.dropdown === kind) this._setDropdown(null);
      else this._setDropdown(kind);
    },

    _setDropdown(kind) {
      this.state.dropdown = kind;
      this.dropdownPanel.setAttribute("visible", kind ? "true" : "false");
      if (kind) this._renderDropdownList();
    },

    _renderDropdownList() {
      while (this.dropdownList.firstChild) this.dropdownList.removeChild(this.dropdownList.firstChild);

      const kind = this.state.dropdown;
      if (!kind) return;

      const items = (kind === "tour") ? this.state.tourList : this.state.sceneList;
      this.dropdownTitle?.setAttribute("text", "value", kind === "tour" ? "Select Tour" : "Select Scene");

      // Layout 2 colunas x 6 linhas (12 itens)
      const panelW = this.data.width - 0.18;
      const colW = (panelW - 0.06) / 2;
      const colX = [-colW/2 - 0.03, colW/2 + 0.03];
      const rowH = 0.10;
      const rowGap = 0.012;
      const maxRows = 6;
      const maxItems = 12;

      const shown = items.slice(0, maxItems);

      for (let i = 0; i < shown.length; i++) {
        const it = shown[i];
        const raw = kind === "tour" ? (it.title ?? it.id ?? String(it)) : (it.name ?? it.id ?? String(it));
        const label = truncateOneLine(raw, 22);

        const col = (i < maxRows) ? 0 : 1;
        const row = (i < maxRows) ? i : (i - maxRows);

        const x = colX[col];
        const y = -(row * (rowH + rowGap));

        const btn = this._makeButton({
          label,
          x,
          y,
          z: this.Z.PANEL_TXT,
          w: colW,
          h: rowH,
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
    },

    // ============================ MAP ============================

    _toggleMapVisible() {
      if (!this.state.hasMap) return;

      // abrir map fecha dropdown pra evitar sobreposição
      if (this.state.dropdown) this._setDropdown(null);

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

      const mapW = (this.data.width - 0.10);
      const mapH = this.data.mapHeight;

      // mapPlane tá centrado em y=-mapH/2, então marker também referencia esse centro
      const cx = 0;
      const cy = -mapH/2;

      const x = cx + ((pos.x / 100) - 0.5) * mapW * this.state.mapZoom;
      const y = cy + (0.5 - (pos.y / 100)) * mapH * this.state.mapZoom;

      this.markerEl.setAttribute("position", `${x} ${y} ${this.Z.MAP_TXT}`);
      this.markerEl.setAttribute("visible", "true");
    },

    // ============================ HELPERS ============================

    _emit(name, detail) {
      this.el.emit(name, detail || {}, false);
    },

    _makeText({ value, x, y, z, width, wrapCount, align, scale, parent = null }) {
      const t = document.createElement("a-entity");
      t.setAttribute("text", [
        `value:${escapeText(value)}`,
        "color:#fff",
        `align:${align || "left"}`,
        "baseline:center",
        "anchor:center",
        `width:${width || 2.0}`,
        `wrapCount:${wrapCount || 24}`,
        "side:double",
        "opacity:1"
      ].join(";"));
      t.setAttribute("position", `${x || 0} ${y || 0} ${z || 0.10}`);
      t.setAttribute("scale", `${scale} ${scale} ${scale}`);
      t.setAttribute("render-on-top", "");
      (parent || this.el).appendChild(t);
      return t;
    },

    _makeButton({ label, x, y, z, w, h, parent = null }) {
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
        "width:2.2",
        "wrapCount:20",
        "side:double",
        "opacity:1"
      ].join(";"));
      txt.setAttribute("position", `0 0 ${this.Z.TXT}`); // bem à frente do plano
      txt.setAttribute("scale", `${this.data.btnTextScale} ${this.data.btnTextScale} ${this.data.btnTextScale}`);
      txt.setAttribute("render-on-top", "");
      btn.appendChild(txt);

      // hover
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

        // debounce: evita toggle duplo (down/up)
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

  function truncateOneLine(s, max) {
    const str = String(s || "");
    if (str.length <= max) return str;
    return str.slice(0, Math.max(0, max - 1)) + "…";
  }
}
