export default class PlatformManager {
  async init(app) {
    this.app = app;
    this.current = null;
    this.baseName = this._isMobile() ? "Mobile" : "Desktop";

    // Base platform (desktop ou mobile)
    await this._switchTo(this.baseName);

    // Se entrar/sair de VR, alterna módulo
    this.app.sceneEl.addEventListener("enter-vr", async () => {
      await this._switchTo("VR");
    });

    this.app.sceneEl.addEventListener("exit-vr", async () => {
      await this._switchTo(this.baseName);
    });

    // Mostra botão VR só se houver suporte real
    const vrSupported = await this._isVRSupported();
    this.app.setVRButtonVisible(vrSupported);
  }

  async _switchTo(name) {
    if (this.current?.name === name) return;

    if (this.current?.instance?.dispose) {
      this.current.instance.dispose();
    }

    const mod = await import(`./platform/${name}.js`);
    const instance = new mod.default();
    instance.init(this.app);

    this.current = { name, instance };
    this.app.emit("platform:changed", { platform: name });
  }

  _isMobile() {
    const ua = navigator.userAgent || "";
    return /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(ua) || (navigator.maxTouchPoints || 0) > 1;
  }

  async _isVRSupported() {
    try {
      if (!("xr" in navigator)) return false;
      if (!navigator.xr?.isSessionSupported) return true; // fallback otimista
      return await navigator.xr.isSessionSupported("immersive-vr");
    } catch {
      return false;
    }
  }
}