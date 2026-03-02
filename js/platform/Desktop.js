export default class Desktop {
  init(app) {
    this.app = app;

    app.cameraEl.setAttribute("look-controls", {
      enabled: true,
      mouseEnabled: true,
      touchEnabled: false,
      pointerLockEnabled: false,
      magicWindowTrackingEnabled: false,
    });

    // Cursor do mouse (raycasting + hover)
    app.cursorEl.removeAttribute("geometry");
    app.cursorEl.removeAttribute("material");
    app.cursorEl.setAttribute("cursor", { rayOrigin: "mouse", fuse: false });
    app.cursorEl.setAttribute("raycaster", { objects: ".clickable", far: 10000 });

    this._hideHands();
  }

  dispose() {}

  _hideHands() {
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