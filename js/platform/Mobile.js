// Mobile.js
// Ajusta UI no mobile e corrige touch look (yaw + pitch)

export default class Mobile {
  constructor(app) {
    // deixa robusto: se vier undefined, vira objeto vazio
    this.app = app || {};

    this._styleEl = null;

    this._canvas = null;
    this._activePointerId = null;
    this._lastX = 0;
    this._lastY = 0;

    // sensibilidade (graus por pixel). Ajusta aqui se quiser.
    this._sens = 0.14;

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
  }

  async init() {
    document.documentElement.classList.add("is-mobile");

    this._injectMobileStyles();
    await this._setupTouchLook();
  }

  destroy() {
    document.documentElement.classList.remove("is-mobile");

    if (this._styleEl) {
      this._styleEl.remove();
      this._styleEl = null;
    }

    if (this._canvas) {
      this._canvas.removeEventListener("pointerdown", this._onPointerDown);
      window.removeEventListener("pointermove", this._onPointerMove);
      window.removeEventListener("pointerup", this._onPointerUp);
      window.removeEventListener("pointercancel", this._onPointerUp);
      this._canvas = null;
    }
  }

  // ---------- UI ----------

  _injectMobileStyles() {
    const existing = document.getElementById("mobile-ui-style");
    if (existing) {
      this._styleEl = existing;
      return;
    }

    const style = document.createElement("style");
    style.id = "mobile-ui-style";
    style.textContent = `
      @media (max-width: 820px) {
        #topMenuBar{
          flex-wrap: wrap;
          align-items: stretch;
          gap: 8px;
          padding: 10px 10px;
        }

        #topMenuBar .bar-left{
          flex: 1 1 100%;
          width: 100%;
          min-width: 0;
          flex-wrap: wrap;
          gap: 8px;
        }

        #topMenuBar .bar-right{
          flex: 1 1 100%;
          width: 100%;
          justify-content: flex-start;
          flex-wrap: wrap;
          gap: 8px;
        }

        #sceneTitle{
          max-width: 100%;
          flex: 1 1 100%;
        }

        .bar-select{
          flex: 1 1 180px;
          max-width: none;
          min-width: 160px;
        }

        .bar-btn{
          padding: 10px 10px;
        }

        .bar-fov{
          flex: 1 1 240px;
        }
        #fovSlider{
          width: 120px;
        }
      }

      @media (max-width: 520px) {
        #topMenuBar .bar-right{
          flex-wrap: nowrap;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          padding-bottom: 2px;
        }
        #topMenuBar .bar-right::-webkit-scrollbar{
          height: 6px;
        }
      }
    `;
    document.head.appendChild(style);
    this._styleEl = style;
  }

  // ---------- Touch look (yaw + pitch) ----------

  async _setupTouchLook() {
    // garante que this.app exista
    if (!this.app) this.app = {};

    // espera achar um canvas do A-Frame (com fallback pra DOM)
    await new Promise((resolve) => {
      const tryGet = () => {
        const sceneEl =
          this.app.sceneEl ||
          document.querySelector("a-scene") ||
          document.querySelector("a-scene[embedded]");

        const canvas =
          sceneEl?.canvas ||
          sceneEl?.renderer?.domElement ||
          document.querySelector(".a-canvas");

        if (canvas) {
          this._canvas = canvas;

          // guarda scene no app se a gente conseguiu achar
          if (sceneEl) this.app.sceneEl = sceneEl;

          // tenta resolver cameraEl de forma robusta
          const camEl =
            this.app.cameraEl ||
            sceneEl?.camera?.el ||
            sceneEl?.querySelector("[camera]") ||
            document.querySelector("[camera]") ||
            document.querySelector("a-entity[camera]");

          if (camEl) this.app.cameraEl = camEl;

          return resolve();
        }

        requestAnimationFrame(tryGet);
      };

      tryGet();
    });

    if (!this._canvas) return;

    // evita scroll/zoom do browser no canvas durante drag
    this._canvas.style.touchAction = "none";

    // desliga input do look-controls (pra não brigar)
    // e DESLIGA magic window tracking no mobile (senão ele sobrescreve pitch)
    if (this.app.cameraEl) {
      this.app.cameraEl.setAttribute("look-controls", "touchEnabled", false);
      this.app.cameraEl.setAttribute("look-controls", "mouseEnabled", false);
      this.app.cameraEl.setAttribute("look-controls", "magicWindowTrackingEnabled", false);
    }

    this._canvas.addEventListener("pointerdown", this._onPointerDown, { passive: false });
    window.addEventListener("pointermove", this._onPointerMove, { passive: false });
    window.addEventListener("pointerup", this._onPointerUp, { passive: false });
    window.addEventListener("pointercancel", this._onPointerUp, { passive: false });
  }

  _onPointerDown(e) {
    if (e.pointerType === "mouse") return;
    if (this._activePointerId !== null) return;

    const t = e.target;
    if (t && t.closest && t.closest("#topMenuBar, #topMenuWrap, #mapOverlay, #hsdebug")) return;

    this._activePointerId = e.pointerId;
    this._lastX = e.clientX;
    this._lastY = e.clientY;

    // mantém os eventos vindo certinho
    this._canvas.setPointerCapture?.(e.pointerId);

    e.preventDefault();
  }

  _onPointerMove(e) {
    if (this._activePointerId === null) return;
    if (e.pointerId !== this._activePointerId) return;

    const dx = e.clientX - this._lastX;
    const dy = e.clientY - this._lastY;
    this._lastX = e.clientX;
    this._lastY = e.clientY;

    this._applyYawPitchDelta(dx, dy);

    e.preventDefault();
  }

  _onPointerUp(e) {
    if (this._activePointerId === null) return;
    if (e.pointerId !== this._activePointerId) return;

    this._canvas.releasePointerCapture?.(e.pointerId);

    this._activePointerId = null;
    e.preventDefault();
  }

  _applyYawPitchDelta(dx, dy) {
    const AFRAME = window.AFRAME;
    if (!AFRAME) return;

    const THREE = AFRAME.THREE;
    const lc = this.app.cameraEl?.components?.["look-controls"];
    if (!lc?.yawObject || !lc?.pitchObject) return;

    // deg/px -> rad/px
    const sensRad = THREE.MathUtils.degToRad(this._sens);

    lc.yawObject.rotation.y -= dx * sensRad;
    lc.pitchObject.rotation.x -= dy * sensRad;

    const minPitch = THREE.MathUtils.degToRad(-85);
    const maxPitch = THREE.MathUtils.degToRad(85);
    lc.pitchObject.rotation.x = clamp(lc.pitchObject.rotation.x, minPitch, maxPitch);
  }
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
