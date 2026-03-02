// js/platform/vr.js

export default class VR {
  constructor(app) {
    this.app = app;
    this._unsubs = [];
    this._session = null;
    this._running = false;

    // estado pra polling
    this._srcState = new Map(); // inputSource -> { axes:[], buttons:[], pinch:boolean }
  }

  init(app) {
    this.app = app;

    // Em VR, não precisa mouse/touch
    this.app.cameraEl.setAttribute("look-controls", {
      enabled: true,
      mouseEnabled: false,
      touchEnabled: false,
      pointerLockEnabled: false,
      magicWindowTrackingEnabled: false,
    });

    // some com cursor 2D
    this.app.cursorEl.setAttribute("visible", "false");

    // lasers
    this.app.leftHandEl.setAttribute("visible", "true");
    this.app.rightHandEl.setAttribute("visible", "true");

    this.app.leftHandEl.setAttribute("laser-controls", "hand: left");
    this.app.rightHandEl.setAttribute("laser-controls", "hand: right");

    this.app.leftHandEl.setAttribute("raycaster", "objects: .clickable; far: 10000");
    this.app.rightHandEl.setAttribute("raycaster", "objects: .clickable; far: 10000");

    this.app.leftHandEl.setAttribute("line", "opacity: 0.7");
    this.app.rightHandEl.setAttribute("line", "opacity: 0.7");

    this._applyVrQualityPipeline();

    const cfg = this.app?.vrConfig || {};
    if (cfg.logInputs) this._installInputLogging();
  }

  _applyVrQualityPipeline() {
    const renderer = this.app.sceneEl?.renderer;
    if (!renderer?.xr) return;

    const cfg = this.app?.vrConfig || {};
    const fbScale = clamp(Number(cfg.framebufferScale ?? 1.6), 0.8, 2.0);

    const ffrEnabled = !!cfg.foveatedRenderingEnabled;
    const foveation = ffrEnabled ? clamp(Number(cfg.foveationLevel ?? 0.7), 0, 1) : 0.0;

    try { renderer.xr.setFramebufferScaleFactor?.(fbScale); } catch {}
    try { renderer.xr.setFoveation?.(foveation); } catch {}

    console.log("[VR] framebufferScale =", fbScale, "| foveated =", ffrEnabled ? foveation : "OFF");
  }

  _installInputLogging() {
    // teclado (se existir)
    const onKeyDown = (e) => console.log(`[IN] keydown ${e.key} (${e.code})`);
    const onKeyUp = (e) => console.log(`[IN] keyup ${e.key} (${e.code})`);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    this._unsubs.push(() => window.removeEventListener("keydown", onKeyDown));
    this._unsubs.push(() => window.removeEventListener("keyup", onKeyUp));

    // eventos A-Frame comuns (controllers)
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
      "menudown","menuup",
      "trackpaddown","trackpadup","trackpadmoved"
    ];

    const attach = (el, tag) => {
      if (!el) return;
      for (const name of evs) {
        const fn = (e) => console.log(`[IN] ${tag}.${name}`, e.detail || "");
        el.addEventListener(name, fn);
        this._unsubs.push(() => el.removeEventListener(name, fn));
      }
    };

    attach(this.app.leftHandEl, "L");
    attach(this.app.rightHandEl, "R");

    // WebXR session events (captura controller e PINCH como "select")
    this._attachSessionLogging();

    console.log("[IN] input logging ON");
  }

  _attachSessionLogging() {
    const getSession = () => {
      try { return this.app.sceneEl?.renderer?.xr?.getSession?.() || null; } catch { return null; }
    };

    const tryAttach = () => {
      const s = getSession();
      if (!s) return false;

      this._session = s;

      const log = (name, e) => console.log(`[XR] ${name}`, summarizeXR(e));
      const onSelectStart = (e) => log("selectstart", e);
      const onSelectEnd = (e) => log("selectend", e);
      const onSqueezeStart = (e) => log("squeezestart", e);
      const onSqueezeEnd = (e) => log("squeezeend", e);

      s.addEventListener("selectstart", onSelectStart);
      s.addEventListener("selectend", onSelectEnd);
      s.addEventListener("squeezestart", onSqueezeStart);
      s.addEventListener("squeezeend", onSqueezeEnd);

      this._unsubs.push(() => s.removeEventListener("selectstart", onSelectStart));
      this._unsubs.push(() => s.removeEventListener("selectend", onSelectEnd));
      this._unsubs.push(() => s.removeEventListener("squeezestart", onSqueezeStart));
      this._unsubs.push(() => s.removeEventListener("squeezeend", onSqueezeEnd));

      console.log("[XR] session listeners attached");

      // começa polling de inputSources + gamepad + pinch joints
      this._startPolling();
      return true;
    };

    // se por algum motivo init rodar antes da session existir:
    if (tryAttach()) return;

    const onEnter = () => { tryAttach(); };
    this.app.sceneEl?.addEventListener("enter-vr", onEnter);
    this._unsubs.push(() => this.app.sceneEl?.removeEventListener("enter-vr", onEnter));
  }

  _forceDisableFoveation() {
    try {
      const renderer = this.app.sceneEl?.renderer;
      const session = renderer?.xr?.getSession?.();
      if (!renderer || !session) return;
  
      // 1) three.js helper (quando disponível)
      try { renderer.xr.setFoveation?.(0); } catch {}
  
      // 2) WebXR layer (Meta/Oculus Browser costuma suportar)
      const rs = session.renderState;
  
      // baseLayer (XRWebGLLayer)
      const base = rs?.baseLayer;
      if (base && base.fixedFoveation != null) {
        base.fixedFoveation = 0; // 0 = mínimo/Off :contentReference[oaicite:6]{index=6}
      }
  
      // layers API (XRProjectionLayer)
      const layers = rs?.layers;
      if (Array.isArray(layers)) {
        for (const layer of layers) {
          if (layer && layer.fixedFoveation != null) layer.fixedFoveation = 0; :contentReference[oaicite:7]{index=7}
        }
      }
  
      console.log("[VR] FFR forced OFF (fixedFoveation=0)");
    } catch (e) {
      console.warn("[VR] failed to force foveation off", e);
    }
  }

  
  _startPolling() {
    if (this._running) return;
    const session = this._session;
    if (!session) return;

    this._running = true;

    const tick = (t, frame) => {
      if (!this._running) return;
      try {
        this._pollInputs(frame);
      } catch (e) {
        console.warn("[XR] poll error", e);
      }
      session.requestAnimationFrame(tick);
    };

    session.requestAnimationFrame(tick);
    console.log("[XR] polling ON");
  }

  _pollInputs(frame) {
    const session = frame?.session;
    if (!session) return;

    const sources = Array.from(session.inputSources || []);
    if (!sources.length) return;

    // refspace pra joint poses (hand tracking)
    let refSpace = null;
    try { refSpace = this.app.sceneEl?.renderer?.xr?.getReferenceSpace?.() || null; } catch {}

    // log mudança de fontes
    if (this._lastSourceCount !== sources.length) {
      this._lastSourceCount = sources.length;
      console.log("[XR] inputSources =", sources.map(describeSource).join(" | "));
    }

    for (const src of sources) {
      // gamepad (controllers e às vezes hands)
      if (src.gamepad) this._pollGamepad(src);

      // hand joints => pinch real (thumb-tip vs index-tip)
      if (src.hand && refSpace) this._pollHandPinch(src, frame, refSpace);
    }
  }

  _pollGamepad(src) {
    const gp = src.gamepad;
    if (!gp) return;

    const prev = this._srcState.get(src) || { axes: [], buttons: [], pinch: false };

    // axes
    const axes = gp.axes || [];
    for (let i = 0; i < axes.length; i++) {
      const v = Number(axes[i] || 0);
      const pv = Number(prev.axes[i] || 0);
      if (Math.abs(v - pv) > 0.08) {
        console.log(`[GP] ${src.handedness || "?"} axis${i}=${v.toFixed(2)} (${describeSource(src)})`);
      }
    }

    // buttons
    const buttons = gp.buttons || [];
    for (let i = 0; i < buttons.length; i++) {
      const b = buttons[i];
      const pb = prev.buttons[i] || {};
      const pressed = !!b.pressed;
      const value = Number(b.value || 0);

      const pressedChanged = pressed !== !!pb.pressed;
      const valueChanged = Math.abs(value - Number(pb.value || 0)) > 0.15;

      if (pressedChanged || valueChanged) {
        console.log(`[GP] ${src.handedness || "?"} btn${i} pressed=${pressed} value=${value.toFixed(2)} (${describeSource(src)})`);
      }
    }

    prev.axes = axes.slice();
    prev.buttons = buttons.map(b => ({ pressed: !!b.pressed, value: Number(b.value || 0) }));
    this._srcState.set(src, prev);
  }

  _pollHandPinch(src, frame, refSpace) {
    const hand = src.hand;
    const thumbTip = hand.get?.("thumb-tip");
    const indexTip = hand.get?.("index-finger-tip");
    if (!thumbTip || !indexTip) return;

    const pThumb = frame.getJointPose?.(thumbTip, refSpace);
    const pIndex = frame.getJointPose?.(indexTip, refSpace);
    if (!pThumb?.transform?.position || !pIndex?.transform?.position) return;

    const a = pThumb.transform.position;
    const b = pIndex.transform.position;

    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);

    // threshold ajustável
    const PINCH_ON = 0.020;   // 2.0 cm
    const PINCH_OFF = 0.030;  // 3.0 cm (histerese)

    const prev = this._srcState.get(src) || { axes: [], buttons: [], pinch: false };
    const was = !!prev.pinch;

    let now = was;
    if (!was && dist <= PINCH_ON) now = true;
    if (was && dist >= PINCH_OFF) now = false;

    if (now !== was) {
      prev.pinch = now;
      console.log(`[HAND] ${src.handedness || "?"} pinch=${now} dist=${dist.toFixed(3)} (${describeSource(src)})`);
      this._srcState.set(src, prev);
    }
  }

  dispose() {
    this._running = false;

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

function describeSource(src) {
  const prof = (src.profiles && src.profiles[0]) ? src.profiles[0] : "unknown";
  const hand = src.hand ? "hand" : "ctrl";
  return `${hand}/${src.handedness || "?"}/${prof}`;
}

function summarizeXR(e) {
  const src = e?.inputSource;
  if (!src) return "";
  return describeSource(src);
}
