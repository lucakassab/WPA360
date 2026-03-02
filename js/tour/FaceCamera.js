// js/tour/FaceCamera.js
export function registerFaceCamera(AFRAME) {
  if (!AFRAME) throw new Error("AFRAME não carregou.");

  const THREE = AFRAME.THREE;

  AFRAME.registerComponent("face-camera", {
    schema: {
      enabled: { type: "boolean", default: true }
    },

    init() {
      this._qCam = new THREE.Quaternion();
      this._qParent = new THREE.Quaternion();
    },

    tick() {
      if (!this.data.enabled) return;

      const cam = this.el.sceneEl?.camera;
      if (!cam) return;

      const obj = this.el.object3D;
      const parent = obj.parent;
      if (!parent) return;

      cam.getWorldQuaternion(this._qCam);
      parent.getWorldQuaternion(this._qParent);

      // localQ = inverse(parentWorldQ) * camWorldQ
      this._qParent.invert();
      obj.quaternion.copy(this._qParent.multiply(this._qCam));
    }
  });
}