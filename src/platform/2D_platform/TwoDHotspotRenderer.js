import {
  getHotspotLabelRoll,
  getHotspotLabelScale,
  getHotspotMarkerIconSrc,
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
    this.itemsByKey = new Map();
    this.interactionLocked = false;
  }

  setInteractionLocked(locked) {
    this.interactionLocked = locked === true;
    if (this.root) {
      this.root.style.pointerEvents = this.interactionLocked ? "none" : "";
      this.root.style.visibility = this.interactionLocked ? "hidden" : "";
    }
  }

  render(scene) {
    const nextItems = [];
    const seenKeys = new Set();

    for (const hotspot of scene.hotspots ?? []) {
      if (isHotspotMarkerVisible(hotspot)) {
        const item = this.syncItem(hotspot, {
          kind: "marker",
          position: hotspot.position,
          roll: getHotspotMarkerRoll(hotspot)
        });
        nextItems.push(item);
        seenKeys.add(item.key);
      }

      if (isHotspotLabelVisible(hotspot)) {
        const item = this.syncItem(hotspot, {
          kind: "label",
          position: getHotspotLabelWorldPosition(hotspot),
          roll: getHotspotLabelRoll(hotspot)
        });
        nextItems.push(item);
        seenKeys.add(item.key);
      }
    }

    for (const [key, item] of this.itemsByKey.entries()) {
      if (!seenKeys.has(key)) {
        this.disposeItem(item);
        this.itemsByKey.delete(key);
      }
    }

    this.items = nextItems;
    this.updateProjection();
  }

  syncItem(hotspot, { kind, position, roll }) {
    const key = createItemKey(hotspot.id, kind);
    let item = this.itemsByKey.get(key);
    if (!item) {
      item = this.createItem(hotspot, { key, kind, position, roll });
      this.itemsByKey.set(key, item);
    }

    item.hotspot = hotspot;
    item.position = position;
    item.roll = roll;
    this.updateItemElement(item);
    return item;
  }

  createItem(hotspot, { key, kind, position, roll }) {
    const element = document.createElement(isNavigableHotspot(hotspot) ? "button" : "div");
    const item = {
      key,
      hotspot,
      element,
      kind,
      position,
      roll,
      onPointerDown: stopPointerPropagation,
      onClick: (event) => this.handleHotspotClick(event, item)
    };

    element.dataset.hotspotId = hotspot.id;
    element.dataset.editorItemType = "hotspot";
    element.dataset.hotspotRole = kind;
    element.addEventListener("pointerdown", item.onPointerDown);
    this.root.append(element);
    this.updateItemElement(item);
    return item;
  }

  updateItemElement(item) {
    const { hotspot, element, kind } = item;
    const label = getHotspotSelectLabel(hotspot);
    const navigable = isNavigableHotspot(hotspot);
    const tagName = navigable ? "BUTTON" : "DIV";
    if (element.tagName !== tagName) {
      const replacement = document.createElement(navigable ? "button" : "div");
      replacement.addEventListener("pointerdown", item.onPointerDown);
      element.replaceWith(replacement);
      item.element = replacement;
    }

    const activeElement = item.element;
    activeElement.className = `hotspot hotspot-${kind} ${navigable ? "is-linked" : ""}`;
    activeElement.dataset.hotspotId = hotspot.id;
    activeElement.dataset.editorItemType = "hotspot";
    activeElement.dataset.hotspotRole = kind;
    activeElement.title = label;

    activeElement.removeEventListener("click", item.onClick);
    if (navigable) {
      activeElement.type = "button";
      activeElement.setAttribute("aria-label", label);
      activeElement.addEventListener("click", item.onClick);
    } else {
      activeElement.removeAttribute("type");
      if (kind === "marker") {
        activeElement.setAttribute("aria-label", label);
      } else {
        activeElement.removeAttribute("aria-label");
      }
    }

    syncItemContent(activeElement, hotspot, kind);
  }

  handleHotspotClick(event, item) {
    if (this.interactionLocked) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const hotspot = item.hotspot;
    event.preventDefault();
    event.stopPropagation();

    this.context.debugLog?.("hotspot:click", {
      platform: "2D_platform",
      hotspotId: hotspot.id,
      label: getHotspotLabelText(hotspot),
      targetTour: hotspot.target_tour ?? null,
      targetScene: hotspot.target_scene
    });

    if (!hotspot.target_scene) {
      this.context.debugLog?.("hotspot:navigation-skipped:no-target", {
        platform: "2D_platform",
        hotspotId: hotspot.id
      });
      return;
    }

    const navigate = typeof this.context.goToHotspotTarget === "function"
      ? this.context.goToHotspotTarget(hotspot, { source: "2D_platform" })
      : this.context.goToScene(hotspot.target_scene);

    navigate
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

  disposeItem(item) {
    item.element?.removeEventListener("pointerdown", item.onPointerDown);
    item.element?.removeEventListener("click", item.onClick);
    item.element?.remove();
  }

  destroy() {
    for (const item of this.itemsByKey.values()) {
      this.disposeItem(item);
    }
    this.items = [];
    this.itemsByKey.clear();
    this.root?.replaceChildren();
  }
}

function createItemKey(hotspotId, kind) {
  return `${hotspotId}:${kind}`;
}

function syncItemContent(element, hotspot, kind) {
  if (kind === "marker") {
    const iconSrc = getHotspotMarkerIconSrc(hotspot);
    let glyph = element.firstElementChild;
    if (iconSrc) {
      if (!glyph || !glyph.classList.contains("hotspot-marker__image")) {
        element.replaceChildren();
        glyph = document.createElement("img");
        glyph.className = "hotspot-marker__image";
        glyph.alt = "";
        glyph.draggable = false;
        glyph.style.width = "100%";
        glyph.style.height = "100%";
        glyph.style.objectFit = "contain";
        glyph.style.display = "block";
        glyph.style.pointerEvents = "none";
        element.append(glyph);
      }
      if (glyph.getAttribute("src") !== iconSrc) {
        glyph.setAttribute("src", iconSrc);
      }
      return;
    }

    if (!glyph || !glyph.classList.contains("hotspot-marker__glyph")) {
      element.replaceChildren();
      glyph = document.createElement("span");
      glyph.className = "hotspot-marker__glyph";
      element.append(glyph);
    }
    return;
  }

  let label = element.firstElementChild;
  if (!label || !label.classList.contains("hotspot-label-text")) {
    element.replaceChildren();
    label = document.createElement("span");
    label.className = "hotspot-label-text";
    element.append(label);
  }
  const nextText = getHotspotLabelText(hotspot);
  if (label.textContent !== nextText) {
    label.textContent = nextText;
  }
}

function stopPointerPropagation(event) {
  event.stopPropagation();
}
