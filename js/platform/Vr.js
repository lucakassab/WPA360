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

    // ✅ boost de qualidade no WebXR (Quest 3)
    this._applyVrQualityBoost();
  }

  _applyVrQualityBoost() {
    const sceneEl = this.app.sceneEl;
    const renderer = sceneEl?.renderer;
    if (!renderer?.xr) return;

    try {
      // 0 = sem foveation (mais nítido), 1 = mais foveation (mais performance)
      renderer.xr.setFoveation?.(0);
    } catch {}

    try {
      // Ajuste fino: 1.2~1.4 costuma ficar bonito no Quest 3.
      // Se pesar demais, baixa pra 1.1.
      renderer.xr.setFramebufferScaleFactor?.(1.25);
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

    // (opcional) poderia restaurar foveation/scale aqui, mas como só afeta VR, tá ok.
  }
}
