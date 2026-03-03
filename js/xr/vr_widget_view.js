// js/xr/vr_widget_view.js
export function ensureVrWidgetView(AFRAME) {
  if (!AFRAME) throw new Error("AFRAME não carregou.");

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
          if (n === "text" || n === "material" || n === "geometry") this._apply();
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
            m.opacity = d.opacity;

            m.toneMapped = d.toneMapped;

            if (force && m.color) {
              try { m.color.set(force); } catch {}
            }

            if (m.alphaTest != null) m.alphaTest = 0.01;

            m.needsUpdate = true;
          }
        });
      }
    });
  }

  const THREE = AFRAME.THREE;

  function escapeText(s) {
    return String(s || "").replace(/;/g, ",").replace(/\n/g, " ");
  }

  function truncateOneLine(s, max) {
    const str = String(s || "");
    if (str.length <= max) return str;
    return str.slice(0, Math.max(0, max - 1)) + "…";
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

  function clampNum(v, a, b) {
    const n = Number(v);
    if (!Number.isFinite(n)) return a;
    return Math.max(a, Math.min(b, n));
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

  function makePlane({ parent, w, h, x, y, z, color, opacity, order }) {
    const p = document.createElement("a-plane");
    p.setAttribute("width", w);
    p.setAttribute("height", h);
    p.setAttribute("position", `${x} ${y} ${z}`);
    p.setAttribute(
      "material",
      `color:${color}; opacity:${opacity}; transparent:true; shader:flat; depthTest:false; depthWrite:false; side:double`
    );
    p.setAttribute(
      "vr-ui-fix",
      `order:${order}; toneMapped:false; depthTest:false; depthWrite:false; transparent:true; opacity:${opacity}; applyDescendants:false`
    );
    parent.appendChild(p);
    return p;
  }

  // ✅ agora dá pra escolher anchor/baseline
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
    textZ
  }) {
    const planeOrder = Number(orderPlane) || 1000;
    let txtOrder = Number(orderText) || (planeOrder + 50);
    if (txtOrder <= planeOrder) txtOrder = planeOrder + 50;

    const btn = document.createElement("a-plane");
    btn.classList.add("clickable");
    btn.setAttribute("width", w);
    btn.setAttribute("height", h);
    btn.setAttribute("position", `${x} ${y} ${z}`);
    btn.setAttribute(
      "material",
      "color:#111; opacity:0.95; transparent:true; shader:flat; depthTest:false; depthWrite:false; side:double"
    );
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

    const hi = () => btn.setAttribute("material", "color", "#2a2a2a");
    const lo = () => btn.setAttribute("material", "color", "#111");
    btn.addEventListener("raycaster-intersected", hi);
    btn.addEventListener("raycaster-intersected-cleared", lo);

    return btn;
  }

  return { makePlane, makeText, makeButton, layoutRow, truncateOneLine };
}
