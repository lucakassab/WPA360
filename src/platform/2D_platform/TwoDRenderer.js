import { ThreePanoramaRenderer } from "../../shared/ThreePanoramaRenderer.js";

export class TwoDRenderer {
  constructor({ root, cfgProvider, assetCache }) {
    this.root = root;
    this.cfgProvider = cfgProvider;
    this.assetCache = assetCache;
    this.listeners = new Set();
    this.view = {
      yaw: 0,
      pitch: 0,
      fov: 86
    };

    this.stage = document.createElement("div");
    this.stage.className = "twod-stage";
    this.stage.setAttribute("aria-label", "2D virtual tour viewport");

    this.panorama = document.createElement("div");
    this.panorama.className = "twod-panorama";
    this.panorama.setAttribute("aria-hidden", "true");
    this.panoramaRenderer = new ThreePanoramaRenderer({
      root: this.panorama,
      assetCache: this.assetCache,
      previewMode: "mono",
      xrEnabled: false
    });

    this.unsubscribeFrame = this.panoramaRenderer.onFrame(() => {
      for (const listener of this.listeners) {
        listener(this.getView());
      }
    });

    this.hotspotLayer = document.createElement("div");
    this.hotspotLayer.className = "hotspot-layer";

    this.caption = document.createElement("section");
    this.caption.className = "scene-caption";

    this.stage.append(this.panorama, this.hotspotLayer, this.caption);
    this.root.append(this.stage);
  }

  async showScene(scene, tour) {
    const cfg = this.cfgProvider();
    const platformCfg = cfg?.platform?.two_d ?? {};
    this.view.fov = Number(platformCfg.default_fov ?? this.view.fov);
    this.view.yaw = 0;
    this.view.pitch = 0;

    await this.panoramaRenderer.setScene(scene, {
      eye: scene.media?.mono_eye ?? "left"
    });

    if (scene.media?.src && scene.media_available !== false) {
      this.panorama.classList.remove("is-empty");
    } else {
      this.panorama.classList.add("is-empty");
    }

    this.caption.innerHTML = "";
    const title = document.createElement("h2");
    title.textContent = scene.title ?? scene.id;
    const help = document.createElement("p");
    help.textContent = "Drag to look around. Select a hotspot to move between scenes.";
    this.caption.append(title, help);

    this.applyView();
  }

  pan(deltaX, deltaY, pointerType = "mouse") {
    const cfg = this.cfgProvider();
    const platformCfg = cfg?.platform?.two_d ?? {};
    const sensitivity = pointerType === "touch"
      ? Number(platformCfg.touch_sensitivity ?? 0.18)
      : Number(platformCfg.mouse_sensitivity ?? 0.12);

    this.view.yaw = wrapDegrees(this.view.yaw - deltaX * sensitivity);
    this.view.pitch = clamp(this.view.pitch + deltaY * sensitivity, -42, 42);
    this.applyView();
  }

  zoom(delta) {
    const cfg = this.cfgProvider();
    const platformCfg = cfg?.platform?.two_d ?? {};
    const minFov = Number(platformCfg.min_fov ?? 55);
    const maxFov = Number(platformCfg.max_fov ?? 112);
    this.view.fov = clamp(this.view.fov + delta, minFov, maxFov);
    this.applyView();
  }

  setDragging(isDragging) {
    this.stage.classList.toggle("is-dragging", isDragging);
  }

  projectWorldToScreen(position) {
    return this.panoramaRenderer.projectWorldToScreen(position, this.stage, "center");
  }

  screenToWorldFromEvent(event, { depth = 8 } = {}) {
    return this.panoramaRenderer.screenToWorld(event, this.stage, depth, "center");
  }

  getView() {
    return { ...this.view };
  }

  onViewChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getPerformanceSnapshot() {
    return this.panoramaRenderer.getPerformanceSnapshot();
  }

  applyView() {
    this.panoramaRenderer.render({
      yaw: this.view.yaw,
      pitch: this.view.pitch,
      fov: this.view.fov
    });
  }

  destroy() {
    this.listeners.clear();
    this.unsubscribeFrame?.();
    this.panoramaRenderer.destroy();
    this.stage.remove();
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function wrapDegrees(value) {
  return ((value % 360) + 360) % 360;
}
