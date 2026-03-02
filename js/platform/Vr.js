// js/platform/vr.js
export default class VR {
  constructor(app) {
    this.app = app;
    this._unsubs = [];
    this._lastWidgetToggleMs = 0;
  }

  init(app) {
    this.app = app;

    // VR: sem mouse/touch
    this.app.cameraEl.setAttribute("look-controls", {
      enabled: true,
      mouseEnabled: false,
      touchEnabled: false,
      pointerLockEnabled: false,
      magicWindowTrackingEnabled: false,
    });

    // some cursor 2D
    this.app.cursorEl.setAttribute("visible", "false");

    // controllers
    this.app.leftHandEl.setAttribute("visible", "true");
    this.app.rightHandEl.setAttribute("visible", "true");

    this.app.leftHandEl.setAttribute("laser-controls", "hand: left");
    this.app.rightHandEl.setAttribute("laser-controls", "hand: right");

    // ✅ necessário pra click funcionar perfeito nos botões (widget)
    this.app.leftHandEl.setAttribute("cursor", "rayOrigin: entity; fuse: false");
    this.app.rightHandEl.setAttribute("cursor", "rayOrigin: entity; fuse: false");

    this.app.leftHandEl.setAttribute("raycaster", "objects: .clickable; far: 10000");
    this.app.rightHandEl.setAttribute("raycaster", "objects: .clickable; far: 10000");

    this.app.leftHandEl.setAttribute("line", "opacity: 0.7");
    this.app.rightHandEl.setAttribute("line", "opacity: 0.7");

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

  dispose() {
    // volta cursor
    this.app.cursorEl.setAttribute("visible", "true");

    // desliga mãos
    this.app.leftHandEl.setAttribute("visible", "false");
    this.app.rightHandEl.setAttribute("visible", "false");

    this.app.leftHandEl.removeAttribute("laser-controls");
    this.app.rightHandEl.removeAttribute("laser-controls");

    this.app.leftHandEl.removeAttribute("cursor");
    this.app.rightHandEl.removeAttribute("cursor");

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
