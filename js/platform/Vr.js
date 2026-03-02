// js/platform/vr.js

export default class VR {
  constructor(app) {
    this.app = app;
    this._unsubs = [];
    this._session = null;
    this._running = false;

    // inputSource -> { pressed: boolean[] , pinch: bool }
    this._srcState = new Map();

    this._lastDebugToggleMs = 0;
    this._lastSwapMs = 0;
  }

  init(app) {
    this.app = app;

    this._cleanupHandVisuals(this.app.leftHandEl);
    this._cleanupHandVisuals(this.app.rightHandEl);

    this.app.cameraEl.setAttribute("look-controls", {
      enabled: true,
      mouseEnabled: false,
      touchEnabled: false,
      pointerLockEnabled: false,
      magicWindowTrackingEnabled: false,
    });

    this.app.cursorEl.setAttribute("visible", "false");

    this.app.leftHandEl.setAttribute("visible", "true");
    this.app.rightHandEl.setAttribute("visible", "true");

    this.app.leftHandEl.setAttribute("laser-controls", "hand: left");
    this.app.rightHandEl.setAttribute("laser-controls", "hand: right");

    this.app.leftHandEl.setAttribute("raycaster", "objects: .clickable; far: 10000");
    this.app.rightHandEl.setAttribute("raycaster", "objects: .clickable; far: 10000");

    this.app.leftHandEl.setAttribute("line", "opacity: 0.7");
    this.app.rightHandEl.setAttribute("line", "opacity: 0.7");

    this._applyVrQuality();
    this._forceDisableFoveationSoon();

    const cfg = this.app?.vrConfig || {};
    if (cfg.logInputs) this._installInputLogging();

    // ✅ novos mapeamentos só quando vr_debug=true
    if (cfg.debugConsole) {
      this._installThumbstickMappings();
    }
  }

  // =====================================================
  // 🧽 REMOVE ESFERAS / GEOMETRY BUGADA
  // =====================================================

  _cleanupHandVisuals(handEl) {
    if (!handEl) return;

    try { handEl.removeAttribute("geometry"); } catch {}
    try { handEl.removeAttribute("material"); } catch {}

    try { handEl.querySelectorAll("a-sphere").forEach(n => n.remove()); } catch {}

    try {
      handEl.querySelectorAll("[geometry]").forEach(n => {
        const g = (n.getAttribute("geometry") || "").toString();
        if (g.includes("sphere")) n.remove();
      });
    } catch {}
  }

  // =====================================================
  // 🔥 QUALIDADE / FFR OFF
  // =====================================================

  _applyVrQuality() {
    const renderer = this.app.sceneEl?.renderer;
    if (!renderer?.xr) return;

    const cfg = this.app?.vrConfig || {};
    const fbScale = clamp(Number(cfg.framebufferScale ?? 1.7), 0.8, 2.0);

    try { renderer.xr.setFramebufferScaleFactor?.(fbScale); } catch {}
    try { renderer.xr.setFoveation?.(0); } catch {}

    console.log("[VR] framebufferScale =", fbScale);
  }

  _forceDisableFoveationSoon() {
    const sceneEl = this.app.sceneEl;
    const kick = () => {
      requestAnimationFrame(() => this._forceDisableFoveation());
      setTimeout(() => this._forceDisableFoveation(), 200);
    };

    kick();

    const onEnter = () => kick();
    sceneEl?.addEventListener("enter-vr", onEnter);
    this._unsubs.push(() => sceneEl?.removeEventListener("enter-vr", onEnter));
  }

  _forceDisableFoveation() {
    try {
      const renderer = this.app.sceneEl?.renderer;
      const session = renderer?.xr?.getSession?.();
      if (!renderer || !session) return;

      try { renderer.xr.setFoveation?.(0); } catch {}

      const rs = session.renderState;

      const base = rs?.baseLayer;
      if (base && base.fixedFoveation != null) base.fixedFoveation = 0;

      const layers = rs?.layers;
      if (Array.isArray(layers)) {
        for (const layer of layers) {
          if (layer && layer.fixedFoveation != null) layer.fixedFoveation = 0;
        }
      }
    } catch {}
  }

  // =====================================================
  // ✅ NOVOS MAPAS (vr_debug=true)
  // =====================================================

  _installThumbstickMappings() {
    // Right thumbstick -> toggle console
    const onRight = (e) => {
      e?.stopPropagation?.();
      this._toggleDebugPanel();
    };

    // Left thumbstick -> toggle swapEyes + reload pano
    const onLeft = (e) => {
      e?.stopPropagation?.();
      this._toggleStereoSwapAndReload();
    };

    // Eventos A-Frame (preferidos)
    this.app.rightHandEl?.addEventListener("thumbstickdown", onRight);
    this.app.leftHandEl?.addEventListener("thumbstickdown", onLeft);

    this._unsubs.push(() => this.app.rightHandEl?.removeEventListener("thumbstickdown", onRight));
    this._unsubs.push(() => this.app.leftHandEl?.removeEventListener("thumbstickdown", onLeft));

    console.log("[VR] mappings: RIGHT thumbstick -> console | LEFT thumbstick -> swapEyes+reload");
  }

  _getDebugConsoleEntity() {
    return (
      this.app?._vrConsoleEl ||
      this.app?.cameraEl?.querySelector?.("#vrConsole") ||
      this.app?.sceneEl?.querySelector?.("#vrConsole") ||
      null
    );
  }

  _toggleDebugPanel() {
    const now = performance.now();
    if (now - this._lastDebugToggleMs < 300) return;
    this._lastDebugToggleMs = now;

    const el = this._getDebugConsoleEntity();
    if (!el) {
      console.warn("[VR] não achei #vrConsole pra togglar");
      return;
    }

    const cur = !!el.object3D?.visible;
    const next = !cur;

    if (el.object3D) el.object3D.visible = next;
    el.setAttribute("visible", next ? "true" : "false");

    console.log(`[VR] debug panel visible=${next}`);
  }

  _toggleStereoSwapAndReload() {
    const now = performance.now();
    if (now - this._lastSwapMs < 350) return;
    this._lastSwapMs = now;

    const panoEl = this.app?.panoEl || document.querySelector("#pano");
    if (!panoEl) {
      console.warn("[VR] não achei #pano");
      return;
    }

    const comp = panoEl.components?.["stereo-top-bottom"];
    const curSwap = !!(comp?.data?.swapEyes ?? panoEl.getAttribute("stereo-top-bottom")?.swapEyes);
    const nextSwap = !curSwap;

    // pega src atual com prioridade pro componente
    const src =
      comp?._currentSrc ||
      comp?.data?.src ||
      this.app?.getCurrentScene?.()?.pano ||
      panoEl.getAttribute("stereo-top-bottom")?.src ||
      "";

    if (!src) {
      console.warn("[VR] não consegui achar src atual pra reload");
      panoEl.setAttribute("stereo-top-bottom", { swapEyes: nextSwap });
      console.log(`[VR] swapEyes=${nextSwap} (sem src p/ reload)`);
      return;
    }

    // 1) aplica swapEyes
    panoEl.setAttribute("stereo-top-bottom", { swapEyes: nextSwap });

    // 2) força reload: limpa src e seta de volta
    //    (setSrc(src) não recarrega se url for igual, então fazemos "vazio -> src")
    try {
      if (comp?.setSrc) {
        comp.setSrc("");
        setTimeout(() => comp.setSrc(src), 30);
      } else {
        panoEl.setAttribute("stereo-top-bottom", { src: "" });
        setTimeout(() => panoEl.setAttribute("stereo-top-bottom", { src }), 30);
      }
    } catch {}

    console.log(`[VR] swapEyes=${nextSwap} + reload pano`);
  }

  // =====================================================
  // 🎮 LOGGING (press only)
  // =====================================================

  _installInputLogging() {
    const discreteEvs = [
      "triggerdown","triggerup",
      "gripdown","gripup",
      "thumbstickdown","thumbstickup",
      "abuttondown","abuttonup",
      "bbuttondown","bbuttonup",
      "xbuttondown","xbuttonup",
      "ybuttondown","ybuttonup",
      "menudown","menuup"
    ];

    const attach = (el, tag) => {
      if (!el) return;
      for (const name of discreteEvs) {
        const fn = () => console.log(`[CTRL ${tag}] ${name}`);
        el.addEventListener(name, fn);
        this._unsubs.push(() => el.removeEventListener(name, fn));
      }
    };

    attach(this.app.leftHandEl, "L");
    attach(this.app.rightHandEl, "R");

    console.log("[VR] Input logging ON (press/release apenas)");
  }

  // =====================================================
  // CLEANUP
  // =====================================================

  dispose() {
    this._running = false;

    this.app.cursorEl.setAttribute("visible", "true");

    this.app.leftHandEl.setAttribute("visible", "false");
    this.app.rightHandEl.setAttribute("visible", "false");

    this.app.leftHandEl.removeAttribute("laser-controls");
    this.app.rightHandEl.removeAttribute("laser-controls");
    this.app.leftHandEl.removeAttribute("raycaster");
    this.app.rightHandEl.removeAttribute("raycaster");
    this.app.leftHandEl.removeAttribute("line");
    this.app.rightHandEl.removeAttribute("line");

    for (const fn of this._unsubs) {
      try { fn(); } catch {}
    }
    this._unsubs = [];
    this._srcState.clear();
  }
}

function clamp(v, a, b) {
  v = Number(v);
  if (!Number.isFinite(v)) return a;
  return Math.max(a, Math.min(b, v));
}
