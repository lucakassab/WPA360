// js/platform/VR.js

export default class VR {
  init(app) {
    this.app = app;
    this._unsubs = [];

    // Em VR, não precisa mouse/touch
    app.cameraEl.setAttribute("look-controls", {
      enabled: true,
      mouseEnabled: false,
      touchEnabled: false,
      pointerLockEnabled: false,
      magicWindowTrackingEnabled: false,
    });

    // Some com cursor 2D
    app.cursorEl.setAttribute("visible", "false");

    // Controladores com laser
    app.leftHandEl.setAttribute("visible", "true");
    app.rightHandEl.setAttribute("visible", "true");

    app.leftHandEl.setAttribute("laser-controls", "hand: left");
    app.rightHandEl.setAttribute("laser-controls", "hand: right");

    app.leftHandEl.setAttribute("raycaster", "objects: .clickable; far: 10000");
    app.rightHandEl.setAttribute("raycaster", "objects: .clickable; far: 10000");

    app.leftHandEl.setAttribute("line", "opacity: 0.7");
    app.rightHandEl.setAttribute("line", "opacity: 0.7");

    // ✅ qualidade XR
    this._applyVrQualityPipeline();

    // ✅ log de inputs (teclas + controle + hand tracking)
    const cfg = this.app?.vrConfig || {};
    if (cfg.logInputs) this._installInputLogging();
  }

  _applyVrQualityPipeline() {
    const sceneEl = this.app.sceneEl;
    const renderer = sceneEl?.renderer;
    if (!renderer?.xr) return;

    const cfg = this.app?.vrConfig || {};

    const fbScale = Number(cfg.framebufferScale ?? 1.6);
    const ffrEnabled = !!cfg.foveatedRenderingEnabled;
    const foveation = ffrEnabled ? Number(cfg.foveationLevel ?? 0.7) : 0.0; // ✅ OFF por padrão

    try { renderer.xr.setFramebufferScaleFactor?.(clamp(fbScale, 0.8, 2.0)); } catch {}
    try { renderer.xr.setFoveation?.(clamp(foveation, 0.0, 1.0)); } catch {}

    console.log("[VR] framebufferScale =", fbScale, "| foveated =", ffrEnabled ? foveation : "OFF");
  }

  _installInputLogging() {
    const log = (tag, e) => {
      const info = summarizeEvent(e);
      console.log(`[IN] ${tag}${info ? " " + info : ""}`);
    };

    // keyboard
    const onKeyDown = (e) => log(`keydown ${e.key} (${e.code})`, e);
    const onKeyUp = (e) => log(`keyup ${e.key} (${e.code})`, e);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    this._unsubs.push(() => window.removeEventListener("keydown", onKeyDown));
    this._unsubs.push(() => window.removeEventListener("keyup", onKeyUp));

    // Controllers / A-Frame input events (mais comuns)
    const evs = [
      "triggerdown","triggerup",
      "gripdown","gripup",
      "thumbstickdown","thumbstickup","thumbstickmoved",
      "trackpaddown","trackpadup","trackpadmoved",
      "abuttondown","abuttonup",
      "bbuttondown","bbuttonup",
      "xbuttondown","xbuttonup",
      "ybuttondown","ybuttonup",
      "menudown","menuup",
      "axismove",
      "buttonchanged"
    ];

    const attach = (el, prefix) => {
      if (!el) return;
      for (const name of evs) {
        const fn = (e) => log(`${prefix}.${name}`, e);
        el.addEventListener(name, fn);
        this._unsubs.push(() => el.removeEventListener(name, fn));
      }

      // Hand tracking pinch (se existir)
      const pinchEvents = [
        "pinchstarted","pinchended","pinchmoved",
        "pinchstart","pinchend","pinchmove"
      ];
      for (const name of pinchEvents) {
        const fn = (e) => log(`${prefix}.${name}`, e);
        el.addEventListener(name, fn);
        this._unsubs.push(() => el.removeEventListener(name, fn));
      }
    };

    attach(this.app.leftHandEl, "L");
    attach(this.app.rightHandEl, "R");

    // WebXR session-level events (quando disponíveis)
    const sceneEl = this.app.sceneEl;
    const onEnter = () => {
      try {
        const session = sceneEl?.renderer?.xr?.getSession?.();
        if (!session) return;

        const onSelectStart = (e) => log("session.selectstart", e);
        const onSelectEnd = (e) => log("session.selectend", e);
        const onSqueezeStart = (e) => log("session.squeezestart", e);
        const onSqueezeEnd = (e) => log("session.squeezeend", e);

        session.addEventListener("selectstart", onSelectStart);
        session.addEventListener("selectend", onSelectEnd);
        session.addEventListener("squeezestart", onSqueezeStart);
        session.addEventListener("squeezeend", onSqueezeEnd);

        this._unsubs.push(() => session.removeEventListener("selectstart", onSelectStart));
        this._unsubs.push(() => session.removeEventListener("selectend", onSelectEnd));
        this._unsubs.push(() => session.removeEventListener("squeezestart", onSqueezeStart));
        this._unsubs.push(() => session.removeEventListener("squeezeend", onSqueezeEnd));

        console.log("[IN] session listeners attached");
      } catch {}
    };

    onEnter();
    const onEnterVr = () => onEnter();
    sceneEl?.addEventListener("enter-vr", onEnterVr);
    this._unsubs.push(() => sceneEl?.removeEventListener("enter-vr", onEnterVr));

    // Se tu quiser tentar capturar pinch de verdade, sem quebrar nada:
    // (não força hand tracking; só deixa pronto se o projeto habilitar depois)
    const cfg = this.app?.vrConfig || {};
    if (cfg.handTrackingLogging) {
      console.log("[IN] hand tracking pinch listeners ON (waiting for events)");
    }
  }

  dispose() {
    // volta cursor
    this.app.cursorEl.setAttribute("visible", "true");

    // desliga mãos
    this.app.leftHandEl.setAttribute("visible", "false");
    this.app.rightHandEl.setAttribute("visible", "false");
    this.app.leftHandEl.removeAttribute("laser-controls");
    this.app.rightHandEl.removeAttribute("laser-controls");
    this.app.leftHandEl.removeAttribute("raycaster");
    this.app.rightHandEl.removeAttribute("raycaster");
    this.app.leftHandEl.removeAttribute("line");
    this.app.rightHandEl.removeAttribute("line");

    // remove listeners
    for (const fn of this._unsubs) {
      try { fn(); } catch {}
    }
    this._unsubs = [];
  }
}

function clamp(v, a, b) {
  v = Number(v);
  if (!Number.isFinite(v)) return a;
  return Math.max(a, Math.min(b, v));
}

function summarizeEvent(e) {
  if (!e) return "";
  const d = e.detail;
  if (!d) return "";

  // tenta pegar eixos comuns
  const x = d.x ?? d.axis?.[0];
  const y = d.y ?? d.axis?.[1];

  // pinch/gestures podem vir com "position"/"hand"/etc
  const hand = d.hand || d.handedness || "";
  const pressed = (d.pressed != null) ? `pressed=${d.pressed}` : "";
  const val = (d.value != null) ? `value=${d.value}` : "";

  const parts = [];
  if (hand) parts.push(`hand=${hand}`);
  if (Number.isFinite(x) && Number.isFinite(y)) parts.push(`xy=${Number(x).toFixed(2)},${Number(y).toFixed(2)}`);
  if (pressed) parts.push(pressed);
  if (val) parts.push(val);

  return parts.join(" ");
}
