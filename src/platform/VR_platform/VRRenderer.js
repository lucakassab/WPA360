import { ThreeHotspotLayer } from "../../shared/ThreeHotspotLayer.js";
import { ThreePanoramaRenderer } from "../../shared/ThreePanoramaRenderer.js";
import { VRInputRig } from "./VRInputRig.js";

export class VRRenderer {
  constructor({ root, cfgProvider, movementCompensator, assetCache, context }) {
    this.root = root;
    this.cfgProvider = cfgProvider;
    this.movementCompensator = movementCompensator;
    this.assetCache = assetCache;
    this.context = context;
    this.view = { yaw: 0, pitch: 0, fov: 96 };
    this.listeners = new Set();

    this.stage = document.createElement("div");
    this.stage.className = "vr-stage";
    this.stage.setAttribute("aria-label", "VR virtual tour viewport");

    this.viewport = document.createElement("div");
    this.viewport.className = "vr-panorama";
    this.viewport.setAttribute("aria-hidden", "true");
    this.panoramaRenderer = new ThreePanoramaRenderer({
      root: this.viewport,
      assetCache: this.assetCache,
      previewMode: "stereo",
      xrEnabled: true
    });

    this.hotspotLayer3D = new ThreeHotspotLayer({
      contentRoot: this.panoramaRenderer.getContentRoot()
    });

    this.inputRig = new VRInputRig({
      panoramaRenderer: this.panoramaRenderer,
      hotspotLayer: this.hotspotLayer3D,
      context: this.context
    });

    this.hud = document.createElement("div");
    this.hud.className = "vr-hud";

    this.enterButton = document.createElement("button");
    this.enterButton.type = "button";
    this.enterButton.textContent = "Enter immersive VR";

    this.resetButton = document.createElement("button");
    this.resetButton.type = "button";
    this.resetButton.textContent = "Reset spatial lock";

    this.orientationButton = document.createElement("button");
    this.orientationButton.type = "button";
    this.orientationButton.textContent = "Use device orientation";

    this.selectButton = document.createElement("button");
    this.selectButton.type = "button";
    this.selectButton.textContent = "Select target";

    this.hud.append(this.enterButton, this.resetButton, this.orientationButton, this.selectButton);

    this.eyeRow = document.createElement("div");
    this.eyeRow.className = "vr-eye-row";
    this.leftEye = this.createEye("left");
    this.rightEye = this.createEye("right");
    this.eyeRow.append(this.leftEye.eye, this.rightEye.eye);

    this.reticle = document.createElement("div");
    this.reticle.className = "vr-reticle";

    this.caption = document.createElement("section");
    this.caption.className = "scene-caption";

    this.stage.append(this.viewport, this.eyeRow, this.hud, this.reticle, this.caption);
    this.root.append(this.stage);

    this.uiState = {
      presenting: null
    };

    this.unsubscribeFrame = this.panoramaRenderer.onFrame((frameState) => this.handleFrame(frameState));
  }

  createEye(name) {
    const eye = document.createElement("div");
    eye.className = "vr-eye";
    eye.dataset.eye = name;

    const hotspotLayer = document.createElement("div");
    hotspotLayer.className = "vr-hotspot-layer";

    eye.append(hotspotLayer);
    return { eye, hotspotLayer };
  }

  async showScene(scene, tour, { userInitiated = false } = {}) {
    const immersiveRequest = userInitiated
      ? this.enterImmersive({ userInitiated: true })
      : null;

    this.view.yaw = 0;
    this.view.pitch = 0;
    this.view.fov = 96;

    await this.panoramaRenderer.setScene(scene, {
      eye: scene.media?.mono_eye ?? "left"
    });
    this.hotspotLayer3D.setHotspots(scene.hotspots ?? []);

    this.caption.innerHTML = "";
    const title = document.createElement("h2");
    title.textContent = `${scene.title ?? scene.id} / VR`;
    const help = document.createElement("p");
    help.textContent = "Switching to VR tries immersive mode first. If unavailable, the inline stereo preview stays active.";
    this.caption.append(title, help);

    this.applyView();

    if (immersiveRequest) {
      await immersiveRequest;
    }
  }

  pan(deltaX, deltaY, pointerType = "mouse") {
    const sensitivity = pointerType === "touch" ? 0.18 : 0.12;
    this.view.yaw = wrapDegrees(this.view.yaw - deltaX * sensitivity);
    this.view.pitch = clamp(this.view.pitch + deltaY * sensitivity, -58, 58);
    this.applyView();
  }

  setOrientationView(orientation) {
    this.movementCompensator.updateOrientation(orientation);
    this.view.yaw = orientation.yaw;
    this.view.pitch = orientation.pitch;
    this.applyView();
  }

  resetSpatialLock() {
    this.movementCompensator.resetAllLocks(this.panoramaRenderer.getHeadPosition());
    this.inputRig.resetSpatialLock(this.panoramaRenderer.getHeadPosition());
    this.panoramaRenderer.setContentCompensation({ x: 0, y: 0, z: 0 });
    this.applyView();
  }

  async enterImmersive({ userInitiated = false } = {}) {
    const result = await this.panoramaRenderer.enterImmersive({ userInitiated });

    if (result.status === "started") {
      this.movementCompensator.resetTranslationLock(null);
      this.context.setStatus?.("Immersive VR session started.", { hideAfterMs: 1800 });
      return result;
    }

    if (result.status === "available-but-not-started") {
      this.context.setStatus?.("Immersive VR is available; use the VR button to start it.", { hideAfterMs: 2200 });
      return result;
    }

    if (result.status === "unsupported") {
      this.context.setStatus?.("Immersive WebXR not available here; keeping inline stereo preview.", { hideAfterMs: 2400 });
      return result;
    }

    if (result.status === "error") {
      console.error("[WPA360] immersive VR session failed", result.error);
      this.context.setStatus?.("Could not start immersive VR; keeping inline stereo preview.", { hideAfterMs: 2600 });
    }

    return result;
  }

  async exitImmersive() {
    await this.panoramaRenderer.exitImmersive();
  }

  isPresenting() {
    return this.panoramaRenderer.isPresenting();
  }

  getReticleProjectionOrigin() {
    return this.inputRig.getReticleProjectionOrigin();
  }

  projectWorldToEye(position, eyeName) {
    const viewport = eyeName === "right" ? this.rightEye.eye : this.leftEye.eye;
    return this.panoramaRenderer.projectWorldToScreen(position, viewport, eyeName);
  }

  screenToWorldFromEvent(event, { depth = 8 } = {}) {
    const eye = event.target.closest?.(".vr-eye");
    const eyeName = eye?.dataset.eye === "right" ? "right" : "left";
    const viewport = eyeName === "right" ? this.rightEye.eye : this.leftEye.eye;
    return this.panoramaRenderer.screenToWorld(event, viewport, depth, eyeName);
  }

  findCenteredHotspot() {
    const cfg = this.cfgProvider();
    const maxDegrees = Number(cfg?.platform?.vr?.gaze_selection_degrees ?? 9);
    return this.hotspotLayer3D.getCenteredHotspot(
      this.panoramaRenderer.getCameraForEye("center"),
      { maxDegrees }
    );
  }

  onViewChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getXRController(index = 0) {
    return this.panoramaRenderer.getXRController(index);
  }

  getPerformanceSnapshot() {
    return this.panoramaRenderer.getPerformanceSnapshot();
  }

  selectCurrentReticleTarget() {
    return this.inputRig.selectCurrentReticleTarget();
  }

  applyView() {
    const view = this.getCompensatedView();
    this.panoramaRenderer.render({
      yaw: view.yaw,
      pitch: view.pitch,
      fov: this.view.fov
    });
  }

  getCompensatedView() {
    return this.movementCompensator.getLockedView(this.view);
  }

  handleFrame(frameState) {
    const contentOffset = frameState.presenting
      ? this.movementCompensator.getContentCompensation(frameState.headPosition)
      : { x: 0, y: 0, z: 0 };

    this.panoramaRenderer.setContentCompensation(contentOffset);
    this.hotspotLayer3D.setVisible(frameState.presenting);
    this.hotspotLayer3D.update(frameState.camera);
    this.inputRig.update(frameState);
    this.syncPresentationUi(frameState.presenting);

    const view = frameState.presenting
      ? {
          yaw: this.view.yaw,
          pitch: this.view.pitch,
          fov: this.view.fov
        }
      : this.getCompensatedView();

    if (frameState.presenting) {
      return;
    }

    for (const listener of this.listeners) {
      listener(view);
    }
  }

  syncPresentationUi(presenting) {
    if (this.uiState.presenting === presenting) {
      return;
    }

    this.uiState.presenting = presenting;
    this.stage.classList.toggle("is-presenting-xr", presenting);
    this.enterButton.textContent = presenting ? "Exit immersive VR" : "Enter immersive VR";
    this.eyeRow.hidden = presenting;
    this.reticle.hidden = presenting;
    this.caption.hidden = presenting;
  }

  destroy() {
    this.listeners.clear();
    this.unsubscribeFrame?.();
    this.inputRig.destroy();
    this.hotspotLayer3D.destroy();
    this.panoramaRenderer.destroy();
    this.stage.remove();
  }
}

function wrapDegrees(value) {
  return ((value % 360) + 360) % 360;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}