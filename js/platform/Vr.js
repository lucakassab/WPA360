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

    // Controladores visíveis
    app.leftHandEl.setAttribute("visible", "true");
    app.rightHandEl.setAttribute("visible", "true");

    // Laser / tracked controls
    app.leftHandEl.setAttribute("laser-controls", "hand: left");
    app.rightHandEl.setAttribute("laser-controls", "hand: right");

    // Raycaster
    app.leftHandEl.setAttribute("raycaster", "objects: .clickable; far: 10000");
    app.rightHandEl.setAttribute("raycaster", "objects: .clickable; far: 10000");

    // ✅ CRÍTICO: cursor no controle -> trigger vira "click"
    // (sem isso você só tem highlight/intersect, mas não click)
    app.leftHandEl.setAttribute("cursor", "rayOrigin: entity; fuse: false");
    app.rightHandEl.setAttribute("cursor", "rayOrigin: entity; fuse: false");

    // Linha do laser (visual)
    app.leftHandEl.setAttribute("line", "opacity: 0.7");
    app.rightHandEl.setAttribute("line", "opacity: 0.7");
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

    // ✅ remove cursor VR
    this.app.leftHandEl.removeAttribute("cursor");
    this.app.rightHandEl.removeAttribute("cursor");

    this.app.leftHandEl.removeAttribute("line");
    this.app.rightHandEl.removeAttribute("line");
  }
}
