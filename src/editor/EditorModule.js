import { EditorDraftStore } from "./EditorDraftStore.js";
import { EditorPanel } from "./EditorPanel.js";
import { EditorPlacementController } from "./EditorPlacementController.js";
import { RightClickEditorMenu } from "./RightClickEditorMenu.js";

export function mountEditor({ root, context }) {
  if (!root) {
    return null;
  }

  const draftStore = new EditorDraftStore({ context });
  draftStore.mount();

  const placementController = new EditorPlacementController({ context, draftStore });
  const rightClickMenu = new RightClickEditorMenu({ context, draftStore, placementController });
  rightClickMenu.mount();

  const panel = new EditorPanel({ root, context, draftStore, placementController });
  panel.mount();

  return {
    destroy() {
      rightClickMenu.destroy();
      placementController.destroy();
      panel.destroy();
    }
  };
}
