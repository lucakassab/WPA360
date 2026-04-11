import * as THREE from "../../../vendor/three/three.module.js";
import { XRControllerModelFactory } from "../../../vendor/three/examples/jsm/webxr/XRControllerModelFactory.js";
import { XRHandModelFactory } from "../../../vendor/three/examples/jsm/webxr/XRHandModelFactory.js";
import { getHotspotLabelText } from "../../shared/HotspotVisualShared.js";
import { VRHandMenu } from "./VRHandMenu.js";

const MAX_RAY_DISTANCE = 24;
const DEFAULT_RETICLE_DISTANCE = 2.4;
const PINCH_SELECT_THRESHOLD = 0.022;
const SELECTION_COOLDOWN_MS = 320;
const MENU_TOUCH_COOLDOWN_MS = 220;
const IDLE_RAY_COLOR = new THREE.Color("#8edee6");
const ACTIVE_RAY_COLOR = new THREE.Color("#fff1bf");
const RETICLE_IDLE_COLOR = new THREE.Color("#d7ecf0");
const RETICLE_ACTIVE_COLOR = new THREE.Color("#f0a85d");
const DEFAULT_RETICLE_PROJECTION_ORIGIN = "right-hand";

export class VRInputRig {
  constructor({ panoramaRenderer, hotspotLayer, context }) {
    this.panoramaRenderer = panoramaRenderer;
    this.hotspotLayer = hotspotLayer;
    this.context = context;
    this.root = panoramaRenderer.getTrackedInputRoot();
    this.root.visible = false;

    this.controllerModelFactory = new XRControllerModelFactory(null, (scene) => {
      applyControllerPresentationMaterial(scene);
    });
    this.controllerModelFactory.setPath(
      new URL("../../../vendor/webxr-input-profiles/profiles/", import.meta.url).href
    );

    this.handModelFactory = new XRHandModelFactory(null, (object) => {
      applySelfLitMaterial(object, "#f4cfa6", 1.15);
    });

    this.reticleProjectionOrigin = this.resolveInitialReticleProjectionOrigin();
    this.highlightedHotspotId = null;
    this.activeAimSource = null;
    this.currentReticleInteraction = null;
    this.activationCooldownUntil = 0;
    this.menuTouchCooldownUntil = 0;
    this.activeMenuTouchActionId = null;

    this.handMenu = new VRHandMenu({
      root: this.root,
      context: this.createHandMenuContext()
    });

    this.temp = {
      headPosition: new THREE.Vector3(),
      reticlePosition: new THREE.Vector3(),
      reticleWorldTarget: new THREE.Vector3(),
      rotationMatrix: new THREE.Matrix4(),
      reticleQuaternion: new THREE.Quaternion(),
      up: new THREE.Vector3(0, 1, 0),

      rayOrigin: new THREE.Vector3(),
      rayDirection: new THREE.Vector3(),

      handWrist: new THREE.Vector3(),
      handIndexMeta: new THREE.Vector3(),
      handPinkyMeta: new THREE.Vector3(),
      handMiddleMeta: new THREE.Vector3(),
      handIndexTip: new THREE.Vector3(),
      handMiddleTip: new THREE.Vector3(),
      handRingTip: new THREE.Vector3(),
      handPinkyTip: new THREE.Vector3(),
      handPalmCenter: new THREE.Vector3(),
      handAverageTips: new THREE.Vector3(),
      handFingerAxis: new THREE.Vector3(),
      rightIndexTipWorld: new THREE.Vector3()
    };

    this.reticleRaycaster = new THREE.Raycaster();

    this.reticle = createReticle();
    this.root.add(this.reticle);

    this.controllers = [0, 1].map((index) => this.createControllerState(index));
  }

  createHandMenuContext() {
    return {
      ...this.context,
      getReticleProjectionOrigin: () => this.getReticleProjectionOrigin(),
      setReticleProjectionOrigin: (value) => this.setReticleProjectionOrigin(value),
      toggleReticleProjectionOrigin: () => this.toggleReticleProjectionOrigin()
    };
  }

  resolveInitialReticleProjectionOrigin() {
    const rawValue = this.context?.store?.getSnapshot?.()?.cfg?.platform?.vr?.reticle_projection_origin;
    return this.normalizeReticleProjectionOrigin(rawValue);
  }

  normalizeReticleProjectionOrigin(value) {
    if (
      value === "right-hand" ||
      value === "rightHand" ||
      value === "hand" ||
      value === "hand-ray" ||
      value === "right-hand-ray"
    ) {
      return "right-hand";
    }

    if (
      value === "gaze" ||
      value === "head" ||
      value === "head-gaze"
    ) {
      return "gaze";
    }

    return DEFAULT_RETICLE_PROJECTION_ORIGIN;
  }

  getReticleProjectionOrigin() {
    return this.reticleProjectionOrigin;
  }

  setReticleProjectionOrigin(value) {
    const nextValue = this.normalizeReticleProjectionOrigin(value);
    if (this.reticleProjectionOrigin === nextValue) {
      return this.reticleProjectionOrigin;
    }

    this.reticleProjectionOrigin = nextValue;
    this.currentReticleInteraction = null;
    this.activeAimSource = null;
    this.activeMenuTouchActionId = null;
    this.syncHighlightedHotspot(null);
    this.handMenu.setHighlightedAction(null);

    this.context.debugLog?.("vr:reticle-projection-origin", {
      reticleProjectionOrigin: this.reticleProjectionOrigin
    });

    this.context.setStatus?.(
      this.reticleProjectionOrigin === "right-hand"
        ? "Reticula: raycast pela mao direita."
        : "Reticula: raycast por gaze.",
      { hideAfterMs: 1600 }
    );

    return this.reticleProjectionOrigin;
  }

  toggleReticleProjectionOrigin() {
    return this.setReticleProjectionOrigin(
      this.reticleProjectionOrigin === "right-hand" ? "gaze" : "right-hand"
    );
  }

  createControllerState(index) {
    const controller = this.panoramaRenderer.getXRController(index);
    const grip = this.panoramaRenderer.getXRControllerGrip(index);
    const hand = this.panoramaRenderer.getXRHand(index);
    const ray = createControllerRay();
    const rayTip = createRayTip();
    const controllerModel = this.controllerModelFactory.createControllerModel(grip);
    const handModel = this.handModelFactory.createHandModel(hand, "mesh");

    const state = {
      index,
      controller,
      grip,
      hand,
      ray,
      rayTip,
      controllerModel,
      handModel,
      wasPinched: false,
      handedness: "unknown",
      onControllerConnected: (event) => this.handleControllerConnection(state, event),
      onControllerDisconnected: () => this.handleControllerDisconnection(state),
      onControllerSelect: () => this.selectFromController(state),
      onHandConnected: (event) => this.handleHandConnection(state, event),
      onHandDisconnected: () => this.handleHandDisconnection(state)
    };

    ray.add(rayTip);
    controller.add(ray);
    grip.add(controllerModel);
    hand.add(handModel);
    this.root.add(controller, grip, hand);

    controller.addEventListener("connected", state.onControllerConnected);
    controller.addEventListener("disconnected", state.onControllerDisconnected);
    controller.addEventListener("select", state.onControllerSelect);
    hand.addEventListener("connected", state.onHandConnected);
    hand.addEventListener("disconnected", state.onHandDisconnected);

    return state;
  }

  update(frameState) {
    this.root.visible = frameState.presenting;

    if (!frameState.presenting) {
      this.handMenu.update(null, this.temp.headPosition.set(0, 0, 0));
      this.reticle.visible = false;
      this.currentReticleInteraction = null;
      this.activeAimSource = null;
      this.activeMenuTouchActionId = null;
      this.syncHighlightedHotspot(null);

      for (const state of this.controllers) {
        this.resetTransientState(state);
      }
      return;
    }

    this.temp.headPosition.set(
      Number(frameState.headPosition?.x ?? 0),
      Number(frameState.headPosition?.y ?? 0),
      Number(frameState.headPosition?.z ?? 0)
    );

    const leftHandState = this.findHandState("left");
    this.handMenu.update(leftHandState, this.temp.headPosition);

    this.activeAimSource = this.resolveActiveAimSource(frameState.camera, this.temp.headPosition);
    this.currentReticleInteraction = this.updateReticle(frameState.camera, this.temp.headPosition);

    this.updateDirectMenuTouch();

    for (const state of this.controllers) {
      this.updateControllerRay(state);
      this.updateHandPinch(state);
    }
  }

  resetSpatialLock(headPosition) {
    for (const state of this.controllers) {
      state.wasPinched = false;
    }
    this.context.debugLog?.("vr:spatial-lock-reset", { headPosition });
  }

  selectCurrentReticleTarget(meta = {}) {
    if (!this.currentReticleInteraction) {
      return false;
    }

    this.performInteraction(this.currentReticleInteraction, {
      input: "reticle-select",
      reticleProjectionOrigin: this.reticleProjectionOrigin,
      aimSourceType: this.activeAimSource?.type ?? "unknown",
      ...meta
    });
    return true;
  }

  selectFromController(state) {
    const isActiveControllerSource =
      this.activeAimSource?.type === "controller" &&
      this.activeAimSource?.state === state;

    if (!isActiveControllerSource || !this.currentReticleInteraction) {
      this.context.debugLog?.("vr:controller-select-miss", {
        index: state.index,
        handedness: state.handedness,
        reason: !isActiveControllerSource ? "controller-not-active-source" : "no-current-reticle-interaction"
      });
      return;
    }

    this.performInteraction(this.currentReticleInteraction, {
      input: "controller",
      index: state.index,
      handedness: state.handedness,
      reticleProjectionOrigin: this.reticleProjectionOrigin,
      aimSourceType: this.activeAimSource?.type ?? "controller"
    });
  }

  updateControllerRay(state) {
    const controllerVisible = this.isControllerAimAvailable(state);
    const isActiveControllerSource =
      this.activeAimSource?.type === "controller" &&
      this.activeAimSource?.state === state;

    state.ray.visible = controllerVisible && isActiveControllerSource;
    state.rayTip.visible = controllerVisible && isActiveControllerSource;

    if (!state.ray.visible) {
      applyControllerRayVisual(state, {
        active: false,
        distance: DEFAULT_RETICLE_DISTANCE
      });
      return;
    }

    const distance = Math.max(
      0.2,
      Math.min(MAX_RAY_DISTANCE, this.currentReticleInteraction?.intersection?.distance ?? DEFAULT_RETICLE_DISTANCE)
    );

    applyControllerRayVisual(state, {
      active: Boolean(this.currentReticleInteraction),
      distance
    });
  }

  updateHandPinch(state) {
    const handVisible = this.root.visible && state.hand.visible;
    if (!handVisible) {
      state.wasPinched = false;
      return;
    }

    const pinchDistance = getPinchDistance(state.hand);
    const pinched = pinchDistance > 0 && pinchDistance < PINCH_SELECT_THRESHOLD;

    if (pinched && !state.wasPinched && performance.now() >= this.activationCooldownUntil) {
      if (this.currentReticleInteraction) {
        this.performInteraction(this.currentReticleInteraction, {
          input: "hand-pinch-reticle",
          index: state.index,
          handedness: state.handedness,
          pinchDistance,
          reticleProjectionOrigin: this.reticleProjectionOrigin,
          aimSourceType: this.activeAimSource?.type ?? "unknown"
        });
      } else {
        this.context.debugLog?.("vr:hand-pinch-miss", {
          index: state.index,
          handedness: state.handedness,
          pinchDistance,
          reticleProjectionOrigin: this.reticleProjectionOrigin,
          aimSourceType: this.activeAimSource?.type ?? "unknown"
        });
      }

      this.activationCooldownUntil = performance.now() + SELECTION_COOLDOWN_MS;
    }

    state.wasPinched = pinched;
  }

  updateDirectMenuTouch() {
    const usingNonGazeReticle = this.reticleProjectionOrigin !== "gaze";
    if (!usingNonGazeReticle) {
      this.activeMenuTouchActionId = null;
      return;
    }

    const rightHandState = this.findHandState("right");
    const indexTip = this.getRightIndexTipWorld(rightHandState?.hand);

    if (!indexTip) {
      this.activeMenuTouchActionId = null;
      return;
    }

    const touchedActionId = this.handMenu.getDirectTouchAction(indexTip);

    if (!touchedActionId) {
      this.activeMenuTouchActionId = null;
      if (this.currentReticleInteraction?.type !== "menu-action") {
        this.handMenu.setHighlightedAction(null);
      }
      return;
    }

    this.handMenu.setHighlightedAction(touchedActionId);

    const now = performance.now();
    const isNewTouch = this.activeMenuTouchActionId !== touchedActionId;

    if (isNewTouch && now >= this.menuTouchCooldownUntil) {
      this.activeMenuTouchActionId = touchedActionId;
      this.menuTouchCooldownUntil = now + MENU_TOUCH_COOLDOWN_MS;

      Promise.resolve(this.handMenu.executeAction(touchedActionId))
        .catch((error) => {
          console.error("[WPA360] VR direct menu touch action failed", error);
          this.context.setStatus?.(error.message, { hideAfterMs: 2400 });
        });
      return;
    }

    this.activeMenuTouchActionId = touchedActionId;
  }

  resolveActiveAimSource(camera, headPosition) {
    const controllerState = this.findPrimaryControllerAimState();
    if (controllerState) {
      return this.getControllerAimSource(controllerState);
    }

    if (this.reticleProjectionOrigin === "right-hand") {
      const handState = this.findHandState("right");
      if (handState?.hand?.visible) {
        const handSource = this.getTrackedHandRaySource(handState.hand);
        if (handSource) {
          return {
            ...handSource,
            type: "right-hand",
            state: handState
          };
        }
      }
    }

    if (!camera) {
      return null;
    }

    return this.getGazeRaySource(camera, headPosition);
  }

  updateReticle(camera, headPosition) {
    const raySource = this.activeAimSource;

    if (!raySource) {
      this.reticle.visible = false;
      this.handMenu.setHighlightedAction(null);
      this.syncHighlightedHotspot(null);
      return null;
    }

    this.reticleRaycaster.ray.origin.copy(raySource.origin);
    this.reticleRaycaster.ray.direction.copy(raySource.direction);
    this.reticleRaycaster.near = 0.05;
    this.reticleRaycaster.far = MAX_RAY_DISTANCE;

    let interaction = this.intersectMenu(this.reticleRaycaster);
    if (!interaction) {
      interaction = this.intersectHotspots(
        this.reticleRaycaster,
        raySource.allowGazeFallback ? camera : null
      );
    }

    const distance = Math.max(
      0.65,
      Math.min(MAX_RAY_DISTANCE, interaction?.intersection?.distance ?? DEFAULT_RETICLE_DISTANCE)
    );

    this.temp.reticlePosition
      .copy(raySource.origin)
      .addScaledVector(raySource.direction, distance);
    this.reticle.position.copy(this.temp.reticlePosition);

    this.temp.rotationMatrix.lookAt(headPosition, this.temp.reticlePosition, this.temp.up);
    this.temp.reticleQuaternion.setFromRotationMatrix(this.temp.rotationMatrix);
    this.reticle.quaternion.copy(this.temp.reticleQuaternion);
    this.reticle.visible = true;

    setReticleState(this.reticle, interaction);

    if (this.activeMenuTouchActionId) {
      this.handMenu.setHighlightedAction(this.activeMenuTouchActionId);
    } else {
      this.handMenu.setHighlightedAction(interaction?.type === "menu-action" ? interaction.actionId : null);
    }

    this.syncHighlightedHotspot(interaction?.type === "hotspot" ? interaction.hotspot?.id ?? null : null);

    return interaction;
  }

  getGazeRaySource(camera, headPosition) {
    camera.getWorldDirection(this.temp.rayDirection);
    this.temp.rayDirection.normalize();
    this.temp.rayOrigin.copy(headPosition);

    return {
      type: "gaze",
      origin: this.temp.rayOrigin,
      direction: this.temp.rayDirection,
      allowGazeFallback: true
    };
  }

  getControllerAimSource(state) {
    const sourceObject = state.controller?.visible
      ? state.controller
      : state.grip?.visible
        ? state.grip
        : null;

    if (!sourceObject) {
      return null;
    }

    this.temp.rotationMatrix.identity().extractRotation(sourceObject.matrixWorld);
    this.temp.rayOrigin.setFromMatrixPosition(sourceObject.matrixWorld);
    this.temp.rayDirection.set(0, 0, -1).applyMatrix4(this.temp.rotationMatrix).normalize();

    return {
      type: "controller",
      state,
      origin: this.temp.rayOrigin,
      direction: this.temp.rayDirection,
      allowGazeFallback: false
    };
  }

  getTrackedHandRaySource(hand) {
    const wrist = copyJointWorldPosition(hand, "wrist", this.temp.handWrist);
    const indexMeta = copyJointWorldPosition(hand, "index-finger-metacarpal", this.temp.handIndexMeta);
    const pinkyMeta = copyJointWorldPosition(hand, "pinky-finger-metacarpal", this.temp.handPinkyMeta);
    const middleMeta = copyJointWorldPosition(hand, "middle-finger-metacarpal", this.temp.handMiddleMeta);
    const indexTip = copyJointWorldPosition(hand, "index-finger-tip", this.temp.handIndexTip);
    const middleTip = copyJointWorldPosition(hand, "middle-finger-tip", this.temp.handMiddleTip);
    const ringTip = copyJointWorldPosition(hand, "ring-finger-tip", this.temp.handRingTip);
    const pinkyTip = copyJointWorldPosition(hand, "pinky-finger-tip", this.temp.handPinkyTip);

    if (!wrist || !indexMeta || !pinkyMeta || !middleMeta || !indexTip || !middleTip || !ringTip || !pinkyTip) {
      return null;
    }

    const palmCenter = this.temp.handPalmCenter
      .copy(wrist)
      .add(indexMeta)
      .add(pinkyMeta)
      .add(middleMeta)
      .multiplyScalar(0.25);

    const averageTips = this.temp.handAverageTips
      .copy(indexTip)
      .add(middleTip)
      .add(ringTip)
      .add(pinkyTip)
      .multiplyScalar(0.25);

    const fingerAxis = this.temp.handFingerAxis.copy(averageTips).sub(wrist);
    if (fingerAxis.lengthSq() < 0.000001) {
      return null;
    }
    fingerAxis.normalize();

    this.temp.rayOrigin
      .copy(palmCenter)
      .addScaledVector(fingerAxis, 0.045);

    this.temp.rayDirection.copy(fingerAxis).normalize();

    return {
      origin: this.temp.rayOrigin,
      direction: this.temp.rayDirection,
      allowGazeFallback: false
    };
  }

  getRightIndexTipWorld(hand) {
    const joint = hand?.joints?.["index-finger-tip"];
    if (!joint?.visible) {
      return null;
    }
    return joint.getWorldPosition(this.temp.rightIndexTipWorld);
  }

  findPrimaryControllerAimState() {
    const candidates = this.controllers.filter((state) => this.isControllerAimAvailable(state));
    if (candidates.length === 0) {
      return null;
    }

    return candidates.find((state) => state.handedness === "right")
      ?? candidates.find((state) => state.index === 0)
      ?? candidates[0]
      ?? null;
  }

  isControllerAimAvailable(state) {
    return Boolean(
      (state.controller?.visible || state.grip?.visible) &&
      !state.hand?.visible
    );
  }

  intersectMenu(raycaster) {
    const menuObjects = this.handMenu.getInteractiveObjects();
    if (menuObjects.length === 0) {
      return null;
    }

    const intersection = raycaster.intersectObjects(menuObjects, false)[0];
    if (!intersection) {
      return null;
    }

    return {
      type: "menu-action",
      actionId: this.handMenu.getActionByObject(intersection.object),
      intersection
    };
  }

  intersectHotspots(raycaster, camera = null) {
    const hit = this.hotspotLayer.intersectRay(raycaster);
    if (hit?.hotspot) {
      return {
        type: "hotspot",
        hotspot: hit.hotspot,
        intersection: hit.intersection
      };
    }

    if (!camera) {
      return null;
    }

    const cfg = this.context.store.getSnapshot().cfg;
    const fallbackHotspot = this.hotspotLayer.getCenteredHotspot(camera, {
      maxDegrees: Number(cfg?.platform?.vr?.gaze_selection_degrees ?? 9)
    });

    if (!fallbackHotspot) {
      return null;
    }

    this.panoramaRenderer.sceneToWorld(fallbackHotspot.position, this.temp.reticleWorldTarget);
    const distance = this.temp.reticleWorldTarget.distanceTo(raycaster.ray.origin);

    return {
      type: "hotspot",
      hotspot: fallbackHotspot,
      intersection: {
        distance
      }
    };
  }

  syncHighlightedHotspot(hotspotId) {
    const nextId = hotspotId ?? null;
    if (this.highlightedHotspotId === nextId) {
      return;
    }

    this.highlightedHotspotId = nextId;
    this.hotspotLayer?.setHighlightedHotspot?.(nextId);

    this.context.debugLog?.("vr:highlighted-hotspot", {
      hotspotId: nextId,
      reticleProjectionOrigin: this.reticleProjectionOrigin,
      aimSourceType: this.activeAimSource?.type ?? "none"
    });
  }

  performInteraction(interaction, meta = {}) {
    if (!interaction) {
      return;
    }

    if (interaction.type === "menu-action" && interaction.actionId) {
      Promise.resolve(this.handMenu.executeAction(interaction.actionId))
        .catch((error) => {
          console.error("[WPA360] VR hand menu action failed", error);
          this.context.setStatus?.(error.message, { hideAfterMs: 2400 });
        });
      return;
    }

    if (interaction.type === "hotspot" && interaction.hotspot) {
      this.syncHighlightedHotspot(interaction.hotspot.id);
      this.navigateToHotspot(interaction.hotspot, {
        distance: interaction.intersection?.distance ?? null,
        ...meta
      });
    }
  }

  navigateToHotspot(hotspot, meta = {}) {
    if (!hotspot?.target_scene) {
      return;
    }

    this.context.debugLog?.("vr:hotspot-select", {
      hotspotId: hotspot.id,
      label: getHotspotLabelText(hotspot),
      targetScene: hotspot.target_scene,
      ...meta
    });

    this.context.goToScene(hotspot.target_scene)
      ?.catch?.((error) => {
        console.error("[WPA360] VR hotspot navigation failed", error);
        this.context.setStatus?.(error.message, { hideAfterMs: 2400 });
      });
  }

  handleControllerConnection(state, event) {
    state.handedness = event.data?.handedness ?? state.handedness;
    this.context.debugLog?.("vr:controller-connected", {
      index: state.index,
      handedness: state.handedness,
      profiles: event.data?.profiles ?? []
    });
  }

  handleControllerDisconnection(state) {
    this.context.debugLog?.("vr:controller-disconnected", {
      index: state.index,
      handedness: state.handedness
    });
  }

  handleHandConnection(state, event) {
    state.handedness = event.data?.handedness ?? state.handedness;
    this.context.debugLog?.("vr:hand-connected", {
      index: state.index,
      handedness: state.handedness,
      profiles: event.data?.profiles ?? []
    });
  }

  handleHandDisconnection(state) {
    state.wasPinched = false;
    this.context.debugLog?.("vr:hand-disconnected", {
      index: state.index,
      handedness: state.handedness
    });
  }

  findHandState(handedness) {
    return this.controllers.find((state) => state.handedness === handedness && state.hand.visible)
      ?? this.controllers.find((state) => state.handedness === handedness)
      ?? null;
  }

  resetTransientState(state) {
    state.wasPinched = false;
    state.ray.visible = false;
    state.rayTip.visible = false;
    applyControllerRayVisual(state, {
      active: false,
      distance: DEFAULT_RETICLE_DISTANCE
    });
  }

  destroy() {
    this.syncHighlightedHotspot(null);
    this.handMenu.destroy();
    this.reticle.removeFromParent();
    disposeObject3D(this.reticle);

    for (const state of this.controllers) {
      state.controller.removeEventListener("connected", state.onControllerConnected);
      state.controller.removeEventListener("disconnected", state.onControllerDisconnected);
      state.controller.removeEventListener("select", state.onControllerSelect);
      state.hand.removeEventListener("connected", state.onHandConnected);
      state.hand.removeEventListener("disconnected", state.onHandDisconnected);
      disposeObject3D(state.controller);
      disposeObject3D(state.grip);
      disposeObject3D(state.hand);
      state.controller.removeFromParent();
      state.grip.removeFromParent();
      state.hand.removeFromParent();
    }

    this.controllers = [];
  }
}

function createControllerRay() {
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -1)
  ]);
  const material = new THREE.LineBasicMaterial({
    color: IDLE_RAY_COLOR.clone(),
    transparent: true,
    opacity: 0.9,
    toneMapped: false
  });
  const line = new THREE.Line(geometry, material);
  line.name = "wpa360-controller-ray";
  line.scale.set(1, 1, MAX_RAY_DISTANCE);
  return line;
}

function createRayTip() {
  const tip = new THREE.Mesh(
    new THREE.SphereGeometry(0.01, 12, 12),
    new THREE.MeshBasicMaterial({
      color: ACTIVE_RAY_COLOR.clone(),
      transparent: true,
      opacity: 0.9,
      toneMapped: false
    })
  );
  tip.position.z = -MAX_RAY_DISTANCE;
  return tip;
}

function createReticle() {
  const group = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.012, 0.018, 32),
    new THREE.MeshBasicMaterial({
      color: RETICLE_IDLE_COLOR.clone(),
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false
    })
  );
  const dot = new THREE.Mesh(
    new THREE.CircleGeometry(0.0035, 18),
    new THREE.MeshBasicMaterial({
      color: RETICLE_ACTIVE_COLOR.clone(),
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false
    })
  );

  ring.renderOrder = 30;
  dot.renderOrder = 31;
  group.add(ring, dot);
  group.userData.reticleRing = ring;
  group.userData.reticleDot = dot;
  return group;
}

function setReticleState(reticle, interaction) {
  const ring = reticle.userData.reticleRing;
  const dot = reticle.userData.reticleDot;
  const active = Boolean(interaction);

  ring.material.color.copy(active ? RETICLE_ACTIVE_COLOR : RETICLE_IDLE_COLOR);
  ring.scale.setScalar(active ? 1.05 : 1);
  dot.material.opacity = active ? 0.95 : 0.75;
}

function getPinchDistance(hand) {
  const thumbTip = hand?.joints?.["thumb-tip"];
  const indexTip = hand?.joints?.["index-finger-tip"];
  if (!thumbTip?.visible || !indexTip?.visible) {
    return Number.POSITIVE_INFINITY;
  }

  return thumbTip.position.distanceTo(indexTip.position);
}

function copyJointWorldPosition(hand, jointName, target) {
  const joint = hand?.joints?.[jointName];
  if (!joint?.visible) {
    return null;
  }
  return joint.getWorldPosition(target);
}

function applyControllerRayVisual(state, { active, distance }) {
  state.ray.scale.z = distance;
  state.rayTip.position.z = -distance;
  state.ray.material.color.copy(active ? ACTIVE_RAY_COLOR : IDLE_RAY_COLOR);
  state.ray.material.opacity = active ? 0.98 : 0.6;
  state.rayTip.material.color.copy(active ? ACTIVE_RAY_COLOR : IDLE_RAY_COLOR);
  state.rayTip.material.opacity = active ? 1 : 0.55;
}

function applyControllerPresentationMaterial(root) {
  root?.traverse?.((child) => {
    if (!child.isMesh || !child.material) {
      return;
    }

    child.frustumCulled = false;
    child.material = convertControllerMaterial(child.material);
  });
}

function applySelfLitMaterial(root, accentColor, emissiveIntensity = 1) {
  const tint = new THREE.Color(accentColor);
  root?.traverse?.((child) => {
    if (!child.isMesh || !child.material) {
      return;
    }

    child.frustumCulled = false;
    const nextMaterial = convertToSelfLitMaterial(child.material, tint, emissiveIntensity);
    child.material = nextMaterial;
  });
}

function convertToSelfLitMaterial(material, tint, emissiveIntensity) {
  if (Array.isArray(material)) {
    return material.map((entry) => convertSingleMaterial(entry, tint, emissiveIntensity));
  }
  return convertSingleMaterial(material, tint, emissiveIntensity);
}

function convertControllerMaterial(material) {
  if (Array.isArray(material)) {
    return material.map((entry) => convertSingleControllerMaterial(entry));
  }
  return convertSingleControllerMaterial(material);
}

function convertSingleControllerMaterial(material) {
  if (!material) {
    return material;
  }

  const nextMaterial = material.clone();
  nextMaterial.toneMapped = false;

  if ("map" in nextMaterial && nextMaterial.map) {
    if ("color" in nextMaterial && nextMaterial.color) {
      nextMaterial.color.set(0xffffff);
    }
    if ("emissive" in nextMaterial && nextMaterial.emissive) {
      nextMaterial.emissive.set(0xffffff);
      nextMaterial.emissiveMap = nextMaterial.map;
      nextMaterial.emissiveIntensity = 1;
    }
  } else {
    const baseColor = nextMaterial.color?.clone?.() ?? new THREE.Color("#d7e4ea");
    if ("color" in nextMaterial && nextMaterial.color) {
      nextMaterial.color.copy(baseColor);
    }
    if ("emissive" in nextMaterial && nextMaterial.emissive) {
      nextMaterial.emissive.copy(baseColor);
      nextMaterial.emissiveIntensity = 0.55;
    }
  }

  if ("metalness" in nextMaterial) {
    nextMaterial.metalness = 0;
  }
  if ("roughness" in nextMaterial) {
    nextMaterial.roughness = 1;
  }

  return nextMaterial;
}

function convertSingleMaterial(material, tint, emissiveIntensity) {
  if (!material) {
    return material;
  }

  const nextMaterial = material.clone();
  nextMaterial.toneMapped = false;
  if ("metalness" in nextMaterial) {
    nextMaterial.metalness = 0;
  }
  if ("roughness" in nextMaterial) {
    nextMaterial.roughness = 1;
  }
  if ("emissive" in nextMaterial) {
    const emissiveColor = nextMaterial.color?.clone?.() ?? tint.clone();
    emissiveColor.lerp(tint, 0.35);
    nextMaterial.emissive.copy(emissiveColor);
    nextMaterial.emissiveIntensity = emissiveIntensity;
  }
  if ("color" in nextMaterial && nextMaterial.color) {
    nextMaterial.color.lerp(tint, 0.12);
  }
  return nextMaterial;
}

function disposeObject3D(object) {
  object?.traverse?.((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) {
      for (const material of child.material) {
        material?.map?.dispose?.();
        material?.dispose?.();
      }
      return;
    }

    child.material?.map?.dispose?.();
    child.material?.dispose?.();
  });
}