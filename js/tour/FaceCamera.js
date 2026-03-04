// js/tour/FaceCamera.js
export function registerFaceCamera(AFRAME) {
  if (!AFRAME) throw new Error("AFRAME não carregou.");

  const THREE = AFRAME.THREE;

  function getViewerWorldPosition(sceneEl, outVec3) {
    const renderer = sceneEl?.renderer;
    const baseCam = sceneEl?.camera;

    if (!renderer || !baseCam) return false;

    // Em VR: pega a XR camera real (média dos dois olhos)
    if (renderer.xr?.isPresenting) {
      const xrCam = renderer.xr.getCamera(baseCam);
      const cams = xrCam?.cameras;

      if (Array.isArray(cams) && cams.length) {
        outVec3.set(0, 0, 0);
        const tmp = new THREE.Vector3();
        for (const c of cams) {
          tmp.setFromMatrixPosition(c.matrixWorld);
          outVec3.add(tmp);
        }
        outVec3.multiplyScalar(1 / cams.length);
        return true;
      }

      outVec3.setFromMatrixPosition(xrCam.matrixWorld);
      return true;
    }

    // fora do VR
    outVec3.setFromMatrixPosition(baseCam.matrixWorld);
    return true;
  }

  AFRAME.registerComponent("face-camera", {
    schema: {
      enabled: { type: "boolean", default: true },
      // auto: desktop usa quaternion-copy (antigo), VR usa lookAt (novo)
      mode: { type: "string", default: "auto" }, // "auto" | "quat" | "lookat"
      // compensação: THREE.Object3D.lookAt aponta o -Z pro alvo.
      // Para planos que "encaram" +Z, gira 180° no Y.
      flipY180: { type: "boolean", default: true }
    },

    init() {
      this._qCam = new THREE.Quaternion();
      this._qParent = new THREE.Quaternion();

      this._vViewer = new THREE.Vector3();
    },

    tick() {
      if (!this.data.enabled) return;

      const sceneEl = this.el.sceneEl;
      if (!sceneEl) return;

      const obj = this.el.object3D;
      const parent = obj.parent;
      if (!parent) return;

      // Decide modo
      const presenting = !!sceneEl?.renderer?.xr?.isPresenting;
      let mode = this.data.mode;

      if (mode === "auto") {
        mode = presenting ? "lookat" : "quat";
      }

      if (mode === "quat") {
        // ===== modo antigo (screen-aligned) =====
        const cam = sceneEl?.camera;
        if (!cam) return;

        cam.getWorldQuaternion(this._qCam);
        parent.getWorldQuaternion(this._qParent);

        this._qParent.invert();
        obj.quaternion.copy(this._qParent.multiply(this._qCam));
        return;
      }

      // ===== modo VR correto (point billboard) =====
      const ok = getViewerWorldPosition(sceneEl, this._vViewer);
      if (!ok) return;

      obj.lookAt(this._vViewer);

      if (this.data.flipY180) {
        obj.rotateY(Math.PI);
      }
    }
  });
}