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

export class TwoDHotspotRenderer {
  constructor({ root, context, project }) {
    this.root = root;
    this.context = context;
    this.project = project;
    this.items = [];
  }

  render(scene) {
    this.destroy();

    for (const hotspot of scene.hotspots ?? []) {
      if (isHotspotMarkerVisible(hotspot)) {
        this.items.push(this.createItem(hotspot, {
          kind: "marker",
          position: hotspot.position,
          roll: getHotspotMarkerRoll(hotspot)
        }));
      }

      if (isHotspotLabelVisible(hotspot)) {
        this.items.push(this.createItem(hotspot, {
          kind: "label",
          position: getHotspotLabelWorldPosition(hotspot),
          roll: getHotspotLabelRoll(hotspot)
        }));
      }
    }

    this.updateProjection();
  }

  createItem(hotspot, { kind, position, roll }) {
    const navigable = isNavigableHotspot(hotspot);
    const element = document.createElement(navigable ? "button" : "div");
    element.className = `hotspot hotspot-${kind} ${navigable ? "is-linked" : ""}`;
    element.dataset.hotspotId = hotspot.id;
    element.dataset.editorItemType = "hotspot";
    element.dataset.hotspotRole = kind;
    element.title = getHotspotSelectLabel(hotspot);
    element.addEventListener("pointerdown", stopPointerPropagation);

    if (navigable) {
      element.type = "button";
      element.addEventListener("click", (event) => this.handleHotspotClick(event, hotspot));
    }

    if (kind === "marker") {
      element.setAttribute("aria-label", getHotspotSelectLabel(hotspot));
      const glyph = document.createElement("span");
      glyph.className = "hotspot-marker__glyph";
      element.append(glyph);
    } else {
      const label = document.createElement("span");
      label.className = "hotspot-label-text";
      label.textContent = getHotspotLabelText(hotspot);
      element.append(label);
    }

    this.root.append(element);
    return { hotspot, element, kind, position, roll };
  }

  handleHotspotClick(event, hotspot) {
    event.preventDefault();
    event.stopPropagation();

    this.context.debugLog?.("hotspot:click", {
      platform: "2D_platform",
      hotspotId: hotspot.id,
      label: getHotspotLabelText(hotspot),
      targetScene: hotspot.target_scene
    });

    if (!hotspot.target_scene) {
      this.context.debugLog?.("hotspot:navigation-skipped:no-target", {
        platform: "2D_platform",
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
    for (const { hotspot, element, kind, position, roll } of this.items) {
      const projected = this.project(position);
      const scale = kind === "marker"
        ? getHotspotScale(hotspot, projected.depth)
        : getHotspotLabelScale(hotspot, projected.depth);

      element.style.left = `${projected.x}px`;
      element.style.top = `${projected.y}px`;
      element.style.zIndex = String(Math.max(1, Math.round(1000 - projected.depth)));
      element.style.transform = `translate(-50%, -50%) rotate(${roll}deg) scale(${scale})`;
      element.classList.toggle("is-hidden", !projected.visible);
    }
  }

  destroy() {
    for (const { element } of this.items) {
      element.remove();
    }
    this.items = [];
    this.root?.replaceChildren();
  }
}

function stopPointerPropagation(event) {
  event.stopPropagation();
}
