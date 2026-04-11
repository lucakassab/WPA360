import {
  getHotspotLabelRoll,
  getHotspotLabelScale,
  getHotspotLabelText,
  getHotspotLabelWorldPosition,
  getHotspotMarkerRoll,
  getHotspotScale,
  getHotspotSelectLabel,
  isHotspotLabelVisible,
  isHotspotMarkerVisible,
  isNavigableHotspot
} from "../../shared/HotspotVisualShared.js";

export class VRHotspotRenderer {
  constructor({ renderer, context }) {
    this.renderer = renderer;
    this.context = context;
    this.items = [];
    this.sceneItems = [];
    this.activeHotspotId = null;
  }

  render(scene) {
    this.destroy();
    this.sceneItems = [...(scene.hotspots ?? [])];

    for (const eyeName of ["left", "right"]) {
      const layer = eyeName === "left"
        ? this.renderer.leftEye.hotspotLayer
        : this.renderer.rightEye.hotspotLayer;

      for (const hotspot of scene.hotspots ?? []) {
        if (isHotspotMarkerVisible(hotspot)) {
          this.items.push(this.createItem(layer, eyeName, hotspot, {
            kind: "marker",
            position: hotspot.position,
            roll: getHotspotMarkerRoll(hotspot)
          }));
        }

        if (isHotspotLabelVisible(hotspot)) {
          this.items.push(this.createItem(layer, eyeName, hotspot, {
            kind: "label",
            position: getHotspotLabelWorldPosition(hotspot),
            roll: getHotspotLabelRoll(hotspot)
          }));
        }
      }
    }

    this.syncActiveStates();
    this.updateProjection();
  }

  createItem(layer, eyeName, hotspot, { kind, position, roll }) {
    const navigable = isNavigableHotspot(hotspot);
    const element = document.createElement(navigable ? "button" : "div");
    element.className = `hotspot hotspot-${kind} ${navigable ? "is-linked" : ""}`;
    element.dataset.hotspotId = hotspot.id;
    element.dataset.editorItemType = "hotspot";
    element.dataset.hotspotRole = kind;
    element.dataset.eye = eyeName;
    element.title = getHotspotSelectLabel(hotspot);
    element.setAttribute("aria-label", getHotspotSelectLabel(hotspot));
    element.addEventListener("pointerdown", stopPointerPropagation);

    if (navigable) {
      element.type = "button";
      element.addEventListener("click", (event) => this.handleHotspotClick(event, hotspot, eyeName));
    }

    if (kind === "marker") {
      const glyph = document.createElement("span");
      glyph.className = "hotspot-marker__glyph";
      element.append(glyph);
    } else {
      const label = document.createElement("span");
      label.className = "hotspot-label-text";
      label.textContent = getHotspotLabelText(hotspot);
      element.append(label);
    }

    layer.append(element);
    return { hotspot, element, eyeName, kind, position, roll };
  }

  setActiveHotspot(hotspotId) {
    const nextId = hotspotId ?? null;
    if (this.activeHotspotId === nextId) {
      return;
    }

    this.activeHotspotId = nextId;
    this.syncActiveStates();
  }

  syncActiveStates() {
    for (const { hotspot, element } of this.items) {
      const isActive = Boolean(this.activeHotspotId && hotspot.id === this.activeHotspotId);
      element.classList.toggle("is-active", isActive);
      element.setAttribute("aria-pressed", isActive ? "true" : "false");
      element.dataset.active = isActive ? "true" : "false";
    }
  }

  handleHotspotClick(event, hotspot, eyeName) {
    event.preventDefault();
    event.stopPropagation();

    this.setActiveHotspot(hotspot.id);

    this.context.debugLog?.("hotspot:click", {
      platform: "VR_platform",
      eye: eyeName,
      hotspotId: hotspot.id,
      label: getHotspotLabelText(hotspot),
      targetScene: hotspot.target_scene
    });

    if (!hotspot.target_scene) {
      this.context.debugLog?.("hotspot:navigation-skipped:no-target", {
        platform: "VR_platform",
        eye: eyeName,
        hotspotId: hotspot.id
      });
      return;
    }

    this.context.goToScene(hotspot.target_scene)
      ?.catch?.((error) => {
        console.error("[WPA360] hotspot navigation failed", error);
        this.context.setStatus?.(error.message, { hideAfterMs: 2400 });
      });
  }

  updateProjection() {
    const presenting = this.renderer.isPresenting();

    for (const { hotspot, element, eyeName, kind, position, roll } of this.items) {
      if (presenting) {
        element.classList.add("is-hidden");
        continue;
      }

      const projected = this.renderer.projectWorldToEye(position, eyeName);
      const scale = kind === "marker"
        ? getHotspotScale(hotspot, projected.depth)
        : getHotspotLabelScale(hotspot, projected.depth);

      element.style.left = `${projected.x}px`;
      element.style.top = `${projected.y}px`;
      element.style.zIndex = String(Math.max(1, Math.round(1000 - projected.depth)));
      element.style.transform = `translate(-50%, -50%) rotate(${roll}deg) scale(${scale})`;
      element.classList.toggle("is-hidden", !projected.visible);
    }

    this.syncActiveStates();
  }

  selectCenteredHotspot() {
    const hotspot = this.renderer.findCenteredHotspot(this.sceneItems);
    if (hotspot?.target_scene) {
      this.setActiveHotspot(hotspot.id);

      this.context.debugLog?.("hotspot:gaze-select", {
        platform: "VR_platform",
        hotspotId: hotspot.id,
        label: getHotspotLabelText(hotspot),
        targetScene: hotspot.target_scene
      });

      this.context.goToScene(hotspot.target_scene)
        ?.catch?.((error) => {
          console.error("[WPA360] hotspot gaze navigation failed", error);
          this.context.setStatus?.(error.message, { hideAfterMs: 2400 });
        });
      return true;
    }

    this.setActiveHotspot(null);
    this.context.setStatus("No scene hotspot is centered right now.", { hideAfterMs: 1200 });
    return false;
  }

  destroy() {
    for (const { element } of this.items) {
      element.remove();
    }
    this.items = [];
    this.sceneItems = [];
    this.activeHotspotId = null;
    this.renderer?.leftEye?.hotspotLayer.replaceChildren();
    this.renderer?.rightEye?.hotspotLayer.replaceChildren();
  }
}

function stopPointerPropagation(event) {
  event.stopPropagation();
}