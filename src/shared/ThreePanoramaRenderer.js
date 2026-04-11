import * as THREE from "../../vendor/three/three.module.js";

const DEFAULT_VIEW = {
  yaw: 0,
  pitch: 0,
  fov: 86
};

export class ThreePanoramaRenderer {
  constructor({
    root,
    assetCache,
    previewMode = "mono",
    xrEnabled = false
  }) {
    this.root = root;
    this.assetCache = assetCache;
    this.previewMode = previewMode;
    this.xrEnabled = xrEnabled;
    this.listeners = new Set();
    this.textureCache = new Map();
    this.view = { ...DEFAULT_VIEW };
    this.baseRotation = { yaw: 0, pitch: 0, roll: 0 };
    this.contentOffset = new THREE.Vector3();
    this.renderStats = {
      mode: "idle",
      frameCount: 0,
      lastFrameTimeMs: 0,
      lastFrameSource: "none"
    };
    this.tempVectors = {
      worldPosition: new THREE.Vector3(),
      cameraPosition: new THREE.Vector3(),
      cameraDirection: new THREE.Vector3(),
      toWorldPosition: new THREE.Vector3(),
      unprojectPoint: new THREE.Vector3(),
      headPosition: new THREE.Vector3(),
      scenePosition: new THREE.Vector3()
    };

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#102a31");

    this.contentRoot = new THREE.Group();
    this.contentRoot.rotation.order = "YXZ";
    this.scene.add(this.contentRoot);

    this.trackedInputRoot = new THREE.Group();
    this.trackedInputRoot.name = "wpa360-tracked-input-root";
    this.scene.add(this.trackedInputRoot);

    this.camera = new THREE.PerspectiveCamera(this.view.fov, 1, 0.1, 2000);
    this.camera.rotation.order = "YXZ";
    this.scene.add(this.camera);

    this.stereoCamera = new THREE.StereoCamera();
    this.stereoCamera.aspect = 0.5;
    this.cameraStateVersion = 0;
    this.stereoCameraVersion = -1;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance"
    });
    this.renderer.xr.enabled = xrEnabled;
    this.renderer.xr.setReferenceSpaceType?.("local");
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, xrEnabled ? 1.25 : 1.5));
    this.renderer.domElement.className = "three-panorama-canvas";
    this.root.append(this.renderer.domElement);

    if ("outputColorSpace" in this.renderer && THREE.SRGBColorSpace) {
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    }

    this.geometry = new THREE.SphereGeometry(500, 96, 64);
    this.material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.BackSide,
      depthWrite: false
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.onBeforeRender = (_renderer, _scene, camera) => {
      this.applyTextureCrop(camera);
    };
    this.contentRoot.add(this.mesh);

    this.handleSessionEnd = this.handleSessionEnd.bind(this);
    this.handleAnimationFrame = this.handleAnimationFrame.bind(this);
    this.handleXRAnimationFrame = this.handleXRAnimationFrame.bind(this);
    this.onWindowResize = this.onWindowResize.bind(this);

    this.resizeObserver = typeof ResizeObserver === "function"
      ? new ResizeObserver(() => this.onResizeObserved())
      : null;
    this.resizeObserver?.observe(this.root);
    window.addEventListener("resize", this.onWindowResize);
    this.resizeIfNeeded(true);
    this.requestRender("init");
  }

  async setScene(scene, { eye = "left" } = {}) {
    this.activeScene = scene ?? null;
    this.stereoLayout = normalizeStereoLayout(scene?.media?.stereo_layout);
    this.eyeOrder = normalizeEyeOrder(scene?.media?.eye_order);
    this.monoEye = eye || scene?.media?.mono_eye || "left";
    this.baseRotation = {
      yaw: Number(scene?.rotation?.yaw ?? 0),
      pitch: Number(scene?.rotation?.pitch ?? 0),
      roll: Number(scene?.rotation?.roll ?? 0)
    };
    this.applyContentTransform();

    const src = scene?.media_available === false ? "" : scene?.media?.src ?? "";
    if (!src) {
      this.setTexture(null);
      this.root.classList.add("is-empty");
      this.requestRender("scene-cleared");
      return;
    }

    const token = Symbol(src);
    this.pendingTextureToken = token;
    const loadedAsset = await this.assetCache.loadImage(src, { optional: true });
    if (this.pendingTextureToken !== token) {
      return;
    }

    if (!loadedAsset) {
      this.setTexture(null);
      this.root.classList.add("is-empty");
      this.requestRender("scene-missing-texture");
      return;
    }

    this.root.classList.remove("is-empty");
    this.setTexture(this.getOrCreateTexture(loadedAsset));
    this.requestRender("scene-texture-ready");
  }

  render({ yaw = 0, pitch = 0, fov = 86 } = {}) {
    this.view = {
      yaw: Number(yaw) || 0,
      pitch: Number(pitch) || 0,
      fov: Number(fov) || DEFAULT_VIEW.fov
    };
    this.applyManualCameraView();
    this.requestRender("view-change");
  }

  setPreviewMode(previewMode = "mono") {
    const nextMode = previewMode === "stereo" ? "stereo" : "mono";
    if (nextMode === this.previewMode) {
      return;
    }
    this.previewMode = nextMode;
    this.requestRender("preview-mode-change");
  }

  setContentCompensation(offset = { x: 0, y: 0, z: 0 }) {
    const nextX = Number(offset?.x ?? 0);
    const nextY = Number(offset?.y ?? 0);
    const nextZ = Number(offset?.z ?? 0);

    if (
      this.contentOffset.x === nextX
      && this.contentOffset.y === nextY
      && this.contentOffset.z === nextZ
    ) {
      return;
    }

    this.contentOffset.set(nextX, nextY, nextZ);
    this.applyContentTransform();
    this.contentRoot.updateMatrixWorld(true);

    if (!this.isPresenting()) {
      this.requestRender("content-compensation");
    }
  }

  onFrame(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getPerformanceSnapshot() {
    return {
      ...this.renderStats,
      presenting: this.isPresenting(),
      previewMode: this.previewMode,
      queuedNonXrFrame: Boolean(this.rafHandle)
    };
  }

  projectWorldToScreen(position, viewport = this.root, eye = "center") {
    const rect = viewport.getBoundingClientRect();
    const camera = this.getCameraForEye(eye);

    if (!camera || rect.width <= 0 || rect.height <= 0) {
      return hiddenProjection(rect);
    }

    this.scene.updateMatrixWorld(true);
    camera.updateMatrixWorld?.(true);
    camera.updateProjectionMatrix?.();

    const worldPosition = this.sceneToWorld(position, this.tempVectors.worldPosition);
    const cameraPosition = this.tempVectors.cameraPosition;
    const cameraDirection = this.tempVectors.cameraDirection;
    const toWorldPosition = this.tempVectors.toWorldPosition;

    camera.getWorldPosition(cameraPosition);
    camera.getWorldDirection(cameraDirection);
    toWorldPosition.copy(worldPosition).sub(cameraPosition);

    const projected = worldPosition.clone().project(camera);
    const inFrontOfCamera = cameraDirection.dot(toWorldPosition) > 0;
    const visible = inFrontOfCamera
      && Number.isFinite(projected.x)
      && Number.isFinite(projected.y)
      && Number.isFinite(projected.z)
      && projected.z >= -1
      && projected.z <= 1
      && projected.x >= -1
      && projected.x <= 1
      && projected.y >= -1
      && projected.y <= 1;

    return {
      visible,
      x: (projected.x + 1) * 0.5 * rect.width,
      y: (1 - projected.y) * 0.5 * rect.height,
      depth: worldPosition.distanceTo(cameraPosition)
    };
  }

  screenToWorld({ clientX, clientY }, viewport = this.root, depth = 8, eye = "center") {
    const rect = viewport.getBoundingClientRect();
    const camera = this.getCameraForEye(eye);

    if (!camera || rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    this.scene.updateMatrixWorld(true);
    camera.updateMatrixWorld?.(true);
    camera.updateProjectionMatrix?.();

    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((clientY - rect.top) / rect.height) * 2 - 1);
    const cameraPosition = this.tempVectors.cameraPosition;
    const worldPoint = this.tempVectors.unprojectPoint.set(x, y, 0.5).unproject(camera);
    camera.getWorldPosition(cameraPosition);

    const direction = worldPoint.sub(cameraPosition).normalize();
    const safeDepth = Math.max(0.1, Number(depth) || 8);
    const worldPosition = worldPoint.copy(cameraPosition).add(direction.multiplyScalar(safeDepth));
    const scenePosition = this.worldToScene(worldPosition, this.tempVectors.scenePosition);

    return {
      x: scenePosition.x,
      y: scenePosition.y,
      z: scenePosition.z,
      depth: safeDepth
    };
  }

  sceneToWorld(position, target = new THREE.Vector3()) {
    target.set(
      Number(position?.x ?? 0),
      Number(position?.y ?? 0),
      Number(position?.z ?? -8)
    );
    return this.contentRoot.localToWorld(target);
  }

  worldToScene(position, target = new THREE.Vector3()) {
    target.copy(position);
    return this.contentRoot.worldToLocal(target);
  }

  getContentRoot() {
    return this.contentRoot;
  }

  getTrackedInputRoot() {
    return this.trackedInputRoot;
  }

  getXRController(index = 0) {
    return this.renderer.xr.getController(index);
  }

  getXRControllerGrip(index = 0) {
    return this.renderer.xr.getControllerGrip(index);
  }

  getXRHand(index = 0) {
    return this.renderer.xr.getHand(index);
  }

  getHeadPosition() {
    const camera = this.getCameraForEye("center");
    if (!camera) {
      return { x: 0, y: 0, z: 0 };
    }

    camera.getWorldPosition(this.tempVectors.headPosition);
    return {
      x: this.tempVectors.headPosition.x,
      y: this.tempVectors.headPosition.y,
      z: this.tempVectors.headPosition.z
    };
  }

  getCameraForEye(eye = "center") {
    if (this.renderer.xr.isPresenting) {
      const xrCamera = this.renderer.xr.getCamera(this.camera);
      if (xrCamera?.isArrayCamera) {
        const cameras = xrCamera.cameras ?? [];
        if (eye === "right") {
          return cameras[1] ?? cameras[0] ?? this.camera;
        }
        if (eye === "left") {
          return cameras[0] ?? this.camera;
        }
        return xrCamera;
      }
      return xrCamera ?? this.camera;
    }

    this.syncStereoCamera();

    if (this.previewMode === "stereo") {
      if (eye === "left") {
        return this.stereoCamera.cameraL;
      }
      if (eye === "right") {
        return this.stereoCamera.cameraR;
      }
    }

    return this.camera;
  }

  isPresenting() {
    return this.renderer.xr.isPresenting === true;
  }

  async enterImmersive({ userInitiated = false } = {}) {
    if (!this.xrEnabled || this.isPresenting()) {
      return {
        status: this.isPresenting() ? "already-presenting" : "xr-disabled"
      };
    }

    if (!navigator.xr?.requestSession) {
      return { status: "unsupported" };
    }

    if (!userInitiated) {
      const supported = await this.getImmersiveSupport();
      if (!supported) {
        return { status: "unsupported" };
      }
      return { status: "available-but-not-started" };
    }

    try {
      const session = await navigator.xr.requestSession("immersive-vr", {
        optionalFeatures: ["local-floor", "bounded-floor", "hand-tracking"]
      });
      session.addEventListener("end", this.handleSessionEnd);
      this.xrSession = session;
      this.stopNonXrLoop();
      await this.renderer.xr.setSession(session);
      this.startXrLoop();
      return { status: "started" };
    } catch (error) {
      return {
        status: "error",
        error
      };
    }
  }

  async exitImmersive() {
    if (!this.xrSession) {
      return;
    }

    const session = this.xrSession;
    session.removeEventListener?.("end", this.handleSessionEnd);
    this.xrSession = null;
    await session.end();
    this.stopXrLoop();
    this.requestRender("xr-exit");
  }

  async getImmersiveSupport() {
    if (!this.xrSupportPromise) {
      if (!navigator.xr?.isSessionSupported) {
        this.xrSupportPromise = Promise.resolve(false);
      } else {
        this.xrSupportPromise = navigator.xr.isSessionSupported("immersive-vr")
          .catch(() => false);
      }
    }
    return this.xrSupportPromise;
  }

  destroy() {
    this.stopNonXrLoop();
    this.stopXrLoop();
    this.resizeObserver?.disconnect();
    window.removeEventListener("resize", this.onWindowResize);
    this.xrSession?.removeEventListener?.("end", this.handleSessionEnd);
    this.xrSession?.end?.().catch?.(() => {});
    this.xrSession = null;

    for (const texture of this.textureCache.values()) {
      texture.dispose();
    }
    this.textureCache.clear();
    this.listeners.clear();
    this.pendingTextureToken = null;

    this.material.map = null;
    this.material.dispose();
    this.geometry.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  requestRender(reason = "update") {
    if (this.isPresenting()) {
      this.renderStats.lastFrameSource = `xr:${reason}`;
      return;
    }

    if (this.rafHandle) {
      this.renderStats.lastFrameSource = `queued:${reason}`;
      return;
    }

    this.renderStats.mode = "raf";
    this.renderStats.lastFrameSource = `raf:${reason}`;
    this.rafHandle = window.requestAnimationFrame(this.handleAnimationFrame);
  }

  handleAnimationFrame(timestamp) {
    this.rafHandle = 0;
    this.renderFrame({ timestamp, frame: null, source: "raf" });
  }

  handleXRAnimationFrame(timestamp, frame) {
    this.renderFrame({ timestamp, frame, source: "xr" });
  }

  renderFrame({ timestamp, frame, source }) {
    const frameStart = performance.now();
    this.resizeIfNeeded();
    this.applyManualCameraView();
    this.applyContentTransform();
    this.scene.updateMatrixWorld(true);

    const frameState = this.createFrameState(frame, source);
    for (const listener of this.listeners) {
      listener(frameState);
    }

    this.applyContentTransform();
    this.scene.updateMatrixWorld(true);

    if (this.isPresenting()) {
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, this.renderWidth, this.renderHeight);
      this.renderer.render(this.scene, this.camera);
    } else if (this.previewMode === "stereo") {
      this.renderStereoPreview();
    } else {
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, this.renderWidth, this.renderHeight);
      this.renderer.render(this.scene, this.camera);
    }

    this.renderStats.mode = this.isPresenting() ? "xr" : "idle";
    this.renderStats.frameCount += 1;
    this.renderStats.lastFrameTimeMs = performance.now() - frameStart;
    this.renderStats.lastTimestamp = timestamp;
    this.renderStats.lastFrameSource = source;
  }

  createFrameState(frame, source) {
    return {
      frame,
      source,
      presenting: this.isPresenting(),
      camera: this.getCameraForEye("center"),
      leftCamera: this.getCameraForEye("left"),
      rightCamera: this.getCameraForEye("right"),
      headPosition: this.getHeadPosition(),
      renderer: this.renderer,
      performance: this.getPerformanceSnapshot()
    };
  }

  renderStereoPreview() {
    this.syncStereoCamera();
    const width = this.renderWidth;
    const height = this.renderHeight;
    const halfWidth = Math.max(1, Math.floor(width / 2));

    this.renderer.setScissorTest(true);
    this.renderer.setViewport(0, 0, halfWidth, height);
    this.renderer.setScissor(0, 0, halfWidth, height);
    this.renderer.render(this.scene, this.stereoCamera.cameraL);

    this.renderer.setViewport(halfWidth, 0, width - halfWidth, height);
    this.renderer.setScissor(halfWidth, 0, width - halfWidth, height);
    this.renderer.render(this.scene, this.stereoCamera.cameraR);
    this.renderer.setScissorTest(false);
  }

  applyManualCameraView() {
    if (this.isPresenting()) {
      return;
    }

    this.camera.rotation.set(
      THREE.MathUtils.degToRad(this.view.pitch),
      THREE.MathUtils.degToRad(this.view.yaw),
      0,
      "YXZ"
    );
    this.camera.fov = this.view.fov;
    this.camera.updateProjectionMatrix();
    this.bumpCameraStateVersion();
  }

  applyContentTransform() {
    this.contentRoot.position.copy(this.contentOffset);
    this.contentRoot.rotation.set(
      THREE.MathUtils.degToRad(-this.baseRotation.pitch),
      THREE.MathUtils.degToRad(-this.baseRotation.yaw),
      THREE.MathUtils.degToRad(-this.baseRotation.roll),
      "YXZ"
    );
  }

  applyTextureCrop(camera) {
    const texture = this.material.map;
    if (!texture) {
      return;
    }

    const requestedEye = camera ? detectRenderEye(camera, this.stereoCamera) : this.monoEye;
    const cropKey = `${this.stereoLayout}:${this.eyeOrder}:${requestedEye}`;
    if (texture.userData.wpa360CropKey === cropKey) {
      return;
    }

    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;

    if (this.stereoLayout !== "top-bottom") {
      texture.repeat.set(1, 1);
      texture.offset.set(0, 0);
    } else {
      const useTopHalf = shouldUseTopHalf(requestedEye, this.eyeOrder);
      texture.repeat.set(1, 0.5);
      texture.offset.set(0, useTopHalf ? 0.5 : 0);
    }

    texture.updateMatrix();
    texture.userData.wpa360CropKey = cropKey;
  }

  setTexture(texture) {
    this.material.map = texture;
    this.material.color.set(texture ? "#ffffff" : "#102a31");

    if (texture) {
      texture.userData.wpa360CropKey = null;
      this.applyTextureCrop(this.getCameraForEye("center"));
    }

    this.material.needsUpdate = true;
  }

  getOrCreateTexture(loadedAsset) {
    if (!this.textureCache.has(loadedAsset.src)) {
      const texture = new THREE.Texture(loadedAsset.image);
      texture.needsUpdate = true;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = true;
      texture.matrixAutoUpdate = false;
      if ("colorSpace" in texture && THREE.SRGBColorSpace) {
        texture.colorSpace = THREE.SRGBColorSpace;
      } else if ("encoding" in texture && THREE.sRGBEncoding) {
        texture.encoding = THREE.sRGBEncoding;
      }
      this.textureCache.set(loadedAsset.src, texture);
    }

    return this.textureCache.get(loadedAsset.src);
  }

  resizeIfNeeded(force = false) {
    const width = Math.max(1, Math.floor(this.root.clientWidth || this.root.getBoundingClientRect().width || 1));
    const height = Math.max(1, Math.floor(this.root.clientHeight || this.root.getBoundingClientRect().height || 1));
    if (!force && width === this.renderWidth && height === this.renderHeight) {
      return false;
    }

    this.renderWidth = width;
    this.renderHeight = height;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.bumpCameraStateVersion();
    return true;
  }

  syncStereoCamera() {
    if (this.previewMode !== "stereo" || this.isPresenting()) {
      return;
    }

    if (this.stereoCameraVersion === this.cameraStateVersion) {
      return;
    }

    this.stereoCamera.update(this.camera);
    this.stereoCameraVersion = this.cameraStateVersion;
  }

  bumpCameraStateVersion() {
    this.cameraStateVersion += 1;
  }

  onResizeObserved() {
    if (this.resizeIfNeeded(true)) {
      this.requestRender("resize-observer");
    }
  }

  onWindowResize() {
    if (this.resizeIfNeeded(true)) {
      this.requestRender("window-resize");
    }
  }

  startXrLoop() {
    if (this.xrLoopActive) {
      return;
    }

    this.xrLoopActive = true;
    this.renderStats.mode = "xr";
    this.renderer.setAnimationLoop(this.handleXRAnimationFrame);
  }

  stopXrLoop() {
    if (!this.xrLoopActive) {
      return;
    }

    this.xrLoopActive = false;
    this.renderer.setAnimationLoop(null);
    this.renderStats.mode = "idle";
  }

  stopNonXrLoop() {
    if (!this.rafHandle) {
      return;
    }

    window.cancelAnimationFrame(this.rafHandle);
    this.rafHandle = 0;
    this.renderStats.mode = "idle";
  }

  handleSessionEnd() {
    this.xrSession?.removeEventListener?.("end", this.handleSessionEnd);
    this.xrSession = null;
    this.stopXrLoop();
    this.requestRender("xr-session-ended");
  }
}

function normalizeStereoLayout(layout) {
  if (layout === "top-bottom" || layout === "topdown" || layout === "top-down") {
    return "top-bottom";
  }
  return "mono";
}

function normalizeEyeOrder(order) {
  return order === "right-left" ? "right-left" : "left-right";
}

function shouldUseTopHalf(eye, eyeOrder) {
  return eyeOrder === "right-left"
    ? eye === "right"
    : eye !== "right";
}

function detectRenderEye(camera, stereoCamera) {
  if (camera === stereoCamera.cameraR) {
    return "right";
  }

  if (camera === stereoCamera.cameraL) {
    return "left";
  }

  if (camera?.name && /right|cameraR/i.test(camera.name)) {
    return "right";
  }

  if (camera?.viewport?.x > 0) {
    return "right";
  }

  return "left";
}

function hiddenProjection(rect) {
  return {
    visible: false,
    x: rect.width / 2,
    y: rect.height / 2,
    depth: Number.POSITIVE_INFINITY
  };
}
