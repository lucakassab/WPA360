import * as THREE from "../../../vendor/three/three.module.js";
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
    this.appliedSceneYaw = 0;
    this.runtimeYawOffset = 0;
    this.lastSceneId = null;
    this.lastSceneSrc = "";
    this.listeners = new Set();
    this.loadingState = {
      visible: false,
      title: "Carregando panorama...",
      detail: ""
    };
    this.loadingVectors = {
      cameraPosition: new THREE.Vector3(),
      cameraDirection: new THREE.Vector3(),
      verticalOffset: new THREE.Vector3(),
      targetPosition: new THREE.Vector3()
    };

    this.stage = document.createElement("div");
    this.stage.className = "vr-stage";
    this.stage.setAttribute("aria-label", "VR virtual tour viewport");

    this.viewport = document.createElement("div");
    this.viewport.className = "vr-panorama";
    this.viewport.setAttribute("aria-hidden", "true");
    this.panoramaRenderer = new ThreePanoramaRenderer({
      root: this.viewport,
      assetCache: this.assetCache,
      xrDebug: this.context.xrDebug,
      previewMode: "stereo",
      xrEnabled: true
    });

    this.hotspotLayer3D = new ThreeHotspotLayer({
      contentRoot: this.panoramaRenderer.getContentRoot(),
      assetCache: this.assetCache
    });

    this.inputRig = new VRInputRig({
      panoramaRenderer: this.panoramaRenderer,
      hotspotLayer: this.hotspotLayer3D,
      context: {
        ...this.context,
        requestVrSnapTurn: (direction, options) => this.requestSnapTurn(direction, options)
      }
    });

    this.hud = document.createElement("div");
    this.hud.className = "vr-hud";

    this.enterButton = document.createElement("button");
    this.enterButton.type = "button";
    this.enterButton.textContent = "Entrar no VR imersivo";
    this.enterButton.title = "Inicia uma sessao WebXR imersiva quando o dispositivo for compativel.";
    this.enterButton.setAttribute("aria-label", "Entrar no VR imersivo");

    this.resetButton = document.createElement("button");
    this.resetButton.type = "button";
    this.resetButton.textContent = "Recentrar lock espacial";
    this.resetButton.title = "Recalibra o travamento espacial e recentra a experiencia em relacao ao usuario.";
    this.resetButton.setAttribute("aria-label", "Recentrar travamento espacial");

    this.orientationButton = document.createElement("button");
    this.orientationButton.type = "button";
    this.orientationButton.textContent = "Usar orientacao do dispositivo";
    this.orientationButton.title = "Atualiza a visualizacao usando a orientacao detectada pelo dispositivo atual.";
    this.orientationButton.setAttribute("aria-label", "Usar orientacao do dispositivo");

    this.selectButton = document.createElement("button");
    this.selectButton.type = "button";
    this.selectButton.textContent = "Selecionar alvo";
    this.selectButton.title = "Confirma a selecao do hotspot ou alvo atualmente destacado.";
    this.selectButton.setAttribute("aria-label", "Selecionar alvo atual");

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

    this.loadingOverlay = document.createElement("div");
    this.loadingOverlay.className = "vr-loading-overlay";
    this.loadingOverlay.hidden = true;

    this.loadingCard = document.createElement("div");
    this.loadingCard.className = "vr-loading-card";
    this.loadingTitle = document.createElement("strong");
    this.loadingDetail = document.createElement("span");
    this.loadingCard.append(this.loadingTitle, this.loadingDetail);
    this.loadingOverlay.append(this.loadingCard);

    this.loadingCanvas = document.createElement("canvas");
    this.loadingCanvas.width = 1024;
    this.loadingCanvas.height = 256;
    this.loadingTexture = new THREE.CanvasTexture(this.loadingCanvas);
    this.loadingTexture.generateMipmaps = false;
    this.loadingTexture.minFilter = THREE.LinearFilter;
    this.loadingTexture.magFilter = THREE.LinearFilter;
    const loadingMaterial = new THREE.SpriteMaterial({
      map: this.loadingTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false
    });
    this.loadingSprite = new THREE.Sprite(loadingMaterial);
    this.loadingSprite.scale.set(1.8, 0.45, 1);
    this.loadingSprite.position.set(0, -0.02, -1.6);
    this.loadingSprite.renderOrder = 10000;
    this.loadingSprite.visible = false;
    this.panoramaRenderer.getTrackedInputRoot().add(this.loadingSprite);

    this.stage.append(this.viewport, this.eyeRow, this.hud, this.reticle, this.caption, this.loadingOverlay);
    this.root.append(this.stage);

    this.uiState = {
      presenting: null
    };
    this.xrFrameLogCounter = 0;
    this.lastLoadingVisualState = {
      visible: false,
      presenting: false
    };
    this.pendingOverlayVisibilityAudit = null;

    this.unsubscribeFrame = this.panoramaRenderer.onFrame((frameState) => this.handleFrame(frameState));
    this.unsubscribeSceneStatus = this.panoramaRenderer.onSceneStatusChange((event) => this.handlePanoramaSceneStatus(event));
    this.updateLoadingPresentation();
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

  async showScene(scene, tour, options = {}) {
    const { userInitiated = false } = options;
    const immersiveRequest = userInitiated
      ? this.enterImmersive({ userInitiated: true })
      : null;
    const nextSceneId = scene?.id ?? null;
    const nextSceneSrc = scene?.media?.src ?? "";
    const shouldPreserveView =
      Boolean(nextSceneId)
      && nextSceneId === this.lastSceneId
      && nextSceneSrc === this.lastSceneSrc;
    const hasExplicitEntryYaw = Number.isFinite(Number(options?.entryYaw));
    const preserveOrientation = options?.preserveOrientation === true
      || (!hasExplicitEntryYaw && options?.preserveOrientation == null && scene?.scene_global_yaw === false);
    const nextSceneYaw = hasExplicitEntryYaw
      ? Number(options.entryYaw)
      : (scene?.scene_global_yaw !== false ? Number(scene?.rotation?.yaw ?? 0) : 0);

    if (!shouldPreserveView) {
      this.view.fov = 96;
      if (preserveOrientation) {
        const effectiveYaw = wrapDegrees(this.view.yaw + this.appliedSceneYaw + this.runtimeYawOffset);
        this.view.yaw = wrapDegrees(effectiveYaw - nextSceneYaw - this.runtimeYawOffset);
      } else {
        this.view.yaw = 0;
        this.view.pitch = 0;
        this.runtimeYawOffset = 0;
      }
    }

    const sceneTransition = await this.panoramaRenderer.setScene(scene, {
      eye: scene.media?.mono_eye ?? "left",
      entryYawOverride: hasExplicitEntryYaw ? nextSceneYaw : null
    });
    this.appliedSceneYaw = nextSceneYaw;
    this.lastSceneId = nextSceneId;
    this.lastSceneSrc = nextSceneSrc;
    this.hotspotLayer3D.setHotspots(scene.hotspots ?? []);

    this.caption.innerHTML = "";
    const title = document.createElement("h2");
    title.textContent = `${scene.title ?? scene.id} / VR`;
    const help = document.createElement("p");
    help.textContent = "Ao trocar para VR, o app tenta iniciar o modo imersivo primeiro. Se nao for possivel, o preview estereo continua ativo na pagina.";
    this.caption.append(title, help);

    this.applyView();

    if (immersiveRequest) {
      await immersiveRequest;
    }

    return sceneTransition;
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

  requestSnapTurn(direction = 1, { degrees = 30 } = {}) {
    const safeDegrees = Math.max(5, Number(degrees) || 30);
    const step = direction >= 0 ? safeDegrees : -safeDegrees;
    this.runtimeYawOffset = wrapDegrees(this.runtimeYawOffset + step);
    this.panoramaRenderer.setRuntimeRotationOffset({ yaw: this.runtimeYawOffset });
    this.context.setStatus?.(
      step > 0 ? `Snap turn: ${safeDegrees} graus para a direita.` : `Snap turn: ${safeDegrees} graus para a esquerda.`,
      { hideAfterMs: 900 }
    );
    return this.runtimeYawOffset;
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

  getRenderResourceStats() {
    return this.panoramaRenderer.getRenderResourceStats();
  }

  async preloadSceneTextures(scenes = []) {
    return this.panoramaRenderer.preloadSceneTextures(scenes);
  }

  waitForScenePresentation(transitionId) {
    return this.panoramaRenderer.waitForScenePresentation(transitionId);
  }

  getCurrentSceneTransition() {
    return this.panoramaRenderer.getCurrentSceneTransition();
  }

  getLoadingDebugState() {
    return {
      ...this.loadingState
    };
  }

  setLoadingState({ visible = false, title = "Carregando panorama...", detail = "" } = {}) {
    const previousState = { ...this.loadingState };
    this.loadingState = {
      visible,
      title,
      detail
    };
    this.loadingTitle.textContent = title;
    this.loadingDetail.textContent = detail || "Aguarde enquanto a imagem 360 e preparada.";
    this.redrawLoadingCanvas();
    this.updateLoadingPresentation();
    this.panoramaRenderer.requestRender?.("vr-loading-state");
    this.context.xrDebug?.log("loading-ui-state-change", {
      transitionId: this.getCurrentSceneTransition()?.transitionId ?? null,
      sceneId: this.getCurrentSceneTransition()?.sceneId ?? null,
      src: this.getCurrentSceneTransition()?.src ?? null,
      overlayVisible: visible,
      details: {
        previousVisible: previousState.visible === true,
        nextVisible: visible === true,
        title,
        detail
      }
    });
    if (previousState.visible !== visible) {
      this.context.xrDebug?.log(visible ? "loading-ui-show" : "loading-ui-hide", {
        transitionId: this.getCurrentSceneTransition()?.transitionId ?? null,
        sceneId: this.getCurrentSceneTransition()?.sceneId ?? null,
        src: this.getCurrentSceneTransition()?.src ?? null,
        overlayVisible: visible,
        details: {
          title,
          detail
        }
      });
    }
  }

  async flushLoadingUi() {
    const presenting = this.isPresenting();
    const frameCount = presenting ? 2 : 1;
    this.context.xrDebug?.log("loading-ui-flush-start", {
      transitionId: this.getCurrentSceneTransition()?.transitionId ?? null,
      sceneId: this.getCurrentSceneTransition()?.sceneId ?? null,
      src: this.getCurrentSceneTransition()?.src ?? null,
      overlayVisible: this.loadingState.visible === true,
      details: {
        presenting,
        frameCount
      }
    });
    await this.panoramaRenderer.flushVisualUpdate({
      frames: frameCount,
      reason: "loading-ui-flush"
    });
    if (!presenting) {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }
    this.context.xrDebug?.log("loading-ui-flush-complete", {
      transitionId: this.getCurrentSceneTransition()?.transitionId ?? null,
      sceneId: this.getCurrentSceneTransition()?.sceneId ?? null,
      src: this.getCurrentSceneTransition()?.src ?? null,
      overlayVisible: this.loadingState.visible === true,
      details: {
        presenting,
        frameCount
      }
    });
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
    this.inputRig.update(frameState);
    this.hotspotLayer3D.setVisible(frameState.presenting && this.inputRig.shouldShowHotspots());
    this.hotspotLayer3D.update(frameState.camera);
    this.syncPresentationUi(frameState.presenting);
    this.updateLoadingPresentation(frameState);
    this.logXrFrame(frameState);
    this.auditOverlayAfterPresentation(frameState);

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
    this.updateLoadingPresentation();
  }

  destroy() {
    this.listeners.clear();
    this.unsubscribeFrame?.();
    this.unsubscribeSceneStatus?.();
    this.inputRig.destroy();
    this.hotspotLayer3D.destroy();
    this.loadingSprite.parent?.remove?.(this.loadingSprite);
    this.loadingSprite.material?.map?.dispose?.();
    this.loadingSprite.material?.dispose?.();
    this.panoramaRenderer.destroy();
    this.stage.remove();
  }

  updateLoadingPresentation(frameState = null) {
    const visible = this.loadingState.visible === true;
    const presenting = this.isPresenting();

    this.loadingOverlay.hidden = !visible || presenting;
    this.loadingOverlay.classList.toggle("is-visible", visible && !presenting);
    this.loadingSprite.visible = visible && presenting;
    if (
      this.lastLoadingVisualState.visible !== visible
      || this.lastLoadingVisualState.presenting !== presenting
    ) {
      this.context.xrDebug?.log("loading-ui-frame-sync", {
        transitionId: this.getCurrentSceneTransition()?.transitionId ?? null,
        sceneId: this.getCurrentSceneTransition()?.sceneId ?? null,
        src: this.getCurrentSceneTransition()?.src ?? null,
        overlayVisible: visible,
        details: {
          presenting,
          domHidden: this.loadingOverlay.hidden,
          spriteVisible: this.loadingSprite.visible
        }
      });
      this.lastLoadingVisualState = { visible, presenting };
    }
    if (visible && presenting && frameState?.camera) {
      this.updateImmersiveLoadingPose(frameState.camera);
    }
  }

  handlePanoramaSceneStatus(event = {}) {
    this.context.debugLog?.("vr:panorama-scene-status", {
      state: event.state ?? null,
      transitionId: event.transitionId ?? null,
      sceneId: event.sceneId ?? null,
      src: event.src ?? null,
      frameSource: event.frameSource ?? null,
      presenting: this.isPresenting()
    });

    if (event.state === "loading-start") {
      this.setLoadingState({
        visible: true,
        title: "Carregando panorama...",
        detail: event.sceneId ?? "Preparando cena"
      });
      return;
    }

    if (
      event.state === "scene-presented"
      || event.state === "scene-missing-texture"
      || event.state === "scene-cleared"
    ) {
      if (event.state === "scene-presented") {
        this.pendingOverlayVisibilityAudit = {
          transitionId: event.transitionId ?? null,
          sceneId: event.sceneId ?? null,
          src: event.src ?? null,
          frameSource: event.frameSource ?? null
        };
      }
      this.setLoadingState({ visible: false });
    }
  }

  logXrFrame(frameState) {
    if (!frameState?.presenting) {
      return;
    }

    const transition = this.getCurrentSceneTransition();
    if (!transition?.transitionId) {
      return;
    }

    this.xrFrameLogCounter += 1;
    this.context.xrDebug?.log("xr-frame", {
      transitionId: transition.transitionId,
      sceneId: transition.sceneId ?? null,
      src: transition.src ?? null,
      overlayVisible: this.loadingState.visible === true,
      details: {
        frameIndex: this.xrFrameLogCounter,
        cameraReady: Boolean(frameState.camera),
        loadingVisible: this.loadingState.visible === true
      }
    });
  }

  auditOverlayAfterPresentation(frameState) {
    if (!frameState?.presenting || !this.pendingOverlayVisibilityAudit) {
      return;
    }

    this.context.xrDebug?.log("loading-ui-frame-sync", {
      transitionId: this.pendingOverlayVisibilityAudit.transitionId,
      sceneId: this.pendingOverlayVisibilityAudit.sceneId,
      src: this.pendingOverlayVisibilityAudit.src,
      overlayVisible: this.loadingState.visible === true,
      details: {
        reason: "post-scene-presented-audit",
        frameSource: this.pendingOverlayVisibilityAudit.frameSource ?? null,
        loadingVisible: this.loadingState.visible === true,
        spriteVisible: this.loadingSprite.visible === true
      }
    });

    if (this.loadingState.visible === true) {
      this.context.xrDebug?.log("loading-ui-still-visible-after-scene-presented", {
        transitionId: this.pendingOverlayVisibilityAudit.transitionId,
        sceneId: this.pendingOverlayVisibilityAudit.sceneId,
        src: this.pendingOverlayVisibilityAudit.src,
        overlayVisible: true,
        details: {
          frameSource: this.pendingOverlayVisibilityAudit.frameSource ?? null
        }
      });
    }

    this.pendingOverlayVisibilityAudit = null;
  }

  updateImmersiveLoadingPose(camera) {
    const vectors = this.loadingVectors;
    camera.getWorldPosition(vectors.cameraPosition);
    camera.getWorldDirection(vectors.cameraDirection);
    vectors.verticalOffset.set(0, -0.12, 0);
    vectors.targetPosition
      .copy(vectors.cameraPosition)
      .addScaledVector(vectors.cameraDirection, 1.6)
      .add(vectors.verticalOffset);
    this.loadingSprite.position.copy(vectors.targetPosition);
    this.loadingSprite.quaternion.copy(camera.quaternion);
  }

  redrawLoadingCanvas() {
    const canvas = this.loadingCanvas;
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    drawRoundedRect(context, 0, 0, canvas.width, canvas.height, 44, "rgba(7, 17, 22, 0.88)");
    drawRoundedRect(context, 18, 18, canvas.width - 36, canvas.height - 36, 34, "rgba(240, 168, 93, 0.14)");
    context.fillStyle = "#f6f0e6";
    context.font = "700 64px 'Segoe UI', sans-serif";
    context.fillText(this.loadingState.title || "Carregando panorama...", 68, 108);
    context.fillStyle = "rgba(246, 240, 230, 0.82)";
    context.font = "400 38px 'Segoe UI', sans-serif";
    context.fillText(this.loadingState.detail || "Aguarde enquanto a imagem 360 e preparada.", 68, 170);
    context.fillStyle = "#f0a85d";
    context.font = "700 30px 'Segoe UI', sans-serif";
    context.fillText("Processando imagem 360 para VR", 68, 220);
    this.loadingTexture.needsUpdate = true;
  }
}

function wrapDegrees(value) {
  return ((value % 360) + 360) % 360;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function drawRoundedRect(context, x, y, width, height, radius, fillStyle) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.arcTo(x + width, y, x + width, y + height, safeRadius);
  context.arcTo(x + width, y + height, x, y + height, safeRadius);
  context.arcTo(x, y + height, x, y, safeRadius);
  context.arcTo(x, y, x + width, y, safeRadius);
  context.closePath();
  context.fillStyle = fillStyle;
  context.fill();
}
