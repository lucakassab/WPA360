// js/platform/VR.js

export default class VR {
  init(app) {
    this.app = app;

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

    // ✅ boost de qualidade no WebXR (Quest)
    this._applyVrQualityBoost();
  }

  _applyVrQualityBoost() {
    const sceneEl = this.app.sceneEl;
    const renderer = sceneEl?.renderer;
    if (!renderer?.xr) return;

    // Mais nitidez = mais custo. Ajusta se engasgar.
    const FB_SCALE = 1.6;      // 1.3–1.7 é a faixa boa no Quest 3
    const FOVEATION = 0.0;     // 0 = OFF (mais nítido)

    try {
      renderer.xr.setFoveation?.(FOVEATION);
    } catch {}

    try {
      // Aumenta resolução do framebuffer XR (reduz serrilhado/“low res”)
      renderer.xr.setFramebufferScaleFactor?.(FB_SCALE);
    } catch {}

    // log útil no console VR
    try {
      console.log("[VR] foveation=", FOVEATION, "fbScale=", FB_SCALE);
    } catch {}
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
  }
}
