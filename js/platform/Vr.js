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

    // Controls (model + input)
    app.leftHandEl.setAttribute("laser-controls", "hand: left");
    app.rightHandEl.setAttribute("laser-controls", "hand: right");

    // Raycaster só nos clicáveis
    app.leftHandEl.setAttribute("raycaster", "objects: .clickable; far: 10000");
    app.rightHandEl.setAttribute("raycaster", "objects: .clickable; far: 10000");

    // Linha do laser
    app.leftHandEl.setAttribute("line", "opacity: 0.7");
    app.rightHandEl.setAttribute("line", "opacity: 0.7");

    // ✅ CONVERSÃO MANUAL: triggerdown -> click no primeiro intersect
    this._onTriggerDownL = (e) => this._fireClickFromRaycaster(app.leftHandEl, "left", e);
    this._onTriggerDownR = (e) => this._fireClickFromRaycaster(app.rightHandEl, "right", e);

    app.leftHandEl.addEventListener("triggerdown", this._onTriggerDownL);
    app.rightHandEl.addEventListener("triggerdown", this._onTriggerDownR);

    // fallback (alguns bindings/emuladores)
    app.leftHandEl.addEventListener("selectstart", this._onTriggerDownL);
    app.rightHandEl.addEventListener("selectstart", this._onTriggerDownR);
  }

  dispose() {
    // volta cursor 2D
    this.app.cursorEl.setAttribute("visible", "true");

    // remove listeners
    if (this._onTriggerDownL) {
      this.app.leftHandEl.removeEventListener("triggerdown", this._onTriggerDownL);
      this.app.leftHandEl.removeEventListener("selectstart", this._onTriggerDownL);
    }
    if (this._onTriggerDownR) {
      this.app.rightHandEl.removeEventListener("triggerdown", this._onTriggerDownR);
      this.app.rightHandEl.removeEventListener("selectstart", this._onTriggerDownR);
    }
    this._onTriggerDownL = null;
    this._onTriggerDownR = null;

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

  _fireClickFromRaycaster(handEl, handName, _evt) {
    // pega intersections do raycaster do controle
    const rc = handEl?.components?.raycaster;
    const hits = rc?.intersections;
    if (!hits || hits.length === 0) return;

    // pega o objeto mais próximo
    let el = hits[0]?.object?.el || null;

    // sobe até achar .clickable (garante que pegou o item certo)
    while (el && !(el.classList && el.classList.contains("clickable"))) {
      el = el.parentNode;
    }
    if (!el) return;

    // anti-double fire (evita disparar 2x por frame)
    const now = performance.now();
    if (el.__vrLastFire && (now - el.__vrLastFire) < 180) return;
    el.__vrLastFire = now;

    // dispara click no elemento atingido
    el.emit("click", { source: "vr-trigger", hand: handName }, false);
  }
}
