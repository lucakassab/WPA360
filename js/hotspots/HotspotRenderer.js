// js/hotspots/HotspotRenderer.js

const DEFAULT_STYLE = {
  ringRadius: 0.12,
  ringThickness: 0.02,
  ringColor: "#ffffff",
  ringOpacity: 0.95,

  ringOutlineEnabled: true,
  ringOutlineColor: "#000000",
  ringOutlineThickness: 0.012,
  ringOutlineOpacity: 0.85,

  labelYOffset: -0.20,

  textColor: "#ffffff",
  textSize: 0.12,
  textOpacity: 1.0,
  textSizeStep: 1,

  textOutlineEnabled: true,
  textOutlineColor: "#000000",
  textOutlineWidth: 0.11,
  textOutlineOpacity: 0.80,

  depthOnTop: true,
  hoverScale: 1.10,

  hitRadius: 0.22
};

export default class HotspotRenderer {
  constructor({ showTooltip, hideTooltip, canHover, isVR, onNavigate } = {}) {
    this.showTooltip = showTooltip || (() => {});
    this.hideTooltip = hideTooltip || (() => {});
    this.canHover = canHover || (() => false);
    this.isVR = isVR || (() => false);
    this.onNavigate = onNavigate || (() => {});
  }

  clear(containerEl) {
    if (!containerEl) return;
    while (containerEl.firstChild) containerEl.removeChild(containerEl.firstChild);
  }

  createHotspot({ hs, sceneStyle, position }) {
    const style = { ...DEFAULT_STYLE, ...(sceneStyle || {}), ...(hs?.style || {}) };
    const inVR = !!this.isVR();

    // ✅ No VR: renderOrder alto + depthTest true (VR-safe)
    // Fora VR: seu comportamento antigo (depthTest false) continua ok.
    const ROT_TOP = inVR
      ? "order: 50; depthTest: true; depthWrite: false"
      : "order: 999; depthTest: false; depthWrite: false";

    const root = document.createElement("a-entity");
    root.setAttribute("position", `${position.x} ${position.y} ${position.z}`);
    root.setAttribute("face-camera", "");

    if (style.depthOnTop) root.setAttribute("render-on-top", ROT_TOP);

    // HITBOX
    const hit = document.createElement("a-sphere");
    hit.classList.add("clickable");
    hit.setAttribute("radius", clampNum(style.hitRadius, 0.10, 0.50));
    hit.setAttribute("material", "color:#fff; opacity:0; transparent:true; depthTest:false; depthWrite:false");
    hit.setAttribute("position", "0 0 0.01");
    if (style.depthOnTop) hit.setAttribute("render-on-top", ROT_TOP);
    root.appendChild(hit);

    // VISUAL
    const pngPath = resolveHotspotPng(hs, style);
    const pngSize = resolveHotspotPngSize(hs, style);

    if (pngPath) {
      const { w, h } = parsePngSize(pngSize, style.ringRadius);

      const sprite = document.createElement("a-plane");
      sprite.setAttribute("width", w);
      sprite.setAttribute("height", h);

      // ✅ side:double evita sumir se o billboard der backface em VR
      sprite.setAttribute(
        "material",
        [
          `src:${pngPath}`,
          "transparent:true",
          `opacity:${clampNum(style.ringOpacity, 0, 1)}`,
          "shader:flat",
          "alphaTest:0.01",
          `depthTest:${inVR ? "true" : "false"}`,
          "depthWrite:false",
          "side:double"
        ].join(";")
      );

      sprite.setAttribute("position", "0 0 0.002");
      if (style.depthOnTop) sprite.setAttribute("render-on-top", ROT_TOP);
      root.appendChild(sprite);
    } else {
      const ringGroup = document.createElement("a-entity");
      if (style.depthOnTop) ringGroup.setAttribute("render-on-top", ROT_TOP);
      root.appendChild(ringGroup);

      if (style.ringOutlineEnabled) {
        const outline = document.createElement("a-ring");
        const grow = Math.max(0.0001, Number(style.ringOutlineThickness) || 0.0);
        const inner = Math.max(0.001, (style.ringRadius - style.ringThickness) - grow);
        const outer = style.ringRadius + grow;

        outline.setAttribute("radius-inner", inner);
        outline.setAttribute("radius-outer", outer);
        outline.setAttribute(
          "material",
          [
            `color:${style.ringOutlineColor}`,
            `opacity:${style.ringOutlineOpacity}`,
            "transparent:true",
            "shader:flat",
            `depthTest:${inVR ? "true" : "false"}`,
            "depthWrite:false",
            "side:double"
          ].join(";")
        );
        outline.setAttribute("position", "0 0 0.001");
        if (style.depthOnTop) outline.setAttribute("render-on-top", ROT_TOP);
        ringGroup.appendChild(outline);
      }

      const ring = document.createElement("a-ring");
      ring.setAttribute("radius-inner", Math.max(0.001, style.ringRadius - style.ringThickness));
      ring.setAttribute("radius-outer", style.ringRadius);
      ring.setAttribute(
        "material",
        [
          `color:${style.ringColor}`,
          `opacity:${style.ringOpacity}`,
          "transparent:true",
          "shader:flat",
          `depthTest:${inVR ? "true" : "false"}`,
          "depthWrite:false",
          "side:double"
        ].join(";")
      );
      ring.setAttribute("position", "0 0 0.002");
      if (style.depthOnTop) ring.setAttribute("render-on-top", ROT_TOP);
      ringGroup.appendChild(ring);
    }

    // LABEL: hidelabel + labelposoffset
    const label = (hs?.label ?? "").toString().trim();
    const hideLabel = truthy(hs?.hidelabel);
    const posOff = parseXY(hs?.labelposoffset);

    if (label && !hideLabel) {
      const labelGroup = document.createElement("a-entity");

      const baseY = Number(style.labelYOffset || -0.2);
      const offX = posOff ? posOff.x : 0;
      const offY = posOff ? posOff.y : 0;

      labelGroup.setAttribute("position", `${offX} ${baseY + offY} 0.002`);
      if (style.depthOnTop) labelGroup.setAttribute("render-on-top", ROT_TOP);
      root.appendChild(labelGroup);

      const stepInt = clampInt(style.textSizeStep, 1, 10);
      const textSizeBase = clampNum(style.textSize, 0.04, 0.40);
      const textSizeFinal = clampNum(textSizeBase * stepInt, 0.04, 1.20);

      const textWidthUnscaled = estimateTextWidthUnscaled(label);

      if (style.textOutlineEnabled && (Number(style.textOutlineOpacity) || 0) > 0) {
        const strength = clampNum(style.textOutlineWidth, 0.0, 1.0);
        const offsetRaw = strength * textSizeFinal;
        const outlineOffset = clampNum(offsetRaw, 0.001, 0.006);

        makeTextOutline8(labelGroup, label, {
          width: textWidthUnscaled,
          size: textSizeFinal,
          color: style.textOutlineColor,
          opacity: clampNum(style.textOutlineOpacity, 0, 1),
          offset: outlineOffset
        }, style.depthOnTop ? ROT_TOP : null);
      }

      const text = document.createElement("a-entity");
      text.setAttribute("text", [
        `value:${escapeText(label)}`,
        "align:center",
        "baseline:center",
        "anchor:center",
        `width:${textWidthUnscaled}`,
        `color:${style.textColor}`,
        `opacity:${clampNum(style.textOpacity, 0, 1)}`
      ].join(";"));

      // bem colado no plano
      text.setAttribute("position", "0 0 0.006");
      text.setAttribute("scale", `${textSizeFinal} ${textSizeFinal} ${textSizeFinal}`);
      if (style.depthOnTop) text.setAttribute("render-on-top", ROT_TOP);
      labelGroup.appendChild(text);
    }

    // INTERAÇÃO
    const hoverScale = clampNum(style.hoverScale, 1.0, 1.5);

    hit.addEventListener("mouseenter", () => {
      if (!this.canHover() || this.isVR()) return;
      root.object3D.scale.set(hoverScale, hoverScale, hoverScale);
      if (label) this.showTooltip(label);
    });

    hit.addEventListener("mouseleave", () => {
      if (!this.canHover() || this.isVR()) return;
      root.object3D.scale.set(1, 1, 1);
      this.hideTooltip();
    });

    hit.addEventListener("click", () => {
      this.hideTooltip();
      this.onNavigate(hs);
    });

    return root;
  }
}

// ===== helpers =====

function resolveHotspotPng(hs, style) {
  const o = (hs?.override_hotspot_png ?? "").toString().trim();
  if (o) return o;

  const compat = (hs?.style?.hotspot_png ?? "").toString().trim();
  if (compat) return compat;

  const def = (style?.hotspot_png ?? "").toString().trim();
  return def || "";
}

function resolveHotspotPngSize(hs, style) {
  const o = hs?.override_hotspot_png_size;
  if (o != null && String(o).trim() !== "") return o;

  const compat = hs?.style?.hotspot_png_size;
  if (compat != null && String(compat).trim() !== "") return compat;

  const def = style?.hotspot_png_size;
  return def ?? "";
}

function makeTextOutline8(parent, label, { width, size, color, opacity, offset }, renderOnTopAttr) {
  const dirs = [
    [-1,  0], [ 1,  0],
    [ 0, -1], [ 0,  1],
    [-1, -1], [ 1, -1],
    [-1,  1], [ 1,  1]
  ];

  const o = Math.max(0.0005, offset);

  for (const [dx, dy] of dirs) {
    const t = document.createElement("a-entity");
    t.setAttribute("text", [
      `value:${escapeText(label)}`,
      "align:center",
      "baseline:center",
      "anchor:center",
      `width:${width}`,
      `color:${color}`,
      `opacity:${opacity}`
    ].join(";"));

    t.setAttribute("scale", `${size} ${size} ${size}`);
    t.setAttribute("position", `${dx * o} ${dy * o} 0.004`);
    if (renderOnTopAttr) t.setAttribute("render-on-top", renderOnTopAttr);
    parent.appendChild(t);
  }
}

function estimateTextWidthUnscaled(text) {
  const len = String(text || "").length;
  const w = len * 0.60 + 0.8;
  return clampNum(w, 1.6, 18.0);
}

function parsePngSize(sizeStr, ringRadius) {
  const d = clampNum((Number(ringRadius) || 0.12) * 2.0, 0.12, 2.0);
  let w = d;
  let h = d;

  if (typeof sizeStr === "string" && sizeStr.trim()) {
    const parts = sizeStr.split(",").map(s => Number(String(s).trim()));
    if (Number.isFinite(parts[0])) w = parts[0];
    if (Number.isFinite(parts[1])) h = parts[1];
  } else if (Array.isArray(sizeStr)) {
    if (Number.isFinite(sizeStr[0])) w = Number(sizeStr[0]);
    if (Number.isFinite(sizeStr[1])) h = Number(sizeStr[1]);
  } else if (sizeStr && typeof sizeStr === "object") {
    if (Number.isFinite(sizeStr.x)) w = Number(sizeStr.x);
    if (Number.isFinite(sizeStr.y)) h = Number(sizeStr.y);
  }

  return { w: clampNum(w, 0.05, 3.0), h: clampNum(h, 0.05, 3.0) };
}

function clampNum(v, a, b) {
  const n = Number(v);
  if (!Number.isFinite(n)) return a;
  return Math.max(a, Math.min(b, n));
}

function clampInt(v, a, b) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return a;
  return Math.max(a, Math.min(b, n));
}

function escapeText(s) {
  return String(s).replace(/;/g, ",").replace(/\n/g, " ");
}

function truthy(v) {
  if (v === true) return true;
  if (typeof v === "number") return v !== 0;
  const s = String(v ?? "").trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "on";
}

function parseXY(v) {
  if (v == null) return null;

  let x, y;

  if (typeof v === "string") {
    const parts = v.split(",").map(s => Number(String(s).trim()));
    x = parts[0];
    y = parts[1];
  } else if (Array.isArray(v)) {
    x = Number(v[0]);
    y = Number(v[1]);
  } else if (typeof v === "object") {
    x = Number(v.x);
    y = Number(v.y);
  }

  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  x = clampNum(x, -2.0, 2.0);
  y = clampNum(y, -2.0, 2.0);

  return { x, y };
}