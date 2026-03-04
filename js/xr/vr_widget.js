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
      btnTextScale: { type: "number", default: 0.18 },

      // ✅ novo: controla interação real (raycast/click)
      interactive: { type: "boolean", default: true }
    },

    init() {
      const baseDist = this.data.distance * 2.2;

      this.RO = { BG: 900, PANEL: 1000, BTN: 1000, TXT: 1100, MARK: 1200 };
      this.Z  = { BG: 0.00, BTN: 0.02, TXT: 0.06, PANEL: 0.03, MARK: 0.010 };

      this.TEXT_Z_WORLD = 0.012;

      this._mapFit = { x: 1, y: 1 };
      this._mapW = this.data.width - 0.10;
      this._mapH = this.data.mapHeight;

      // dropdown layout
      this._dd = {
        ddW: this.data.width - 0.10,
        headerH: 0.12,
        footerH: 0.14,
        padTop: 0.06,
        padBetweenTitleList: 0.06,
        padBetweenListClose: 0.08,
        padBottom: 0.06,

        rowH: 0.10,
        rowGap: 0.020, // ✅ spacing vertical (ajusta aqui)
        maxRows: 6,
        maxItems: 40,
      };

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

        dropdown: null, // "tour" | "scene" | null
        loading: false
      };

      this.el.setAttribute("position", `0 -0.10 -${baseDist}`);
      this.el.object3D.scale.set(this.data.uiScale, this.data.uiScale, this.data.uiScale);

      this._build();

      // ✅ quando o App esconder o widget, fecha tudo e mata interação
      this.el.addEventListener("vrwidget:forceclose", () => {
        this._closeDropdown();
        this._setMapVisible(false);
        this._applyInteractivity();
      });

      queueMicrotask(() => {
        this.el.emit("vrwidget:requestsync", { reason: "init" }, false);
      });

      this.el.addEventListener("vrwidget:update", (e) => this._applyUpdate(e?.detail || {}));

      // estado inicial de interação
      this._applyInteractivity();
    },

    update() {
      this._applyInteractivity();
    },

    tick() {
      // ✅ garante que “invisível” = não interativo, mesmo se algo reativar clickables
      this._applyInteractivity();
    },

    // =========================
    // Interatividade REAL (mata raycast/click quando oculto)
    // =========================
    _isInteractableNow() {
      if (!this.data.interactive) return false;

      const visAttr = this.el.getAttribute("visible");
      if (visAttr === false || visAttr === "false") return false;

      const visObj = this.el.object3D ? this.el.object3D.visible : true;
      if (visObj === false) return false;

      return true;
    },

    _toggleClickable(node, enabled) {
      if (!node) return;

      // A-Frame Entity: classList existe
      if (enabled) node.classList.add("clickable");
      else node.classList.remove("clickable");
    },

    _applyInteractivity() {
      const enabled = this._isInteractableNow();

      // botões fixos
      this._toggleClickable(this.btnTourDrop, enabled);
      this._toggleClickable(this.btnSceneDrop, enabled);
      this._toggleClickable(this.btnMap, enabled);

      // botões do map
      if (this._mapBtns) {
        for (const b of this._mapBtns) this._toggleClickable(b, enabled);
      }

      // dropdown close
      this._toggleClickable(this.ddCloseBtn, enabled);

      // dropdown itens (varrem o container)
      if (this.ddList?.querySelectorAll) {
        const nodes = this.ddList.querySelectorAll(".clickable,[data-vrdditem='1']");
        nodes.forEach(n => this._toggleClickable(n, enabled));
      }
    },

    // =========================
    // Helpers visuais
    // =========================
    _btnColor(btn, color) {
      if (!btn) return;
      btn.setAttribute("rounded-rect", "color", color);
    },

    _applyMapScale() {
      if (!this.mapPlane?.object3D) return;
      const sx = this._mapFit?.x ?? 1;
      const sy = this._mapFit?.y ?? 1;
      const z = this.state.mapZoom || 1;
      this.mapPlane.object3D.scale.set(z * sx, z * sy, 1);
    },

    _calcFitContain(imgW, imgH) {
      const cw = this._mapW;
      const ch = this._mapH;
      if (!imgW || !imgH || !cw || !ch) return { x: 1, y: 1 };

      const containerAspect = cw / ch;
      const imgAspect = imgW / imgH;

      let sx = 1, sy = 1;
      if (imgAspect > containerAspect) sy = containerAspect / imgAspect;
      else sx = imgAspect / containerAspect;

      sx = Math.max(0.2, Math.min(1, sx));
      sy = Math.max(0.2, Math.min(1, sy));
      return { x: sx, y: sy };
    },

    _clearEntity(ent) {
      if (!ent) return;
      while (ent.firstChild) ent.removeChild(ent.firstChild);
    },

    // =========================
    // Build UI
    // =========================
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
      const yPanelTop = (yRow2 - 0.105) - 0.02;

      // BG panel
      V.makePlane({
        parent: this.el,
        w, h,
        x: 0, y: 0, z: this.Z.BG,
        color: "#000",
        opacity: 0.78,
        order: this.RO.BG,
        radius: 0.08
      });

      this.titleEl = V.makeText({
        parent: this.el,
        value: "—",
        x: 0, y: yTitle, z: this.Z.TXT,
        width: 3.2,
        wrapCount: 28,
        align: "center",
        anchor: "center",
        baseline: "center",
        scale: this.data.titleScale,
        order: this.RO.TXT
      });

      // Loading badge
      this.loadingBg = V.makePlane({
        parent: this.el,
        w: 0.46,
        h: 0.10,
        x: 0,
        y: yTitle - 0.11,
        z: this.Z.BTN,
        color: "#111",
        opacity: 0.92,
        order: this.RO.BTN,
        radius: 0.05
      });
      this.loadingText = V.makeText({
        parent: this.el,
        value: "Carregando…",
        x: 0,
        y: yTitle - 0.11,
        z: this.Z.TXT,
        width: 1.2,
        wrapCount: 16,
        align: "center",
        anchor: "center",
        baseline: "center",
        scale: this.data.textScale,
        order: this.RO.TXT
      });
      this.loadingBg.setAttribute("visible", "false");
      this.loadingText.setAttribute("visible", "false");

      const leftX = (-w / 2) + padX;
      const rightX = (w / 2) - padX;

      // Drop buttons
      this.btnTourDrop = V.makeButton({
        parent: this.el,
        label: "Tour",
        x: leftX + 0.14, y: yRow1, z: this.Z.BTN,
        w: 0.28, h: rowH,
        orderPlane: this.RO.BTN,
        orderText: this.RO.TXT,
        textScale: this.data.btnTextScale,
        textZ: this.TEXT_Z_WORLD,
        radius: 0.04
      });

      this.btnSceneDrop = V.makeButton({
        parent: this.el,
        label: "Scene",
        x: rightX - 0.16, y: yRow1, z: this.Z.BTN,
        w: 0.32, h: rowH,
        orderPlane: this.RO.BTN,
        orderText: this.RO.TXT,
        textScale: this.data.btnTextScale,
        textZ: this.TEXT_Z_WORLD,
        radius: 0.04
      });

      this.tourValueText = V.makeText({
        parent: this.el,
        value: "—",
        x: leftX + 0.48, y: yRow1, z: this.Z.TXT,
        width: 2.4,
        wrapCount: 26,
        align: "left",
        anchor: "center",
        baseline: "center",
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
        anchor: "center",
        baseline: "center",
        scale: this.data.textScale,
        order: this.RO.TXT
      });

      this._bindClick(this.btnTourDrop, () => this._toggleDropdown("tour"));
      this._bindClick(this.btnSceneDrop, () => this._toggleDropdown("scene"));

      // Row2 buttons
      const items = [
        { label: "Prev", w: 0.24, ev: () => this.el.emit("vrwidget:prevscene", {}, false) },
        { label: "Next", w: 0.24, ev: () => this.el.emit("vrwidget:nextscene", {}, false) },
        { label: "Map",  w: 0.22, ev: () => this._toggleMapVisible() }
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
          textZ: this.TEXT_Z_WORLD,
          radius: 0.04
        });

        this._bindClick(btn, items[i].ev);
        if (items[i].label === "Map") this.btnMap = btn;
      }

      // ===== Map panel =====
      this.mapGroup = document.createElement("a-entity");
      this.mapGroup.setAttribute("visible", "false");
      this.mapGroup.setAttribute("position", `0 ${yPanelTop - 0.02} ${this.Z.PANEL}`);
      this.el.appendChild(this.mapGroup);

      const mapW = this._mapW;
      const mapH = this._mapH;

      this.mapPlane = V.makePlane({
        parent: this.mapGroup,
        w: mapW, h: mapH,
        x: 0, y: -mapH / 2, z: this.Z.BG,
        color: "#111",
        opacity: 0.95,
        order: this.RO.PANEL,
        radius: 0.06
      });

      // marker child do mapPlane
      this.markerEl = document.createElement("a-circle");
      this.markerEl.setAttribute("radius", 0.020);
      this.markerEl.setAttribute("material", "color:#ff3b30; shader:flat; depthTest:false; depthWrite:false; transparent:true; opacity:1; side:double");
      this.markerEl.setAttribute("position", `0 0 ${this.Z.MARK}`);
      this.markerEl.setAttribute("visible", "false");
      this.markerEl.setAttribute("vr-ui-fix", `order:${this.RO.MARK}; toneMapped:false; depthTest:false; depthWrite:false; transparent:true; opacity:1; applyDescendants:false`);
      this.mapPlane.appendChild(this.markerEl);

      this.mapPlane.addEventListener("rounded-rect-texture-loaded", (e) => {
        const wImg = Number(e?.detail?.width || 0);
        const hImg = Number(e?.detail?.height || 0);
        this._mapFit = this._calcFitContain(wImg, hImg);
        this._applyMapScale();
        this._applyMarker(this.state.marker);
      });

      const yBtns = -mapH - 0.10;
      const zBtn = this.Z.BTN;

      const b1 = V.makeButton({ parent: this.mapGroup, label: "Zoom-", x: -0.22, y: yBtns, z: zBtn, w: 0.22, h: 0.11, orderPlane: this.RO.BTN, orderText: this.RO.TXT, textScale: this.data.btnTextScale, textZ: this.TEXT_Z_WORLD, radius: 0.04 });
      const b2 = V.makeButton({ parent: this.mapGroup, label: "Zoom+", x: +0.02, y: yBtns, z: zBtn, w: 0.22, h: 0.11, orderPlane: this.RO.BTN, orderText: this.RO.TXT, textScale: this.data.btnTextScale, textZ: this.TEXT_Z_WORLD, radius: 0.04 });
      const b3 = V.makeButton({ parent: this.mapGroup, label: "Reset", x: +0.28, y: yBtns, z: zBtn, w: 0.18, h: 0.11, orderPlane: this.RO.BTN, orderText: this.RO.TXT, textScale: this.data.btnTextScale, textZ: this.TEXT_Z_WORLD, radius: 0.04 });

      this._mapBtns = [b1, b2, b3];

      this._bindClick(b1, () => this._setMapZoom(this.state.mapZoom / 1.15));
      this._bindClick(b2, () => this._setMapZoom(this.state.mapZoom * 1.15));
      this._bindClick(b3, () => this._setMapZoom(1.0));

      this._applyMapScale();
      this._applyMarker(null);

      // ===== Dropdown panel =====
      this.ddGroup = document.createElement("a-entity");
      this.ddGroup.setAttribute("visible", "false");
      this.ddGroup.setAttribute("position", `0 ${yPanelTop - 0.02} ${this.Z.PANEL}`);
      this.el.appendChild(this.ddGroup);

      this.ddBg = V.makePlane({
        parent: this.ddGroup,
        w: this._dd.ddW, h: 0.40,
        x: 0, y: -0.20, z: this.Z.BG,
        color: "#0b0b0b",
        opacity: 0.96,
        order: this.RO.PANEL,
        radius: 0.06
      });

      this.ddTitle = V.makeText({
        parent: this.ddGroup,
        value: "Select —",
        x: 0, y: 0.0, z: this.Z.TXT,
        width: 2.8,
        wrapCount: 20,
        align: "center",
        anchor: "center",
        baseline: "center",
        scale: this.data.textScale,
        order: this.RO.TXT
      });

      this.ddList = document.createElement("a-entity");
      this.ddGroup.appendChild(this.ddList);

      this.ddCloseBtn = V.makeButton({
        parent: this.ddGroup,
        label: "Close",
        x: 0, y: -0.25, z: this.Z.BTN,
        w: 0.30, h: 0.11,
        orderPlane: this.RO.BTN,
        orderText: this.RO.TXT,
        textScale: this.data.btnTextScale,
        textZ: this.TEXT_Z_WORLD,
        radius: 0.04
      });
      this._bindClick(this.ddCloseBtn, () => this._closeDropdown());
    },

    // =========================
    // Updates do App
    // =========================
    _applyUpdate(d) {
      if (d.tourTitle != null) this.state.tourTitle = String(d.tourTitle);
      if (d.sceneTitle != null) this.state.sceneTitle = String(d.sceneTitle);
      if (d.currentTourId != null) this.state.currentTourId = String(d.currentTourId);
      if (d.currentSceneId != null) this.state.currentSceneId = String(d.currentSceneId);
      if (d.tourList != null) this.state.tourList = Array.isArray(d.tourList) ? d.tourList : [];
      if (d.sceneList != null) this.state.sceneList = Array.isArray(d.sceneList) ? d.sceneList : [];
      if (d.hasMap != null) this.state.hasMap = !!d.hasMap;
      if (d.mapSrc != null) this.state.mapSrc = String(d.mapSrc || "");
      if (d.marker != null) this.state.marker = d.marker;
      if (d.loading != null) this.state.loading = !!d.loading;

      const tourLabel = V.truncateOneLine(this.state.tourTitle || "—", 28);
      const sceneLabel = V.truncateOneLine(this.state.sceneTitle || "—", 28);

      this.titleEl?.setAttribute("text", "value", sceneLabel);
      this.tourValueText?.setAttribute("text", "value", tourLabel);
      this.sceneValueText?.setAttribute("text", "value", sceneLabel);

      const show = this.state.loading;
      this.loadingBg?.setAttribute("visible", show ? "true" : "false");
      this.loadingText?.setAttribute("visible", show ? "true" : "false");

      if (this.btnMap) this._btnColor(this.btnMap, this.state.hasMap ? "#121212" : "#070707");

      // map texture
      if (this.mapPlane) {
        if (this.state.mapSrc) {
          this._mapFit = { x: 1, y: 1 };
          this._applyMapScale();
          this.mapPlane.setAttribute("rounded-rect", "src", this.state.mapSrc);
          this.mapPlane.setAttribute("rounded-rect", "opacity", 1.0);
          this.mapPlane.setAttribute("rounded-rect", "color", "#ffffff");
        } else {
          this._mapFit = { x: 1, y: 1 };
          this._applyMapScale();
          this.mapPlane.setAttribute("rounded-rect", "src", "");
          this.mapPlane.setAttribute("rounded-rect", "color", "#111");
        }
      }

      this._applyMarker(this.state.hasMap ? this.state.marker : null);

      if (!this.state.hasMap) this._setMapVisible(false);

      // re-render dropdown imediatamente se aberto
      if (this.state.dropdown) this._renderDropdown();

      // garante clickables coerentes com estado atual
      this._applyInteractivity();
    },

    // =========================
    // Map
    // =========================
    _toggleMapVisible() {
      if (!this.state.hasMap) return;
      const next = !this.state.mapVisible;
      this.state.mapVisible = next;
      this.mapGroup.setAttribute("visible", next ? "true" : "false");

      // se abriu map, fecha dropdown
      if (next) this._closeDropdown();

      this._applyInteractivity();
    },

    _setMapVisible(v) {
      this.state.mapVisible = !!v;
      this.mapGroup?.setAttribute("visible", this.state.mapVisible ? "true" : "false");
      this._applyInteractivity();
    },

    _setMapZoom(z) {
      const nz = Math.max(0.7, Math.min(3.5, Number(z) || 1));
      this.state.mapZoom = nz;
      this._applyMapScale();
      this._applyMarker(this.state.marker);
    },

    _applyMarker(pos) {
      if (!this.markerEl) return;

      if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) {
        this.markerEl.setAttribute("visible", "false");
        return;
      }

      const mapW = this._mapW;
      const mapH = this._mapH;

      const x = ((pos.x / 100) - 0.5) * mapW;
      const y = (0.5 - (pos.y / 100)) * mapH;

      this.markerEl.setAttribute("position", `${x} ${y} ${this.Z.MARK}`);
      this.markerEl.setAttribute("visible", "true");
    },

    // =========================
    // Dropdown
    // =========================
    _toggleDropdown(kind) {
      // se abrir dropdown, fecha map
      this._setMapVisible(false);

      if (this.state.dropdown === kind) {
        this._closeDropdown();
        this._applyInteractivity();
        return;
      }

      this.state.dropdown = kind;
      this.ddGroup?.setAttribute("visible", "true");
      this._renderDropdown();
      this._applyInteractivity();
    },

    _closeDropdown() {
      this.state.dropdown = null;
      this.ddGroup?.setAttribute("visible", "false");
      this._clearEntity(this.ddList);
      this._applyInteractivity();
    },

    _calcDropdownHeight(rows) {
      const dd = this._dd;
      const r = Math.max(0, rows);

      const listH = (r * dd.rowH) + (Math.max(0, r - 1) * dd.rowGap);

      const total =
        dd.padTop +
        dd.headerH +
        dd.padBetweenTitleList +
        listH +
        dd.padBetweenListClose +
        dd.footerH +
        dd.padBottom;

      return Math.max(0.40, total);
    },

    _renderDropdown() {
      if (!this.state.dropdown) return;
      if (!this.ddGroup || !this.ddBg || !this.ddTitle || !this.ddList || !this.ddCloseBtn) return;

      const kind = this.state.dropdown;

      const list = (kind === "tour" ? this.state.tourList : this.state.sceneList) || [];
      const items = list.slice(0, this._dd.maxItems);

      const rows = Math.min(this._dd.maxRows, items.length);
      const totalH = this._calcDropdownHeight(rows);

      // BG
      this.ddBg.setAttribute("width", this._dd.ddW);
      this.ddBg.setAttribute("height", totalH);
      this.ddBg.setAttribute("position", `0 ${-totalH / 2} ${this.Z.BG}`);

      // title centralizado
      const title = kind === "tour" ? "Select Tour" : "Select Scene";
      const yTitle = -(this._dd.padTop + (this._dd.headerH / 2));
      this.ddTitle.setAttribute("text", "value", title);
      this.ddTitle.setAttribute("position", `0 ${yTitle} ${this.Z.TXT}`);

      // lista
      const yListTop = -(this._dd.padTop + this._dd.headerH + this._dd.padBetweenTitleList);
      const startY = yListTop - (this._dd.rowH / 2);

      // close embaixo + padding
      const yClose = -(totalH - this._dd.padBottom - (this._dd.footerH / 2));
      this.ddCloseBtn.setAttribute("position", `0 ${yClose} ${this.Z.BTN}`);

      // rebuild lista
      this._clearEntity(this.ddList);

      if (!rows) return;

      for (let i = 0; i < rows; i++) {
        const it = items[i];
        const y = startY - i * (this._dd.rowH + this._dd.rowGap);

        const label =
          kind === "tour"
            ? (it?.title ?? it?.id ?? "—")
            : (it?.name ?? it?.id ?? "—");

        const id = String(it?.id ?? "");

        const btn = V.makeButton({
          parent: this.ddList,
          label: V.truncateOneLine(String(label), 28),
          x: 0,
          y,
          z: this.Z.BTN,
          w: this._dd.ddW - 0.10,
          h: this._dd.rowH,
          orderPlane: this.RO.BTN,
          orderText: this.RO.TXT,
          textScale: this.data.btnTextScale,
          textZ: this.TEXT_Z_WORLD,
          radius: 0.04
        });

        // marca item atual
        const isSelected =
          (kind === "tour" && id === this.state.currentTourId) ||
          (kind === "scene" && id === this.state.currentSceneId);

        btn.setAttribute("rounded-rect", "opacity", 0.95);
        btn.setAttribute("rounded-rect", "color", isSelected ? "#0a4b7a" : "#121212");

        // marcador pra varrer depois (interatividade)
        btn.setAttribute("data-vrdditem", "1");

        this._bindClick(btn, () => {
          if (!id) return;

          if (kind === "tour") {
            this.el.emit("vrwidget:selecttour", { tourId: id }, false);
          } else {
            this.el.emit("vrwidget:selectscene", { sceneId: id, tourId: this.state.currentTourId }, false);
          }

          this._closeDropdown();
        });
      }

      // garante clickables coerentes agora
      this._applyInteractivity();
    },

    // =========================
    // Click binding (debounce + guard)
    // =========================
    _bindClick(el, fn) {
      if (!el) return;
      el.__lastClickTs = 0;

      el.addEventListener("click", (e) => {
        e?.stopPropagation?.();

        // ✅ se não é interativo / está invisível, NÃO processa
        if (!this._isInteractableNow()) return;

        const now = performance.now();
        if (now - (el.__lastClickTs || 0) < 250) return;
        el.__lastClickTs = now;

        fn?.();
      });
    }
  });
}