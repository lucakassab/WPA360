import * as THREE from "../../../vendor/three/three.module.js";

const BUTTON_GEOMETRY = new THREE.PlaneGeometry(0.115, 0.04);
const MENU_ACTIONS = [
  { id: "tour-prev", label: "Voltar Tour", position: [-0.07, 0.055, 0] },
  { id: "tour-next", label: "Avancar Tour", position: [0.07, 0.055, 0] },
  { id: "scene-prev", label: "Voltar Cena", position: [-0.07, 0.005, 0] },
  { id: "scene-next", label: "Avancar Cena", position: [0.07, 0.005, 0] },
  { id: "toggle-hotspot-editor", label: "Editor Hotspot", position: [0, -0.045, 0] },
  { id: "toggle-dev-controls", label: "Dev Controls", position: [0, -0.095, 0] },
  { id: "toggle-reticle-origin", label: "Mira: Mao Dir.", position: [-0.07, -0.145, 0] },
  { id: "exit-vr", label: "Sair do VR", position: [0.07, -0.145, 0] }
];

export class VRHandMenu {
  constructor({ root, context }) {
    this.root = root;
    this.context = context;
    this.group = new THREE.Group();
    this.group.name = "wpa360-left-hand-menu";
    this.group.visible = false;
    this.root.add(this.group);

    this.temp = {
      wrist: new THREE.Vector3(),
      indexMeta: new THREE.Vector3(),
      pinkyMeta: new THREE.Vector3(),
      middleMeta: new THREE.Vector3(),
      thumbTip: new THREE.Vector3(),
      indexTip: new THREE.Vector3(),
      middleTip: new THREE.Vector3(),
      ringTip: new THREE.Vector3(),
      pinkyTip: new THREE.Vector3(),
      palmCenter: new THREE.Vector3(),
      palmAcross: new THREE.Vector3(),
      fingerAxis: new THREE.Vector3(),
      fingerDelta: new THREE.Vector3(),
      palmNormal: new THREE.Vector3(),
      toHead: new THREE.Vector3(),
      averageTips: new THREE.Vector3(),
      targetPosition: new THREE.Vector3(),
      xAxis: new THREE.Vector3(),
      yAxis: new THREE.Vector3(),
      zAxis: new THREE.Vector3(),
      targetQuaternion: new THREE.Quaternion(),
      rotationMatrix: new THREE.Matrix4(),
      localTouchPoint: new THREE.Vector3()
    };

    this.visibilityScore = 0;
    this.highlightedActionId = null;
    this.reticleOrigin = null;

    this.entries = MENU_ACTIONS.map((action) => this.createButton(action));
    this.reticleToggleEntry = this.entries.find((entry) => entry.action.id === "toggle-reticle-origin") || null;
    this.editorToggleEntry = this.entries.find((entry) => entry.action.id === "toggle-hotspot-editor") || null;
    this.devControlsEntry = this.entries.find((entry) => entry.action.id === "toggle-dev-controls") || null;
    this.syncEditorToggleVisibility();
    this.syncEditorToggleLabel();
    this.syncDevControlsVisibility();
    this.syncDevControlsLabel();
    this.syncReticleToggleLabel();
  }

  createButton(action) {
    const idleTexture = createButtonTexture(action.label, false);
    const activeTexture = createButtonTexture(action.label, true);
    const material = new THREE.MeshBasicMaterial({
      map: idleTexture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide
    });

    const mesh = new THREE.Mesh(BUTTON_GEOMETRY, material);
    mesh.position.set(...action.position);
    mesh.userData.menuActionId = action.id;
    mesh.renderOrder = 20;
    this.group.add(mesh);

    return {
      action,
      mesh,
      idleTexture,
      activeTexture
    };
  }

  update(leftHandState, headPosition) {
    this.syncEditorToggleVisibility();
    this.syncEditorToggleLabel();
    this.syncDevControlsVisibility();
    this.syncDevControlsLabel();
    this.syncReticleToggleLabel();

    const shouldShowPose = leftHandState
      ? this.computePose(leftHandState, headPosition)
      : null;

    const targetScore = shouldShowPose ? 1 : 0;
    this.visibilityScore = THREE.MathUtils.clamp(
      THREE.MathUtils.lerp(
        this.visibilityScore,
        targetScore,
        targetScore > this.visibilityScore ? 0.2 : 0.12
      ),
      0,
      1
    );

    if (shouldShowPose && this.visibilityScore > 0.08) {
      if (!this.group.visible) {
        this.group.position.copy(this.temp.targetPosition);
        this.group.quaternion.copy(this.temp.targetQuaternion);
      } else {
        this.group.position.lerp(this.temp.targetPosition, 0.28);
        this.group.quaternion.slerp(this.temp.targetQuaternion, 0.28);
      }
    }

    this.group.visible = this.visibilityScore > 0.45;
    if (!this.group.visible) {
      this.setHighlightedAction(null);
    }
  }

  getInteractiveObjects() {
    if (!this.group.visible) {
      return [];
    }
    return this.entries.filter((entry) => entry.mesh.visible).map((entry) => entry.mesh);
  }

  getActionByObject(object) {
    let current = object;
    while (current) {
      if (current.userData?.menuActionId) {
        return current.userData.menuActionId;
      }
      current = current.parent;
    }
    return null;
  }

  getDirectTouchAction(worldPosition, {
    padding = 0.018,
    depthThreshold = 0.03
  } = {}) {
    if (!this.group.visible || !worldPosition) {
      return null;
    }

    const localPoint = this.temp.localTouchPoint.copy(worldPosition);
    this.group.worldToLocal(localPoint);

    let bestEntry = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const entry of this.entries) {
      if (!entry.mesh.visible) {
        continue;
      }

      const { mesh } = entry;
      const halfWidth = (BUTTON_GEOMETRY.parameters.width * mesh.scale.x) * 0.5;
      const halfHeight = (BUTTON_GEOMETRY.parameters.height * mesh.scale.y) * 0.5;

      const dx = localPoint.x - mesh.position.x;
      const dy = localPoint.y - mesh.position.y;
      const dz = localPoint.z - mesh.position.z;

      if (Math.abs(dz) > depthThreshold) {
        continue;
      }

      if (Math.abs(dx) > halfWidth + padding || Math.abs(dy) > halfHeight + padding) {
        continue;
      }

      const nx = Math.abs(dx) / Math.max(0.0001, halfWidth + padding);
      const ny = Math.abs(dy) / Math.max(0.0001, halfHeight + padding);
      const nz = Math.abs(dz) / Math.max(0.0001, depthThreshold);
      const score = nx + ny + nz * 0.35;

      if (score < bestScore) {
        bestScore = score;
        bestEntry = entry;
      }
    }

    return bestEntry?.action?.id ?? null;
  }

  setHighlightedAction(actionId) {
    if (this.highlightedActionId === actionId) {
      return;
    }

    this.highlightedActionId = actionId;
    for (const entry of this.entries) {
      entry.mesh.material.map = entry.action.id === actionId
        ? entry.activeTexture
        : entry.idleTexture;
      entry.mesh.material.needsUpdate = true;
    }
  }

  executeAction(actionId) {
    this.context.debugLog?.("vr:hand-menu-action", { actionId });

    switch (actionId) {
      case "tour-prev":
        return this.context.goToRelativeTour?.(-1);

      case "tour-next":
        return this.context.goToRelativeTour?.(1);

      case "scene-prev":
        return this.context.goToRelativeScene?.(-1);

      case "scene-next":
        return this.context.goToRelativeScene?.(1);

      case "toggle-hotspot-editor":
        return this.toggleHotspotEditor();

      case "toggle-dev-controls":
        return this.toggleDevControls();

      case "toggle-reticle-origin":
        return this.toggleReticleOrigin();

      case "exit-vr":
        return this.context.exitVrMode?.();

      default:
        return undefined;
    }
  }

  destroy() {
    for (const entry of this.entries) {
      entry.idleTexture.dispose();
      entry.activeTexture.dispose();
      entry.mesh.material.dispose();
      entry.mesh.removeFromParent();
    }

    this.entries = [];
    this.group.removeFromParent();
  }

  toggleReticleOrigin() {
    const currentOrigin = this.getReticleOrigin();
    const nextOrigin = currentOrigin === "right-hand" ? "gaze" : "right-hand";

    let result = nextOrigin;

    if (typeof this.context.setReticleProjectionOrigin === "function") {
      result = this.context.setReticleProjectionOrigin(nextOrigin);
    } else if (typeof this.context.toggleReticleProjectionOrigin === "function") {
      result = this.context.toggleReticleProjectionOrigin();
    } else if ("reticleProjectionOrigin" in this.context) {
      this.context.reticleProjectionOrigin = nextOrigin;
      result = nextOrigin;
    }

    this.reticleOrigin = this.getReticleOrigin();
    this.syncReticleToggleLabel();

    this.context.debugLog?.("vr:reticle-origin-changed", {
      requestedOrigin: nextOrigin,
      appliedOrigin: this.reticleOrigin
    });

    return result;
  }

  toggleHotspotEditor() {
    if (!this.isEditorAvailable()) {
      this.context.setStatus?.("Entre em VR com ?editor=1 para abrir o editor de hotspots.", { hideAfterMs: 1800 });
      return false;
    }

    const result = this.context.toggleVrHotspotEditor?.();
    this.syncEditorToggleLabel();
    return result;
  }

  isEditorAvailable() {
    return Boolean(this.context.isVrHotspotEditorEnabled?.());
  }

  isEditorOpen() {
    return Boolean(this.context.isVrHotspotEditorOpen?.());
  }

  getReticleOrigin() {
    const rawValue =
      (typeof this.context.getReticleProjectionOrigin === "function"
        ? this.context.getReticleProjectionOrigin()
        : undefined) ??
      this.context.reticleProjectionOrigin ??
      "right-hand";

    return this.normalizeReticleOrigin(rawValue);
  }

  normalizeReticleOrigin(value) {
    if (
      value === "right-hand" ||
      value === "rightHand" ||
      value === "hand" ||
      value === "hand-ray" ||
      value === "right-hand-ray"
    ) {
      return "right-hand";
    }
    return "gaze";
  }

  getReticleToggleLabel(origin) {
    return origin === "right-hand" ? "Mira: Mao Dir." : "Mira: Gaze";
  }

  syncReticleToggleLabel() {
    if (!this.reticleToggleEntry) {
      return;
    }

    const currentOrigin = this.getReticleOrigin();
    if (this.reticleOrigin === currentOrigin) {
      return;
    }

    this.reticleOrigin = currentOrigin;
    const nextLabel = this.getReticleToggleLabel(currentOrigin);
    this.updateEntryLabel(this.reticleToggleEntry, nextLabel);
  }

  syncEditorToggleVisibility() {
    if (!this.editorToggleEntry) {
      return;
    }

    const isVisible = this.isEditorAvailable();
    this.editorToggleEntry.mesh.visible = isVisible;
    if (!isVisible && this.highlightedActionId === this.editorToggleEntry.action.id) {
      this.setHighlightedAction(null);
    }
  }

  syncDevControlsVisibility() {
    if (!this.devControlsEntry) {
      return;
    }

    const isVisible = this.isEditorAvailable();
    this.devControlsEntry.mesh.visible = isVisible;
    if (!isVisible && this.highlightedActionId === this.devControlsEntry.action.id) {
      this.setHighlightedAction(null);
    }
  }

  syncEditorToggleLabel() {
    if (!this.editorToggleEntry || !this.isEditorAvailable()) {
      return;
    }

    const nextLabel = this.isEditorOpen() ? "Fechar Editor" : "Editor Hotspot";
    this.updateEntryLabel(this.editorToggleEntry, nextLabel);
  }

  syncDevControlsLabel() {
    if (!this.devControlsEntry || !this.isEditorAvailable()) {
      return;
    }

    const isEnabled = Boolean(this.context.isVrDevControlsEnabled?.());
    const nextLabel = isEnabled ? "Dev Ctrl: On" : "Dev Controls";
    this.updateEntryLabel(this.devControlsEntry, nextLabel);
  }

  updateEntryLabel(entry, nextLabel) {
    if (!entry || entry.action.label === nextLabel) {
      return;
    }

    entry.action.label = nextLabel;

    entry.idleTexture.dispose();
    entry.activeTexture.dispose();

    entry.idleTexture = createButtonTexture(nextLabel, false);
    entry.activeTexture = createButtonTexture(nextLabel, true);

    entry.mesh.material.map = entry.action.id === this.highlightedActionId
      ? entry.activeTexture
      : entry.idleTexture;
    entry.mesh.material.needsUpdate = true;
  }

  toggleDevControls() {
    if (!this.isEditorAvailable()) {
      this.context.setStatus?.("Entre em VR com ?editor=1 para usar Dev Controls.", { hideAfterMs: 1800 });
      return false;
    }

    const result = this.context.toggleVrDevControls?.() ?? false;
    this.syncDevControlsLabel();
    return result;
  }

  computePose(leftHandState, headPosition) {
    const wrist = copyJointPosition(leftHandState.hand, "wrist", this.temp.wrist);
    const indexMeta = copyJointPosition(leftHandState.hand, "index-finger-metacarpal", this.temp.indexMeta);
    const pinkyMeta = copyJointPosition(leftHandState.hand, "pinky-finger-metacarpal", this.temp.pinkyMeta);
    const middleMeta = copyJointPosition(leftHandState.hand, "middle-finger-metacarpal", this.temp.middleMeta);
    const thumbTip = copyJointPosition(leftHandState.hand, "thumb-tip", this.temp.thumbTip);
    const indexTip = copyJointPosition(leftHandState.hand, "index-finger-tip", this.temp.indexTip);
    const middleTip = copyJointPosition(leftHandState.hand, "middle-finger-tip", this.temp.middleTip);
    const ringTip = copyJointPosition(leftHandState.hand, "ring-finger-tip", this.temp.ringTip);
    const pinkyTip = copyJointPosition(leftHandState.hand, "pinky-finger-tip", this.temp.pinkyTip);

    if (!wrist || !indexMeta || !pinkyMeta || !middleMeta || !thumbTip || !indexTip || !middleTip || !ringTip || !pinkyTip) {
      return null;
    }

    const palmCenter = this.temp.palmCenter
      .copy(wrist)
      .add(indexMeta)
      .add(pinkyMeta)
      .add(middleMeta)
      .multiplyScalar(0.25);

    const palmAcross = this.temp.palmAcross.copy(indexMeta).sub(pinkyMeta);
    const averageTips = this.temp.averageTips
      .copy(indexTip)
      .add(middleTip)
      .add(ringTip)
      .add(pinkyTip)
      .multiplyScalar(0.25);

    const fingerAxis = this.temp.fingerAxis.copy(averageTips).sub(wrist);

    if (palmAcross.lengthSq() < 0.000001 || fingerAxis.lengthSq() < 0.000001) {
      return false;
    }

    palmAcross.normalize();
    fingerAxis.normalize();

    const palmNormal = this.temp.palmNormal.copy(fingerAxis).cross(palmAcross);
    if (palmNormal.lengthSq() < 0.000001) {
      return false;
    }
    palmNormal.normalize();

    const toHead = this.temp.toHead.copy(headPosition).sub(palmCenter).normalize();

    const palmFacingScore = palmNormal.dot(toHead);

    let openFingers = 0;
    if (this.temp.fingerDelta.copy(indexTip).sub(wrist).dot(fingerAxis) > 0.065) {
      openFingers += 1;
    }
    if (this.temp.fingerDelta.copy(middleTip).sub(wrist).dot(fingerAxis) > 0.065) {
      openFingers += 1;
    }
    if (this.temp.fingerDelta.copy(ringTip).sub(wrist).dot(fingerAxis) > 0.065) {
      openFingers += 1;
    }
    if (this.temp.fingerDelta.copy(pinkyTip).sub(wrist).dot(fingerAxis) > 0.065) {
      openFingers += 1;
    }

    const thumbIndexDistance = thumbTip.distanceTo(indexTip);
    const shouldShow = palmFacingScore > 0.42 && openFingers >= 3 && thumbIndexDistance > 0.045;

    const yAxis = this.temp.yAxis.copy(fingerAxis);

    const xAxis = this.temp.xAxis
      .copy(palmAcross)
      .addScaledVector(yAxis, -palmAcross.dot(yAxis));

    if (xAxis.lengthSq() < 0.000001) {
      return false;
    }
    xAxis.normalize();

    const zAxis = this.temp.zAxis.copy(xAxis).cross(yAxis);
    if (zAxis.lengthSq() < 0.000001) {
      return false;
    }
    zAxis.normalize();

    if (zAxis.dot(toHead) < 0) {
      xAxis.negate();
      zAxis.negate();
    }

    this.temp.targetPosition
      .copy(palmCenter)
      .addScaledVector(palmNormal, 0.055)
      .addScaledVector(yAxis, 0.02);

    this.temp.rotationMatrix.makeBasis(xAxis, yAxis, zAxis);
    this.temp.targetQuaternion.setFromRotationMatrix(this.temp.rotationMatrix);

    return shouldShow;
  }
}

function copyJointPosition(hand, jointName, target) {
  const joint = hand?.joints?.[jointName];
  if (!joint?.visible) {
    return null;
  }
  return joint.getWorldPosition(target);
}

function createButtonTexture(label, active) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  roundRect(ctx, 4, 4, canvas.width - 8, canvas.height - 8, 70);
  ctx.fillStyle = active ? "#fff3bc" : "rgba(10, 28, 34, 0.88)";
  ctx.fill();
  ctx.lineWidth = active ? 8 : 5;
  ctx.strokeStyle = active ? "#f0a85d" : "rgba(255, 255, 255, 0.22)";
  ctx.stroke();

  ctx.font = '700 46px "Segoe UI", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = active ? "#0b2b33" : "#f6f0e6";
  ctx.fillText(label, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}
