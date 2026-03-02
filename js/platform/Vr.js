// js/platform/vr.js

export default class VR {
  constructor(app) {
    this.app = app;
    this._unsubs = [];
    this._session = null;
    this._running = false;
    this._srcState = new Map();
    this._lastDebugToggleMs = 0;
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

    if (cfg.debugConsole) {
      this._installDebugPanelToggle();
    }
  }

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

  // -------------------- Thumbstick toggle --------------------

  _installDebugPanelToggle() {
    const sceneEl = this.app.sceneEl;

    const onAnyThumbstickDown = (e) => {
      // garante que é “down” mesmo
      this._toggleDebugPanel();
      e?.stopPropagation?.();
    };

    // 1) captura no scene inteiro (mais confiável)
    sceneEl?.addEventListener("thumbstickdown", onAnyThumbstickDown, true);
    this._unsubs.push(() => sceneEl?.removeEventListener("thumbstickdown", onAnyThumbstickDown, true));

    // 2) redundância: hands
    const onL = () => this._toggleDebugPanel();
    const onR = () => this._toggleDebugPanel();

    this.app.leftHandEl?.addEventListener("thumbstickdown", onL);
    this.app.rightHandEl?.addEventListener("thumbstickdown", onR);

    this._unsubs.push(() => this.app.leftHandEl?.removeEventListener("thumbstickdown", onL));
    this._unsubs.push(() => this.app.rightHandEl?.removeEventListener("thumbstickdown", onR));

    console.log("[VR] thumbstickdown => toggle debug panel");
  }

  _getDebugConsoleEntity() {
    // prioridade: referência do App
    if (this.app?._vrConsoleEl) return this.app._vrConsoleEl;

    // fallback: busca pelo id
    return (
      this.app?.cameraEl?.querySelector?.("#vrConsole") ||
      this.app?.sceneEl?.querySelector?.("#vrConsole") ||
      null
    );
  }

  _toggleDebugPanel() {
    const now = performance.now();
    if (now - this._lastDebugToggleMs < 350) return; // debounce mais forte
    this._lastDebugToggleMs = now;

    const el = this._getDebugConsoleEntity();
    if (!el) {
      console.warn("[VR] não achei #vrConsole pra togglar");
      return;
    }

    const cur = !!el.object3D?.visible;
    const next = !cur;

    // usa o estado REAL do three.js + atributo (pra A-Frame ficar alinhado)
    if (el.object3D) el.object3D.visible = next;
    el.setAttribute("visible", next ? "true" : "false");

    console.log(`[VR] debug panel visible=${next}`);
  }

  // -------------------- logging (press only) --------------------

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

    // (se tu ainda usa polling/gamepad pra log, mantém aqui; não interfere no toggle agora)
    console.log("[VR] Input logging ON");
  }

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
