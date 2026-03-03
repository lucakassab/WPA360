// js/xr/vr_widget.js
import { ensureVrWidgetView } from "./vr_widget_view.js";

export function registerVrWidget(AFRAME) {
  const V = ensureVrWidgetView(AFRAME);

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
      // +30% longe (pedido anterior)
      const baseDist = this.data.distance * 1.30;

      this.RO = { BG: 900, PANEL: 1000, BTN: 1000, TXT: 1100, MARK: 1200 };
      this.Z  = { BG: 0.00, BTN: 0.02, TXT: 0.06, TXT_FRONT: 0.09, PANEL: 0.03, MARK: 0.095 };

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

      this.el.setAttribute("position", `0 -0.10 -${baseDist}`);
      this.el.object3D.scale.set(this.data.uiScale, this.data.uiScale, this.data.uiScale);

      this._build();

      // ✅ handshake: pede sync assim que o componente nascer
      queueMicrotask(() => {
        this.el.emit("vrwidget:requestsync", { reason: "init" }, false);
      });

      this.el.addEventListener("vrwidget:update", (e) => this._applyUpdate(e?.detail || {}));
    },

    // =================== BUILD ===================

    _build() {
      const w = this.data.width;
      const h = this.data.height;

      const padX = 0.06;
      const topY = h / 2;
      const rowGap = 0.13;
      const rowH = 0.11;

      const yTitle = topY - 0.09;
      const yRow1 = yTitle - rowGap;
      const yRow2 = yRow1 - rowGap;
      const yRow2b = yRow2 - 0.105;
      const yPanelTop = yRow2b - 0.02;

      // BG
      V.makePlane({
        parent: this.el,
        w, h,
        x: 0, y: 0, z: this.Z.BG,
        color: "#000",
        opacity: 0.78,
        order: this.RO.BG
      });

      // Title
      this.titleEl = V.makeText({
        parent: this.el,
        value: "—",
        x: 0, y: yTitle, z: this.Z.TXT,
        width: 3.2,
        wrapCount: 28,
        align: "center",
        scale: this.data.titleScale,
        order: this.RO.TXT
      });

      const leftX = (-w / 2) + padX;
      const rightX = (w / 2) - padX;

      // Row 1 buttons
      this.btnTourDrop = V.makeButton({
        parent: this.el,
        label: "Tour",
        x: leftX + 0.14, y: yRow1, z: this.Z.BTN,
        w: 0.28, h: rowH,
        orderPlane: this.RO.BTN,
        orderText: this.RO.TXT,
        textScale: this.data.btnTextScale,
        textZ: this.Z.TXT_FRONT
      });

      this.btnSceneDrop = V.makeButton({
        parent: this.el,
        label: "Scene",
        x: rightX - 0.16, y: yRow1, z: this.Z.BTN,
        w: 0.32, h: rowH,
        orderPlane: this.RO.BTN,
        orderText: this.RO.TXT,
        textScale: this.data.btnTextScale,
        textZ: this.Z.TXT_FRONT
      });

      this.tourValueText = V.makeText({
        parent: this.el,
        value: "—",
        x: leftX + 0.48, y: yRow1, z: this.Z.TXT,
        width: 2.4,
        wrapCount: 26,
        align: "left",
        scale: this.data.textScale,
        order: this.RO.TXT
      });

      this.sceneValueText = V.makeText({
        parent: this.el,
        value: "—",
        x: rightX - 0.56, y: yRow1, z: this.Z.TXT,
        width: 2.4,
        wrapCount: 26,
        align: "right",
        scale: this.data.textScale,
        order: this.RO.TXT
      });

      this._bindClick(this.btnTourDrop, () => this._toggleDropdown("tour"));
      this._bindClick(this.btnSceneDrop, () => this._toggleDropdown("scene"));

      // Row 2 auto layout
      const items = [
        { label: "Prev", w: 0.22, ev: () => this.el.emit("vrwidget:prevscene", {}, false) },
        { label: "Next", w: 0.22, ev: () => this.el.emit("vrwidget:nextscene", {}, false) },
        { label: "Map",  w: 0.20, ev: () => this._toggleMapVisible() },
        { label: "FOV-", w: 0.18, ev: () => this.el.emit("vrwidget:fovdelta", { delta: -5 }, false) },
        { label: "FOV+", w: 0.18, ev: () => this.el.emit("vrwidget:fovdelta", { delta: +5 }, false) }
      ];

      const placements = V.layoutRow(items.map(i => i.w), {
        left: (-w / 2) + padX,
        right: (w / 2) - padX,
        minGap: 0.02
      });

      for (let i = 0; i < items.length; i++) {
        const p = placements[i];
        const btn = V.makeButton({
          parent: this.el,
          label: items[i].label,
          x: p.x, y: yRow2, z: this.Z.BTN,
          w: p.w, h: rowH,
          orderPlane: this.RO.BTN,
          orderText: this.RO.TXT,
          textScale: this.data.btnTextScale,
          textZ: this.Z.TXT_FRONT
        });

        this._bindClick(btn, items[i].ev);

        if (items[i].label === "Map") this.btnMap = btn;
      }

      this.fovText = V.makeText({
        parent: this.el,
        value: "FOV 80",
        x: (w / 2) - padX - 0.22, y: yRow2b, z: this.Z.TXT,
        width: 2.0,
        wrapCount: 14,
        align: "right",
        scale: this.data.textScale,
        order: this.RO.TXT
      });

      // Dropdown container
      this.dropdownPanel = document.createElement("a-entity");
      this.dropdownPanel.setAttribute("visible", "false");
      this.dropdownPanel.setAttribute("position", `0 ${yPanelTop} ${this.Z.PANEL}`);
      this.el.appendChild(this.dropdownPanel);

      // dropdown bg + title + list + close
      const ddW = this.data.width - 0.10;
      const ddH = 0.52;

      V.makePlane({
        parent: this.dropdownPanel,
        w: ddW, h: ddH,
        x: 0, y: -ddH/2, z: this.Z.BG,
        color: "#050505",
        opacity: 0.92,
        order: this.RO.PANEL
      });

      this.dropdownTitle = V.makeText({
        parent: this.dropdownPanel,
        value: "Select",
        x: (-ddW/2) + 0.12, y: -0.06, z: this.Z.TXT,
        width: 2.8,
        wrapCount: 24,
        align: "left",
        scale: this.data.textScale,
        order: this.RO.TXT
      });

      this.dropdownList = document.createElement("a-entity");
      this.dropdownList.setAttribute("position", `0 -0.14 ${this.Z.TXT}`);
      this.dropdownPanel.appendChild(this.dropdownList);

      this.btnClose = V.makeButton({
        parent: this.dropdownPanel,
        label: "Close",
        x: (ddW/2) - 0.16, y: -0.06, z: this.Z.BTN,
        w: 0.18, h: 0.10,
        orderPlane: this.RO.BTN,
        orderText: this.RO.TXT,
        textScale: this.data.btnTextScale,
        textZ: this.Z.TXT_FRONT
      });
      this._bindClick(this.btnClose, () => this._setDropdown(null));

      // "Loading…" placeholder (resolve o “só Close”)
      this.dropdownLoading = V.makeText({
        parent: this.dropdownPanel,
        value: "Loading…",
        x: 0, y: -0.22, z: this.Z.TXT,
        width: 2.6,
        wrapCount: 24,
        align: "center",
        scale: this.data.textScale,
        order: this.RO.TXT
      });

      // Map panel
      this.mapGroup = document.createElement("a-entity");
      this.mapGroup.setAttribute("visible", "false");
      this.mapGroup.setAttribute("position", `0 ${yPanelTop - 0.02} ${this.Z.PANEL}`);
      this.el.appendChild(this.mapGroup);

      const mapW = this.data.width - 0.10;
      const mapH = this.data.mapHeight;

      this.mapPlane = V.makePlane({
        parent: this.mapGroup,
        w: mapW, h: mapH,
        x: 0, y: -mapH/2, z: this.Z.BG,
        color: "#111",
        opacity: 0.95,
        order: this.RO.PANEL
      });

      this.markerEl = document.createElement("a-circle");
      this.markerEl.setAttribute("radius", 0.020);
      this.markerEl.setAttribute("material", "color:#ff3b30; shader:flat; depthTest:false; depthWrite:false; transparent:true; opacity:1; side:double");
      this.markerEl.setAttribute("position", `0 ${-mapH/2} ${this.Z.MARK}`);
      this.markerEl.setAttribute("vr-ui-fix", `order:${this.RO.MARK}; toneMapped:false; depthTest:false; depthWrite:false; transparent:true; opacity:1`);
      this.mapGroup.appendChild(this.markerEl);

      // zoom buttons
      const yBtns = -mapH - 0.10;
      const zBtn = this.Z.BTN;

      const b1 = V.makeButton({ parent: this.mapGroup, label: "Zoom-", x: -0.22, y: yBtns, z: zBtn, w: 0.22, h: 0.11, orderPlane: this.RO.BTN, orderText: this.RO.TXT, textScale: this.data.btnTextScale, textZ: this.Z.TXT_FRONT });
      const b2 = V.makeButton({ parent: this.mapGroup, label: "Zoom+", x: +0.02, y: yBtns, z: zBtn, w: 0.22, h: 0.11, orderPlane: this.RO.BTN, orderText: this.RO.TXT, textScale: this.data.btnTextScale, textZ: this.Z.TXT_FRONT });
      const b3 = V.makeButton({ parent: this.mapGroup, label: "Reset", x: +0.28, y: yBtns, z: zBtn, w: 0.18, h: 0.11, orderPlane: this.RO.BTN, orderText: this.RO.TXT, textScale: this.data.btnTextScale, textZ: this.Z.TXT_FRONT });

      this._bindClick(b1, () => this._setMapZoom(this.state.mapZoom / 1.15));
      this._bindClick(b2, () => this._setMapZoom(this.state.mapZoom * 1.15));
      this._bindClick(b3, () => this._setMapZoom(1.0));

      // hide on start
      this._setDropdown(null);
      this._applyMarker(null);
    },

    // =================== UPDATE ===================

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

      const tourLabel = V.truncateOneLine(this.state.tourTitle || "—", 28);
      const sceneLabel = V.truncateOneLine(this.state.sceneTitle || "—", 28);

      this.titleEl?.setAttribute("text", "value", sceneLabel);
      this.tourValueText?.setAttribute("text", "value", tourLabel);
      this.sceneValueText?.setAttribute("text", "value", sceneLabel);
      this.fovText?.setAttribute("text", "value", `FOV ${this.state.fov}`);

      // map color
      if (this.btnMap) this.btnMap.setAttribute("material", "color", this.state.hasMap ? "#111" : "#330");

      // map texture
      if (this.mapPlane && this.state.mapSrc) {
        this.mapPlane.setAttribute(
          "material",
          `src:${this.state.mapSrc}; shader:flat; transparent:true; opacity:1.0; depthTest:false; depthWrite:false; side:double`
        );
      }

      this._applyMarker(this.state.hasMap ? this.state.marker : null);

      // ✅ se dropdown aberto e agora tem lista, renderiza na hora
      if (this.state.dropdown) this._renderDropdownList();
    },

    // =================== DROPDOWNS ===================

    _toggleDropdown(kind) {
      if (this.state.dropdown === kind) this._setDropdown(null);
      else this._setDropdown(kind);
    },

    _setDropdown(kind) {
      this.state.dropdown = kind;
      this.dropdownPanel.setAttribute("visible", kind ? "true" : "false");

      if (!kind) return;

      // ✅ render IMEDIATO (mesmo se vazio)
      this._renderDropdownList();

      // ✅ se ainda não tem dados, pede sync pro App
      const items = (kind === "tour") ? this.state.tourList : this.state.sceneList;
      if (!items || items.length === 0) {
        this.el.emit("vrwidget:requestsync", { reason: "dropdown-open", kind }, false);
      }
    },

    _renderDropdownList() {
      while (this.dropdownList.firstChild) this.dropdownList.removeChild(this.dropdownList.firstChild);

      const kind = this.state.dropdown;
      if (!kind) return;

      const items = (kind === "tour") ? this.state.tourList : this.state.sceneList;

      this.dropdownTitle?.setAttribute("text", "value", kind === "tour" ? "Select Tour" : "Select Scene");

      // loading placeholder
      const empty = !items || items.length === 0;
      this.dropdownLoading.setAttribute("visible", empty ? "true" : "false");
      if (empty) return;

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
        const label = V.truncateOneLine(raw, 22);

        const col = (i < maxRows) ? 0 : 1;
        const row = (i < maxRows) ? i : (i - maxRows);

        const x = colX[col];
        const y = -(row * (rowH + rowGap));

        const btn = V.makeButton({
          parent: this.dropdownList,
          label,
          x, y, z: this.Z.BTN,
          w: colW, h: rowH,
          orderPlane: this.RO.BTN,
          orderText: this.RO.TXT,
          textScale: this.data.btnTextScale,
          textZ: this.Z.TXT_FRONT
        });

        const isSel = (kind === "tour")
          ? (String(it.id) === String(this.state.currentTourId))
          : (String(it.id) === String(this.state.currentSceneId));

        if (isSel) btn.setAttribute("material", "color", "#1f3a52");

        this._bindClick(btn, () => {
          if (kind === "tour") this.el.emit("vrwidget:selecttour", { tourId: it.id }, false);
          else this.el.emit("vrwidget:selectscene", { sceneId: it.id }, false);
          this._setDropdown(null);
        });
      }
    },

    // =================== MAP ===================

    _toggleMapVisible() {
      if (!this.state.hasMap) return;
      // fecha dropdown se abrir map
      if (this.state.dropdown) this._setDropdown(null);

      const next = !this.state.mapVisible;
      this.state.mapVisible = next;
      this.mapGroup.setAttribute("visible", next ? "true" : "false");
    },

    _setMapZoom(z) {
      const nz = Math.max(0.7, Math.min(3.5, Number(z) || 1));
      this.state.mapZoom = nz;
      this.mapPlane.object3D.scale.set(nz, nz, 1);
      this._applyMarker(this.state.marker);
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

      this.markerEl.setAttribute("position", `${x} ${y} ${this.Z.MARK}`);
      this.markerEl.setAttribute("visible", "true");
    },

    // =================== Click helper ===================

    _bindClick(el, fn) {
      if (!el) return;
      el.__lastClickTs = 0;

      el.addEventListener("click", (e) => {
        e?.stopPropagation?.();
        const now = performance.now();
        if (now - (el.__lastClickTs || 0) < 250) return;
        el.__lastClickTs = now;
        fn?.();
      });
    }
  });
}
