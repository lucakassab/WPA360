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

        dropdown: null
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

      // Layers (Z)
      this.Z = {
        BG: 0.00,
        BTN: 0.05,
        TXT: 0.10,
        PANEL: 0.14,
        PANEL_TXT: 0.19,
        MAP: 0.12,
        MAP_TXT: 0.17
      };

      // Grid basics
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
      const yRow2b = yRow2 - 0.105; // mini-linha do FOV text
      const yPanelTop = yRow2b - 0.02;

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

      // === Row 1: Tour/Scene triggers + values (fixos, sem overlap) ===
      const leftX = (-w / 2) + this.L.padX;
      const rightX = (w / 2) - this.L.padX;

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

      // === Row 2: layout automático (SEM OVERLAP) ===
      // itens com larguras desejadas
      const row2Items = [
        { key: "prev", label: "Prev", w: 0.22, onClick: () => this._emit("vrwidget:prevscene", {}) },
        { key: "next", label: "Next", w: 0.22, onClick: () => this._emit("vrwidget:nextscene", {}) },
        { key: "map",  label: "Map",  w: 0.20, onClick: () => this._toggleMapVisible() },
        { key: "fovm", label: "FOV-", w: 0.18, onClick: () => this._emit("vrwidget:fovdelta", { delta: -5 }) },
        { key: "fovp", label: "FOV+", w: 0.18, onClick: () => this._emit("vrwidget:fovdelta", { delta: +5 }) }
      ];

      const placements = layoutRow(row2Items.map(i => i.w), {
        left: (-w / 2) + this.L.padX,
        right: (w / 2) - this.L.padX,
        minGap: 0.02
      });

      // cria botões já posicionados
      for (let i = 0; i < row2Items.length; i++) {
        const it = row2Items[i];
        const p = placements[i];

        const btn = this._makeButton({
          label: it.label,
          x: p.x,
          y: yRow2,
          z: this.Z.BTN,
          w: p.w,
          h: this.L.rowH
        });

        this._onClick(btn, it.onClick);

        if (it.key === "prev") this.btnPrev = btn;
        if (it.key === "next") this.btnNext = btn;
        if (it.key === "map")  this.btnMap = btn;
        if (it.key === "fovm") this.btnFovMinus = btn;
        if (it.key === "fovp") this.btnFovPlus = btn;
      }

      // FOV text em mini-linha abaixo (não briga com botões nunca)
      this.fovText = this._makeText({
        value: "FOV 80",
        x: (w / 2) - this.L.padX - 0.22,
        y: yRow2b,
        z: this.Z.TXT,
        width: 2.0,
        wrapCount: 14,
        align: "right",
        scale: this.data.textScale
      });

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
      while (this.dropdownPanel.firstChild) this.dropdownPanel.removeChild(this.dropdownPanel.firstChild);

      const w = this.data.width - 0.10;
      const h = 0.52;

      this.ddBg = document.createElement("a-plane");
      this.ddBg.setAttribute("width", w);
      this.ddBg.setAttribute("height", h);
      this.ddBg.setAttribute("material", "color:#050505; opacity:0.92; transparent:true; shader:flat; depthTest:false; depthWrite:false");
      this.ddBg.setAttribute("position", `0 ${-h/2} 0`);
      this.ddBg.setAttribute("render-on-top", "");
      this.dropdownPanel.appendChild(this.ddBg);

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

      this.dropdownList = document.createElement("a-entity");
      this.dropdownList.setAttribute("position", `0 -0.14 ${this.Z.PANEL_TXT}`);
      this.dropdownPanel.appendChild(this.dropdownList);

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

      const tourLabel = truncateOneLine(this.state.tourTitle || "—", 28);
      const sceneLabel = truncateOneLine(this.state.sceneTitle || "—", 28);

      this.titleEl?.setAttribute("text", "value", sceneLabel);
      this.tourValueText?.setAttribute("text", "value", tourLabel);
      this.sceneValueText?.setAttribute("text", "value", sceneLabel);
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

    // ============================ DROPDOWNS ============================

    _toggleDropdown(kind) {
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
      txt.setAttribute("position", `0 0 ${this.Z.TXT}`);
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

  // ✅ layout dinâmico: distribui itens na linha sem overlap
  function layoutRow(widths, { left, right, minGap = 0.02 }) {
    const avail = Math.max(0.1, right - left);
    const n = widths.length;
    const sumW = widths.reduce((a, b) => a + b, 0);

    // tenta usar gap mínimo
    const need = sumW + minGap * (n - 1);

    let scale = 1.0;
    let gap = minGap;

    if (need > avail) {
      // encolhe tudo proporcionalmente
      scale = avail / need;
      // mantém gap mínimo proporcional também (não zera)
      gap = minGap * scale;
    } else {
      // distribui gap extra automaticamente
      const extra = avail - sumW;
      gap = (n > 1) ? (extra / (n - 1)) : 0;
      gap = Math.max(minGap, gap);
      // se gap ficou maior que o necessário, ok
      // (se isso empurrar pra fora, o cálculo abaixo mantém dentro)
    }

    const out = [];
    let x = left;
    for (let i = 0; i < n; i++) {
      const w = widths[i] * scale;
      const cx = x + w / 2;
      out.push({ x: cx, w });
      x += w + gap;
    }

    // clamp final pra garantir dentro do range
    // (se o gap mínimo estourou, ajusta levemente shift)
    const last = out[out.length - 1];
    const end = last.x + last.w / 2;
    const over = end - right;
    if (over > 0.0001) {
      for (const p of out) p.x -= over;
    }

    return out;
  }
}
