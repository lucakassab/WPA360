export class RightClickEditorMenu {
  constructor({ context, draftStore, placementController }) {
    this.context = context;
    this.draftStore = draftStore;
    this.placementController = placementController;
    this.runtimeRoot = context.getRuntimeRoot?.();
    this.menu = null;

    this.onContextMenu = this.onContextMenu.bind(this);
    this.onDocumentPointerDown = this.onDocumentPointerDown.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
  }

  mount() {
    this.runtimeRoot?.addEventListener("contextmenu", this.onContextMenu, { capture: true });
    document.addEventListener("pointerdown", this.onDocumentPointerDown, { capture: true });
    window.addEventListener("keydown", this.onKeyDown);
  }

  destroy() {
    this.runtimeRoot?.removeEventListener("contextmenu", this.onContextMenu, { capture: true });
    document.removeEventListener("pointerdown", this.onDocumentPointerDown, { capture: true });
    window.removeEventListener("keydown", this.onKeyDown);
    this.close();
  }

  onContextMenu(event) {
    const hotspotElement = event.target.closest?.("[data-editor-item-type='hotspot']");
    if (!hotspotElement || !this.runtimeRoot?.contains(hotspotElement)) {
      this.close();
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const sceneId = this.context.store.getSnapshot().currentSceneId;
    const hotspotId = hotspotElement.dataset.hotspotId;
    if (!this.draftStore.selectHotspot(sceneId, hotspotId)) {
      this.context.setStatus?.("Nao consegui selecionar esse hotspot.", { hideAfterMs: 1600 });
      return;
    }

    this.context.debugLog?.("editor:right-click-menu:open", { sceneId, hotspotId });
    this.open(event, { sceneId, hotspotId });
  }

  open(event, { sceneId, hotspotId }) {
    this.close();
    this.menu = document.createElement("div");
    this.menu.className = "editor-context-menu";
    this.menu.setAttribute("role", "menu");

    const title = document.createElement("p");
    title.className = "editor-context-menu__title";
    title.textContent = hotspotId;

    const moveButton = this.createButton("Move Hotspot to Location", () => {
      this.close();
      this.placementController.startHotspotPlacement({ sceneId, hotspotId });
    });

    const selectButton = this.createButton("Select in Editor", () => {
      this.close();
      this.context.setStatus?.("Hotspot selecionado no editor.", { hideAfterMs: 1200 });
    });

    const deleteButton = this.createButton("Delete Hotspot", () => {
      this.close();
      this.draftStore.deleteHotspot();
      this.context.debugLog?.("editor:right-click-menu:delete-hotspot", { sceneId, hotspotId });
      this.context.setStatus?.("Hotspot removido.", { hideAfterMs: 1200 });
    });

    this.menu.append(title, moveButton, selectButton, deleteButton);
    document.body.append(this.menu);
    this.positionMenu(event.clientX, event.clientY);
  }

  createButton(label, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "menuitem");
    button.textContent = label;
    button.addEventListener("click", handler);
    return button;
  }

  positionMenu(clientX, clientY) {
    const margin = 12;
    const rect = this.menu.getBoundingClientRect();
    const x = Math.min(clientX, window.innerWidth - rect.width - margin);
    const y = Math.min(clientY, window.innerHeight - rect.height - margin);
    this.menu.style.left = `${Math.max(margin, x)}px`;
    this.menu.style.top = `${Math.max(margin, y)}px`;
  }

  onDocumentPointerDown(event) {
    if (this.menu && !this.menu.contains(event.target)) {
      this.close();
    }
  }

  onKeyDown(event) {
    if (event.key === "Escape") {
      this.close();
    }
  }

  close() {
    this.menu?.remove();
    this.menu = null;
  }
}
