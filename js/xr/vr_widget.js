// js/xr/vr_widget.js
export function registerVrWidget(AFRAME) {
  if (!AFRAME) throw new Error("AFRAME não carregou.");

  AFRAME.registerComponent("vr-widget", {
    schema: {
      width: { type: "number", default: 1.25 },
      height: { type: "number", default: 0.78 },
      distance: { type: "number", default: 0.85 },
      mapHeight: { type: "number", default: 0.46 },
    },

    init() {
      this.state = {
        mapVisible: false,
        mapZoom: 1.0,
        mapSrc: "",
        marker: null,
        tourTitle: "—",
        sceneTitle: "—",
        fov: 80,
        hasMap: false
      };

      this._buildUI();

      this.el.addEventListener("vrwidget:update", (e) => {
        this._applyUpdate(e?.detail || {});
      });
    },

    _buildUI() {
      const w = this.data.width;
      const h = this.data.height;

      this.el.setAttribute("position", `0 -0.10 -${this.data.distance}`);
      this.el.setAttribute("visible", "true");

      const bg = document.createElement("a-plane");
      bg.setAttribute("width", w);
      bg.setAttribute("height", h);
      bg.setAttribute("material", "color:#000; opacity:0.78; transparent:true; shader:flat; depthTest:false; depthWrite:false");
      bg.setAttribute("position", "0 0 0");
      this.el.appendChild(bg);

      this.titleEl = this._makeText({
        value: "—",
        width: 2.2,
        align: "center",
        scale: 0.22,
        x: 0,
        y: (h / 2) - 0.08,
        z: 0.01
      });
      this.el.appendChild(this.titleEl);

      const rowY = (h / 2) - 0.19;

      this.btnTourPrev = this._makeButton({ label: "Tour ◀", x: (-w/2) + 0.20, y: rowY, w: 0.26, h: 0.10 });
      this.btnTourNext = this._makeButton({ label: "Tour ▶", x: (-w/2) + 0.20 + 0.26 + 0.02, y: rowY, w: 0.26, h: 0.10 });
      this.tourText = this._makeText({ value: "—", width: 2.2, align: "left", scale: 0.16, x: (-w/2) + 0.58, y: rowY, z: 0.012 });

      this._onClick(this.btnTourPrev, () => this._emit("vrwidget:tourstep", { delta: -1 }));
      this._onClick(this.btnTourNext, () => this._emit("vrwidget:tourstep", { delta: +1 }));

      this.el.appendChild(this.btnTourPrev);
      this.el.appendChild(this.btnTourNext);
      this.el.appendChild(this.tourText);

      const sx = (w/2) - 0.54;
      this.btnScenePrev = this._makeButton({ label: "Scene ◀", x: sx, y: rowY, w: 0.30, h: 0.10 });
      this.btnSceneNext = this._makeButton({ label: "Scene ▶", x: sx + 0.30 + 0.02, y: rowY, w: 0.30, h: 0.10 });

      this._onClick(this.btnScenePrev, () => this._emit("vrwidget:scenestep", { delta: -1 }));
      this._onClick(this.btnSceneNext, () => this._emit("vrwidget:scenestep", { delta: +1 }));

      this.el.appendChild(this.btnScenePrev);
      this.el.appendChild(this.btnSceneNext);

      const row2Y = (h / 2) - 0.32;

      this.btnPrev = this._makeButton({ label: "Prev", x: (-w/2) + 0.16, y: row2Y, w: 0.22, h: 0.10 });
      this.btnNext = this._makeButton({ label: "Next", x: (-w/2) + 0.16 + 0.22 + 0.02, y: row2Y, w: 0.22, h: 0.10 });
      this.btnMap = this._makeButton({ label: "Map", x: (-w/2) + 0.16 + 0.22 + 0.22 + 0.04, y: row2Y, w: 0.20, h: 0.10 });

      this._onClick(this.btnPrev, () => this._emit("vrwidget:prevscene", {}));
      this._onClick(this.btnNext, () => this._emit("vrwidget:nextscene", {}));
      this._onClick(this.btnMap, () => this._toggleMapVisible());

      this.el.appendChild(this.btnPrev);
      this.el.appendChild(this.btnNext);
      this.el.appendChild(this.btnMap);

      const fx = (w/2) - 0.40;
      this.btnFovMinus = this._makeButton({ label: "FOV -", x: fx, y: row2Y, w: 0.18, h: 0.10 });
      this.btnFovPlus  = this._makeButton({ label: "FOV +", x: fx + 0.18 + 0.02, y: row2Y, w: 0.18, h: 0.10 });
      this.fovText = this._makeText({ value: "FOV 80", width: 2.0, align: "left", scale: 0.15, x: fx + 0.40, y: row2Y, z: 0.012 });

      this._onClick(this.btnFovMinus, () => this._emit("vrwidget:fovdelta", { delta: -5 }));
      this._onClick(this.btnFovPlus,  () => this._emit("vrwidget:fovdelta", { delta: +5 }));

      this.el.appendChild(this.btnFovMinus);
      this.el.appendChild(this.btnFovPlus);
      this.el.appendChild(this.fovText);

      // MAP
      const mapYTop = row2Y - 0.10;
      const mapH = this.data.mapHeight;
      const mapW = w - 0.10;

      this.mapGroup = document.createElement("a-entity");
      this.mapGroup.setAttribute("position", `0 ${mapYTop - mapH/2 - 0.02} 0.01`);
      this.el.appendChild(this.mapGroup);

      this.mapPlane = document.createElement("a-plane");
      this.mapPlane.setAttribute("width", mapW);
      this.mapPlane.setAttribute("height", mapH);
      this.mapPlane.setAttribute("material", "color:#111; opacity:0.95; transparent:true; shader:flat; depthTest:false; depthWrite:false");
      this.mapPlane.setAttribute("position", "0 0 0");
      this.mapGroup.appendChild(this.mapPlane);

      this.markerEl = document.createElement("a-circle");
      this.markerEl.setAttribute("radius", 0.018);
      this.markerEl.setAttribute("material", "color:#ff3b30; shader:flat; depthTest:false; depthWrite:false");
      this.markerEl.setAttribute("position", `0 0 0.01`);
      this.mapGroup.appendChild(this.markerEl);

      const zy = -(mapH/2) - 0.09;
      this.btnZoomOut = this._makeButton({ label: "Zoom -", x: -0.18, y: zy, w: 0.22, h: 0.10, z: 0.02, parent: this.mapGroup });
      this.btnZoomIn  = this._makeButton({ label: "Zoom +", x: +0.06, y: zy, w: 0.22, h: 0.10, z: 0.02, parent: this.mapGroup });
      this.btnZoomReset = this._makeButton({ label: "Reset", x: +0.30, y: zy, w: 0.18, h: 0.10, z: 0.02, parent: this.mapGroup });

      this._onClick(this.btnZoomOut, () => this._setMapZoom(this.state.mapZoom / 1.15));
      this._onClick(this.btnZoomIn,  () => this._setMapZoom(this.state.mapZoom * 1.15));
      this._onClick(this.btnZoomReset, () => this._setMapZoom(1.0));

      this._setMapVisible(false);
      this._applyMarker(null);
    },

    _applyUpdate(d) {
      if (d.tourTitle != null) this.state.tourTitle = String(d.tourTitle);
      if (d.sceneTitle != null) this.state.sceneTitle = String(d.sceneTitle);
      if (d.fov != null) this.state.fov = Math.round(Number(d.fov) || 80);
      if (d.hasMap != null) this.state.hasMap = !!d.hasMap;
      if (d.mapSrc != null) this.state.mapSrc = String(d.mapSrc || "");
      if (d.marker != null) this.state.marker = d.marker;

      if (this.titleEl) this.titleEl.setAttribute("text", "value", this.state.sceneTitle);
      if (this.tourText) this.tourText.setAttribute("text", "value", `Tour: ${this.state.tourTitle}`);
      if (this.fovText) this.fovText.setAttribute("text", "value", `FOV ${this.state.fov}`);

      if (this.btnMap) {
        this.btnMap.setAttribute("material", "color", this.state.hasMap ? "#111" : "#330");
      }

      if (this.mapPlane && this.state.mapSrc) {
        this.mapPlane.setAttribute("material", `src:${this.state.mapSrc}; shader:flat; transparent:true; opacity:1.0; depthTest:false; depthWrite:false`);
      }

      this._applyMarker(this.state.hasMap ? this.state.marker : null);
      if (!this.state.hasMap) this._setMapVisible(false);
    },

    _toggleMapVisible() {
      if (!this.state.hasMap) return;
      this._setMapVisible(!this.state.mapVisible);
    },

    _setMapVisible(v) {
      this.state.mapVisible = !!v;
      if (this.mapGroup) this.mapGroup.setAttribute("visible", this.state.mapVisible ? "true" : "false");
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

      this.markerEl.setAttribute("position", `${x} ${y} 0.02`);
      this.markerEl.setAttribute("visible", "true");
    },

    _emit(name, detail) {
      this.el.emit(name, detail || {}, false);
    },

    _makeText({ value, width, align, scale, x, y, z }) {
      const t = document.createElement("a-entity");
      t.setAttribute("text", [
        `value:${escapeText(value)}`,
        "color:#fff",
        `align:${align || "left"}`,
        "baseline:center",
        "anchor:center",
        `width:${width || 2.0}`
      ].join(";"));
      t.setAttribute("position", `${x || 0} ${y || 0} ${z || 0.01}`);
      t.setAttribute("scale", `${scale || 0.14} ${scale || 0.14} ${scale || 0.14}`);
      return t;
    },

    _makeButton({ label, x, y, w, h, z = 0.01, parent = null }) {
      const btn = document.createElement("a-plane");
      btn.classList.add("clickable");
      btn.setAttribute("width", w);
      btn.setAttribute("height", h);
      btn.setAttribute("position", `${x} ${y} ${z}`);
      btn.setAttribute("material", "color:#111; opacity:0.95; transparent:true; shader:flat; depthTest:false; depthWrite:false");

      const txt = document.createElement("a-entity");
      txt.setAttribute("text", [
        `value:${escapeText(label)}`,
        "color:#fff",
        "align:center",
        "baseline:center",
        "anchor:center",
        "width:1.6"
      ].join(";"));
      txt.setAttribute("position", "0 0 0.01");
      txt.setAttribute("scale", "0.14 0.14 0.14");
      btn.appendChild(txt);

      // ✅ highlight funciona mesmo se o ray acertar o texto
      const hi = () => btn.setAttribute("material", "color", "#2a2a2a");
      const lo = () => btn.setAttribute("material", "color", "#111");

      btn.addEventListener("raycaster-intersected", hi);
      btn.addEventListener("raycaster-intersected-cleared", lo);
      txt.addEventListener("raycaster-intersected", hi);
      txt.addEventListener("raycaster-intersected-cleared", lo);

      (parent || this.el).appendChild(btn);
      return btn;
    },

    _onClick(btn, fn) {
      if (!btn) return;

      const handler = (e) => {
        e?.stopPropagation?.();
        fn?.();
      };

      // ✅ click no botão
      btn.addEventListener("click", handler);

      // ✅ click no texto/filhos também executa
      btn.querySelectorAll("*").forEach(ch => {
        ch.addEventListener("click", handler);
      });
    }
  });

  function escapeText(s) {
    return String(s || "").replace(/;/g, ",").replace(/\n/g, " ");
  }
}
