import * as THREE from "../../../vendor/three/three.module.js";
import { XRControllerModelFactory } from "../../../vendor/three/examples/jsm/webxr/XRControllerModelFactory.js";
import { XRHandModelFactory } from "../../../vendor/three/examples/jsm/webxr/XRHandModelFactory.js";
import { getHotspotLabelText } from "../../shared/HotspotVisualShared.js";
import { VRHandMenu } from "./VRHandMenu.js";
import { VRControllerDevLegend, VRControllerEditMenu, VRQuickNavWidget } from "./VRControllerDevPanels.js";
import { VRHandEditorMenu } from "./VRHandEditorMenu.js";
import { VRHotspotEditorWidget } from "./VRHotspotEditorWidget.js";

const MAX_RAY_DISTANCE = 24;
const DEFAULT_RETICLE_DISTANCE = 2.4;
const PINCH_SELECT_THRESHOLD = 0.022;
const PINCH_MANIPULATION_DELAY_MS = 180;
const SELECTION_COOLDOWN_MS = 320;
const MENU_TOUCH_COOLDOWN_MS = 220;
const IDLE_RAY_COLOR = new THREE.Color("#8edee6");
const ACTIVE_RAY_COLOR = new THREE.Color("#fff1bf");
const RETICLE_IDLE_COLOR = new THREE.Color("#d7ecf0");
const RETICLE_ACTIVE_COLOR = new THREE.Color("#f0a85d");
const DEFAULT_RETICLE_PROJECTION_ORIGIN = "right-hand";
const DEV_STICK_DEADZONE = 0.18;
const DEV_LATERAL_MOVE_SPEED = 1.35;
const DEV_DEPTH_MOVE_SPEED = 2.1;
const DEV_VERTICAL_BUTTON_SPEED = 1.1;
const DEV_ROTATE_SPEED = 115;
const DEV_SCALE_SPEED = 1.15;
const SNAP_TURN_THRESHOLD = 0.72;
const SNAP_TURN_DEGREES = 30;
const LABEL_OFFSET_STEP = 0.08;
const LABEL_ROTATION_STEP = 6;
const LABEL_SCALE_STEP = 0.08;
const HOTSPOT_POSITION_STEP = 0.2;
const HOTSPOT_ROTATION_STEP = 5;
const HOTSPOT_REFERENCE_DEPTH_STEP = 0.25;

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
    this.activeHandEditorTouchActionId = null;
    this.activeEditorTouchActionId = null;
    this.activeMenuTouchActionId = null;
    this.editorPlacementPending = false;
    this.editorHotspotPickPending = false;
    this.editorCreatePendingType = null;
    this.editorCreatePendingTargetTourId = null;
    this.editorCreatePendingTargetSceneId = null;
    this.devControlsEnabled = false;
    this.devControlsMode = "move";
    this.quickNavOpen = false;
    this.quickNavAnchorHandedness = "right";
    this.quickNavSelectedSceneId = null;
    this.quickNavSelectedTourId = null;
    this.handEditorMode = "move";
    this.lastUpdateTimeMs = performance.now();
    this.destinationCatalogCache = new Map();

    this.handMenu = new VRHandMenu({
      root: this.root,
      context: this.createHandMenuContext()
    });
    this.handEditorMenu = new VRHandEditorMenu({
      root: this.root,
      context: this.createHandEditorContext()
    });
    this.hotspotEditorWidget = new VRHotspotEditorWidget({
      root: this.root,
      panoramaRenderer: this.panoramaRenderer,
      context: this.createHotspotEditorContext()
    });
    this.controllerEditMenu = new VRControllerEditMenu({
      root: this.root,
      context: this.createDevUiContext()
    });
    this.controllerDevLegend = new VRControllerDevLegend({
      root: this.root,
      context: this.createDevUiContext()
    });
    this.quickNavWidget = new VRQuickNavWidget({
      root: this.root,
      context: this.createQuickNavContext()
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
      rightIndexTipWorld: new THREE.Vector3(),
      controllerWorldPosition: new THREE.Vector3(),
      controllerScenePosition: new THREE.Vector3(),
      controllerWorldQuaternion: new THREE.Quaternion(),
      controllerRayOrigin: new THREE.Vector3(),
      controllerRayDirection: new THREE.Vector3(),
      controllerRayPoint: new THREE.Vector3(),
      controllerRight: new THREE.Vector3(),
      worldUp: new THREE.Vector3(0, 1, 0),
      devFinalWorldPosition: new THREE.Vector3(),
      devDeltaQuaternion: new THREE.Quaternion(),
      devBaseQuaternion: new THREE.Quaternion(),
      devResultQuaternion: new THREE.Quaternion(),
      devInverseQuaternion: new THREE.Quaternion(),
      devEuler: new THREE.Euler(0, 0, 0, "YXZ"),
      selectedHotspotWorldPosition: new THREE.Vector3()
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
      toggleReticleProjectionOrigin: () => this.toggleReticleProjectionOrigin(),
      isVrHotspotEditorEnabled: () => this.isVrHotspotEditorEnabled(),
      isVrHotspotEditorOpen: () => this.isAnyVrEditorInterfaceOpen(),
      toggleVrHotspotEditor: () => this.togglePreferredVrEditorInterface(),
      isVrDevControlsEnabled: () => this.isVrDevControlsEnabled(),
      toggleVrDevControls: () => this.toggleVrDevControls()
    };
  }

  createHandEditorContext() {
    return {
      ...this.context,
      isVrHandEditorAvailable: () => this.isVrHandEditorAvailable(),
      isVrHandEditorOpen: () => this.isVrHandEditorOpen(),
      closeVrHandEditor: () => this.closeVrHandEditor(),
      setVrHandEditorMode: (mode) => this.setVrHandEditorMode(mode),
      getVrHandEditorMode: () => this.getVrHandEditorMode(),
      getVrHandEditorSummary: () => this.getVrHandEditorSummary(),
      getVrHandEditorActionState: (actionId) => this.getVrHandEditorActionState(actionId),
      executeVrHandEditorAction: (actionId) => this.executeVrHandEditorAction(actionId),
      getVrHotspotListOptions: () => this.getVrHotspotListOptions(),
      selectVrHotspotById: (hotspotId) => this.selectVrHotspotById(hotspotId),
      getVrCreateSceneListOptions: () => this.getVrCreateSceneListOptions(),
      selectVrCreateSceneById: (sceneId) => this.selectVrCreateSceneById(sceneId),
      getVrCreateTargetSummary: () => this.getVrCreateTargetSummary()
    };
  }

  createHotspotEditorContext() {
    return {
      ...this.context,
      requestHotspotPlacementMode: () => this.requestHotspotPlacementMode(),
      requestHotspotSelectionMode: () => this.requestHotspotSelectionMode(),
      requestCreateHotspotMode: (type) => this.requestCreateHotspotMode(type),
      getVrHotspotListOptions: () => this.getVrHotspotListOptions(),
      selectVrHotspotById: (hotspotId) => this.selectVrHotspotById(hotspotId),
      getVrCreateSceneListOptions: () => this.getVrCreateSceneListOptions(),
      selectVrCreateSceneById: (sceneId) => this.selectVrCreateSceneById(sceneId),
      getVrCreateTargetSummary: () => this.getVrCreateTargetSummary(),
      getVrEditorToolMode: () => this.getVrEditorToolMode(),
      isVrDevControlsEnabled: () => this.isVrDevControlsEnabled(),
      getVrDevControlsMode: () => this.getVrDevControlsMode(),
      toggleVrDevControls: () => this.toggleVrDevControls()
    };
  }

  createDevUiContext() {
    return {
      ...this.context,
      isVrDevControlsEnabled: () => this.isVrDevControlsEnabled(),
      getVrDevControlsMode: () => this.getVrDevControlsMode(),
      isVrDevGripActive: () => this.isVrDevGripActive(),
      getVrSelectedHotspot: () => this.getSelectedDraftHotspot(),
      getVrDevTraceTargetLabel: () => this.getVrDevTraceTargetLabel(),
      getVrDevMenuActionState: (actionId) => this.getVrDevMenuActionState(actionId),
      executeVrDevMenuAction: (actionId) => this.executeVrDevMenuAction(actionId)
    };
  }

  createQuickNavContext() {
    return {
      ...this.context,
      isVrQuickNavOpen: () => this.isVrQuickNavOpen(),
      getVrQuickNavState: () => this.getVrQuickNavState(),
      executeVrQuickNavAction: (actionId) => this.executeVrQuickNavAction(actionId)
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
    this.activeEditorTouchActionId = null;
    this.activeMenuTouchActionId = null;
    this.syncHighlightedHotspot(null);
    this.hotspotEditorWidget.setHighlightedAction(null);
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
      inputSource: null,
      wasPinched: false,
      handedness: "unknown",
      triggerPressed: false,
      triggerWasPressed: false,
      triggerTrackedInteraction: null,
      triggerPendingActivation: null,
      devGripPressed: false,
      devThumbstickPressed: false,
      snapTurnArmed: true,
      devActiveHotspotId: null,
      devActiveSceneId: null,
      devGrabRayDistance: DEFAULT_RETICLE_DISTANCE,
      devManualWorldOffset: new THREE.Vector3(),
      devManualDepthOffset: 0,
      devGrabControllerQuaternion: new THREE.Quaternion(),
      devGrabHotspotRotation: { yaw: 0, pitch: 0, roll: 0 },
      devManualRotationOffset: { yaw: 0, pitch: 0, roll: 0 },
      quickNavGripPressed: false,
      handPinchStartedAt: 0,
      handPinchManipulating: false,
      handPinchHotspotId: null,
      handPinchSceneId: null,
      handPinchInteractionType: null,
      handEditStartRayDirection: new THREE.Vector3(0, 0, -1),
      handEditStartHotspotRotation: { yaw: 0, pitch: 0, roll: 0 },
      handEditReferenceDepth: DEFAULT_RETICLE_DISTANCE,
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
    const now = performance.now();
    const deltaSeconds = Math.min(0.05, Math.max(0.001, (now - this.lastUpdateTimeMs) / 1000));
    this.lastUpdateTimeMs = now;
    this.root.visible = frameState.presenting;

    if (!frameState.presenting) {
      this.handMenu.update(null, this.temp.headPosition.set(0, 0, 0));
      this.handEditorMenu.update(null, this.temp.headPosition.set(0, 0, 0));
      this.hotspotEditorWidget.update(null, { x: 0, y: 0, z: 0 });
      this.controllerEditMenu.update(null, this.temp.headPosition);
      this.controllerDevLegend.update(null, this.temp.headPosition);
      this.quickNavWidget.update(null, this.temp.headPosition);
      this.reticle.visible = false;
      this.currentReticleInteraction = null;
      this.activeAimSource = null;
      this.activeHandEditorTouchActionId = null;
      this.activeEditorTouchActionId = null;
      this.activeMenuTouchActionId = null;
      this.clearEditorToolModes();
      this.resetDevControlsInteraction();
      this.resetQuickNavInteraction();
      this.handEditorMenu.setHighlightedAction(null);
      this.hotspotEditorWidget.setHighlightedAction(null);
      this.quickNavWidget.setHighlightedAction(null);
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
    const leftControllerState = this.findControllerState("left");
    const rightControllerState = this.findControllerState("right");
    const handEditorOpen = this.handEditorMenu.isOpen();
    this.handMenu.update(handEditorOpen ? null : leftHandState, this.temp.headPosition);
    this.handEditorMenu.update(handEditorOpen ? leftHandState : null, this.temp.headPosition);
    this.hotspotEditorWidget.update(frameState, frameState.headPosition);
    this.controllerEditMenu.update(leftControllerState, this.temp.headPosition);
    this.controllerDevLegend.update(rightControllerState, this.temp.headPosition);
    this.updateQuickNavGripState();
    this.quickNavWidget.update(this.getQuickNavAnchorControllerState(), this.temp.headPosition);

    this.updateControllerTriggerStates();
    this.activeAimSource = this.resolveActiveAimSource(frameState.camera, this.temp.headPosition);
    this.currentReticleInteraction = this.updateReticle(frameState.camera, this.temp.headPosition);
    this.trackControllerTriggerTarget(this.currentReticleInteraction);

    this.updateDirectUiTouch();
    this.updateDevControllerEditing(deltaSeconds);
    this.updateSnapTurnInput();
    this.controllerDevLegend.update(rightControllerState, this.temp.headPosition);

    for (const state of this.controllers) {
      this.updateControllerRay(state);
      this.updateHandPinch(state);
    }

    this.finalizeControllerTriggerStates();
  }

  resetSpatialLock(headPosition) {
    for (const state of this.controllers) {
      state.wasPinched = false;
    }
    this.context.debugLog?.("vr:spatial-lock-reset", { headPosition });
  }

  selectCurrentReticleTarget(meta = {}) {
    if (this.tryHandleEditorToolMode(meta)) {
      return true;
    }

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
    if (this.isVrTriggerRevealMode()) {
      const releaseInteraction = state.triggerTrackedInteraction?.type === "hotspot"
        ? state.triggerTrackedInteraction
        : (state.triggerPendingActivation?.type === "hotspot" ? state.triggerPendingActivation : null);

      if (releaseInteraction) {
        state.triggerTrackedInteraction = null;
        state.triggerPendingActivation = null;
        this.performInteraction(releaseInteraction, {
          input: "controller-trigger-release",
          index: state.index,
          handedness: state.handedness,
          aimSourceType: "controller-trigger-release"
        });
        return;
      }
    }

    const isActiveControllerSource =
      this.activeAimSource?.type === "controller" &&
      this.activeAimSource?.state === state;

    if (!isActiveControllerSource) {
      this.context.debugLog?.("vr:controller-select-miss", {
        index: state.index,
        handedness: state.handedness,
        reason: "controller-not-active-source"
      });
      return;
    }

    if (
      this.isVrDevControlsEnabled()
      && state.handedness === "right"
      && state.devGripPressed
      && this.currentReticleInteraction?.type === "hotspot"
    ) {
      this.context.debugLog?.("vr:controller-select-suppressed", {
        index: state.index,
        handedness: state.handedness,
        reason: "dev-controls-grip-active-for-hotspot"
      });
      return;
    }

    const handled = this.selectCurrentReticleTarget({
      input: "controller",
      index: state.index,
      handedness: state.handedness,
      aimSourceType: this.activeAimSource?.type ?? "controller"
    });

    if (!handled) {
      this.context.debugLog?.("vr:controller-select-miss", {
        index: state.index,
        handedness: state.handedness,
        reason: "no-current-reticle-interaction"
      });
    }
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
      Math.min(MAX_RAY_DISTANCE, this.currentReticleInteraction?.reticleDistance ?? DEFAULT_RETICLE_DISTANCE)
    );

    applyControllerRayVisual(state, {
      active: Boolean(this.currentReticleInteraction),
      distance
    });
  }

  updateHandPinch(state) {
    const handVisible = this.root.visible && state.hand.visible;
    if (!handVisible) {
      this.resetHandPinchState(state);
      state.wasPinched = false;
      return;
    }

    const pinchDistance = getPinchDistance(state.hand);
    const pinched = pinchDistance > 0 && pinchDistance < PINCH_SELECT_THRESHOLD;

    if (state.handedness === "right" && this.isVrHandEditorOpen()) {
      this.updateVrHandEditorPinch(state, {
        pinched,
        pinchDistance
      });
      state.wasPinched = pinched;
      return;
    }

    if (pinched && !state.wasPinched && performance.now() >= this.activationCooldownUntil) {
      const handled = this.selectCurrentReticleTarget({
        input: "hand-pinch-reticle",
        index: state.index,
        handedness: state.handedness,
        pinchDistance,
        aimSourceType: this.activeAimSource?.type ?? "unknown"
      });

      if (!handled) {
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

  updateDirectUiTouch() {
    const rightHandState = this.findHandState("right");
    const indexTip = this.getRightIndexTipWorld(rightHandState?.hand);

    if (!indexTip) {
      this.activeHandEditorTouchActionId = null;
      this.activeEditorTouchActionId = null;
      this.activeMenuTouchActionId = null;
      return;
    }

    const touchedHandEditorActionId = this.handEditorMenu.getDirectTouchAction(indexTip);
    if (touchedHandEditorActionId) {
      this.handEditorMenu.setHighlightedAction(touchedHandEditorActionId);
      this.hotspotEditorWidget.setHighlightedAction(null);
      this.handMenu.setHighlightedAction(null);
      this.controllerEditMenu.setHighlightedAction(null);

      const now = performance.now();
      const isNewTouch = this.activeHandEditorTouchActionId !== touchedHandEditorActionId;
      if (isNewTouch && now >= this.menuTouchCooldownUntil) {
        this.activeHandEditorTouchActionId = touchedHandEditorActionId;
        this.activeEditorTouchActionId = null;
        this.activeMenuTouchActionId = null;
        this.menuTouchCooldownUntil = now + MENU_TOUCH_COOLDOWN_MS;

        Promise.resolve(this.handEditorMenu.executeAction(touchedHandEditorActionId))
          .catch((error) => {
            console.error("[WPA360] VR direct hand editor action failed", error);
            this.context.setStatus?.(error.message, { hideAfterMs: 2400 });
          });
        return;
      }

      this.activeHandEditorTouchActionId = touchedHandEditorActionId;
      this.activeEditorTouchActionId = null;
      this.activeMenuTouchActionId = null;
      return;
    }

    this.activeHandEditorTouchActionId = null;
    const touchedEditorActionId = this.hotspotEditorWidget.getDirectTouchAction(indexTip);
    if (touchedEditorActionId) {
      this.handEditorMenu.setHighlightedAction(null);
      this.handMenu.setHighlightedAction(null);
      this.hotspotEditorWidget.setHighlightedAction(touchedEditorActionId);

      const now = performance.now();
      const isNewTouch = this.activeEditorTouchActionId !== touchedEditorActionId;
      if (isNewTouch && now >= this.menuTouchCooldownUntil) {
        this.activeEditorTouchActionId = touchedEditorActionId;
        this.activeMenuTouchActionId = null;
        this.menuTouchCooldownUntil = now + MENU_TOUCH_COOLDOWN_MS;

        Promise.resolve(this.hotspotEditorWidget.executeAction(touchedEditorActionId))
          .catch((error) => {
            console.error("[WPA360] VR direct editor action failed", error);
            this.context.setStatus?.(error.message, { hideAfterMs: 2400 });
          });
        return;
      }

      this.activeEditorTouchActionId = touchedEditorActionId;
      this.activeMenuTouchActionId = null;
      return;
    }

    this.activeEditorTouchActionId = null;
    const touchedActionId = this.handMenu.getDirectTouchAction(indexTip);

    if (!touchedActionId) {
      this.activeMenuTouchActionId = null;
      if (this.currentReticleInteraction?.type !== "hand-editor-action") {
        this.handEditorMenu.setHighlightedAction(null);
      }
      if (this.currentReticleInteraction?.type !== "menu-action") {
        this.handMenu.setHighlightedAction(null);
      }
      if (this.currentReticleInteraction?.type !== "editor-action") {
        this.hotspotEditorWidget.setHighlightedAction(null);
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
      this.handEditorMenu.setHighlightedAction(null);
      this.handMenu.setHighlightedAction(null);
      this.controllerEditMenu.setHighlightedAction(null);
      this.quickNavWidget.setHighlightedAction(null);
      this.syncHighlightedHotspot(null);
      return null;
    }

    this.reticleRaycaster.ray.origin.copy(raySource.origin);
    this.reticleRaycaster.ray.direction.copy(raySource.direction);
    this.reticleRaycaster.near = 0.05;
    this.reticleRaycaster.far = MAX_RAY_DISTANCE;

    let interaction = this.intersectHandEditorMenu(this.reticleRaycaster);
    if (!interaction) {
      interaction = this.intersectEditorWidget(this.reticleRaycaster);
    }
    if (!interaction) {
      interaction = this.intersectControllerEditMenu(this.reticleRaycaster);
    }
    if (!interaction) {
      interaction = this.intersectQuickNavWidget(this.reticleRaycaster);
    }
    if (!interaction) {
      interaction = this.intersectMenu(this.reticleRaycaster);
    }
    if (!interaction && this.shouldAllowHotspotRaycast(raySource)) {
      interaction = this.intersectHotspots(
        this.reticleRaycaster,
        raySource.allowGazeFallback ? camera : null
      );
    }

    const fallbackDistance = Math.max(0.65, Math.min(MAX_RAY_DISTANCE, DEFAULT_RETICLE_DISTANCE));
    const reticlePoint = this.resolveReticlePoint(raySource, interaction, fallbackDistance);
    const distance = reticlePoint.distanceTo(raySource.origin);

    interaction = interaction
      ? {
          ...interaction,
          reticleDistance: distance
        }
      : null;

    this.temp.reticlePosition.copy(reticlePoint);
    this.reticle.position.copy(this.temp.reticlePosition);

    this.temp.rotationMatrix.lookAt(headPosition, this.temp.reticlePosition, this.temp.up);
    this.temp.reticleQuaternion.setFromRotationMatrix(this.temp.rotationMatrix);
    this.reticle.quaternion.copy(this.temp.reticleQuaternion);
    this.reticle.visible = true;

    setReticleState(this.reticle, interaction);

    if (this.activeHandEditorTouchActionId) {
      this.handEditorMenu.setHighlightedAction(this.activeHandEditorTouchActionId);
      this.hotspotEditorWidget.setHighlightedAction(null);
      this.handMenu.setHighlightedAction(null);
      this.controllerEditMenu.setHighlightedAction(null);
      this.quickNavWidget.setHighlightedAction(null);
    } else {
      this.handEditorMenu.setHighlightedAction(interaction?.type === "hand-editor-action" ? interaction.actionId : null);
    }

    if (this.activeEditorTouchActionId) {
      this.hotspotEditorWidget.setHighlightedAction(this.activeEditorTouchActionId);
      this.handMenu.setHighlightedAction(null);
      this.controllerEditMenu.setHighlightedAction(null);
      this.quickNavWidget.setHighlightedAction(null);
    } else {
      this.hotspotEditorWidget.setHighlightedAction(interaction?.type === "editor-action" ? interaction.actionId : null);
    }

    if (this.activeMenuTouchActionId) {
      this.handMenu.setHighlightedAction(this.activeMenuTouchActionId);
    } else {
      this.handMenu.setHighlightedAction(interaction?.type === "menu-action" ? interaction.actionId : null);
    }

    this.controllerEditMenu.setHighlightedAction(interaction?.type === "controller-dev-menu-action" ? interaction.actionId : null);
    this.quickNavWidget.setHighlightedAction(interaction?.type === "quick-nav-action" ? interaction.actionId : null);
    this.syncHighlightedHotspot(this.resolvePreferredHotspotHighlight(interaction));

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

  getVrHotspotVisibilityMode() {
    const rawValue = String(
      this.context.store.getSnapshot().cfg?.platform?.vr?.hotspot_visibility_mode ?? "always"
    ).trim().toLowerCase();

    return rawValue === "hold-trigger" || rawValue === "trigger-hold"
      ? "hold-trigger"
      : "always";
  }

  isVrTriggerRevealMode() {
    return this.getVrHotspotVisibilityMode() === "hold-trigger";
  }

  hasVisibleControllerAim() {
    return this.controllers.some((state) => this.isControllerAimAvailable(state));
  }

  isAnyControllerTriggerPressed() {
    return this.controllers.some((state) => state.triggerPressed);
  }

  shouldShowHotspots() {
    if (!this.isVrTriggerRevealMode()) {
      return true;
    }

    if (!this.hasVisibleControllerAim()) {
      return true;
    }

    return this.isAnyControllerTriggerPressed();
  }

  shouldAllowHotspotRaycast(raySource) {
    if (!this.isVrTriggerRevealMode()) {
      return true;
    }

    if (!this.hasVisibleControllerAim()) {
      return true;
    }

    if (raySource?.type !== "controller") {
      return false;
    }

    return raySource.state?.triggerPressed === true;
  }

  updateControllerTriggerStates() {
    for (const state of this.controllers) {
      const gamepad = this.getControllerGamepad(state);
      const nextPressed = this.isControllerAimAvailable(state) && isGamepadButtonPressed(gamepad, 0);

      if (nextPressed) {
        state.triggerPendingActivation = null;
      }

      if (state.triggerWasPressed && !nextPressed) {
        state.triggerPendingActivation = state.triggerTrackedInteraction?.type === "hotspot"
          ? state.triggerTrackedInteraction
          : null;
        state.triggerTrackedInteraction = null;
      } else if (!nextPressed) {
        state.triggerTrackedInteraction = null;
      }

      state.triggerPressed = nextPressed;
    }
  }

  finalizeControllerTriggerStates() {
    for (const state of this.controllers) {
      state.triggerWasPressed = state.triggerPressed;
    }
  }

  trackControllerTriggerTarget(interaction) {
    for (const state of this.controllers) {
      if (!state.triggerPressed) {
        continue;
      }

      const isActiveControllerSource =
        this.activeAimSource?.type === "controller" &&
        this.activeAimSource?.state === state;

      state.triggerTrackedInteraction = isActiveControllerSource && interaction?.type === "hotspot"
        ? interaction
        : null;
    }
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

  intersectHandEditorMenu(raycaster) {
    const objects = this.handEditorMenu.getInteractiveObjects();
    if (objects.length === 0) {
      return null;
    }

    const intersection = raycaster.intersectObjects(objects, false)[0];
    if (!intersection) {
      return null;
    }

    return {
      type: "hand-editor-action",
      actionId: this.handEditorMenu.getActionByObject(intersection.object),
      intersection
    };
  }

  intersectControllerEditMenu(raycaster) {
    const objects = this.controllerEditMenu.getInteractiveObjects();
    if (objects.length === 0) {
      return null;
    }

    const intersection = raycaster.intersectObjects(objects, false)[0];
    if (!intersection) {
      return null;
    }

    return {
      type: "controller-dev-menu-action",
      actionId: this.controllerEditMenu.getActionByObject(intersection.object),
      intersection
    };
  }

  intersectQuickNavWidget(raycaster) {
    const objects = this.quickNavWidget.getInteractiveObjects();
    if (objects.length === 0) {
      return null;
    }

    const intersection = raycaster.intersectObjects(objects, false)[0];
    if (!intersection) {
      return null;
    }

    return {
      type: "quick-nav-action",
      actionId: this.quickNavWidget.getActionByObject(intersection.object),
      intersection
    };
  }

  intersectEditorWidget(raycaster) {
    const objects = this.hotspotEditorWidget.getInteractiveObjects();
    if (objects.length === 0) {
      return null;
    }

    const intersection = raycaster.intersectObjects(objects, false)[0];
    if (!intersection) {
      return null;
    }

    return {
      type: "editor-action",
      actionId: this.hotspotEditorWidget.getActionByObject(intersection.object),
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
        distance,
        point: this.temp.reticleWorldTarget.clone()
      }
    };
  }

  resolveReticlePoint(raySource, interaction, fallbackDistance) {
    const hitPoint = interaction?.intersection?.point;
    if (
      hitPoint &&
      Number.isFinite(hitPoint.x) &&
      Number.isFinite(hitPoint.y) &&
      Number.isFinite(hitPoint.z)
    ) {
      return this.temp.reticlePosition.copy(hitPoint);
    }

    const safeDistance = Math.max(
      0.65,
      Math.min(MAX_RAY_DISTANCE, interaction?.intersection?.distance ?? fallbackDistance)
    );

    return this.temp.reticlePosition
      .copy(raySource.origin)
      .addScaledVector(raySource.direction, safeDistance);
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

  resolvePreferredHotspotHighlight(interaction) {
    const activeDevHotspotId = this.getActiveDevHotspotId();
    if (activeDevHotspotId) {
      return activeDevHotspotId;
    }

    if (interaction?.type === "hotspot") {
      return interaction.hotspot?.id ?? null;
    }

    if (this.isVrDevControlsEnabled() || this.isVrHandEditorOpen()) {
      return this.getSelectedDraftHotspot()?.id ?? null;
    }

    return null;
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

    if (interaction.type === "hand-editor-action" && interaction.actionId) {
      Promise.resolve(this.handEditorMenu.executeAction(interaction.actionId))
        .catch((error) => {
          console.error("[WPA360] VR hand editor action failed", error);
          this.context.setStatus?.(error.message, { hideAfterMs: 2400 });
        });
      return;
    }

    if (interaction.type === "editor-action" && interaction.actionId) {
      Promise.resolve(this.hotspotEditorWidget.executeAction(interaction.actionId))
        .catch((error) => {
          console.error("[WPA360] VR hotspot editor action failed", error);
          this.context.setStatus?.(error.message, { hideAfterMs: 2400 });
        });
      return;
    }

    if (interaction.type === "controller-dev-menu-action" && interaction.actionId) {
      Promise.resolve(this.controllerEditMenu.executeAction(interaction.actionId))
        .catch((error) => {
          console.error("[WPA360] VR controller edit menu action failed", error);
          this.context.setStatus?.(error.message, { hideAfterMs: 2400 });
        });
      return;
    }

    if (interaction.type === "quick-nav-action" && interaction.actionId) {
      Promise.resolve(this.quickNavWidget.executeAction(interaction.actionId))
        .catch((error) => {
          console.error("[WPA360] VR quick nav action failed", error);
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
      targetTour: hotspot.target_tour ?? null,
      targetScene: hotspot.target_scene,
      ...meta
    });

    const navigate = typeof this.context.goToHotspotTarget === "function"
      ? this.context.goToHotspotTarget(hotspot, { source: "VR_platform", ...meta })
      : this.context.goToScene(hotspot.target_scene);

    navigate
      ?.catch?.((error) => {
        console.error("[WPA360] VR hotspot navigation failed", error);
        this.context.setStatus?.(error.message, { hideAfterMs: 2400 });
      });
  }

  handleControllerConnection(state, event) {
    state.inputSource = event.data ?? null;
    state.handedness = event.data?.handedness ?? state.handedness;
    this.context.debugLog?.("vr:controller-connected", {
      index: state.index,
      handedness: state.handedness,
      profiles: event.data?.profiles ?? []
    });
  }

  handleControllerDisconnection(state) {
    state.inputSource = null;
    this.resetDevControllerState(state);
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
    this.resetHandPinchState(state);
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

  findControllerState(handedness) {
    return this.controllers.find((state) => state.handedness === handedness && this.isControllerAimAvailable(state))
      ?? this.controllers.find((state) => state.handedness === handedness)
      ?? null;
  }

  getRightControllerState() {
    return this.findControllerState("right");
  }

  resetTransientState(state) {
    state.wasPinched = false;
    state.triggerPressed = false;
    state.triggerWasPressed = false;
    state.triggerTrackedInteraction = null;
    state.triggerPendingActivation = null;
    this.resetHandPinchState(state);
    this.resetDevControllerState(state);
    state.snapTurnArmed = true;
    state.quickNavGripPressed = false;
    state.ray.visible = false;
    state.rayTip.visible = false;
    applyControllerRayVisual(state, {
      active: false,
      distance: DEFAULT_RETICLE_DISTANCE
    });
  }

  isVrHotspotEditorEnabled() {
    return Boolean(this.context.getEditorBridge?.());
  }

  getVrEditorToolMode() {
    if (this.editorCreatePendingType) {
      return `create-${this.editorCreatePendingType}`;
    }

    if (this.editorPlacementPending) {
      return "placement";
    }

    if (this.editorHotspotPickPending) {
      return "pick-hotspot";
    }

    return "idle";
  }

  clearEditorToolModes() {
    this.editorCreatePendingType = null;
    this.editorPlacementPending = false;
    this.editorHotspotPickPending = false;
  }

  isAnyVrEditorInterfaceOpen() {
    return this.isVrHandEditorOpen() || Boolean(this.hotspotEditorWidget?.isOpen?.());
  }

  togglePreferredVrEditorInterface() {
    const hasActiveController =
      this.isControllerAimAvailable(this.findControllerState("left"))
      || this.isControllerAimAvailable(this.findControllerState("right"));

    if (hasActiveController) {
      this.closeVrHandEditor();
      return this.hotspotEditorWidget?.toggle?.() ?? false;
    }

    if (this.findHandState("left")?.hand?.visible || this.findHandState("right")?.hand?.visible) {
      return this.toggleVrHandEditor();
    }

    return this.hotspotEditorWidget?.toggle?.() ?? false;
  }

  isVrHandEditorAvailable() {
    return this.isVrHotspotEditorEnabled();
  }

  isVrHandEditorOpen() {
    return Boolean(this.handEditorMenu?.isOpen?.());
  }

  openVrHandEditor() {
    if (!this.isVrHandEditorAvailable()) {
      this.context.setStatus?.("Entre em VR com ?editor=1 para abrir o editor por hand tracking.", { hideAfterMs: 2200 });
      return false;
    }

    this.hotspotEditorWidget?.close?.();
    this.clearEditorToolModes();
    this.setReticleProjectionOrigin("right-hand");
    this.handEditorMenu.open();
    this.context.setStatus?.("Editor VR por hand tracking aberto.", { hideAfterMs: 1800 });
    return true;
  }

  closeVrHandEditor() {
    this.handEditorMenu.close();
    this.activeHandEditorTouchActionId = null;
    for (const state of this.controllers) {
      this.resetHandPinchState(state);
    }
    this.context.setStatus?.("Editor VR fechado.", { hideAfterMs: 1400 });
    return true;
  }

  toggleVrHandEditor() {
    if (this.isVrHandEditorOpen()) {
      this.closeVrHandEditor();
      return false;
    }
    return this.openVrHandEditor();
  }

  setVrHandEditorMode(mode) {
    const nextMode = normalizeVrHandEditorMode(mode);
    if (this.handEditorMode === nextMode) {
      return true;
    }

    this.handEditorMode = nextMode;
    this.context.setStatus?.(
      nextMode === "move"
        ? "Modo VR: mover hotspot."
        : nextMode === "rotate"
          ? "Modo VR: rotacionar hotspot."
          : nextMode === "label"
            ? "Modo VR: editar label."
            : "Modo VR: editar link.",
      { hideAfterMs: 1400 }
    );
    return true;
  }

  getVrHandEditorMode() {
    return this.handEditorMode;
  }

  getVrHandEditorSummary() {
    const bridge = this.context.getEditorBridge?.();
    const draftState = bridge?.draftStore?.getSnapshot?.();
    const draft = draftState?.draft ?? null;
    const selectedScene = this.getSelectedDraftScene();
    const selectedHotspot = this.getSelectedDraftHotspot();
    const targetTourId = String(selectedHotspot?.target_tour ?? draft?.id ?? "").trim() || null;
    const targetTourTitle = this.getEditorTourTitle(targetTourId);
    const targetSceneTitle = this.getEditorTargetSceneTitle(targetTourId, selectedHotspot?.target_scene);

    const createTarget = this.getVrCreateTargetSummary();

    return {
      mode: this.getVrHandEditorMode(),
      dirty: Boolean(draftState?.dirty),
      selectedSceneId: selectedScene?.id ?? null,
      selectedSceneTitle: selectedScene?.title ?? selectedScene?.id ?? null,
      selectedHotspotId: selectedHotspot?.id ?? null,
      selectedHotspotLabel: selectedHotspot ? getHotspotLabelText(selectedHotspot) : null,
      targetTourId,
      targetTourTitle,
      targetSceneId: selectedHotspot?.target_scene ?? null,
      targetSceneTitle,
      createTargetTourId: createTarget.tourId,
      createTargetTourTitle: createTarget.tourTitle,
      createTargetSceneId: createTarget.sceneId,
      createTargetSceneTitle: createTarget.sceneTitle,
      hint: this.getVrHandEditorHint()
    };
  }

  getVrHandEditorHint() {
    if (this.editorCreatePendingType) {
      return this.editorCreatePendingType === "annotation"
        ? "Aponte para o panorama e confirme para criar uma anotacao no local atual."
        : "Escolha a cena destino na lista e depois aponte para o panorama para confirmar a criacao do link.";
    }

    if (this.editorHotspotPickPending) {
      return "Aponte para um hotspot existente e confirme para seleciona-lo no editor VR.";
    }

    if (this.editorPlacementPending) {
      return "Aponte para o novo local do hotspot e confirme para reposiciona-lo.";
    }

    switch (this.getVrHandEditorMode()) {
      case "rotate":
        return "Pinch curto seleciona. Pinch continuo gira yaw/pitch; use o menu para roll e ajuste fino.";
      case "label":
        return "Pinch curto seleciona hotspot. A label e ajustada pelo menu da mao esquerda.";
      case "link":
        return "Pinch curto seleciona hotspot. Defina tour e cena destino pelo menu da mao esquerda.";
      default:
        return "Pinch curto seleciona. Pinch continuo arrasta o hotspot na direcao da reticula.";
    }
  }

  getVrHandEditorActionState(actionId) {
    const hotspot = this.getSelectedDraftHotspot();
    if (!hotspot) {
      return false;
    }

    switch (actionId) {
      case "toggle-marker-visible":
        return hotspot.marker_visible !== false;
      case "toggle-hotspot-billboard":
        return hotspot.billboard !== false;
      case "toggle-label-visible":
        return hotspot.label?.visible !== false;
      case "toggle-label-billboard":
        return hotspot.label?.billboard !== false;
      case "link-type-toggle":
        return hotspot.type === "scene_link";
      default:
        return false;
    }
  }

  async executeVrHandEditorAction(actionId) {
    switch (actionId) {
      case "save-draft":
        return this.markEditorDraftSaved();
      case "undo-draft":
        return this.undoEditorDraft();
      case "scene-prev":
        return this.cycleSelectedScene(-1);
      case "scene-next":
        return this.cycleSelectedScene(1);
      case "hotspot-prev":
        return this.cycleSelectedHotspot(-1);
      case "hotspot-next":
        return this.cycleSelectedHotspot(1);
      case "pick-hotspot":
        return this.requestHotspotSelectionMode();
      case "create-link-hotspot":
        return this.requestCreateHotspotMode("scene_link");
      case "create-note-hotspot":
        return this.requestCreateHotspotMode("annotation");
      case "delete-hotspot":
        return this.deleteSelectedHotspot();
      case "move-x-minus":
        return this.nudgeSelectedHotspotField("position.x", -HOTSPOT_POSITION_STEP);
      case "move-x-plus":
        return this.nudgeSelectedHotspotField("position.x", HOTSPOT_POSITION_STEP);
      case "move-y-minus":
        return this.nudgeSelectedHotspotField("position.y", -HOTSPOT_POSITION_STEP);
      case "move-y-plus":
        return this.nudgeSelectedHotspotField("position.y", HOTSPOT_POSITION_STEP);
      case "move-z-minus":
        return this.nudgeSelectedHotspotField("position.z", -HOTSPOT_POSITION_STEP);
      case "move-z-plus":
        return this.nudgeSelectedHotspotField("position.z", HOTSPOT_POSITION_STEP);
      case "move-ref-minus":
        return this.nudgeSelectedHotspotField("reference_depth", -HOTSPOT_REFERENCE_DEPTH_STEP, { min: 0.25 });
      case "move-ref-plus":
        return this.nudgeSelectedHotspotField("reference_depth", HOTSPOT_REFERENCE_DEPTH_STEP, { min: 0.25 });
      case "rotate-yaw-minus":
        return this.nudgeSelectedHotspotField("rotation.yaw", -HOTSPOT_ROTATION_STEP);
      case "rotate-yaw-plus":
        return this.nudgeSelectedHotspotField("rotation.yaw", HOTSPOT_ROTATION_STEP);
      case "rotate-pitch-minus":
        return this.nudgeSelectedHotspotField("rotation.pitch", -HOTSPOT_ROTATION_STEP);
      case "rotate-pitch-plus":
        return this.nudgeSelectedHotspotField("rotation.pitch", HOTSPOT_ROTATION_STEP);
      case "rotate-roll-minus":
        return this.nudgeSelectedHotspotField("rotation.roll", -HOTSPOT_ROTATION_STEP);
      case "rotate-roll-plus":
        return this.nudgeSelectedHotspotField("rotation.roll", HOTSPOT_ROTATION_STEP);
      case "toggle-marker-visible":
        return this.toggleSelectedHotspotField("marker_visible");
      case "toggle-hotspot-billboard":
        return this.toggleSelectedHotspotField("billboard");
      case "toggle-label-visible":
        return this.toggleSelectedHotspotLabelField("visible");
      case "toggle-label-billboard":
        return this.toggleSelectedHotspotLabelField("billboard");
      case "label-scale-minus":
        return this.nudgeSelectedHotspotLabelField("scale", -LABEL_SCALE_STEP, { min: 0.1 });
      case "label-scale-plus":
        return this.nudgeSelectedHotspotLabelField("scale", LABEL_SCALE_STEP, { min: 0.1 });
      case "label-offset-x-minus":
        return this.nudgeSelectedHotspotLabelField("position_offset.x", -LABEL_OFFSET_STEP);
      case "label-offset-x-plus":
        return this.nudgeSelectedHotspotLabelField("position_offset.x", LABEL_OFFSET_STEP);
      case "label-offset-y-minus":
        return this.nudgeSelectedHotspotLabelField("position_offset.y", -LABEL_OFFSET_STEP);
      case "label-offset-y-plus":
        return this.nudgeSelectedHotspotLabelField("position_offset.y", LABEL_OFFSET_STEP);
      case "label-offset-z-minus":
        return this.nudgeSelectedHotspotLabelField("position_offset.z", -LABEL_OFFSET_STEP);
      case "label-offset-z-plus":
        return this.nudgeSelectedHotspotLabelField("position_offset.z", LABEL_OFFSET_STEP);
      case "label-yaw-minus":
        return this.nudgeSelectedHotspotLabelField("rotation_offset.yaw", -LABEL_ROTATION_STEP);
      case "label-yaw-plus":
        return this.nudgeSelectedHotspotLabelField("rotation_offset.yaw", LABEL_ROTATION_STEP);
      case "link-type-toggle":
        return this.toggleSelectedHotspotType();
      case "link-tour-prev":
        return this.cycleSelectedHotspotTargetTour(-1);
      case "link-tour-next":
        return this.cycleSelectedHotspotTargetTour(1);
      case "link-scene-prev":
        return this.cycleSelectedHotspotTargetScene(-1);
      case "link-scene-next":
        return this.cycleSelectedHotspotTargetScene(1);
      case "link-use-current-scene":
        return this.useCurrentSceneAsSelectedHotspotTarget();
      default:
        return false;
    }
  }

  markEditorDraftSaved() {
    const bridge = this.context.getEditorBridge?.();
    if (!bridge?.draftStore?.saveDraft?.()) {
      return false;
    }
    this.context.setStatus?.("Draft do editor VR marcado como salvo.", { hideAfterMs: 1600 });
    return true;
  }

  undoEditorDraft() {
    const bridge = this.context.getEditorBridge?.();
    if (!bridge?.draftStore?.undo?.()) {
      this.context.setStatus?.("Nao ha alteracao anterior para desfazer.", { hideAfterMs: 1800 });
      return false;
    }
    this.context.setStatus?.("Ultima alteracao desfeita.", { hideAfterMs: 1600 });
    return true;
  }

  cycleSelectedScene(step) {
    const bridge = this.context.getEditorBridge?.();
    const draftState = bridge?.draftStore?.getSnapshot?.();
    const scenes = draftState?.draft?.scenes ?? [];
    if (scenes.length === 0) {
      this.context.setStatus?.("Nao ha cenas disponiveis para edicao.", { hideAfterMs: 1600 });
      return false;
    }

    const currentIndex = scenes.findIndex((scene) => scene.id === draftState.selectedSceneId);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextScene = scenes[modulo(safeIndex + step, scenes.length)];
    bridge.draftStore.setSelectedScene(nextScene.id);
    return true;
  }

  cycleSelectedHotspot(step) {
    const bridge = this.context.getEditorBridge?.();
    const draftState = bridge?.draftStore?.getSnapshot?.();
    const scene = this.getSelectedDraftScene();
    const hotspots = scene?.hotspots ?? [];
    if (hotspots.length === 0) {
      this.context.setStatus?.("A cena atual nao possui hotspots para editar.", { hideAfterMs: 1600 });
      return false;
    }

    const currentIndex = hotspots.findIndex((hotspot) => hotspot.id === draftState.selectedHotspotId);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextHotspot = hotspots[modulo(safeIndex + step, hotspots.length)];
    bridge.draftStore.setSelectedHotspot(nextHotspot.id);
    return true;
  }

  deleteSelectedHotspot() {
    const bridge = this.context.getEditorBridge?.();
    const hotspot = this.getSelectedDraftHotspot();
    if (!bridge || !hotspot) {
      this.context.setStatus?.("Selecione um hotspot antes de remover.", { hideAfterMs: 1800 });
      return false;
    }

    bridge.draftStore.captureUndoPoint?.();
    bridge.draftStore.deleteHotspot();
    this.context.setStatus?.(`Hotspot ${hotspot.id} removido do draft.`, { hideAfterMs: 1600 });
    return true;
  }

  toggleSelectedHotspotType() {
    const bridge = this.context.getEditorBridge?.();
    const hotspot = this.getSelectedDraftHotspot();
    if (!bridge || !hotspot) {
      this.context.setStatus?.("Selecione um hotspot antes de alterar o tipo.", { hideAfterMs: 1600 });
      return false;
    }

    bridge.draftStore.captureUndoPoint?.();
    bridge.draftStore.updateHotspotField("type", hotspot.type === "scene_link" ? "annotation" : "scene_link");
    return true;
  }

  toggleSelectedHotspotField(field) {
    const bridge = this.context.getEditorBridge?.();
    const hotspot = this.getSelectedDraftHotspot();
    if (!bridge || !hotspot) {
      this.context.setStatus?.("Selecione um hotspot antes de editar.", { hideAfterMs: 1600 });
      return false;
    }

    bridge.draftStore.captureUndoPoint?.();
    bridge.draftStore.updateHotspotField(field, !(getPathValue(hotspot, field) !== false));
    return true;
  }

  toggleSelectedHotspotLabelField(field) {
    const bridge = this.context.getEditorBridge?.();
    const hotspot = this.getSelectedDraftHotspot();
    if (!bridge || !hotspot) {
      this.context.setStatus?.("Selecione um hotspot antes de editar a label.", { hideAfterMs: 1600 });
      return false;
    }

    bridge.draftStore.captureUndoPoint?.();
    bridge.draftStore.updateHotspotLabelField(field, !(getPathValue(hotspot.label ?? {}, field) !== false));
    return true;
  }

  nudgeSelectedHotspotField(path, delta, { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = {}) {
    const bridge = this.context.getEditorBridge?.();
    const hotspot = this.getSelectedDraftHotspot();
    if (!bridge || !hotspot) {
      this.context.setStatus?.("Selecione um hotspot antes de ajustar valores.", { hideAfterMs: 1600 });
      return false;
    }

    const currentValue = Number(getPathValue(hotspot, path) ?? 0);
    const nextValue = clampNumber(roundNumber(currentValue + delta), min, max);
    bridge.draftStore.captureUndoPoint?.();
    bridge.draftStore.updateHotspotField(path, nextValue);
    return true;
  }

  getSelectedDraftScene() {
    const bridge = this.context.getEditorBridge?.();
    const snapshot = bridge?.draftStore?.getSnapshot?.();
    return snapshot?.draft?.scenes?.find((candidate) => candidate.id === snapshot.selectedSceneId) ?? null;
  }

  getVrHotspotListOptions() {
    const scene = this.getSelectedDraftScene();
    const bridge = this.context.getEditorBridge?.();
    const snapshot = bridge?.draftStore?.getSnapshot?.();
    const selectedHotspotId = snapshot?.selectedHotspotId ?? null;
    return (scene?.hotspots ?? []).map((hotspot) => ({
      id: hotspot.id,
      label: getHotspotLabelText(hotspot) || hotspot.id,
      selected: hotspot.id === selectedHotspotId
    }));
  }

  selectVrHotspotById(hotspotId) {
    const bridge = this.context.getEditorBridge?.();
    const scene = this.getSelectedDraftScene();
    const hotspot = scene?.hotspots?.find((candidate) => candidate.id === hotspotId) ?? null;
    if (!bridge || !scene || !hotspot) {
      this.context.setStatus?.("Nao consegui selecionar esse hotspot na lista.", { hideAfterMs: 1800 });
      return false;
    }

    bridge.draftStore.setSelectedHotspot(hotspot.id);
    this.context.setStatus?.(`Hotspot ${hotspot.id} selecionado no editor VR.`, { hideAfterMs: 1500 });
    return true;
  }

  getVrCreateSceneListOptions() {
    const bridge = this.context.getEditorBridge?.();
    const draft = bridge?.draftStore?.getSnapshot?.().draft;
    const selectedScene = this.getSelectedDraftScene();
    if (!draft || !selectedScene) {
      return [];
    }

    const selectedTargetSceneId = this.resolveCreateTargetSceneId();

    return (draft.scenes ?? [])
      .filter((scene) => scene.id !== selectedScene.id)
      .map((scene) => ({
        id: scene.id,
        label: scene.title || scene.id,
        selected: scene.id === selectedTargetSceneId
      }));
  }

  getVrCreateTargetSummary() {
    const bridge = this.context.getEditorBridge?.();
    const draft = bridge?.draftStore?.getSnapshot?.().draft;
    const sceneId = this.resolveCreateTargetSceneId();
    const tourId = String(
      this.editorCreatePendingTargetTourId ?? draft?.id ?? ""
    ).trim() || null;

    return {
      tourId,
      tourTitle: this.getEditorTourTitle(tourId),
      sceneId,
      sceneTitle: this.getEditorTargetSceneTitle(tourId, sceneId)
    };
  }

  getDefaultCreateTargetSceneId() {
    const bridge = this.context.getEditorBridge?.();
    const draft = bridge?.draftStore?.getSnapshot?.().draft;
    const selectedScene = this.getSelectedDraftScene();
    if (!draft || !selectedScene) {
      return null;
    }

    const availableScenes = (draft.scenes ?? []).filter((scene) => scene.id !== selectedScene.id);
    return availableScenes[0]?.id ?? null;
  }

  resolveCreateTargetSceneId() {
    const bridge = this.context.getEditorBridge?.();
    const draft = bridge?.draftStore?.getSnapshot?.().draft;
    const selectedScene = this.getSelectedDraftScene();
    const pendingSceneId = String(this.editorCreatePendingTargetSceneId ?? "").trim() || null;
    if (!draft || !selectedScene) {
      return pendingSceneId;
    }

    const isValidPendingScene = (draft.scenes ?? []).some(
      (scene) => scene.id === pendingSceneId && scene.id !== selectedScene.id
    );
    return isValidPendingScene ? pendingSceneId : this.getDefaultCreateTargetSceneId();
  }

  selectVrCreateSceneById(sceneId) {
    const bridge = this.context.getEditorBridge?.();
    const draft = bridge?.draftStore?.getSnapshot?.().draft;
    const selectedScene = this.getSelectedDraftScene();
    const normalizedSceneId = String(sceneId ?? "").trim();
    if (!draft || !selectedScene || !normalizedSceneId) {
      this.context.setStatus?.("Nao consegui definir a cena de destino do novo hotspot.", { hideAfterMs: 1800 });
      return false;
    }

    const targetScene = (draft.scenes ?? []).find(
      (scene) => scene.id === normalizedSceneId && scene.id !== selectedScene.id
    );
    if (!targetScene) {
      this.context.setStatus?.("A cena escolhida nao esta disponivel para este link.", { hideAfterMs: 1800 });
      return false;
    }

    this.editorCreatePendingTargetTourId = draft.id ?? null;
    this.editorCreatePendingTargetSceneId = targetScene.id;
    this.context.setStatus?.(`Destino do novo hotspot: ${targetScene.title || targetScene.id}.`, { hideAfterMs: 1600 });
    return true;
  }

  getEditorTourTitle(tourId) {
    const normalizedTourId = String(tourId ?? "").trim();
    if (!normalizedTourId) {
      return null;
    }

    const bridge = this.context.getEditorBridge?.();
    const draft = bridge?.draftStore?.getSnapshot?.().draft;
    if (draft?.id === normalizedTourId) {
      return draft.title ?? draft.id ?? normalizedTourId;
    }

    const cached = this.destinationCatalogCache.get(normalizedTourId);
    if (cached?.title) {
      return cached.title;
    }

    const entry = this.context.store.getSnapshot().master?.tours?.find((candidate) => candidate.id === normalizedTourId);
    return entry?.title ?? normalizedTourId;
  }

  getEditorTargetSceneTitle(tourId, sceneId) {
    const normalizedSceneId = String(sceneId ?? "").trim();
    if (!normalizedSceneId) {
      return null;
    }

    const bridge = this.context.getEditorBridge?.();
    const draft = bridge?.draftStore?.getSnapshot?.().draft;
    if (draft?.id === tourId) {
      const scene = draft.scenes?.find((candidate) => candidate.id === normalizedSceneId) ?? null;
      return scene?.title ?? scene?.id ?? normalizedSceneId;
    }

    const cached = this.destinationCatalogCache.get(String(tourId ?? "").trim());
    const scene = cached?.scenes?.find((candidate) => candidate.id === normalizedSceneId) ?? null;
    return scene?.title ?? scene?.id ?? normalizedSceneId;
  }

  async ensureEditorDestinationCatalog(tourId) {
    const normalizedTourId = String(tourId ?? "").trim();
    if (!normalizedTourId) {
      return null;
    }

    const bridge = this.context.getEditorBridge?.();
    const draft = bridge?.draftStore?.getSnapshot?.().draft;
    if (draft?.id === normalizedTourId) {
      return {
        tourId: draft.id ?? normalizedTourId,
        title: draft.title ?? draft.id ?? normalizedTourId,
        scenes: (draft.scenes ?? []).map((scene) => ({
          id: scene.id,
          title: scene.title || scene.id
        }))
      };
    }

    if (this.destinationCatalogCache.has(normalizedTourId)) {
      return this.destinationCatalogCache.get(normalizedTourId);
    }

    const catalog = await this.context.getEditorTourCatalog?.(normalizedTourId);
    if (catalog) {
      this.destinationCatalogCache.set(normalizedTourId, catalog);
    }
    return catalog ?? null;
  }

  getPreferredSceneIdFromCatalog(catalog, preferredSceneId, { avoidSceneId = null } = {}) {
    const scenes = catalog?.scenes ?? [];
    if (scenes.length === 0) {
      return null;
    }

    if (preferredSceneId && scenes.some((scene) => scene.id === preferredSceneId)) {
      return preferredSceneId;
    }

    return scenes.find((scene) => scene.id !== avoidSceneId)?.id
      ?? scenes[0]?.id
      ?? null;
  }

  async applySelectedHotspotLinkTarget(targetTourId, targetSceneId) {
    const bridge = this.context.getEditorBridge?.();
    const hotspot = this.getSelectedDraftHotspot();
    const selectedScene = this.getSelectedDraftScene();
    const draft = bridge?.draftStore?.getSnapshot?.().draft;
    if (!bridge || !hotspot || !draft) {
      this.context.setStatus?.("Selecione um hotspot antes de definir destino.", { hideAfterMs: 1800 });
      return false;
    }

    const normalizedTourId = String(targetTourId ?? draft.id ?? "").trim() || draft.id;
    const catalog = await this.ensureEditorDestinationCatalog(normalizedTourId);
    if (!catalog) {
      this.context.setStatus?.("Nao consegui carregar as cenas do tour destino.", { hideAfterMs: 2200 });
      return false;
    }

    const normalizedSceneId = this.getPreferredSceneIdFromCatalog(catalog, targetSceneId, {
      avoidSceneId: normalizedTourId === draft.id ? selectedScene?.id ?? null : null
    });
    if (!normalizedSceneId) {
      this.context.setStatus?.("O tour destino nao possui cenas disponiveis.", { hideAfterMs: 2200 });
      return false;
    }

    bridge.draftStore.captureUndoPoint?.();
    bridge.draftStore.updateHotspotField("target_tour", normalizedTourId);
    bridge.draftStore.updateHotspotField("target_scene", normalizedSceneId);
    return true;
  }

  async cycleSelectedHotspotTargetTour(step) {
    const bridge = this.context.getEditorBridge?.();
    const hotspot = this.getSelectedDraftHotspot();
    const draft = bridge?.draftStore?.getSnapshot?.().draft;
    if (!bridge || !hotspot || !draft) {
      this.context.setStatus?.("Selecione um hotspot antes de ajustar o tour destino.", { hideAfterMs: 1800 });
      return false;
    }

    const masterTours = [...(this.context.store.getSnapshot().master?.tours ?? [])];
    if (draft.id && !masterTours.some((tour) => tour.id === draft.id)) {
      masterTours.unshift({ id: draft.id, title: draft.title ?? draft.id });
    }
    if (masterTours.length === 0) {
      this.context.setStatus?.("Nao ha tours disponiveis para usar como destino.", { hideAfterMs: 2000 });
      return false;
    }

    const currentTargetTourId = String(hotspot.target_tour ?? draft.id ?? "").trim() || draft.id;
    const currentIndex = masterTours.findIndex((tour) => tour.id === currentTargetTourId);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextTour = masterTours[modulo(safeIndex + step, masterTours.length)];
    const catalog = await this.ensureEditorDestinationCatalog(nextTour.id);
    const nextSceneId = this.getPreferredSceneIdFromCatalog(catalog, hotspot.target_scene, {
      avoidSceneId: nextTour.id === draft.id ? this.getSelectedDraftScene()?.id ?? null : null
    });

    return this.applySelectedHotspotLinkTarget(nextTour.id, nextSceneId);
  }

  async cycleSelectedHotspotTargetScene(step) {
    const bridge = this.context.getEditorBridge?.();
    const hotspot = this.getSelectedDraftHotspot();
    const draft = bridge?.draftStore?.getSnapshot?.().draft;
    if (!bridge || !hotspot || !draft) {
      this.context.setStatus?.("Selecione um hotspot antes de ajustar a cena destino.", { hideAfterMs: 1800 });
      return false;
    }

    const targetTourId = String(hotspot.target_tour ?? draft.id ?? "").trim() || draft.id;
    const catalog = await this.ensureEditorDestinationCatalog(targetTourId);
    const scenes = catalog?.scenes ?? [];
    if (scenes.length === 0) {
      this.context.setStatus?.("Nao existe cena disponivel no tour destino.", { hideAfterMs: 2000 });
      return false;
    }

    const currentIndex = scenes.findIndex((scene) => scene.id === hotspot.target_scene);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextScene = scenes[modulo(safeIndex + step, scenes.length)];
    return this.applySelectedHotspotLinkTarget(targetTourId, nextScene.id);
  }

  useCurrentSceneAsSelectedHotspotTarget() {
    const bridge = this.context.getEditorBridge?.();
    const draft = bridge?.draftStore?.getSnapshot?.().draft;
    const selectedScene = this.getSelectedDraftScene();
    if (!bridge || !draft || !selectedScene) {
      this.context.setStatus?.("Nao consegui usar a cena atual como destino.", { hideAfterMs: 1800 });
      return false;
    }

    return this.applySelectedHotspotLinkTarget(draft.id, selectedScene.id);
  }

  selectHotspotInEditor(sceneId, hotspotId, successMessage = "Hotspot selecionado no editor VR.") {
    const bridge = this.context.getEditorBridge?.();
    if (!bridge?.draftStore?.selectHotspot?.(sceneId, hotspotId)) {
      return false;
    }

    this.syncHighlightedHotspot(hotspotId);
    this.context.setStatus?.(successMessage, { hideAfterMs: 1400 });
    return true;
  }

  resetHandPinchState(state) {
    if (!state) {
      return;
    }

    state.handPinchStartedAt = 0;
    state.handPinchManipulating = false;
    state.handPinchHotspotId = null;
    state.handPinchSceneId = null;
    state.handPinchInteractionType = null;
    state.handEditReferenceDepth = DEFAULT_RETICLE_DISTANCE;
  }

  updateVrHandEditorPinch(state, { pinched, pinchDistance }) {
    const now = performance.now();

    if (this.activeHandEditorTouchActionId) {
      this.resetHandPinchState(state);
      return;
    }

    if (!pinched) {
      if (state.wasPinched) {
        if (state.handPinchManipulating) {
          this.context.setStatus?.("Manipulacao do hotspot concluida.", { hideAfterMs: 1000 });
        } else if (
          now >= this.activationCooldownUntil
          && state.handPinchInteractionType === "hotspot"
          && state.handPinchHotspotId
          && state.handPinchSceneId
        ) {
          this.selectHotspotInEditor(state.handPinchSceneId, state.handPinchHotspotId);
          this.activationCooldownUntil = now + SELECTION_COOLDOWN_MS;
        }
      }

      this.resetHandPinchState(state);
      return;
    }

    if (!state.wasPinched) {
      state.handPinchStartedAt = now;
      state.handPinchInteractionType = this.currentReticleInteraction?.type ?? null;

      if (state.handPinchInteractionType === "hotspot") {
        const hotspot = this.getCurrentReticleHotspot();
        state.handPinchHotspotId = hotspot?.id ?? null;
        state.handPinchSceneId = this.context.store.getSnapshot().currentSceneId ?? null;
      } else if (
        state.handPinchInteractionType === "hand-editor-action"
        || state.handPinchInteractionType === "menu-action"
        || state.handPinchInteractionType === "editor-action"
      ) {
        if (now >= this.activationCooldownUntil) {
          this.selectCurrentReticleTarget({
            input: "hand-pinch-ui",
            index: state.index,
            handedness: state.handedness,
            pinchDistance
          });
          this.activationCooldownUntil = now + SELECTION_COOLDOWN_MS;
        }
      }
      return;
    }

    if (state.handPinchManipulating) {
      this.applyVrHandEditorManipulation(state);
      return;
    }

    const currentMode = this.getVrHandEditorMode();
    const canBeginManipulation =
      state.handPinchInteractionType == null
      || state.handPinchInteractionType === "hotspot";

    if (
      canBeginManipulation
      && (currentMode === "move" || currentMode === "rotate")
      && now - state.handPinchStartedAt >= PINCH_MANIPULATION_DELAY_MS
    ) {
      this.beginVrHandEditorManipulation(state);
      if (state.handPinchManipulating) {
        this.applyVrHandEditorManipulation(state);
      }
    }
  }

  beginVrHandEditorManipulation(state) {
    const bridge = this.context.getEditorBridge?.();
    const draftState = bridge?.draftStore?.getSnapshot?.();
    const sceneId = state.handPinchSceneId ?? draftState?.selectedSceneId ?? null;
    const hotspotId = state.handPinchHotspotId ?? draftState?.selectedHotspotId ?? null;
    if (!bridge || !sceneId || !hotspotId || !bridge.draftStore.selectHotspot(sceneId, hotspotId)) {
      return false;
    }

    const hotspot = this.getSelectedDraftHotspot();
    const raySource = this.getTrackedHandRaySource(state.hand);
    if (!hotspot || !raySource) {
      return false;
    }

    bridge.draftStore.captureUndoPoint?.();
    state.handPinchManipulating = true;
    state.handPinchHotspotId = hotspot.id;
    state.handPinchSceneId = sceneId;
    state.handEditReferenceDepth = Math.max(0.25, Number(hotspot.reference_depth ?? DEFAULT_RETICLE_DISTANCE));
    state.handEditStartRayDirection.copy(raySource.direction);
    state.handEditStartHotspotRotation = {
      yaw: Number(hotspot.rotation?.yaw ?? 0),
      pitch: Number(hotspot.rotation?.pitch ?? 0),
      roll: Number(hotspot.rotation?.roll ?? 0)
    };
    this.syncHighlightedHotspot(hotspot.id);
    return true;
  }

  applyVrHandEditorManipulation(state) {
    const bridge = this.context.getEditorBridge?.();
    if (!bridge || !state.handPinchHotspotId || !state.handPinchSceneId) {
      return;
    }

    if (!bridge.draftStore.selectHotspot(state.handPinchSceneId, state.handPinchHotspotId)) {
      this.resetHandPinchState(state);
      return;
    }

    const hotspot = this.getSelectedDraftHotspot();
    const raySource = this.getTrackedHandRaySource(state.hand);
    if (!hotspot || !raySource) {
      return;
    }

    if (this.getVrHandEditorMode() === "rotate") {
      const startAngles = directionToYawPitch(state.handEditStartRayDirection);
      const currentAngles = directionToYawPitch(raySource.direction);
      const nextRotation = {
        yaw: state.handEditStartHotspotRotation.yaw + normalizeDegrees(currentAngles.yaw - startAngles.yaw),
        pitch: state.handEditStartHotspotRotation.pitch + normalizeDegrees(currentAngles.pitch - startAngles.pitch),
        roll: state.handEditStartHotspotRotation.roll
      };

      bridge.draftStore.applySelectedHotspotTransform({ rotation: nextRotation });
      return;
    }

    const depth = Math.max(0.25, Number(hotspot.reference_depth ?? state.handEditReferenceDepth));
    const worldTarget = this.temp.reticleWorldTarget
      .copy(raySource.origin)
      .addScaledVector(raySource.direction, depth);
    const scenePosition = this.panoramaRenderer.worldToScene(worldTarget);
    const referenceDepth = Math.max(0.25, worldTarget.distanceTo(this.temp.headPosition));

    if (
      !hasSignificantPositionDelta(hotspot.position, scenePosition)
      && Math.abs(Number(hotspot.reference_depth ?? referenceDepth) - referenceDepth) < 0.0005
    ) {
      return;
    }

    bridge.draftStore.applySelectedHotspotTransform({
      position: {
        x: scenePosition.x,
        y: scenePosition.y,
        z: scenePosition.z
      },
      referenceDepth
    });
  }

  isVrDevControlsEnabled() {
    return Boolean(this.devControlsEnabled && this.isVrHotspotEditorEnabled());
  }

  getVrDevControlsMode() {
    return this.devControlsMode;
  }

  isVrDevGripActive() {
    return Boolean(this.getActiveDevHotspotId());
  }

  getActiveDevHotspotId() {
    return this.getRightControllerState()?.devActiveHotspotId ?? null;
  }

  isVrQuickNavOpen() {
    return this.quickNavOpen === true;
  }

  isVrQuickNavAvailable() {
    return !this.isVrDevControlsEnabled() && !this.isAnyVrEditorInterfaceOpen();
  }

  openVrQuickNav(handedness = "right") {
    if (!this.isVrQuickNavAvailable()) {
      return false;
    }

    const snapshot = this.context.store.getSnapshot();
    this.quickNavOpen = true;
    this.quickNavAnchorHandedness = handedness === "left" ? "left" : "right";
    this.quickNavSelectedSceneId = snapshot.currentSceneId ?? snapshot.currentTour?.initial_scene ?? null;
    this.quickNavSelectedTourId = snapshot.currentTourEntry?.id ?? snapshot.currentTour?.id ?? null;
    return true;
  }

  closeVrQuickNav() {
    this.quickNavOpen = false;
    this.quickNavWidget.setHighlightedAction(null);
    return true;
  }

  resetQuickNavInteraction() {
    this.quickNavOpen = false;
    for (const state of this.controllers) {
      state.quickNavGripPressed = false;
    }
  }

  updateQuickNavGripState() {
    if (!this.isVrQuickNavAvailable()) {
      this.resetQuickNavInteraction();
      return;
    }

    let hasAnchorController = false;

    for (const state of this.controllers) {
      const gamepad = this.getControllerGamepad(state);
      const gripPressed = isGamepadButtonPressed(gamepad, 1);

      if (gripPressed && !state.quickNavGripPressed && this.isControllerAimAvailable(state)) {
        this.openVrQuickNav(state.handedness);
        hasAnchorController = true;
      }

      if (this.quickNavAnchorHandedness === state.handedness && this.isControllerAimAvailable(state)) {
        hasAnchorController = true;
      }

      state.quickNavGripPressed = gripPressed;
    }

    if (this.quickNavOpen && !hasAnchorController) {
      this.closeVrQuickNav();
    }
  }

  getQuickNavAnchorControllerState() {
    if (!this.quickNavOpen) {
      return null;
    }

    const preferred = this.findControllerState(this.quickNavAnchorHandedness);
    if (preferred && this.isControllerAimAvailable(preferred)) {
      return preferred;
    }

    return this.findPrimaryControllerAimState();
  }

  getVrQuickNavState() {
    const snapshot = this.context.store.getSnapshot();
    const tours = snapshot.master?.tours ?? [];
    const currentTour = snapshot.currentTour ?? null;
    const selectedTour = tours.find((tour) => tour.id === this.quickNavSelectedTourId) ?? null;
    const selectedScene = currentTour?.scenes?.find((scene) => scene.id === this.quickNavSelectedSceneId) ?? null;
    const resolvedSceneId = selectedScene?.id ?? snapshot.currentSceneId ?? null;
    const resolvedSceneTitle = selectedScene?.title ?? selectedScene?.id ?? snapshot.currentScene?.title ?? null;
    const resolvedTourId = selectedTour?.id ?? snapshot.currentTourEntry?.id ?? null;
    const resolvedTourTitle = selectedTour?.title ?? snapshot.currentTourEntry?.title ?? null;

    return {
      currentSceneId: snapshot.currentSceneId ?? null,
      currentSceneTitle: snapshot.currentScene?.title ?? snapshot.currentSceneId ?? null,
      selectedSceneId: resolvedSceneId,
      selectedSceneTitle: resolvedSceneTitle,
      selectedTourId: resolvedTourId,
      selectedTourTitle: resolvedTourTitle
    };
  }

  cycleVrQuickNavScene(step) {
    const snapshot = this.context.store.getSnapshot();
    const scenes = snapshot.currentTour?.scenes ?? [];
    if (!scenes.length) {
      return false;
    }

    const currentIndex = scenes.findIndex((scene) => scene.id === this.quickNavSelectedSceneId);
    const safeIndex = currentIndex >= 0 ? currentIndex : scenes.findIndex((scene) => scene.id === snapshot.currentSceneId);
    const nextScene = scenes[modulo((safeIndex >= 0 ? safeIndex : 0) + step, scenes.length)];
    this.quickNavSelectedSceneId = nextScene?.id ?? this.quickNavSelectedSceneId;
    return true;
  }

  cycleVrQuickNavTour(step) {
    const snapshot = this.context.store.getSnapshot();
    const tours = snapshot.master?.tours ?? [];
    if (!tours.length) {
      return false;
    }

    const currentIndex = tours.findIndex((tour) => tour.id === this.quickNavSelectedTourId);
    const safeIndex = currentIndex >= 0 ? currentIndex : tours.findIndex((tour) => tour.id === snapshot.currentTourEntry?.id);
    const nextTour = tours[modulo((safeIndex >= 0 ? safeIndex : 0) + step, tours.length)];
    this.quickNavSelectedTourId = nextTour?.id ?? this.quickNavSelectedTourId;
    return true;
  }

  async executeVrQuickNavAction(actionId) {
    switch (actionId) {
      case "quick-nav-scene-prev":
        return this.cycleVrQuickNavScene(-1);
      case "quick-nav-scene-next":
        return this.cycleVrQuickNavScene(1);
      case "quick-nav-tour-prev":
        return this.cycleVrQuickNavTour(-1);
      case "quick-nav-tour-next":
        return this.cycleVrQuickNavTour(1);
      case "quick-nav-close":
        return this.closeVrQuickNav();
      case "quick-nav-open-scene": {
        const sceneId = this.getVrQuickNavState().selectedSceneId;
        if (!sceneId) {
          return false;
        }
        this.closeVrQuickNav();
        await this.context.goToScene?.(sceneId);
        return true;
      }
      case "quick-nav-open-tour": {
        const tourId = this.getVrQuickNavState().selectedTourId;
        if (!tourId) {
          return false;
        }
        this.closeVrQuickNav();
        await this.context.loadTour?.(tourId);
        return true;
      }
      default:
        return false;
    }
  }

  toggleVrDevControls() {
    if (!this.isVrHotspotEditorEnabled()) {
      this.context.setStatus?.("Entre em VR com ?editor=1 para usar os dev controls.", { hideAfterMs: 2000 });
      return false;
    }

    this.devControlsEnabled = !this.devControlsEnabled;
    this.clearEditorToolModes();
    this.resetDevControlsInteraction();

    this.context.setStatus?.(
      this.devControlsEnabled
        ? "Dev Controls ligados. Use o grip do controle direito para editar hotspots."
        : "Dev Controls desligados. O controle voltou ao modo normal do tour.",
      { hideAfterMs: 2200 }
    );

    return this.devControlsEnabled;
  }

  resetDevControlsInteraction() {
    for (const state of this.controllers) {
      state.devGripPressed = false;
      state.devThumbstickPressed = false;
      state.devActiveHotspotId = null;
      state.devActiveSceneId = null;
      state.devGrabRayDistance = DEFAULT_RETICLE_DISTANCE;
      state.devManualWorldOffset.set(0, 0, 0);
      state.devManualDepthOffset = 0;
      state.devManualRotationOffset.yaw = 0;
      state.devManualRotationOffset.pitch = 0;
      state.devManualRotationOffset.roll = 0;
    }
  }

  updateDevControllerEditing(deltaSeconds) {
    if (!this.isVrDevControlsEnabled()) {
      this.resetDevControlsInteraction();
      return;
    }

    const rightControllerState = this.getRightControllerState();

    if (!rightControllerState || !this.isControllerAimAvailable(rightControllerState)) {
      this.resetDevControllerState(rightControllerState);
      return;
    }

    const gamepad = this.getControllerGamepad(rightControllerState);
    if (!gamepad) {
      this.resetDevControllerState(rightControllerState);
      return;
    }

    const gripPressed = isGamepadButtonPressed(gamepad, 1);
    const thumbstickPressed = isGamepadButtonPressed(gamepad, 3);
    const buttonAPressed = isGamepadButtonPressed(gamepad, 4);
    const buttonBPressed = isGamepadButtonPressed(gamepad, 5);

    if (gripPressed && !rightControllerState.devGripPressed) {
      this.beginDevHotspotGrab(rightControllerState);
    } else if (!gripPressed && rightControllerState.devGripPressed) {
      this.endDevHotspotGrab(rightControllerState);
    }

    if (gripPressed && thumbstickPressed && !rightControllerState.devThumbstickPressed) {
      this.devControlsMode = this.devControlsMode === "move"
        ? "rotate"
        : this.devControlsMode === "rotate"
          ? "scale"
          : "move";
      if (this.devControlsMode === "move") {
        this.captureDevMoveReference(rightControllerState);
      } else if (this.devControlsMode === "rotate") {
        this.captureDevRotationReference(rightControllerState);
      }
      this.context.setStatus?.(
        this.devControlsMode === "move"
          ? "Dev Controls: modo movimentacao."
          : this.devControlsMode === "rotate"
            ? "Dev Controls: modo rotacao."
            : "Dev Controls: modo escala.",
        { hideAfterMs: 1600 }
      );
    }

    if (gripPressed && rightControllerState.devActiveHotspotId) {
      this.applyDevHotspotInteraction(rightControllerState, gamepad, deltaSeconds, {
        buttonAPressed,
        buttonBPressed
      });
    }

    rightControllerState.devGripPressed = gripPressed;
    rightControllerState.devThumbstickPressed = thumbstickPressed;
  }

  beginDevHotspotGrab(state) {
    const bridge = this.context.getEditorBridge?.();
    const sceneId = this.context.store.getSnapshot().currentSceneId;
    const hotspot = this.getCurrentReticleHotspot();
    if (!bridge || !sceneId || !hotspot) {
      state.devGripPressed = true;
      this.context.setStatus?.("Aponte para um hotspot e segure o grip para editar.", { hideAfterMs: 1600 });
      return;
    }

    const didSelect = bridge.draftStore.selectHotspot(sceneId, hotspot.id);
    if (!didSelect) {
      state.devGripPressed = true;
      return;
    }

    state.devActiveHotspotId = hotspot.id;
    state.devActiveSceneId = sceneId;
    bridge.draftStore.captureUndoPoint?.();
    this.syncHighlightedHotspot(hotspot.id);
    this.captureDevMoveReference(state, hotspot);
    this.captureDevRotationReference(state);
    this.context.setStatus?.("Hotspot capturado pelos Dev Controls.", { hideAfterMs: 1400 });
  }

  captureDevMoveReference(state, hotspot = null) {
    if (!state?.devActiveHotspotId) {
      return false;
    }

    const selectedHotspot = hotspot ?? this.getSelectedDraftHotspot();
    const raySource = this.getControllerRaySource(state);
    if (!selectedHotspot || !raySource) {
      return false;
    }

    const interactionDistance =
      this.currentReticleInteraction?.type === "hotspot" &&
      this.currentReticleInteraction.hotspot?.id === selectedHotspot.id
        ? Number(this.currentReticleInteraction.intersection?.distance ?? DEFAULT_RETICLE_DISTANCE)
        : null;

    if (Number.isFinite(interactionDistance) && interactionDistance > 0.1) {
      state.devGrabRayDistance = interactionDistance;
    } else {
      this.panoramaRenderer.sceneToWorld(selectedHotspot.position, this.temp.selectedHotspotWorldPosition);
      state.devGrabRayDistance = Math.max(
        0.25,
        this.temp.selectedHotspotWorldPosition.distanceTo(raySource.origin)
      );
    }

    this.temp.controllerRayPoint
      .copy(raySource.origin)
      .addScaledVector(raySource.direction, state.devGrabRayDistance);
    this.panoramaRenderer.sceneToWorld(selectedHotspot.position, this.temp.selectedHotspotWorldPosition);
    state.devManualWorldOffset
      .copy(this.temp.selectedHotspotWorldPosition)
      .sub(this.temp.controllerRayPoint);
    state.devManualDepthOffset = 0;
    return true;
  }

  captureDevRotationReference(state) {
    if (!state?.devActiveHotspotId) {
      return false;
    }

    const selectedHotspot = this.getSelectedDraftHotspot();
    const controllerQuaternion = this.getControllerWorldQuaternion(state);
    if (!selectedHotspot || !controllerQuaternion) {
      return false;
    }

    state.devGrabControllerQuaternion.copy(controllerQuaternion);
    state.devGrabHotspotRotation = {
      yaw: Number(selectedHotspot.rotation?.yaw ?? 0),
      pitch: Number(selectedHotspot.rotation?.pitch ?? 0),
      roll: Number(selectedHotspot.rotation?.roll ?? 0)
    };
    state.devManualRotationOffset.yaw = 0;
    state.devManualRotationOffset.pitch = 0;
    state.devManualRotationOffset.roll = 0;
    return true;
  }

  applyDevHotspotInteraction(state, gamepad, deltaSeconds, { buttonAPressed, buttonBPressed }) {
    const bridge = this.context.getEditorBridge?.();
    if (!bridge || !state?.devActiveHotspotId) {
      return;
    }

    const sceneId = this.context.store.getSnapshot().currentSceneId;
    if (sceneId !== state.devActiveSceneId || !bridge.draftStore.selectHotspot(sceneId, state.devActiveHotspotId)) {
      this.endDevHotspotGrab(state);
      return;
    }

    if (this.devControlsMode === "move") {
      const raySource = this.getControllerRaySource(state);
      const controllerQuaternion = this.getControllerWorldQuaternion(state);
      if (!raySource || !controllerQuaternion) {
        return;
      }

      const stick = getThumbstickAxes(gamepad, DEV_STICK_DEADZONE);
      const depthStep = -stick.y * DEV_DEPTH_MOVE_SPEED * deltaSeconds;
      const verticalStep = ((buttonBPressed ? 1 : 0) - (buttonAPressed ? 1 : 0)) * DEV_VERTICAL_BUTTON_SPEED * deltaSeconds;

      state.devManualDepthOffset += depthStep;
      this.temp.controllerRight.set(1, 0, 0).applyQuaternion(controllerQuaternion);
      this.temp.controllerRight.y = 0;
      if (this.temp.controllerRight.lengthSq() < 0.0001) {
        this.temp.controllerRight.set(1, 0, 0);
      }
      this.temp.controllerRight.normalize();
      state.devManualWorldOffset.addScaledVector(this.temp.controllerRight, stick.x * DEV_LATERAL_MOVE_SPEED * deltaSeconds);
      state.devManualWorldOffset.addScaledVector(this.temp.worldUp, verticalStep);

      const currentDepth = Math.max(0.25, state.devGrabRayDistance + state.devManualDepthOffset);
      this.temp.controllerRayPoint
        .copy(raySource.origin)
        .addScaledVector(raySource.direction, currentDepth);
      this.temp.devFinalWorldPosition
        .copy(this.temp.controllerRayPoint)
        .add(state.devManualWorldOffset);
      const referenceDepth = Math.max(
        0.25,
        this.temp.devFinalWorldPosition.distanceTo(this.temp.headPosition)
      );

      const scenePosition = this.panoramaRenderer.worldToScene(
        this.temp.devFinalWorldPosition,
        this.temp.controllerScenePosition
      );

      const nextPosition = {
        x: scenePosition.x,
        y: scenePosition.y,
        z: scenePosition.z
      };

      const selectedHotspot = this.getSelectedDraftHotspot();
      if (
        selectedHotspot
        && !hasSignificantPositionDelta(selectedHotspot.position, nextPosition)
        && Math.abs(Number(selectedHotspot.reference_depth ?? referenceDepth) - referenceDepth) < 0.0005
      ) {
        return;
      }

      bridge.draftStore.applySelectedHotspotTransform({
        position: nextPosition,
        referenceDepth
      });
      return;
    }

    if (this.devControlsMode === "scale") {
      const stick = getThumbstickAxes(gamepad, DEV_STICK_DEADZONE);
      const selectedHotspot = this.getSelectedDraftHotspot();
      if (!selectedHotspot) {
        return;
      }

      const nextScale = Math.max(
        0.1,
        Number(selectedHotspot.scale ?? 1) + (-stick.y * DEV_SCALE_SPEED * deltaSeconds)
      );
      if (Math.abs(nextScale - Number(selectedHotspot.scale ?? 1)) < 0.0005) {
        return;
      }

      bridge.draftStore.updateHotspotField("scale", nextScale);
      return;
    }

    const controllerQuaternion = this.getControllerWorldQuaternion(state);
    if (!controllerQuaternion) {
      return;
    }

    const stick = getThumbstickAxes(gamepad, DEV_STICK_DEADZONE);
    state.devManualRotationOffset.yaw += stick.x * DEV_ROTATE_SPEED * deltaSeconds;
    state.devManualRotationOffset.pitch += -stick.y * DEV_ROTATE_SPEED * deltaSeconds;
    state.devManualRotationOffset.roll += ((buttonBPressed ? 1 : 0) - (buttonAPressed ? 1 : 0)) * DEV_ROTATE_SPEED * deltaSeconds;

    this.temp.devInverseQuaternion.copy(state.devGrabControllerQuaternion).invert();
    this.temp.devDeltaQuaternion.copy(controllerQuaternion).multiply(this.temp.devInverseQuaternion);
    rotationToQuaternion(state.devGrabHotspotRotation, this.temp.devBaseQuaternion);
    this.temp.devResultQuaternion.copy(this.temp.devDeltaQuaternion).multiply(this.temp.devBaseQuaternion);

    const nextRotation = quaternionToRotation(this.temp.devResultQuaternion, this.temp.devEuler);
    nextRotation.yaw += state.devManualRotationOffset.yaw;
    nextRotation.pitch += state.devManualRotationOffset.pitch;
    nextRotation.roll += state.devManualRotationOffset.roll;

    bridge.draftStore.applySelectedHotspotTransform({ rotation: nextRotation });
  }

  endDevHotspotGrab(state) {
    this.resetDevControllerState(state);
  }

  resetDevControllerState(state) {
    if (!state) {
      return;
    }

    state.devGripPressed = false;
    state.devThumbstickPressed = false;
    state.devActiveHotspotId = null;
    state.devActiveSceneId = null;
    state.devGrabRayDistance = DEFAULT_RETICLE_DISTANCE;
    state.devManualWorldOffset.set(0, 0, 0);
    state.devManualDepthOffset = 0;
    state.devManualRotationOffset.yaw = 0;
    state.devManualRotationOffset.pitch = 0;
    state.devManualRotationOffset.roll = 0;
  }

  updateSnapTurnInput() {
    const controllerState = this.getSnapTurnControllerState();
    if (!controllerState) {
      for (const state of this.controllers) {
        state.snapTurnArmed = true;
      }
      return;
    }

    const gamepad = this.getControllerGamepad(controllerState);
    if (!gamepad) {
      controllerState.snapTurnArmed = true;
      return;
    }

    const stick = getThumbstickAxes(gamepad, DEV_STICK_DEADZONE);
    if (Math.abs(stick.x) < SNAP_TURN_THRESHOLD) {
      controllerState.snapTurnArmed = true;
      return;
    }

    if (!controllerState.snapTurnArmed) {
      return;
    }

    controllerState.snapTurnArmed = false;
    this.context.requestVrSnapTurn?.(stick.x > 0 ? -1 : 1, { degrees: SNAP_TURN_DEGREES });
  }

  getSnapTurnControllerState() {
    const rightControllerState = this.getRightControllerState();
    if (
      rightControllerState
      && this.isControllerAimAvailable(rightControllerState)
      && !rightControllerState.devGripPressed
      && !rightControllerState.devActiveHotspotId
    ) {
      return rightControllerState;
    }

    const leftControllerState = this.findControllerState("left");
    if (
      leftControllerState
      && this.isControllerAimAvailable(leftControllerState)
      && !leftControllerState.devGripPressed
      && !leftControllerState.devActiveHotspotId
    ) {
      return leftControllerState;
    }

    return null;
  }

  getSelectedDraftHotspot() {
    const bridge = this.context.getEditorBridge?.();
    const snapshot = bridge?.draftStore?.getSnapshot?.();
    const scene = snapshot?.draft?.scenes?.find((candidate) => candidate.id === snapshot.selectedSceneId);
    return scene?.hotspots?.find((candidate) => candidate.id === snapshot.selectedHotspotId) ?? null;
  }

  getVrDevTraceTargetLabel() {
    if (!this.isVrDevControlsEnabled()) {
      return "Trace: dev controls desligado";
    }

    const rightControllerState = this.getRightControllerState();
    const isActiveControllerSource =
      this.activeAimSource?.type === "controller" &&
      this.activeAimSource?.state === rightControllerState;

    if (!isActiveControllerSource) {
      return "Trace: controle direito nao e a fonte ativa";
    }

    const interaction = this.currentReticleInteraction;
    if (!interaction) {
      return "Trace: sem alvo";
    }

    const distance = Number(interaction.intersection?.distance);
    const distanceLabel = Number.isFinite(distance) ? ` @ ${roundNumber(distance)}m` : "";

    switch (interaction.type) {
      case "hotspot":
        return `Trace: hotspot ${interaction.hotspot?.id ?? "?"}${distanceLabel}`;
      case "controller-dev-menu-action":
        return `Trace: menu dev ${interaction.actionId ?? "?"}${distanceLabel}`;
      case "editor-action":
        return `Trace: widget ${interaction.actionId ?? "?"}${distanceLabel}`;
      case "hand-editor-action":
        return `Trace: hand editor ${interaction.actionId ?? "?"}${distanceLabel}`;
      case "menu-action":
        return `Trace: menu mao ${interaction.actionId ?? "?"}${distanceLabel}`;
      default:
        return `Trace: ${interaction.type ?? "desconhecido"}${distanceLabel}`;
    }
  }

  getVrDevMenuActionState(actionId) {
    const hotspot = this.getSelectedDraftHotspot();
    if (!hotspot) {
      return false;
    }

    switch (actionId) {
      case "toggle-marker-visible":
        return hotspot.marker_visible !== false;
      case "toggle-hotspot-billboard":
        return hotspot.billboard !== false;
      case "toggle-label-visible":
        return hotspot.label?.visible !== false;
      case "toggle-label-billboard":
        return hotspot.label?.billboard !== false;
      default:
        return false;
    }
  }

  executeVrDevMenuAction(actionId) {
    const bridge = this.context.getEditorBridge?.();
    const hotspot = this.getSelectedDraftHotspot();
    if (!bridge || !hotspot) {
      this.context.setStatus?.("Selecione um hotspot para editar no menu do controle esquerdo.", { hideAfterMs: 1800 });
      return false;
    }

    switch (actionId) {
      case "toggle-marker-visible":
        bridge.draftStore.captureUndoPoint?.();
        bridge.draftStore.updateHotspotField("marker_visible", !(hotspot.marker_visible !== false));
        return true;
      case "toggle-hotspot-billboard":
        bridge.draftStore.captureUndoPoint?.();
        bridge.draftStore.updateHotspotField("billboard", !(hotspot.billboard !== false));
        return true;
      case "toggle-label-visible":
        bridge.draftStore.captureUndoPoint?.();
        bridge.draftStore.updateHotspotLabelField("visible", !(hotspot.label?.visible !== false));
        return true;
      case "toggle-label-billboard":
        bridge.draftStore.captureUndoPoint?.();
        bridge.draftStore.updateHotspotLabelField("billboard", !(hotspot.label?.billboard !== false));
        return true;
      case "label-offset-x-minus":
        return this.nudgeSelectedHotspotLabelField("position_offset.x", -LABEL_OFFSET_STEP);
      case "label-offset-x-plus":
        return this.nudgeSelectedHotspotLabelField("position_offset.x", LABEL_OFFSET_STEP);
      case "label-offset-y-minus":
        return this.nudgeSelectedHotspotLabelField("position_offset.y", -LABEL_OFFSET_STEP);
      case "label-offset-y-plus":
        return this.nudgeSelectedHotspotLabelField("position_offset.y", LABEL_OFFSET_STEP);
      case "label-yaw-minus":
        return this.nudgeSelectedHotspotLabelField("rotation_offset.yaw", -LABEL_ROTATION_STEP);
      case "label-yaw-plus":
        return this.nudgeSelectedHotspotLabelField("rotation_offset.yaw", LABEL_ROTATION_STEP);
      case "label-scale-minus":
        return this.nudgeSelectedHotspotLabelField("scale", -LABEL_SCALE_STEP, { min: 0.1 });
      case "label-scale-plus":
        return this.nudgeSelectedHotspotLabelField("scale", LABEL_SCALE_STEP, { min: 0.1 });
      default:
        return false;
    }
  }

  nudgeSelectedHotspotLabelField(path, delta, { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = {}) {
    const bridge = this.context.getEditorBridge?.();
    const hotspot = this.getSelectedDraftHotspot();
    if (!bridge || !hotspot) {
      return false;
    }

    const currentValue = Number(getPathValue(hotspot.label ?? {}, path) ?? 0);
    const nextValue = clampNumber(roundNumber(currentValue + delta), min, max);
    bridge.draftStore.captureUndoPoint?.();
    bridge.draftStore.updateHotspotLabelField(path, nextValue);
    return true;
  }

  getControllerGamepad(state) {
    return state?.inputSource?.gamepad ?? null;
  }

  getControllerRaySource(state) {
    const sourceObject = state?.controller?.visible
      ? state.controller
      : state?.grip?.visible
        ? state.grip
        : null;

    if (!sourceObject) {
      return null;
    }

    this.temp.rotationMatrix.identity().extractRotation(sourceObject.matrixWorld);
    this.temp.controllerRayOrigin.setFromMatrixPosition(sourceObject.matrixWorld);
    this.temp.controllerRayDirection.set(0, 0, -1).applyMatrix4(this.temp.rotationMatrix).normalize();

    return {
      origin: this.temp.controllerRayOrigin,
      direction: this.temp.controllerRayDirection
    };
  }

  getControllerWorldQuaternion(state) {
    const sourceObject = state?.controller?.visible
      ? state.controller
      : state?.grip?.visible
        ? state.grip
        : null;

    if (!sourceObject) {
      return null;
    }

    return sourceObject.getWorldQuaternion(this.temp.controllerWorldQuaternion);
  }

  requestHotspotPlacementMode() {
    const bridge = this.context.getEditorBridge?.();
    const draftState = bridge?.draftStore?.getSnapshot?.();
    const scene = draftState?.draft?.scenes?.find((candidate) => candidate.id === draftState.selectedSceneId);
    const hotspot = scene?.hotspots?.find((candidate) => candidate.id === draftState.selectedHotspotId) ?? null;
    if (!hotspot) {
      this.context.setStatus?.("Selecione um hotspot antes de mover no VR.", { hideAfterMs: 1800 });
      return false;
    }

    this.editorCreatePendingType = null;
    this.editorPlacementPending = true;
    this.editorHotspotPickPending = false;
    this.context.setStatus?.("Aponte para o panorama e confirme para reposicionar o hotspot.", { hideAfterMs: 2200 });
    return true;
  }

  requestHotspotSelectionMode() {
    if (!this.isVrHotspotEditorEnabled()) {
      this.context.setStatus?.("Entre em VR com ?editor=1 para selecionar hotspots no editor.", { hideAfterMs: 1800 });
      return false;
    }

    this.editorCreatePendingType = null;
    this.editorHotspotPickPending = true;
    this.editorPlacementPending = false;
    this.context.setStatus?.("Aponte para um hotspot e confirme para seleciona-lo no editor.", { hideAfterMs: 2200 });
    return true;
  }

  requestCreateHotspotMode(type = "scene_link") {
    if (!this.isVrHotspotEditorEnabled()) {
      this.context.setStatus?.("Entre em VR com ?editor=1 para criar hotspots no editor.", { hideAfterMs: 1800 });
      return false;
    }

    this.editorCreatePendingType = type === "annotation" ? "annotation" : "scene_link";
    this.editorPlacementPending = false;
    this.editorHotspotPickPending = false;

    if (this.editorCreatePendingType === "scene_link") {
      const bridge = this.context.getEditorBridge?.();
      const draft = bridge?.draftStore?.getSnapshot?.().draft;
      this.editorCreatePendingTargetTourId = draft?.id ?? null;
      this.editorCreatePendingTargetSceneId = this.resolveCreateTargetSceneId();
      if (!this.editorCreatePendingTargetSceneId) {
        this.context.setStatus?.("Nao existe outra cena disponivel para vincular o novo hotspot.", { hideAfterMs: 2200 });
        this.editorCreatePendingType = null;
        return false;
      }
    }

    const createTarget = this.getVrCreateTargetSummary();
    this.context.setStatus?.(
      this.editorCreatePendingType === "annotation"
        ? "Aponte para o panorama e confirme para criar uma anotacao."
        : `Aponte para o panorama e confirme para criar um hotspot ligado a ${createTarget.sceneTitle ?? "cena destino"}.`,
      { hideAfterMs: 2200 }
    );
    return true;
  }

  tryHandleEditorToolMode(meta = {}) {
    if (!this.editorCreatePendingType && !this.editorPlacementPending && !this.editorHotspotPickPending) {
      return false;
    }

    const bridge = this.context.getEditorBridge?.();
    if (!bridge) {
      this.clearEditorToolModes();
      return false;
    }

    if (this.editorCreatePendingType) {
      if (
        this.currentReticleInteraction?.type === "menu-action"
        || this.currentReticleInteraction?.type === "editor-action"
        || this.currentReticleInteraction?.type === "hand-editor-action"
        || this.currentReticleInteraction?.type === "controller-dev-menu-action"
      ) {
        this.context.setStatus?.("Aponte para o panorama antes de confirmar a criacao do hotspot.", { hideAfterMs: 1800 });
        return true;
      }

      const draftState = bridge.draftStore.getSnapshot();
      const selectedScene = this.getSelectedDraftScene();
      const referenceDepth = Math.max(
        0.1,
        Number(this.getSelectedDraftHotspot()?.reference_depth ?? 8)
      );
      const position = this.getReticlePlacementPosition(referenceDepth);
      if (!selectedScene || !position) {
        this.context.setStatus?.("Nao consegui calcular uma posicao valida para criar o hotspot.", { hideAfterMs: 1800 });
        return true;
      }

      const createType = this.editorCreatePendingType;
      bridge.draftStore.captureUndoPoint?.();
      const createdHotspotId = bridge.draftStore.addHotspot(createType, {
        position,
        referenceDepth: position.depth ?? referenceDepth,
        targetTourId: createType === "scene_link" ? this.editorCreatePendingTargetTourId : null,
        targetSceneId: createType === "scene_link" ? this.editorCreatePendingTargetSceneId : null
      });

      this.editorCreatePendingType = null;
      if (createdHotspotId) {
        this.context.setStatus?.(
          createType === "annotation"
            ? `Anotacao ${createdHotspotId} criada no panorama.`
            : `Hotspot ${createdHotspotId} criado no panorama.`,
          { hideAfterMs: 1800 }
        );
      }
      return true;
    }

    if (this.editorHotspotPickPending) {
      if (this.currentReticleInteraction?.type === "hotspot" && this.currentReticleInteraction.hotspot) {
        const sceneId = this.context.store.getSnapshot().currentSceneId;
        const didSelect = bridge.draftStore.selectHotspot(sceneId, this.currentReticleInteraction.hotspot.id);
        this.editorHotspotPickPending = false;
        if (didSelect) {
          this.syncHighlightedHotspot(this.currentReticleInteraction.hotspot.id);
          this.context.setStatus?.("Hotspot selecionado no editor VR.", { hideAfterMs: 1600 });
          return true;
        }
      }

      this.context.setStatus?.("Aponte para um hotspot do tour para seleciona-lo.", { hideAfterMs: 1800 });
      return true;
    }

    if (this.editorPlacementPending) {
      if (this.currentReticleInteraction?.type === "menu-action" || this.currentReticleInteraction?.type === "editor-action") {
        this.context.setStatus?.("Aponte para o panorama antes de confirmar o novo local.", { hideAfterMs: 1800 });
        return true;
      }

      const draftState = bridge.draftStore.getSnapshot();
      const scene = draftState?.draft?.scenes?.find((candidate) => candidate.id === draftState.selectedSceneId);
      const hotspot = scene?.hotspots?.find((candidate) => candidate.id === draftState.selectedHotspotId) ?? null;
      const depth = Math.max(0.1, Number(hotspot?.reference_depth ?? 8));
      const position = this.getReticlePlacementPosition(depth);
      const didMove = bridge.placementController.moveSelectedHotspotToPosition(position, {
        successMessage: "Hotspot reposicionado pelo editor VR.",
        missingPositionMessage: "Nao consegui calcular uma posicao valida para o hotspot."
      });

      if (didMove) {
        this.editorPlacementPending = false;
      }
      return true;
    }

    return false;
  }

  getCurrentReticleHotspot() {
    return this.currentReticleInteraction?.type === "hotspot"
      ? this.currentReticleInteraction.hotspot
      : null;
  }

  getReticlePlacementPosition(depth = 8) {
    if (!this.activeAimSource) {
      return null;
    }

    const safeDepth = Math.max(0.1, Number(depth) || 8);
    const worldTarget = this.temp.reticleWorldTarget
      .copy(this.activeAimSource.origin)
      .addScaledVector(this.activeAimSource.direction, safeDepth);
    const scenePosition = this.panoramaRenderer.worldToScene(worldTarget);

    return {
      x: scenePosition.x,
      y: scenePosition.y,
      z: scenePosition.z,
      depth: safeDepth
    };
  }

  destroy() {
    this.syncHighlightedHotspot(null);
    this.clearEditorToolModes();
    this.resetQuickNavInteraction();
    this.handMenu.destroy();
    this.handEditorMenu.destroy();
    this.hotspotEditorWidget.destroy();
    this.controllerEditMenu.destroy();
    this.controllerDevLegend.destroy();
    this.quickNavWidget.destroy();
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
      depthTest: false,
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
      depthTest: false,
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

function isGamepadButtonPressed(gamepad, index) {
  return Boolean(gamepad?.buttons?.[index]?.pressed);
}

function getThumbstickAxes(gamepad, deadzone = 0.18) {
  const axes = Array.isArray(gamepad?.axes) ? gamepad.axes : [];
  const axisX = Number(axes.length >= 4 ? axes[2] : axes[0] ?? 0);
  const axisY = Number(axes.length >= 4 ? axes[3] : axes[1] ?? 0);

  return {
    x: applyDeadzone(axisX, deadzone),
    y: applyDeadzone(axisY, deadzone)
  };
}

function applyDeadzone(value, deadzone) {
  const magnitude = Math.abs(Number(value) || 0);
  if (magnitude <= deadzone) {
    return 0;
  }

  const normalized = (magnitude - deadzone) / Math.max(0.0001, 1 - deadzone);
  return Math.sign(value) * normalized;
}

function rotationToQuaternion(rotation, target = new THREE.Quaternion()) {
  const euler = new THREE.Euler(
    THREE.MathUtils.degToRad(Number(rotation?.pitch ?? 0)),
    THREE.MathUtils.degToRad(Number(rotation?.yaw ?? 0)),
    THREE.MathUtils.degToRad(Number(rotation?.roll ?? 0)),
    "YXZ"
  );
  return target.setFromEuler(euler);
}

function quaternionToRotation(quaternion, euler = new THREE.Euler(0, 0, 0, "YXZ")) {
  euler.setFromQuaternion(quaternion, "YXZ");
  return {
    yaw: THREE.MathUtils.radToDeg(euler.y),
    pitch: THREE.MathUtils.radToDeg(euler.x),
    roll: THREE.MathUtils.radToDeg(euler.z)
  };
}

function getPathValue(source, path) {
  return String(path ?? "")
    .split(".")
    .reduce((value, part) => value?.[part], source);
}

function roundNumber(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function modulo(value, length) {
  if (!length) {
    return 0;
  }
  return ((value % length) + length) % length;
}

function normalizeVrHandEditorMode(value) {
  return value === "rotate" || value === "label" || value === "link"
    ? value
    : "move";
}

function directionToYawPitch(direction) {
  const safeDirection = direction?.clone?.() ?? new THREE.Vector3(0, 0, -1);
  if (safeDirection.lengthSq() < 0.000001) {
    safeDirection.set(0, 0, -1);
  }
  safeDirection.normalize();

  return {
    yaw: THREE.MathUtils.radToDeg(Math.atan2(safeDirection.x, -safeDirection.z)),
    pitch: THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(safeDirection.y, -1, 1)))
  };
}

function normalizeDegrees(value) {
  let normalized = Number(value) || 0;
  while (normalized > 180) {
    normalized -= 360;
  }
  while (normalized < -180) {
    normalized += 360;
  }
  return normalized;
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

function hasSignificantPositionDelta(currentPosition, nextPosition, epsilon = 0.0005) {
  return Math.abs(Number(currentPosition?.x ?? 0) - Number(nextPosition?.x ?? 0)) >= epsilon
    || Math.abs(Number(currentPosition?.y ?? 0) - Number(nextPosition?.y ?? 0)) >= epsilon
    || Math.abs(Number(currentPosition?.z ?? 0) - Number(nextPosition?.z ?? 0)) >= epsilon;
}
