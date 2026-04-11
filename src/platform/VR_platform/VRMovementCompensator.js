export class VRMovementCompensator {
  constructor({ cfgProvider }) {
    this.cfgProvider = cfgProvider;
    this.orientationOffset = { yaw: 0, pitch: 0 };
    this.lastOrientation = null;
    this.translationOrigin = null;
  }

  resetOrientationLock() {
    this.orientationOffset = this.lastOrientation
      ? { yaw: this.lastOrientation.yaw, pitch: this.lastOrientation.pitch }
      : { yaw: 0, pitch: 0 };
  }

  resetTranslationLock(headPosition = null) {
    this.translationOrigin = headPosition
      ? normalizePosition(headPosition)
      : null;
  }

  resetAllLocks(headPosition = null) {
    this.resetOrientationLock();
    this.resetTranslationLock(headPosition);
  }

  updateOrientation(orientation) {
    this.lastOrientation = orientation;
    return this.getLockedView(orientation);
  }

  getLockedView(view) {
    const cfg = this.cfgProvider();
    if (cfg?.platform?.vr?.spatial_lock === false) {
      return { ...view };
    }

    return {
      ...view,
      yaw: wrapDegrees(view.yaw - this.orientationOffset.yaw),
      pitch: clamp(view.pitch - this.orientationOffset.pitch, -58, 58)
    };
  }

  getContentCompensation(headPosition) {
    const cfg = this.cfgProvider();
    if (cfg?.platform?.vr?.spatial_lock === false) {
      return { x: 0, y: 0, z: 0 };
    }

    const current = normalizePosition(headPosition);
    if (!this.translationOrigin) {
      this.translationOrigin = current;
    }

    return {
      x: sanitizeDelta(this.translationOrigin.x - current.x),
      y: sanitizeDelta(this.translationOrigin.y - current.y),
      z: sanitizeDelta(this.translationOrigin.z - current.z)
    };
  }
}

function wrapDegrees(value) {
  return ((value % 360) + 360) % 360;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizePosition(position) {
  return {
    x: Number(position?.x ?? 0),
    y: Number(position?.y ?? 0),
    z: Number(position?.z ?? 0)
  };
}

function sanitizeDelta(value) {
  const nextValue = Number(value ?? 0);
  return Math.abs(nextValue) < 0.0005 ? 0 : nextValue;
}
