export class TwoDInputController {
  constructor({ target, renderer, inputProfile }) {
    this.target = target;
    this.renderer = renderer;
    this.inputProfile = inputProfile;
    this.drag = null;

    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onWheel = this.onWheel.bind(this);
  }

  attach() {
    this.target.addEventListener("pointerdown", this.onPointerDown);
    this.target.addEventListener("pointermove", this.onPointerMove);
    this.target.addEventListener("pointerup", this.onPointerUp);
    this.target.addEventListener("pointercancel", this.onPointerUp);
    this.target.addEventListener("wheel", this.onWheel, { passive: false });
  }

  onPointerDown(event) {
    if (isInteractiveTarget(event.target)) {
      return;
    }

    if (event.button !== undefined && event.button !== 0) {
      return;
    }
    this.drag = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      pointerType: event.pointerType || this.inputProfile.pointer
    };
    this.target.setPointerCapture?.(event.pointerId);
    this.renderer.setDragging(true);
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
    this.target.releasePointerCapture?.(event.pointerId);
    this.drag = null;
    this.renderer.setDragging(false);
  }

  onWheel(event) {
    event.preventDefault();
    this.renderer.zoom(Math.sign(event.deltaY) * 5);
  }

  destroy() {
    this.target.removeEventListener("pointerdown", this.onPointerDown);
    this.target.removeEventListener("pointermove", this.onPointerMove);
    this.target.removeEventListener("pointerup", this.onPointerUp);
    this.target.removeEventListener("pointercancel", this.onPointerUp);
    this.target.removeEventListener("wheel", this.onWheel);
    this.drag = null;
  }
}

function isInteractiveTarget(target) {
  return Boolean(target?.closest?.(".hotspot, button, a, input, select, textarea, label"));
}
