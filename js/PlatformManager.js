// js/PlatformManager.js
export default class PlatformManager {
  async init(app) {
    this.app = app;
    this.current = null;
    this.baseName = this._isMobile() ? "Mobile" : "Desktop";

    await this._switchTo(this.baseName);

    this.app.sceneEl.addEventListener("enter-vr", async () => {
      await this._switchTo("VR"); // pode virar VR/Vr/vr via fallback
    });

    this.app.sceneEl.addEventListener("exit-vr", async () => {
      await this._switchTo(this.baseName);
    });

    const vrSupported = await this._isVRSupported();
    this.app.setVRButtonVisible(vrSupported);
  }

  async _switchTo(name) {
    if (this.current?.name === name) return;

    // cleanup compat: dispose() OU destroy()
    const inst = this.current?.instance;
    if (inst) {
      try { inst.dispose?.(); } catch {}
      try { inst.destroy?.(); } catch {}
    }

    const mod = await this._importPlatformWithFallback(name);

    // passa app no ctor (Mobile usa ctor(app); Desktop/VR ignoram extra args)
    const instance = new mod.default(this.app);

    // init pode ser sync/async e pode aceitar app ou nada
    const r = instance.init?.(this.app);
    if (r && typeof r.then === "function") await r;

    this.current = { name, instance };
    this.app.emit("platform:changed", { platform: name });
  }

  async _importPlatformWithFallback(name) {
    // tenta várias combinações (resolve GitHub Pages case-sensitive)
    const candidates = this._buildCandidates(name);

    let lastErr = null;
    for (const p of candidates) {
      try {
        return await import(p);
      } catch (e) {
        lastErr = e;
      }
    }

    // estoura com erro original
    throw lastErr || new Error(`Falha ao importar plataforma: ${name}`);
  }

  _buildCandidates(name) {
    const base = `./platform/${name}.js`;
    const low = `./platform/${String(name).toLowerCase()}.js`;
    const title = `./platform/${String(name).charAt(0).toUpperCase()}${String(name).slice(1).toLowerCase()}.js`;

    // caso VR especificamente: tenta os 3 jeitos
    const isVR = String(name).toLowerCase() === "vr";
    if (isVR) {
      return [
        "./platform/VR.js",
        "./platform/Vr.js",
        "./platform/vr.js",
        base, title, low
      ];
    }

    return [base, title, low];
  }

  _isMobile() {
    const ua = navigator.userAgent || "";
    return /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(ua) || (navigator.maxTouchPoints || 0) > 1;
  }

  async _isVRSupported() {
    try {
      if (!("xr" in navigator)) return false;
      if (!navigator.xr?.isSessionSupported) return true;
      return await navigator.xr.isSessionSupported("immersive-vr");
    } catch {
      return false;
    }
  }
}
