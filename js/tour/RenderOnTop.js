// js/tour/RenderOnTop.js
export function registerRenderOnTop(AFRAME) {
  if (!AFRAME) throw new Error("AFRAME não carregou.");

  AFRAME.registerComponent("render-on-top", {
    schema: {
      order: { type: "int", default: 999 },
      depthTest: { type: "boolean", default: false },
      depthWrite: { type: "boolean", default: false }
    },

    init() {
      this._apply = this._apply.bind(this);
      this.el.addEventListener("object3dset", this._apply);
      this.el.addEventListener("loaded", this._apply);

      // Reaplica em mudanças (ex.: text cria mesh depois)
      this.el.addEventListener("componentchanged", (e) => {
        if (e.detail?.name === "text" || e.detail?.name === "geometry" || e.detail?.name === "material") {
          this._apply();
        }
      });
    },

    update() {
      this._apply();
    },

    _apply() {
      const obj = this.el.object3D;
      if (!obj) return;

      const { order, depthTest, depthWrite } = this.data;

      obj.traverse((child) => {
        if (!child || !child.isMesh) return;

        child.renderOrder = order;

        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const m of mats) {
          if (!m) continue;
          m.depthTest = depthTest;
          m.depthWrite = depthWrite;
          m.transparent = true; // garante ordenação estável com alpha
          m.needsUpdate = true;
        }
      });
    }
  });
}