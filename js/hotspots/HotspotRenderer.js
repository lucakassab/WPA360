// js/hotspots/HotspotRenderer.js

const DEFAULT_STYLE = {
  // Ring (fallback quando não tem PNG)
  ringRadius: 0.12,
  ringThickness: 0.02,
  ringColor: "#ffffff",
  ringOpacity: 0.95,

  ringOutlineEnabled: true,
  ringOutlineColor: "#000000",
  ringOutlineThickness: 0.012,
  ringOutlineOpacity: 0.85,

  // Label (SEM PLACA)
  labelYOffset: -0.20,

  // Text
  textColor: "#ffffff",
  textSize: 0.12,
  textOpacity: 1.0,
  textSizeStep: 1, // inteiro (1..10)

  // Text outline (8 offsets)
  textOutlineEnabled: true,
  textOutlineColor: "#000000",
  textOutlineWidth: 0.11,   // “força” (offset é clampado)
  textOutlineOpacity: 0.80,

  // ✅ PNG custom do hotspot (defaults por cena via hotspotStyle)
  // hotspot_png: "./assets/ui/hotspot.png"
  // hotspot_png_size: "0.35,0.35"

  // Extra
  depthOnTop: true,
  hoverScale: 1.10,

  // Hitbox (não muda)
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
    // merge base + defaults da cena + style por hotspot (compat)
    const style = { ...DEFAULT_STYLE, ...(sceneStyle || {}), ...(hs?.style || {}) };

    const root = document.createElement("a-entity");
    root.setAttribute("position", `${position.x} ${position.y} ${position.z}`);
    root.setAttribute("face-camera", "");
    if (style.depthOnTop) root.setAttribute("render-on-top", "");

    // === HITBOX (raycaster acerta isso) ===
    // NÃO ALTERAR: interação depende disso
    const hit = document.createElement("a-sphere");
    hit.classList.add("clickable");
    hit.setAttribute("radius", clampNum(style.hitRadius, 0.10, 0.50));
    hit.setAttribute("material", "color:#fff; opacity:0; transparent:true; depthTest:false; depthWrite:false");
    hit.setAttribute("position", "0 0 0.01");
    if (style.depthOnTop) hit.setAttribute("render-on-top", "");
    root.appendChild(hit);

    // === VISUAL DO HOTSPOT (PNG ou círculo) ===
    // Hierarquia:
    // 1) hs.override_hotspot_png / hs.override_hotspot_png_size
    // 2) hs.style.hotspot_png / hs.style.hotspot_png_size (compat)
    // 3) sceneStyle.hotspot_png / sceneStyle.hotspot_png_size (defaults por cena)
    const pngPath = resolveHotspotPng(hs, style);
    const pngSize = resolveHotspotPngSize(hs, style);

    if (pngPath) {
      const { w, h } = parsePngSize(pngSize, style.ringRadius);

      const sprite = document.createElement("a-plane");
      sprite.setAttribute("width", w);
      sprite.setAttribute("height", h);

      // shader flat pra não depender de luz
      // alphaTest ajuda em PNG com borda semi-transparente
      sprite.setAttribute(
        "material",
        `src:${pngPath}; transparent:true; opacity:${clampNum(style.ringOpacity, 0, 1)}; shader:flat; alphaTest:0.01; depthTest:false; depthWrite:false`
      );

      sprite.setAttribute("position", "0 0 0.002");
      if (style.depthOnTop) sprite.setAttribute("render-on-top", "");
      root.appendChild(sprite);
    } else {
      // Fallback: círculo (ring + outline)
      const ringGroup = document.createElement("a-entity");
      if (style.depthOnTop) ringGroup.setAttribute("render-on-top", "");
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
          `color:${style.ringOutlineColor}; opacity:${style.ringOutlineOpacity}; transparent:true; depthTest:false; depthWrite:false`
        );
        outline.setAttribute("position", "0 0 0.001");
        if (style.depthOnTop) outline.setAttribute("render-on-top", "");
        ringGroup.appendChild(outline);
      }

      const ring = document.createElement("a-ring");
      ring.setAttribute("radius-inner", Math.max(0.001, style.ringRadius - style.ringThickness));
      ring.setAttribute("radius-outer", style.ringRadius);
      ring.setAttribute(
        "material",
        `color:${style.ringColor}; opacity:${style.ringOpacity}; transparent:true; depthTest:false; depthWrite:false`
      );
      ring.setAttribute("position", "0 0 0.002");
      if (style.depthOnTop) ring.setAttribute("render-on-top", "");
      ringGroup.appendChild(ring);
    }

    // === TEXTO + OUTLINE (SEM PLACA) ===
    const label = (hs?.label ?? "").toString().trim();
    if (label) {
      const labelGroup = document.createElement("a-entity");
      labelGroup.setAttribute("position", `0 ${Number(style.labelYOffset || -0.2)} 0.002`);
      if (style.depthOnTop) labelGroup.setAttribute("render-on-top", "");
      root.appendChild(labelGroup);

      const stepInt = clampInt(style.textSizeStep, 1, 10);
      const textSizeBase = clampNum(style.textSize, 0.04, 0.40);
      const textSizeFinal = clampNum(textSizeBase * stepInt, 0.04, 1.20);

      const textWidthUnscaled = estimateTextWidthUnscaled(label);

      // OUTLINE (offset clampado)
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
        }, style.depthOnTop);
      }

      // TEXTO principal (único)
      const text = document.createElement("a-entity");
      text.setAttribute("text", [
        `value:${escapeText(label)}`,
        `align:center`,
        `baseline:center`,
        `anchor:center`,
        `width:${textWidthUnscaled}`,
        `color:${style.textColor}`,
        `opacity:${clampNum(style.textOpacity, 0, 1)}`
      ].join(";"));

      text.setAttribute("position", "0 0 0.012");
      text.setAttribute("scale", `${textSizeFinal} ${textSizeFinal} ${textSizeFinal}`);
      if (style.depthOnTop) text.setAttribute("render-on-top", "");
      labelGroup.appendChild(text);
    }

    // === Interação no HITBOX (inalterado) ===
    const hoverScale = clampNum(style.hoverScale, 1.0, 1.5);

    hit.addEventListener("mouseenter", () => {
      if (!this.canHover() || this.isVR()) return;
      root.object3D.scale.set(hoverScale, hoverScale, hoverScale);
      if (hs?.label) this.showTooltip(hs.label);
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

/* ===== PNG resolution (hierarquia) ===== */

function resolveHotspotPng(hs, style) {
  // prioridade: override_hotspot_png -> hs.style.hotspot_png -> style.hotspot_png (scene default)
  const o = (hs?.override_hotspot_png ?? "").toString().trim();
  if (o) return o;

  const compat = (hs?.style?.hotspot_png ?? "").toString().trim();
  if (compat) return compat;

  const def = (style?.hotspot_png ?? "").toString().trim();
  return def || "";
}

function resolveHotspotPngSize(hs, style) {
  // prioridade: override_hotspot_png_size -> hs.style.hotspot_png_size -> style.hotspot_png_size
  const o = hs?.override_hotspot_png_size;
  if (o != null && String(o).trim() !== "") return o;

  const compat = hs?.style?.hotspot_png_size;
  if (compat != null && String(compat).trim() !== "") return compat;

  const def = style?.hotspot_png_size;
  return def ?? "";
}

/* ===== Outline por offsets (8 direções) ===== */

function makeTextOutline8(parent, label, { width, size, color, opacity, offset }, onTop) {
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
      `align:center`,
      `baseline:center`,
      `anchor:center`,
      `width:${width}`,
      `color:${color}`,
      `opacity:${opacity}`
    ].join(";"));

    t.setAttribute("scale", `${size} ${size} ${size}`);
    t.setAttribute("position", `${dx * o} ${dy * o} 0.010`);
    if (onTop) t.setAttribute("render-on-top", "");
    parent.appendChild(t);
  }
}

/* ===== Estimativa estável do width “unscaled” ===== */

function estimateTextWidthUnscaled(text) {
  const len = String(text || "").length;
  const w = len * 0.60 + 0.8;
  return clampNum(w, 1.6, 18.0);
}

/* ===== PNG size parser ===== */

function parsePngSize(sizeStr, ringRadius) {
  // default: baseado no círculo (diâmetro)
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

  return {
    w: clampNum(w, 0.05, 3.0),
    h: clampNum(h, 0.05, 3.0)
  };
}

/* ===== Utils ===== */

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