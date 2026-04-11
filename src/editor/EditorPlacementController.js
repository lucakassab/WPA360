export class EditorPlacementController {
  constructor({ context, draftStore }) {
    this.context = context;
    this.draftStore = draftStore;
    this.runtimeRoot = context.getRuntimeRoot?.();
    this.isPicking = false;

    this.onPointerDown = this.onPointerDown.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
  }

  startHotspotPlacement({ sceneId = null, hotspotId = null } = {}) {
    if (sceneId && hotspotId && !this.draftStore.selectHotspot(sceneId, hotspotId)) {
      this.context.setStatus?.("Hotspot nao encontrado para reposicionamento.", { hideAfterMs: 1800 });
      return false;
    }

    const target = getSelectedActiveHotspot(this.draftStore.getSnapshot(), this.context.store.getSnapshot().currentSceneId);
    const hotspot = target?.hotspot;
    if (!hotspot) {
      this.context.debugLog?.("editor:hotspot-placement:blocked:not-active-scene", {
        runtimeSceneId: this.context.store.getSnapshot().currentSceneId,
        editorSceneId: this.draftStore.getSnapshot().selectedSceneId,
        selectedHotspotId: this.draftStore.getSnapshot().selectedHotspotId
      });
      this.context.setStatus?.("Selecione um hotspot visivel da cena ativa antes de mover.", { hideAfterMs: 2200 });
      return false;
    }

    this.stopHotspotPlacement();
    this.isPicking = true;
    this.runtimeRoot?.classList.add("is-editor-picking-hotspot");
    this.runtimeRoot?.addEventListener("pointerdown", this.onPointerDown, { capture: true });
    window.addEventListener("keydown", this.onKeyDown, { capture: true });

    this.context.debugLog?.("editor:hotspot-placement:start", {
      sceneId: target.scene.id,
      hotspotId: hotspot.id
    });
    this.context.setStatus?.("Click no panorama para reposicionar o hotspot selecionado. Esc cancela.");
    return true;
  }

  stopHotspotPlacement() {
    if (!this.isPicking) {
      return;
    }

    this.isPicking = false;
    this.runtimeRoot?.classList.remove("is-editor-picking-hotspot");
    this.runtimeRoot?.removeEventListener("pointerdown", this.onPointerDown, { capture: true });
    window.removeEventListener("keydown", this.onKeyDown, { capture: true });
  }

  onPointerDown(event) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const target = getSelectedActiveHotspot(this.draftStore.getSnapshot(), this.context.store.getSnapshot().currentSceneId);
    const hotspot = target?.hotspot;
    if (!hotspot) {
      this.context.setStatus?.("O hotspot selecionado nao pertence mais a cena ativa.", { hideAfterMs: 2200 });
      this.context.debugLog?.("editor:hotspot-placement:failed", { reason: "selected-hotspot-not-active" });
      this.stopHotspotPlacement();
      return;
    }

    const depth = Math.max(0.1, Number(hotspot?.reference_depth ?? distanceFromOrigin(hotspot?.position) ?? 8));
    const position = this.context.screenToWorldFromEvent?.(event, { depth });

    if (!position) {
      this.context.setStatus?.("Nao consegui calcular a posicao 3D desse clique.", { hideAfterMs: 2000 });
      this.context.debugLog?.("editor:hotspot-placement:failed", { reason: "screen-to-world-null" });
      this.stopHotspotPlacement();
      return;
    }

    this.draftStore.moveSelectedHotspotTo(position);
    this.context.debugLog?.("editor:hotspot-placement:complete", {
      hotspotId: hotspot?.id,
      position
    });
    this.context.setStatus?.("Hotspot reposicionado.", { hideAfterMs: 1400 });
    this.stopHotspotPlacement();
  }

  onKeyDown(event) {
    if (event.key !== "Escape") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.context.debugLog?.("editor:hotspot-placement:cancel");
    this.context.setStatus?.("Reposicionamento cancelado.", { hideAfterMs: 1200 });
    this.stopHotspotPlacement();
  }

  destroy() {
    this.stopHotspotPlacement();
  }
}

function getSelectedActiveHotspot(state, runtimeSceneId) {
  const activeSceneId = runtimeSceneId ?? state.activeSceneId;
  if (!activeSceneId || state.selectedSceneId !== activeSceneId) {
    return null;
  }

  const scene = state.draft?.scenes?.find((candidate) => candidate.id === activeSceneId);
  const hotspot = scene?.hotspots?.find((candidate) => candidate.id === state.selectedHotspotId) ?? null;
  return scene && hotspot ? { scene, hotspot } : null;
}

function distanceFromOrigin(position) {
  return Math.hypot(
    Number(position?.x ?? 0),
    Number(position?.y ?? 0),
    Number(position?.z ?? -8)
  );
}
