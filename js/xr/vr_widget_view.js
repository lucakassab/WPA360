// js/xr/vr_widget_view.js
export function ensureVrWidgetView(AFRAME) {
  if (!AFRAME) throw new Error("AFRAME não carregou.");

  // =========================
  // vr-ui-fix
  // =========================
  if (!AFRAME.components["vr-ui-fix"]) {
    AFRAME.registerComponent("vr-ui-fix", {
      schema: {
        order: { type: "int", default: 1100 },
        toneMapped: { type: "boolean", default: false },
        depthTest: { type: "boolean", default: false },
        depthWrite: { type: "boolean", default: false },
        transparent: { type: "boolean", default: true },
        opacity: { type: "number", default: 1.0 },
        forceColor: { type: "string", default: "" },
        applyDescendants: { type: "boolean", default: false }
      },

      init() {
        this._apply = this._apply.bind(this);

        this.el.addEventListener("object3dset", this._apply);
        this.el.addEventListener("loaded", this._apply);

        this.el.addEventListener("componentchanged", (e) => {
          const n = e?.detail?.name;
          if (n === "text" || n === "material" || n === "geometry" || n === "rounded-rect") this._apply();
        });

        let n = 0;
        const tick = () => {
          this._apply();
          n++;
          if (n < 8) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },

      update() { this._apply(); },

      _apply() {
        const obj = this.el.object3D;
        if (!obj) return;

        const d = this.data;
        const force = (d.forceColor || "").trim();

        obj.traverse((child) => {
          if (!child || !child.isMesh) return;

          const sameEl = child.el === this.el;
          if (!d.applyDescendants && !sameEl) return;

          child.renderOrder = d.order;

          const mats = Array.isArray(child.material) ? child.material : [child.material];
          for (const m of mats) {
            if (!m) continue;

            m.depthTest = d.depthTest;
            m.depthWrite = d.depthWrite;
            m.transparent = d.transparent;

            if (!child.userData?.__vrui_keepOpacity) m.opacity = d.opacity;
            if (force && m.color && !child.userData?.__vrui_keepColor) {
              try { m.color.set(force); } catch {}
            }

            m.toneMapped = d.toneMapped;
            if (m.alphaTest != null) m.alphaTest = 0.01;
            m.needsUpdate = true;
          }
        });
      }
    });
  }

  const THREE = AFRAME.THREE;

  // =========================
  // texture cache
  // =========================
  const _texCache = new Map(); // url -> THREE.Texture

  function resolveUrl(src) {
    try { return new URL(src, window.location.href).toString(); }
    catch { return String(src || ""); }
  }

  function loadTexture(url) {
    if (_texCache.has(url)) return Promise.resolve(_texCache.get(url));

    const loader = new THREE.TextureLoader();
    return new Promise((resolve, reject) => {
      loader.load(
        url,
        (tex) => {
          // qualidade decente pra UI
          tex.wrapS = THREE.ClampToEdgeWrapping;
          tex.wrapT = THREE.ClampToEdgeWrapping;
          tex.generateMipmaps = true;
          tex.minFilter = THREE.LinearMipmapLinearFilter;
          tex.magFilter = THREE.LinearFilter;

          // anisotropy (se der)
          try {
            const maxA = AFRAME?.scenes?.[0]?.renderer?.capabilities?.getMaxAnisotropy?.() ?? 8;
            tex.anisotropy = Math.min(8, maxA || 8);
          } catch {}

          _texCache.set(url, tex);
          resolve(tex);
        },
        undefined,
        reject
      );
    });
  }

  // =========================
  // rounded-rect (com textura + UV normalizado)
  // =========================
  if (!AFRAME.components["rounded-rect"]) {
    AFRAME.registerComponent("rounded-rect", {
      schema: {
        width: { type: "number", default: 1 },
        height: { type: "number", default: 0.5 },
        radius: { type: "number", default: 0.04 },

        color: { type: "string", default: "#111" },
        opacity: { type: "number", default: 0.95 },

        src: { type: "string", default: "" },

        borderEnabled: { type: "boolean", default: true },
        borderOpacity: { type: "number", default: 0.12 },
        borderPad: { type: "number", default: 0.008 },

        depthTest: { type: "boolean", default: false },
        depthWrite: { type: "boolean", default: false }
      },

      init() {
        this._group = new THREE.Group();
        this.el.setObject3D("mesh", this._group);
        this._group.el = this.el;

        this._mainMesh = null;
        this._borderMesh = null;

        this._currentTexUrl = "";
        this._texInfo = { width: 0, height: 0 };

        this._build(true);
        this._applyMaterialProps();
        this._applyTexture();
      },

      update(oldData) {
        const d = this.data;
        const changedGeom =
          !oldData ||
          d.width !== oldData.width ||
          d.height !== oldData.height ||
          d.radius !== oldData.radius ||
          d.borderEnabled !== oldData.borderEnabled ||
          d.borderPad !== oldData.borderPad;

        if (changedGeom) this._build(true);

        this._applyMaterialProps();

        const srcChanged = !oldData || String(d.src || "") !== String(oldData.src || "");
        if (srcChanged) this._applyTexture();
      },

      remove() {
        this._disposeMesh(this._mainMesh);
        this._disposeMesh(this._borderMesh);
        this._mainMesh = null;
        this._borderMesh = null;

        try { this.el.removeObject3D("mesh"); } catch {}
        this._group = null;
      },

      _disposeMesh(m) {
        if (!m) return;
        try { m.geometry?.dispose?.(); } catch {}
        try { m.material?.dispose?.(); } catch {}
      },

      _build(rebuildGeometry) {
        const d = this.data;

        if (rebuildGeometry) {
          if (this._mainMesh) this._group.remove(this._mainMesh);
          if (this._borderMesh) this._group.remove(this._borderMesh);
          this._disposeMesh(this._mainMesh);
          this._disposeMesh(this._borderMesh);
          this._mainMesh = null;
          this._borderMesh = null;
        }

        if (!this._mainMesh) {
          const geo = makeRoundedRectGeo(d.width, d.height, d.radius);
          const mat = new THREE.MeshBasicMaterial({
            color: new THREE.Color(d.color),
            transparent: true,
            opacity: clampNum(d.opacity, 0, 1),
            side: THREE.DoubleSide,
            depthTest: !!d.depthTest,
            depthWrite: !!d.depthWrite
          });
          mat.toneMapped = false;

          const mesh = new THREE.Mesh(geo, mat);
          mesh.el = this.el;
          mesh.userData.__vrui_keepOpacity = false;
          mesh.userData.__vrui_keepColor = false;

          this._mainMesh = mesh;
          this._group.add(mesh);
        }

        if (d.borderEnabled && !this._borderMesh) {
          const bw = d.width + d.borderPad * 2;
          const bh = d.height + d.borderPad * 2;
          const br = Math.min(d.radius + d.borderPad, Math.min(bw, bh) * 0.45);

          const geoB = makeRoundedRectGeo(bw, bh, br);
          const matB = new THREE.MeshBasicMaterial({
            color: new THREE.Color("#ffffff"),
            transparent: true,
            opacity: clampNum(d.borderOpacity, 0, 1),
            side: THREE.DoubleSide,
            depthTest: !!d.depthTest,
            depthWrite: !!d.depthWrite
          });
          matB.toneMapped = false;

          const meshB = new THREE.Mesh(geoB, matB);
          meshB.position.z = -0.0006;
          meshB.el = this.el;
          meshB.userData.__vrui_keepOpacity = true;
          meshB.userData.__vrui_keepColor = true;

          this._borderMesh = meshB;
          this._group.add(meshB);
        }

        if (!d.borderEnabled && this._borderMesh) {
          this._group.remove(this._borderMesh);
          this._disposeMesh(this._borderMesh);
          this._borderMesh = null;
        }
      },

      _applyMaterialProps() {
        const d = this.data;

        if (this._mainMesh?.material) {
          const hasSrc = String(d.src || "").trim().length > 0;

          // com textura: branco (não tinge)
          this._mainMesh.material.color.set(hasSrc ? "#ffffff" : d.color);
          this._mainMesh.material.opacity = clampNum(d.opacity, 0, 1);
          this._mainMesh.material.depthTest = !!d.depthTest;
          this._mainMesh.material.depthWrite = !!d.depthWrite;
          this._mainMesh.material.transparent = true;
          this._mainMesh.material.toneMapped = false;
          this._mainMesh.material.needsUpdate = true;
        }

        if (this._borderMesh?.material) {
          this._borderMesh.material.opacity = clampNum(d.borderOpacity, 0, 1);
          this._borderMesh.material.depthTest = !!d.depthTest;
          this._borderMesh.material.depthWrite = !!d.depthWrite;
          this._borderMesh.material.transparent = true;
          this._borderMesh.material.toneMapped = false;
          this._borderMesh.material.needsUpdate = true;
        }
      },

      async _applyTexture() {
        const d = this.data;
        if (!this._mainMesh?.material) return;

        const src = String(d.src || "").trim();
        if (!src) {
          this._currentTexUrl = "";
          this._texInfo = { width: 0, height: 0 };
          this._mainMesh.material.map = null;
          this._mainMesh.material.needsUpdate = true;
          return;
        }

        const url = resolveUrl(src);
        this._currentTexUrl = url;

        try {
          const tex = await loadTexture(url);

          if (this._currentTexUrl !== url) return;

          this._mainMesh.material.map = tex;
          this._mainMesh.material.needsUpdate = true;

          const iw = tex?.image?.width || 0;
          const ih = tex?.image?.height || 0;
          this._texInfo = { width: iw, height: ih };

          // ✅ avisa o widget pra fazer fit scale
          this.el.emit("rounded-rect-texture-loaded", {
            src,
            url,
            width: iw,
            height: ih
          }, false);
        } catch (e) {
          console.warn("[rounded-rect] falha ao carregar textura:", url, e);
          if (this._currentTexUrl === url) {
            this._texInfo = { width: 0, height: 0 };
            this._mainMesh.material.map = null;
            this._mainMesh.material.needsUpdate = true;
          }
        }
      }
    });
  }

  // ✅ UV NORMALIZADO (0..1) pra textura caber certinho
  function makeRoundedRectGeo(w, h, r) {
    const hw = w / 2;
    const hh = h / 2;
    const rr = Math.max(0.0001, Math.min(r, Math.min(hw, hh) * 0.49));

    const shape = new THREE.Shape();
    shape.moveTo(-hw + rr, -hh);
    shape.lineTo(hw - rr, -hh);
    shape.quadraticCurveTo(hw, -hh, hw, -hh + rr);
    shape.lineTo(hw, hh - rr);
    shape.quadraticCurveTo(hw, hh, hw - rr, hh);
    shape.lineTo(-hw + rr, hh);
    shape.quadraticCurveTo(-hw, hh, -hw, hh - rr);
    shape.lineTo(-hw, -hh + rr);
    shape.quadraticCurveTo(-hw, -hh, -hw + rr, -hh);

    const geo = new THREE.ShapeGeometry(shape, 8);
    geo.computeBoundingBox();

    const bb = geo.boundingBox;
    const sizeX = (bb.max.x - bb.min.x) || 1;
    const sizeY = (bb.max.y - bb.min.y) || 1;

    const pos = geo.attributes.position;
    const uvs = new Float32Array(pos.count * 2);

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const u = (x - bb.min.x) / sizeX;
      const v = (y - bb.min.y) / sizeY;
      uvs[i * 2 + 0] = u;
      uvs[i * 2 + 1] = v;
    }

    geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    geo.computeVertexNormals();
    return geo;
  }

  function escapeText(s) {
    return String(s || "").replace(/;/g, ",").replace(/\n/g, " ");
  }

  function truncateOneLine(s, max) {
    const str = String(s || "");
    if (str.length <= max) return str;
    return str.slice(0, Math.max(0, max - 1)) + "…";
  }

  function clampNum(v, a, b) {
    const n = Number(v);
    if (!Number.isFinite(n)) return a;
    return Math.max(a, Math.min(b, n));
  }

  function layoutRow(widths, { left, right, minGap = 0.02 }) {
    const avail = Math.max(0.1, right - left);
    const n = widths.length;
    const sumW = widths.reduce((a, b) => a + b, 0);

    const need = sumW + minGap * (n - 1);
    let scale = 1.0;
    let gap = minGap;

    if (need > avail) {
      scale = avail / need;
      gap = minGap * scale;
    } else {
      const extra = avail - sumW;
      gap = (n > 1) ? (extra / (n - 1)) : 0;
      gap = Math.max(minGap, gap);
    }

    const out = [];
    let x = left;
    for (let i = 0; i < n; i++) {
      const w = widths[i] * scale;
      const cx = x + w / 2;
      out.push({ x: cx, w });
      x += w + gap;
    }

    const last = out[out.length - 1];
    const end = last.x + last.w / 2;
    const over = end - right;
    if (over > 0.0001) for (const p of out) p.x -= over;

    return out;
  }

  function setChildZWorld(parentEl, childEl, desiredWorldZ) {
    const worldZ = clampNum(desiredWorldZ, 0.001, 0.03);

    if (!parentEl?.object3D || !childEl?.object3D || !THREE) {
      childEl?.setAttribute?.("position", `0 0 ${worldZ}`);
      return;
    }

    const apply = () => {
      try {
        parentEl.object3D.updateWorldMatrix(true, false);
        const s = new THREE.Vector3(1, 1, 1);
        parentEl.object3D.getWorldScale(s);
        const localZ = worldZ / (s.z || 1);
        childEl.object3D.position.set(0, 0, localZ);
      } catch {}
    };

    apply();
    requestAnimationFrame(apply);
    requestAnimationFrame(apply);
  }

  // ✅ builders
  function makePlane({ parent, w, h, x, y, z, color, opacity, order, radius = 0.05 }) {
    const p = document.createElement("a-entity");
    p.setAttribute("position", `${x} ${y} ${z}`);

    p.setAttribute("rounded-rect", {
      width: w,
      height: h,
      radius,
      color,
      opacity,
      src: "",
      borderEnabled: true,
      borderOpacity: 0.12,
      borderPad: 0.008,
      depthTest: false,
      depthWrite: false
    });

    p.setAttribute(
      "vr-ui-fix",
      `order:${order}; toneMapped:false; depthTest:false; depthWrite:false; transparent:true; opacity:${opacity}; applyDescendants:false`
    );

    parent.appendChild(p);
    return p;
  }

  function makeText({
    parent,
    value,
    x, y, z,
    width,
    wrapCount,
    align,
    anchor,
    baseline,
    scale,
    order
  }) {
    const t = document.createElement("a-entity");
    t.setAttribute("text", [
      `value:${escapeText(value)}`,
      "color:#ffffff",
      "opacity:1",
      `align:${align || "center"}`,
      `anchor:${anchor || "center"}`,
      `baseline:${baseline || "center"}`,
      `width:${width || 2.0}`,
      `wrapCount:${wrapCount || 24}`,
      "side:double"
    ].join(";"));

    t.setAttribute("position", `${x} ${y} ${z}`);
    t.setAttribute("scale", `${scale} ${scale} ${scale}`);

    t.setAttribute(
      "vr-ui-fix",
      `order:${order}; toneMapped:false; depthTest:false; depthWrite:false; transparent:true; opacity:1; forceColor:#ffffff; applyDescendants:false`
    );

    parent.appendChild(t);
    return t;
  }

  function makeButton({
    parent,
    label,
    x, y, z,
    w, h,
    orderPlane,
    orderText,
    textScale,
    textZ,
    radius = 0.03
  }) {
    const planeOrder = Number(orderPlane) || 1000;
    let txtOrder = Number(orderText) || (planeOrder + 50);
    if (txtOrder <= planeOrder) txtOrder = planeOrder + 50;

    const btn = document.createElement("a-entity");
    btn.classList.add("clickable");
    btn.setAttribute("position", `${x} ${y} ${z}`);

    btn.__ui = {
      base: "#121212",
      hover: "#1f1f1f",
      selected: "#1f3a52",
      disabled: "#070707",
      state: "default"
    };

    btn.setAttribute("rounded-rect", {
      width: w,
      height: h,
      radius,
      color: btn.__ui.base,
      opacity: 0.95,
      src: "",
      borderEnabled: true,
      borderOpacity: 0.12,
      borderPad: 0.006,
      depthTest: false,
      depthWrite: false
    });

    btn.setAttribute(
      "vr-ui-fix",
      `order:${planeOrder}; toneMapped:false; depthTest:false; depthWrite:false; transparent:true; opacity:0.95; applyDescendants:false`
    );

    parent.appendChild(btn);

    const txt = document.createElement("a-entity");
    txt.setAttribute("text", [
      `value:${escapeText(label || "—")}`,
      "color:#ffffff",
      "opacity:1",
      "align:center",
      "anchor:center",
      "baseline:center",
      "width:2.6",
      "wrapCount:26",
      "side:double"
    ].join(";"));

    txt.setAttribute("position", "0 0 0");
    txt.setAttribute("scale", `${textScale} ${textScale} ${textScale}`);

    txt.setAttribute(
      "vr-ui-fix",
      `order:${txtOrder}; toneMapped:false; depthTest:false; depthWrite:false; transparent:true; opacity:1; forceColor:#ffffff; applyDescendants:false`
    );

    btn.appendChild(txt);
    setChildZWorld(btn, txt, Number(textZ) || 0.012);

    const applyState = () => {
      const u = btn.__ui;
      let c = u.base;
      if (u.state === "disabled") c = u.disabled;
      else if (u.state === "selected") c = u.selected;
      else if (u.state === "hover") c = u.hover;
      btn.setAttribute("rounded-rect", "color", c);
    };

    btn.__applyState = applyState;

    const hi = () => {
      const u = btn.__ui;
      if (u.state === "disabled" || u.state === "selected") return;
      u.state = "hover";
      applyState();
    };
    const lo = () => {
      const u = btn.__ui;
      if (u.state === "disabled" || u.state === "selected") return;
      u.state = "default";
      applyState();
    };

    btn.addEventListener("raycaster-intersected", hi);
    btn.addEventListener("raycaster-intersected-cleared", lo);

    btn.__setSelected = (v) => {
      const u = btn.__ui;
      if (u.state === "disabled") return;
      u.state = v ? "selected" : "default";
      applyState();
    };
    btn.__setDisabled = (v) => {
      const u = btn.__ui;
      u.state = v ? "disabled" : "default";
      applyState();
    };

    return btn;
  }

  return { makePlane, makeText, makeButton, layoutRow, truncateOneLine };
}