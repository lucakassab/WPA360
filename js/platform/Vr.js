// js/platform/vr.js

export default class VR {
  constructor(app) {
    this.app = app;
    this._unsubs = [];
    this._session = null;
    this._running = false;
    this._srcState = new Map();
  }

  init(app) {
    this.app = app;

    // Config câmera
    this.app.cameraEl.setAttribute("look-controls", {
      enabled: true,
      mouseEnabled: false,
      touchEnabled: false,
      pointerLockEnabled: false,
      magicWindowTrackingEnabled: false,
    });

    this.app.cursorEl.setAttribute("visible", "false");

    // Controladores
    this.app.leftHandEl.setAttribute("visible", "true");
    this.app.rightHandEl.setAttribute("visible", "true");

    this.app.leftHandEl.setAttribute("laser-controls", "hand: left");
    this.app.rightHandEl.setAttribute("laser-controls", "hand: right");

    this.app.leftHandEl.setAttribute("raycaster", "objects: .clickable; far: 10000");
    this.app.rightHandEl.setAttribute("raycaster", "objects: .clickable; far: 10000");

    this.app.leftHandEl.setAttribute("line", "opacity: 0.7");
    this.app.rightHandEl.setAttribute("line", "opacity: 0.7");

    this._applyVrQuality();
    this._installInputLogging();

    // ⚡ Força FFR OFF quando entrar em VR
    this.app.sceneEl.addEventListener("enter-vr", () => {
      requestAnimationFrame(() => this._forceDisableFoveation());
      setTimeout(() => this._forceDisableFoveation(), 200);
    });
  }

  // =====================================================
  // 🔥 QUALIDADE / FFR
  // =====================================================

  _applyVrQuality() {
    const renderer = this.app.sceneEl?.renderer;
    if (!renderer?.xr) return;

    const fbScale = 1.7; // ajusta se quiser
    try { renderer.xr.setFramebufferScaleFactor?.(fbScale); } catch {}

    try { renderer.xr.setFoveation?.(0); } catch {}

    console.log("[VR] framebufferScale =", fbScale);
  }

  _forceDisableFoveation() {
    try {
      const renderer = this.app.sceneEl?.renderer;
      const session = renderer?.xr?.getSession?.();
      if (!renderer || !session) return;

      try { renderer.xr.setFoveation?.(0); } catch {}

      const rs = session.renderState;

      const base = rs?.baseLayer;
      if (base && base.fixedFoveation != null) {
        base.fixedFoveation = 0;
      }

      const layers = rs?.layers;
      if (Array.isArray(layers)) {
        for (const layer of layers) {
          if (layer && layer.fixedFoveation != null) {
            layer.fixedFoveation = 0;
          }
        }
      }

      console.log("[VR] FFR FORÇADO OFF");
    } catch (e) {
      console.warn("[VR] erro ao desativar FFR", e);
    }
  }

  // =====================================================
  // 🎮 INPUT LOGGING COMPLETO
  // =====================================================

  _installInputLogging() {
    const evs = [
      "triggerdown","triggerup",
      "gripdown","gripup",
      "thumbstickdown","thumbstickup","thumbstickmoved",
      "axismove",
      "buttonchanged",
      "abuttondown","abuttonup",
      "bbuttondown","bbuttonup",
      "xbuttondown","xbuttonup",
      "ybuttondown","ybuttonup",
      "menudown","menuup"
    ];

    const attach = (el, tag) => {
      if (!el) return;
      for (const name of evs) {
        const fn = (e) => console.log(`[CTRL ${tag}] ${name}`, e.detail || "");
        el.addEventListener(name, fn);
        this._unsubs.push(() => el.removeEventListener(name, fn));
      }
    };

    attach(this.app.leftHandEl, "L");
    attach(this.app.rightHandEl, "R");

    this._attachSessionLogging();
    console.log("[VR] Input logging ON");
  }

  _attachSessionLogging() {
    const tryAttach = () => {
      const session = this.app.sceneEl?.renderer?.xr?.getSession?.();
      if (!session) return false;

      this._session = session;

      const log = (name, e) =>
        console.log(`[XR] ${name}`, this._describeSource(e?.inputSource));

      const evs = ["selectstart","selectend","squeezestart","squeezeend"];

      for (const name of evs) {
        const fn = (e) => log(name, e);
        session.addEventListener(name, fn);
        this._unsubs.push(() => session.removeEventListener(name, fn));
      }

      this._startPolling();
      return true;
    };

    if (!tryAttach()) {
      const onEnter = () => tryAttach();
      this.app.sceneEl.addEventListener("enter-vr", onEnter);
      this._unsubs.push(() =>
        this.app.sceneEl.removeEventListener("enter-vr", onEnter)
      );
    }
  }

  _startPolling() {
    if (this._running) return;
    const session = this._session;
    if (!session) return;

    this._running = true;

    const tick = (t, frame) => {
      if (!this._running) return;
      this._pollInputs(frame);
      session.requestAnimationFrame(tick);
    };

    session.requestAnimationFrame(tick);
  }

  _pollInputs(frame) {
    const session = frame?.session;
    if (!session) return;

    const sources = Array.from(session.inputSources || []);
    let refSpace = null;

    try {
      refSpace = this.app.sceneEl?.renderer?.xr?.getReferenceSpace?.();
    } catch {}

    for (const src of sources) {
      if (src.gamepad) this._pollGamepad(src);
      if (src.hand && refSpace)
        this._pollHandPinch(src, frame, refSpace);
    }
  }

  _pollGamepad(src) {
    const gp = src.gamepad;
    const prev = this._srcState.get(src) || { axes: [], buttons: [], pinch: false };

    gp.axes?.forEach((v, i) => {
      const pv = prev.axes[i] ?? 0;
      if (Math.abs(v - pv) > 0.08)
        console.log(`[GP ${src.handedness}] axis${i}=${v.toFixed(2)}`);
    });

    gp.buttons?.forEach((b, i) => {
      const pb = prev.buttons[i] || {};
      if (b.pressed !== pb.pressed || Math.abs(b.value - (pb.value ?? 0)) > 0.15) {
        console.log(`[GP ${src.handedness}] btn${i} pressed=${b.pressed} value=${b.value.toFixed(2)}`);
      }
    });

    prev.axes = gp.axes.slice();
    prev.buttons = gp.buttons.map(b => ({
      pressed: b.pressed,
      value: b.value
    }));

    this._srcState.set(src, prev);
  }

  _pollHandPinch(src, frame, refSpace) {
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

    const prev = this._srcState.get(src) || {};
    const was = !!prev.pinch;

    const now = dist < 0.02;

    if (now !== was) {
      console.log(`[HAND ${src.handedness}] pinch=${now}`);
      prev.pinch = now;
      this._srcState.set(src, prev);
    }
  }

  _describeSource(src) {
    if (!src) return "";
    const prof = src.profiles?.[0] || "unknown";
    const type = src.hand ? "hand" : "ctrl";
    return `${type}/${src.handedness}/${prof}`;
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

    for (const fn of this._unsubs) {
      try { fn(); } catch {}
    }

    this._unsubs = [];
    this._srcState.clear();
  }
}
