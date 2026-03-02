// js/platform/vr.js
export default class VR {
  constructor(app) {
    this.app = app;
    this._unsubs = [];
    this._lastWidgetToggleMs = 0;
  }

  init(app) {
    this.app = app;

    // câmera em VR
    this.app.cameraEl.setAttribute("look-controls", {
      enabled: true,
      mouseEnabled: false,
      touchEnabled: false,
      pointerLockEnabled: false,
      magicWindowTrackingEnabled: false,
    });

    // some cursor 2D
    this.app.cursorEl.setAttribute("visible", "false");

    // controladores
    this.app.leftHandEl.setAttribute("visible", "true");
    this.app.rightHandEl.setAttribute("visible", "true");

    this.app.leftHandEl.setAttribute("laser-controls", "hand: left");
    this.app.rightHandEl.setAttribute("laser-controls", "hand: right");

    // ✅ garante interseção (hover/focus)
    this.app.leftHandEl.setAttribute("raycaster", "objects: .clickable; far: 10000");
    this.app.rightHandEl.setAttribute("raycaster", "objects: .clickable; far: 10000");

    this.app.leftHandEl.setAttribute("line", "opacity: 0.7");
    this.app.rightHandEl.setAttribute("line", "opacity: 0.7");

    // ✅ CLICK real via trigger (não depende de cursor component)
    const onTriggerL = () => this._fireClickFromRay(this.app.leftHandEl);
    const onTriggerR = () => this._fireClickFromRay(this.app.rightHandEl);

    this.app.leftHandEl.addEventListener("triggerdown", onTriggerL);
    this.app.rightHandEl.addEventListener("triggerdown", onTriggerR);

    this._unsubs.push(() => this.app.leftHandEl.removeEventListener("triggerdown", onTriggerL));
    this._unsubs.push(() => this.app.rightHandEl.removeEventListener("triggerdown", onTriggerR));

    // ✅ GRIP toggle widget (qualquer mão)
    const onGrip = () => this._toggleVrWidget();
    this.app.leftHandEl.addEventListener("gripdown", onGrip);
    this.app.rightHandEl.addEventListener("gripdown", onGrip);

    this._unsubs.push(() => this.app.leftHandEl.removeEventListener("gripdown", onGrip));
    this._unsubs.push(() => this.app.rightHandEl.removeEventListener("gripdown", onGrip));
  }

  _toggleVrWidget() {
    const now = performance.now();
    if (now - this._lastWidgetToggleMs < 300) return;
    this._lastWidgetToggleMs = now;

    const el =
      this.app?._vrWidgetEl ||
      this.app?.cameraEl?.querySelector?.("#vrWidget") ||
      this.app?.sceneEl?.querySelector?.("#vrWidget");

    if (!el) return;

    const cur = !!el.object3D?.visible;
    const next = !cur;

    if (el.object3D) el.object3D.visible = next;
    el.setAttribute("visible", next ? "true" : "false");

    console.log(`[VR] vrWidget visible=${next}`);
  }

  _fireClickFromRay(handEl) {
    const rc = handEl?.components?.raycaster;
    const ints = rc?.intersections;
    if (!ints || !ints.length) return;

    // pega o objeto mais perto
    let obj = ints[0]?.object;
    if (!obj) return;

    // sobe até achar um object3D com el
    while (obj && !obj.el && obj.parent) obj = obj.parent;
    let hitEl = obj?.el || null;
    if (!hitEl) return;

    // sobe na árvore DOM até achar .clickable
    while (hitEl && !hitEl.classList?.contains("clickable")) {
      hitEl = hitEl.parentEl || null;
    }
    if (!hitEl) return;

    // dispara click no alvo correto
    hitEl.emit("click", { from: handEl }, false);
  }

  dispose() {
    // volta cursor 2D
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
  }
}
