import * as THREE from "../../../vendor/three/three.module.js";
import { getHotspotLabelText } from "../../shared/HotspotVisualShared.js";

const MENU_BUTTON_GEOMETRY = new THREE.PlaneGeometry(0.11, 0.04);
const MENU_PANEL_GEOMETRY = new THREE.PlaneGeometry(0.52, 0.27);
const MENU_INFO_GEOMETRY = new THREE.PlaneGeometry(0.46, 0.08);
const LEGEND_PANEL_GEOMETRY = new THREE.PlaneGeometry(0.36, 0.22);
const MENU_ACTIONS = [
  { id: "toggle-marker-visible", label: "Marker\nvisivel", position: [-0.18, 0.06, 0.004], kind: "toggle" },
  { id: "toggle-hotspot-billboard", label: "Billboard\nhotspot", position: [-0.06, 0.06, 0.004], kind: "toggle" },
  { id: "toggle-label-visible", label: "Label\nvisivel", position: [0.06, 0.06, 0.004], kind: "toggle" },
  { id: "toggle-label-billboard", label: "Billboard\nlabel", position: [0.18, 0.06, 0.004], kind: "toggle" },
  { id: "label-offset-x-minus", label: "Label X\n-", position: [-0.18, 0.005, 0.004] },
  { id: "label-offset-x-plus", label: "Label X\n+", position: [-0.06, 0.005, 0.004] },
  { id: "label-offset-y-minus", label: "Label Y\n-", position: [0.06, 0.005, 0.004] },
  { id: "label-offset-y-plus", label: "Label Y\n+", position: [0.18, 0.005, 0.004] },
  { id: "label-yaw-minus", label: "Yaw da\nlabel -", position: [-0.18, -0.05, 0.004] },
  { id: "label-yaw-plus", label: "Yaw da\nlabel +", position: [-0.06, -0.05, 0.004] },
  { id: "label-scale-minus", label: "Escala\nlabel -", position: [0.06, -0.05, 0.004] },
  { id: "label-scale-plus", label: "Escala\nlabel +", position: [0.18, -0.05, 0.004] }
];
const QUICK_NAV_PANEL_GEOMETRY = new THREE.PlaneGeometry(0.54, 0.28);
const QUICK_NAV_INFO_GEOMETRY = new THREE.PlaneGeometry(0.48, 0.11);
const QUICK_NAV_ACTIONS = [
  { id: "quick-nav-scene-prev", label: "Cena\n-", position: [-0.18, 0.045, 0.004] },
  { id: "quick-nav-scene-next", label: "Cena\n+", position: [-0.06, 0.045, 0.004] },
  { id: "quick-nav-open-scene", label: "Abrir\ncena", position: [0.06, 0.045, 0.004] },
  { id: "quick-nav-close", label: "Fechar", position: [0.18, 0.045, 0.004], kind: "danger" },
  { id: "quick-nav-tour-prev", label: "Tour\n-", position: [-0.18, -0.01, 0.004] },
  { id: "quick-nav-tour-next", label: "Tour\n+", position: [-0.06, -0.01, 0.004] },
  { id: "quick-nav-open-tour", label: "Abrir\ntour", position: [0.06, -0.01, 0.004] }
];

export class VRControllerEditMenu {
  constructor({ root, context }) {
    this.root = root;
    this.context = context;
    this.group = new THREE.Group();
    this.group.name = "wpa360-vr-controller-edit-menu";
    this.group.visible = false;
    this.root.add(this.group);

    this.background = new THREE.Mesh(
      MENU_PANEL_GEOMETRY,
      new THREE.MeshBasicMaterial({
        color: new THREE.Color("#081418"),
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false
      })
    );
    this.background.renderOrder = 18;
    this.group.add(this.background);

    this.infoTexture = createCanvasTexture(1024, 200);
    this.infoMaterial = new THREE.MeshBasicMaterial({
      map: this.infoTexture,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false
    });
    this.infoPanel = new THREE.Mesh(MENU_INFO_GEOMETRY, this.infoMaterial);
    this.infoPanel.position.set(0, 0.105, 0.004);
    this.infoPanel.renderOrder = 19;
    this.group.add(this.infoPanel);

    this.entries = MENU_ACTIONS.map((action) => createButtonEntry(action, MENU_BUTTON_GEOMETRY));
    for (const entry of this.entries) {
      entry.mesh.userData.controllerDevMenuActionId = entry.action.id;
      this.group.add(entry.mesh);
    }

    this.highlightedActionId = null;
    this.lastInfoSignature = null;
    this.temp = createPoseTemp();
  }

  update(controllerState, headPosition) {
    if (!this.shouldShow(controllerState)) {
      this.group.visible = false;
      this.setHighlightedAction(null);
      return;
    }

    applyFloatingPose({
      group: this.group,
      sourceObject: getControllerAnchorObject(controllerState),
      headPosition,
      localOffset: new THREE.Vector3(-0.22, 0.06, -0.08),
      temp: this.temp
    });

    this.group.visible = true;
    this.syncButtonVisuals();
    this.redrawInfo();
  }

  shouldShow(controllerState) {
    return Boolean(
      this.context.isVrDevControlsEnabled?.() &&
      getControllerAnchorObject(controllerState)
    );
  }

  getInteractiveObjects() {
    if (!this.group.visible) {
      return [];
    }
    return this.entries.map((entry) => entry.mesh);
  }

  getActionByObject(object) {
    let current = object;
    while (current) {
      if (current.userData?.controllerDevMenuActionId) {
        return current.userData.controllerDevMenuActionId;
      }
      current = current.parent;
    }
    return null;
  }

  setHighlightedAction(actionId) {
    if (this.highlightedActionId === actionId) {
      return;
    }

    this.highlightedActionId = actionId ?? null;
    this.syncButtonVisuals();
  }

  executeAction(actionId) {
    return this.context.executeVrDevMenuAction?.(actionId) ?? false;
  }

  syncButtonVisuals() {
    for (const entry of this.entries) {
      const isToggleOn = entry.action.kind === "toggle"
        && Boolean(this.context.getVrDevMenuActionState?.(entry.action.id));
      const isHighlighted = entry.action.id === this.highlightedActionId;

      entry.mesh.material.map = isHighlighted || isToggleOn
        ? entry.activeTexture
        : entry.idleTexture;
      entry.mesh.material.needsUpdate = true;
    }
  }

  redrawInfo() {
    const selectedHotspot = this.context.getVrSelectedHotspot?.();
    const traceTarget = this.context.getVrDevTraceTargetLabel?.() ?? "Trace: sem dados";
    const signature = JSON.stringify({
      hotspotId: selectedHotspot?.id ?? null,
      label: getHotspotLabelText(selectedHotspot ?? {}),
      mode: this.context.getVrDevControlsMode?.() ?? "move",
      traceTarget
    });

    if (signature === this.lastInfoSignature) {
      return;
    }

    this.lastInfoSignature = signature;

    const ctx = this.infoTexture.image.getContext("2d");
    const width = this.infoTexture.image.width;
    const height = this.infoTexture.image.height;
    ctx.clearRect(0, 0, width, height);
    drawRoundedCard(ctx, 0, 0, width, height, 30);
    ctx.fillStyle = "rgba(7, 19, 24, 0.94)";
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
    ctx.stroke();

    ctx.fillStyle = "#f0a85d";
    ctx.font = '700 34px "Segoe UI", sans-serif';
    ctx.fillText("Edicao Rapida", 28, 42);

    ctx.fillStyle = "#f6f0e6";
    ctx.font = '600 24px "Segoe UI", sans-serif';
    const hotspotLine = selectedHotspot
      ? `Hotspot: ${selectedHotspot.id} (${getHotspotLabelText(selectedHotspot)})`
      : "Hotspot: nenhum selecionado";
    const mode = this.context.getVrDevControlsMode?.() ?? "move";
    const modeLine = `Modo: ${mode === "rotate" ? "rotacao" : mode === "scale" ? "escala" : "movimento"}`;
    const traceLine = traceTarget;
    fillWrappedText(ctx, hotspotLine, 28, 88, width - 56, 28);
    fillWrappedText(ctx, modeLine, 28, 118, width - 56, 28);
    fillWrappedText(ctx, traceLine, 28, 148, width - 56, 28);

    this.infoTexture.needsUpdate = true;
  }

  destroy() {
    for (const entry of this.entries) {
      entry.idleTexture.dispose();
      entry.activeTexture.dispose();
      entry.mesh.material.dispose();
      entry.mesh.removeFromParent();
    }

    this.infoTexture.dispose();
    this.infoMaterial.dispose();
    this.background.material.dispose();
    this.infoPanel.removeFromParent();
    this.background.removeFromParent();
    this.group.removeFromParent();
  }
}

export class VRControllerDevLegend {
  constructor({ root, context }) {
    this.root = root;
    this.context = context;
    this.group = new THREE.Group();
    this.group.name = "wpa360-vr-controller-dev-legend";
    this.group.visible = false;
    this.root.add(this.group);

    this.background = new THREE.Mesh(
      LEGEND_PANEL_GEOMETRY,
      new THREE.MeshBasicMaterial({
        color: new THREE.Color("#081418"),
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false
      })
    );
    this.background.renderOrder = 18;
    this.group.add(this.background);

    this.legendTexture = createCanvasTexture(1024, 620);
    this.legendMaterial = new THREE.MeshBasicMaterial({
      map: this.legendTexture,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false
    });
    this.legendPanel = new THREE.Mesh(LEGEND_PANEL_GEOMETRY, this.legendMaterial);
    this.legendPanel.position.set(0, 0, 0.004);
    this.legendPanel.renderOrder = 19;
    this.group.add(this.legendPanel);

    this.lastSignature = null;
    this.temp = createPoseTemp();
  }

  update(controllerState, headPosition) {
    if (!this.shouldShow(controllerState)) {
      this.group.visible = false;
      return;
    }

    applyFloatingPose({
      group: this.group,
      sourceObject: getControllerAnchorObject(controllerState),
      headPosition,
      localOffset: new THREE.Vector3(0.19, 0.07, -0.08),
      temp: this.temp
    });

    this.group.visible = true;
    this.redraw();
  }

  shouldShow(controllerState) {
    return Boolean(
      this.context.isVrDevControlsEnabled?.() &&
      getControllerAnchorObject(controllerState)
    );
  }

  redraw() {
    const selectedHotspot = this.context.getVrSelectedHotspot?.();
    const mode = this.context.getVrDevControlsMode?.() ?? "move";
    const gripActive = Boolean(this.context.isVrDevGripActive?.());
    const traceTarget = this.context.getVrDevTraceTargetLabel?.() ?? "Trace: sem dados";
    const signature = JSON.stringify({
      hotspotId: selectedHotspot?.id ?? null,
      label: getHotspotLabelText(selectedHotspot ?? {}),
      mode,
      gripActive,
      traceTarget
    });

    if (signature === this.lastSignature) {
      return;
    }

    this.lastSignature = signature;

    const ctx = this.legendTexture.image.getContext("2d");
    const width = this.legendTexture.image.width;
    const height = this.legendTexture.image.height;
    ctx.clearRect(0, 0, width, height);
    drawRoundedCard(ctx, 0, 0, width, height, 40);
    ctx.fillStyle = "rgba(7, 19, 24, 0.96)";
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(240, 168, 93, 0.42)";
    ctx.stroke();

    ctx.fillStyle = "#f0a85d";
    ctx.font = '700 44px "Segoe UI", sans-serif';
    ctx.fillText("Dev Controls", 34, 58);

    ctx.fillStyle = "#f6f0e6";
    ctx.font = '700 30px "Segoe UI", sans-serif';
    ctx.fillText(`Modo: ${mode === "rotate" ? "Rotacao" : mode === "scale" ? "Escala" : "Movimento"}`, 34, 108);

    ctx.font = '600 24px "Segoe UI", sans-serif';
    fillWrappedText(
      ctx,
      selectedHotspot
        ? `Hotspot: ${selectedHotspot.id} (${getHotspotLabelText(selectedHotspot)})`
        : "Hotspot: nenhum selecionado",
      34,
      152,
      width - 68,
      28
    );
    fillWrappedText(
      ctx,
      `Estado: ${gripActive ? "editando com grip pressionado" : "pronto para capturar com grip"}`,
      34,
      200,
      width - 68,
      28
    );
    fillWrappedText(ctx, traceTarget, 34, 244, width - 68, 28);

    const lines = mode === "rotate"
      ? [
          "Grip: mantem a edicao travada no hotspot selecionado.",
          "Mover controle: rotacao direta do hotspot.",
          "Stick X / Y: yaw e pitch.",
          "Botao B / A: roll positivo e negativo.",
          "Click no stick: troca para modo escala."
        ]
      : mode === "scale"
        ? [
            "Grip: mantem a edicao travada no hotspot selecionado.",
            "Stick Y: aumenta ou reduz a escala do hotspot.",
            "Mover controle: sem efeito neste modo.",
            "Botao B / A: sem ajuste dedicado em escala.",
            "Click no stick: volta para modo movimento."
          ]
      : [
          "Grip: captura o hotspot apontado e segue a reticula.",
          "Mover controle: move pela base da reticula.",
          "Stick X: offset lateral acumulado.",
          "Stick Y: aproximar e afastar no eixo de profundidade.",
          "Botao B / A: sobe e desce mantendo o offset.",
          "Click no stick: troca para modo rotacao."
        ];

    let cursorY = 298;
    for (const line of lines) {
      fillWrappedText(ctx, line, 34, cursorY, width - 68, 30);
      cursorY += 56;
    }

    this.legendTexture.needsUpdate = true;
  }

  destroy() {
    this.legendTexture.dispose();
    this.legendMaterial.dispose();
    this.background.material.dispose();
    this.legendPanel.removeFromParent();
    this.background.removeFromParent();
    this.group.removeFromParent();
  }
}

export class VRQuickNavWidget {
  constructor({ root, context }) {
    this.root = root;
    this.context = context;
    this.group = new THREE.Group();
    this.group.name = "wpa360-vr-quick-nav-widget";
    this.group.visible = false;
    this.root.add(this.group);

    this.background = new THREE.Mesh(
      QUICK_NAV_PANEL_GEOMETRY,
      new THREE.MeshBasicMaterial({
        color: new THREE.Color("#081418"),
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false
      })
    );
    this.background.renderOrder = 18;
    this.group.add(this.background);

    this.infoTexture = createCanvasTexture(1024, 280);
    this.infoMaterial = new THREE.MeshBasicMaterial({
      map: this.infoTexture,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false
    });
    this.infoPanel = new THREE.Mesh(QUICK_NAV_INFO_GEOMETRY, this.infoMaterial);
    this.infoPanel.position.set(0, 0.095, 0.004);
    this.infoPanel.renderOrder = 19;
    this.group.add(this.infoPanel);

    this.entries = QUICK_NAV_ACTIONS.map((action) => createButtonEntry(action, MENU_BUTTON_GEOMETRY));
    for (const entry of this.entries) {
      entry.mesh.userData.quickNavActionId = entry.action.id;
      this.group.add(entry.mesh);
    }

    this.highlightedActionId = null;
    this.lastInfoSignature = null;
    this.temp = createPoseTemp();
  }

  update(controllerState, headPosition) {
    if (!this.shouldShow(controllerState)) {
      this.group.visible = false;
      this.setHighlightedAction(null);
      return;
    }

    applyFloatingPose({
      group: this.group,
      sourceObject: getControllerAnchorObject(controllerState),
      headPosition,
      localOffset: new THREE.Vector3(0, 0.09, -0.16),
      temp: this.temp
    });

    this.group.visible = true;
    this.syncButtonVisuals();
    this.redrawInfo();
  }

  shouldShow(controllerState) {
    return Boolean(
      this.context.isVrQuickNavOpen?.() &&
      getControllerAnchorObject(controllerState)
    );
  }

  getInteractiveObjects() {
    if (!this.group.visible) {
      return [];
    }
    return this.entries.map((entry) => entry.mesh);
  }

  getActionByObject(object) {
    let current = object;
    while (current) {
      if (current.userData?.quickNavActionId) {
        return current.userData.quickNavActionId;
      }
      current = current.parent;
    }
    return null;
  }

  setHighlightedAction(actionId) {
    if (this.highlightedActionId === actionId) {
      return;
    }
    this.highlightedActionId = actionId ?? null;
    this.syncButtonVisuals();
  }

  executeAction(actionId) {
    return this.context.executeVrQuickNavAction?.(actionId) ?? false;
  }

  syncButtonVisuals() {
    for (const entry of this.entries) {
      const isHighlighted = entry.action.id === this.highlightedActionId;
      entry.mesh.material.map = isHighlighted ? entry.activeTexture : entry.idleTexture;
      entry.mesh.material.needsUpdate = true;
    }
  }

  redrawInfo() {
    const state = this.context.getVrQuickNavState?.() ?? {};
    const signature = JSON.stringify(state);
    if (signature === this.lastInfoSignature) {
      return;
    }
    this.lastInfoSignature = signature;

    const ctx = this.infoTexture.image.getContext("2d");
    const width = this.infoTexture.image.width;
    const height = this.infoTexture.image.height;
    ctx.clearRect(0, 0, width, height);
    drawRoundedCard(ctx, 0, 0, width, height, 30);
    ctx.fillStyle = "rgba(7, 19, 24, 0.94)";
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
    ctx.stroke();

    ctx.fillStyle = "#f0a85d";
    ctx.font = '700 34px "Segoe UI", sans-serif';
    ctx.fillText("Navegacao Rapida", 28, 42);

    ctx.fillStyle = "#f6f0e6";
    ctx.font = '600 24px "Segoe UI", sans-serif';
    fillWrappedText(
      ctx,
      `Cena atual: ${state.currentSceneTitle ?? state.currentSceneId ?? "-"}`,
      28,
      88,
      width - 56,
      28
    );
    fillWrappedText(
      ctx,
      `Cena selecionada: ${state.selectedSceneTitle ?? state.selectedSceneId ?? "-"}`,
      28,
      118,
      width - 56,
      28
    );
    fillWrappedText(
      ctx,
      `Tour selecionado: ${state.selectedTourTitle ?? state.selectedTourId ?? "-"}`,
      28,
      148,
      width - 56,
      28
    );
    fillWrappedText(
      ctx,
      "Segure o grip para abrir. Use trigger no painel para trocar de cena ou tour.",
      28,
      196,
      width - 56,
      28
    );

    this.infoTexture.needsUpdate = true;
  }

  destroy() {
    for (const entry of this.entries) {
      entry.idleTexture.dispose();
      entry.activeTexture.dispose();
      entry.mesh.material.dispose();
      entry.mesh.removeFromParent();
    }

    this.infoTexture.dispose();
    this.infoMaterial.dispose();
    this.background.material.dispose();
    this.infoPanel.removeFromParent();
    this.background.removeFromParent();
    this.group.removeFromParent();
  }
}

function createButtonEntry(action, geometry) {
  const idleTexture = createButtonTexture(action.label, false, action.kind === "toggle");
  const activeTexture = createButtonTexture(action.label, true, action.kind === "toggle");
  const material = new THREE.MeshBasicMaterial({
    map: idleTexture,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...action.position);
  mesh.renderOrder = 20;

  return {
    action,
    mesh,
    idleTexture,
    activeTexture
  };
}

function createCanvasTexture(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createButtonTexture(label, active, toggleStyle = false) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawRoundedCard(ctx, 4, 4, canvas.width - 8, canvas.height - 8, 62);

  if (toggleStyle) {
    ctx.fillStyle = active ? "#fff2c4" : "rgba(9, 26, 32, 0.92)";
    ctx.fill();
    ctx.lineWidth = active ? 8 : 5;
    ctx.strokeStyle = active ? "#f0a85d" : "rgba(255, 255, 255, 0.2)";
    ctx.stroke();
    ctx.fillStyle = active ? "#0b2b33" : "#f6f0e6";
  } else {
    ctx.fillStyle = active ? "#ffe7b8" : "rgba(11, 31, 38, 0.9)";
    ctx.fill();
    ctx.lineWidth = active ? 8 : 5;
    ctx.strokeStyle = active ? "#f0a85d" : "rgba(255, 255, 255, 0.18)";
    ctx.stroke();
    ctx.fillStyle = active ? "#0b2b33" : "#f6f0e6";
  }

  drawCenteredButtonText(ctx, label, canvas.width / 2, canvas.height / 2, canvas.width - 56);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createPoseTemp() {
  return {
    anchorPosition: new THREE.Vector3(),
    anchorQuaternion: new THREE.Quaternion(),
    offset: new THREE.Vector3(),
    headPosition: new THREE.Vector3(),
    up: new THREE.Vector3(0, 1, 0),
    targetPosition: new THREE.Vector3(),
    lookTarget: new THREE.Vector3(),
    rotationMatrix: new THREE.Matrix4(),
    targetQuaternion: new THREE.Quaternion()
  };
}

function applyFloatingPose({ group, sourceObject, headPosition, localOffset, temp }) {
  if (!sourceObject || !headPosition) {
    group.visible = false;
    return;
  }

  sourceObject.getWorldPosition(temp.anchorPosition);
  sourceObject.getWorldQuaternion(temp.anchorQuaternion);
  temp.headPosition.set(
    Number(headPosition.x ?? 0),
    Number(headPosition.y ?? 0),
    Number(headPosition.z ?? 0)
  );

  temp.offset.copy(localOffset).applyQuaternion(temp.anchorQuaternion);
  temp.targetPosition.copy(temp.anchorPosition).add(temp.offset);
  temp.lookTarget.copy(temp.headPosition);
  temp.rotationMatrix.lookAt(temp.lookTarget, temp.targetPosition, temp.up);
  temp.targetQuaternion.setFromRotationMatrix(temp.rotationMatrix);

  if (!group.visible) {
    group.position.copy(temp.targetPosition);
    group.quaternion.copy(temp.targetQuaternion);
  } else {
    group.position.lerp(temp.targetPosition, 0.34);
    group.quaternion.slerp(temp.targetQuaternion, 0.34);
  }
}

function getControllerAnchorObject(controllerState) {
  if (controllerState?.grip?.visible) {
    return controllerState.grip;
  }
  if (controllerState?.controller?.visible) {
    return controllerState.controller;
  }
  return null;
}

function drawRoundedCard(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function fillWrappedText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  let line = "";
  let cursorY = y;

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width <= maxWidth) {
      line = testLine;
      continue;
    }

    if (line) {
      ctx.fillText(line, x, cursorY);
      cursorY += lineHeight;
    }
    line = word;
  }

  if (line) {
    ctx.fillText(line, x, cursorY);
  }
}

function drawCenteredButtonText(ctx, label, centerX, centerY, maxWidth) {
  const lines = String(label ?? "").split("\n").filter(Boolean);
  const fontSize = lines.length > 1 ? 28 : 40;
  const lineHeight = lines.length > 1 ? 34 : 44;
  ctx.font = `700 ${fontSize}px "Segoe UI", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const renderedLines = [];
  for (const rawLine of lines) {
    const wrapped = wrapTextToWidth(ctx, rawLine, maxWidth);
    renderedLines.push(...wrapped);
  }

  const totalHeight = (renderedLines.length - 1) * lineHeight;
  let cursorY = centerY - totalHeight / 2;
  for (const line of renderedLines) {
    ctx.fillText(line, centerX, cursorY);
    cursorY += lineHeight;
  }
}

function wrapTextToWidth(ctx, text, maxWidth) {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [""];
  }

  const lines = [];
  let line = "";

  for (const word of words) {
    const nextLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(nextLine).width <= maxWidth || !line) {
      line = nextLine;
      continue;
    }

    lines.push(line);
    line = word;
  }

  if (line) {
    lines.push(line);
  }

  return lines;
}
