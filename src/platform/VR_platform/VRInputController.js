export class VRInputController {
  constructor({ renderer, hotspotRenderer, movementCompensator }) {
    this.renderer = renderer;
    this.hotspotRenderer = hotspotRenderer;
    this.movementCompensator = movementCompensator;
    this.drag = null;
    this.orientationEnabled = false;

    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onDeviceOrientation = this.onDeviceOrientation.bind(this);
    this.enableOrientation = this.enableOrientation.bind(this);
    this.onReset = () => this.renderer.resetSpatialLock();
    this.onSelect = () => this.selectCurrentTarget();
    this.onEnterImmersive = async () => {
      if (this.renderer.isPresenting()) {
        await this.renderer.exitImmersive();
        return;
      }
      await this.renderer.enterImmersive({ userInitiated: true });
    };
  }

  attach() {
    this.renderer.stage.addEventListener("pointerdown", this.onPointerDown);
    this.renderer.stage.addEventListener("pointermove", this.onPointerMove);
    this.renderer.stage.addEventListener("pointerup", this.onPointerUp);
    this.renderer.stage.addEventListener("pointercancel", this.onPointerUp);
    this.renderer.resetButton.addEventListener("click", this.onReset);
    this.renderer.selectButton.addEventListener("click", this.onSelect);
    this.renderer.enterButton.addEventListener("click", this.onEnterImmersive);
    this.renderer.orientationButton.addEventListener("click", this.enableOrientation);
    window.addEventListener("keydown", this.onKeyDown);
  }

  onPointerDown(event) {
    if (this.renderer.isPresenting() || isInteractiveTarget(event.target)) {
      return;
    }

    if (event.button !== undefined && event.button !== 0) {
      return;
    }

    this.drag = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      pointerType: event.pointerType || "mouse"
    };
    this.renderer.stage.setPointerCapture?.(event.pointerId);
  }

  onPointerMove(event) {
    if (!this.drag || event.pointerId !== this.drag.pointerId) {
      return;
    }

    const deltaX = event.clientX - this.drag.x;
    const deltaY = event.clientY - this.drag.y;
    this.drag.x = event.clientX;
    this.drag.y = event.clientY;
    this.renderer.pan(deltaX, deltaY, this.drag.pointerType);
  }

  onPointerUp(event) {
    if (!this.drag || event.pointerId !== this.drag.pointerId) {
      return;
    }
    this.renderer.stage.releasePointerCapture?.(event.pointerId);
    this.drag = null;
  }

  onKeyDown(event) {
    if (event.key === "Enter" || event.key === " ") {
      this.selectCurrentTarget();
    }
    if (event.key.toLowerCase() === "r") {
      this.renderer.resetSpatialLock();
    }
    if (event.key.toLowerCase() === "v") {
      this.onEnterImmersive();
    }
  }

  selectCurrentTarget() {
    if (this.renderer.selectCurrentReticleTarget()) {
      return true;
    }

    if (!this.renderer.isPresenting()) {
      return this.hotspotRenderer.selectCenteredHotspot();
    }

    return false;
  }

  async enableOrientation() {
    if (this.renderer.isPresenting()) {
      return;
    }

    const eventType = window.DeviceOrientationEvent;
    if (!eventType) {
      return;
    }

    if (typeof eventType.requestPermission === "function") {
      const permission = await eventType.requestPermission();
      if (permission !== "granted") {
        return;
      }
    }

    if (!this.orientationEnabled) {
      window.addEventListener("deviceorientation", this.onDeviceOrientation, true);
      this.orientationEnabled = true;
    }
  }

  onDeviceOrientation(event) {
    if (event.alpha == null || this.renderer.isPresenting()) {
      return;
    }

    const yaw = 360 - Number(event.alpha);
    const pitch = clamp(Number(event.beta ?? 0) * -0.65, -58, 58);
    this.renderer.setOrientationView({ yaw, pitch });
  }

  destroy() {
    this.renderer.stage.removeEventListener("pointerdown", this.onPointerDown);
    this.renderer.stage.removeEventListener("pointermove", this.onPointerMove);
    this.renderer.stage.removeEventListener("pointerup", this.onPointerUp);
    this.renderer.stage.removeEventListener("pointercancel", this.onPointerUp);
    this.renderer.resetButton.removeEventListener("click", this.onReset);
    this.renderer.selectButton.removeEventListener("click", this.onSelect);
    this.renderer.enterButton.removeEventListener("click", this.onEnterImmersive);
    this.renderer.orientationButton.removeEventListener("click", this.enableOrientation);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("deviceorientation", this.onDeviceOrientation, true);
    this.drag = null;
    this.orientationEnabled = false;
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function isInteractiveTarget(target) {
  return Boolean(target?.closest?.(".hotspot, button, a, input, select, textarea, label"));
}