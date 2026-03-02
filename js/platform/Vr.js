// js/platform/vr.js

export default class VR {
  constructor(app) {
    this.app = app;
    this._unsubs = [];
    this._session = null;
    this._running = false;

    // inputSource -> { pressed: boolean[] , pinch: bool }
    this._srcState = new Map();
  }

  init(app) {
    this.app = app;

    // remove qualquer geometry/sphere chata presa nas mãos
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

      console.log("[VR] FFR forced OFF (fixedFoveation=0)");
    } catch (e) {
      console.warn("[VR] erro ao desativar FFR", e);
    }
  }

  // =====================================================
  // 🎮 INPUT LOGGING (SÓ PRESS/RELEASE)
  // =====================================================

  _installInputLogging() {
    // Eventos A-Frame discretos (press/release). NÃO loga touch/move.
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

    // WebXR session events (press/release equivalentes)
    this._attachSessionLogging();

    console.log("[VR] Input logging ON (press/release apenas; touch/value/axes ignorados)");
  }

  _attachSessionLogging() {
    const tryAttach = () => {
      const session = this.app.sceneEl?.renderer?.xr?.getSession?.();
      if (!session) return false;

      this._session = session;

      const log = (name, e) => {
        console.log(`[XR] ${name} ${this._describeSource(e?.inputSource)}`);
      };

      const evs = ["selectstart","selectend","squeezestart","squeezeend"];
      for (const name of evs) {
        const fn = (e) => log(name, e);
        session.addEventListener(name, fn);
        this._unsubs.push(() => session.removeEventListener(name, fn));
      }

      // polling: SOMENTE pressed changed
      this._startPolling();
      return true;
    };

    if (!tryAttach()) {
      const onEnter = () => tryAttach();
      this.app.sceneEl.addEventListener("enter-vr", onEnter);
      this._unsubs.push(() => this.app.sceneEl.removeEventListener("enter-vr", onEnter));
    }
  }

  _startPolling() {
    if (this._running) return;
    const session = this._session;
    if (!session) return;

    this._running = true;

    const tick = (_t, frame) => {
      if (!this._running) return;
      try { this._pollInputs(frame); } catch {}
      session.requestAnimationFrame(tick);
    };

    session.requestAnimationFrame(tick);
  }

  _pollInputs(frame) {
    const session = frame?.session;
    if (!session) return;

    const sources = Array.from(session.inputSources || []);
    if (!sources.length) return;

    for (const src of sources) {
      if (src.gamepad) this._pollGamepadPressOnly(src);

      // hand tracking pinch continua (é evento relevante)
      // se tu quiser matar também, eu removo
      if (src.hand) this._pollHandPinchDiscrete(src, frame);
    }
  }

  // ✅ controllers: LOGA SOMENTE pressed mudou (down/up)
  _pollGamepadPressOnly(src) {
    const gp = src.gamepad;
    if (!gp?.buttons) return;

    const state = this._srcState.get(src) || { pressed: [], pinch: false };
    const prev = state.pressed;

    for (let i = 0; i < gp.buttons.length; i++) {
      const pressedNow = !!gp.buttons[i]?.pressed;
      const pressedPrev = !!prev[i];

      if (pressedNow !== pressedPrev) {
        console.log(`[GP ${src.handedness || "?"}] btn${i} pressed=${pressedNow} (${this._describeSource(src)})`);
      }

      prev[i] = pressedNow;
    }

    state.pressed = prev;
    this._srcState.set(src, state);
  }

  // ✅ hand tracking pinch: start/end apenas (nada contínuo)
  _pollHandPinchDiscrete(src, frame) {
    try {
      const renderer = this.app.sceneEl?.renderer;
      const refSpace = renderer?.xr?.getReferenceSpace?.();
      if (!refSpace) return;

      const hand = src.hand;
      const thumbTip = hand.get?.("thumb-tip");
      const indexTip = hand.get?.("index-finger-tip");
      if (!thumbTip || !indexTip) return;

      const pThumb = frame.getJointPose?.(thumbTip, refSpace);
      const pIndex = frame.getJointPose?.(indexTip, refSpace);
      if (!pThumb || !pIndex) return;

      const a = pThumb.transform.position;
      const b = pIndex.transform.position;

      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dz = a.z - b.z;
      const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);

      const PINCH_ON = 0.020;
      const PINCH_OFF = 0.030;

      const state = this._srcState.get(src) || { pressed: [], pinch: false };
      const was = !!state.pinch;

      let now = was;
      if (!was && dist <= PINCH_ON) now = true;
      if (was && dist >= PINCH_OFF) now = false;

      if (now !== was) {
        state.pinch = now;
        console.log(`[HAND ${src.handedness || "?"}] pinch=${now} (${this._describeSource(src)})`);
        this._srcState.set(src, state);
      }
    } catch {
      // sem spam
    }
  }

  _describeSource(src) {
    if (!src) return "";
    const prof = src.profiles?.[0] || "unknown";
    const type = src.hand ? "hand" : "ctrl";
    return `${type}/${src.handedness || "?"}/${prof}`;
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
