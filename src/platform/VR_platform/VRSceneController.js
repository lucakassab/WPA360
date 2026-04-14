import { VRHotspotRenderer } from "./VRHotspotRenderer.js";
import { VRInputController } from "./VRInputController.js";
import { VRMovementCompensator } from "./VRMovementCompensator.js";
import { VRRenderer } from "./VRRenderer.js";

export class VRSceneController {
  constructor({ root, context }) {
    this.root = root;
    this.context = context;
  }

  mount() {
    this.movementCompensator = new VRMovementCompensator({
      cfgProvider: () => this.context.store.getSnapshot().cfg
    });
    this.renderer = new VRRenderer({
      root: this.root,
      cfgProvider: () => this.context.store.getSnapshot().cfg,
      movementCompensator: this.movementCompensator,
      assetCache: this.context.assetCache,
      context: this.context
    });
    this.hotspotRenderer = new VRHotspotRenderer({
      renderer: this.renderer,
      context: this.context
    });
    this.inputController = new VRInputController({
      renderer: this.renderer,
      hotspotRenderer: this.hotspotRenderer,
      movementCompensator: this.movementCompensator
    });
    this.renderer.onViewChange(() => this.hotspotRenderer.updateProjection());
    this.inputController.attach();
  }

  async render(state, options = {}) {
    if (!state.currentScene) {
      return;
    }

    const sceneTransition = await this.renderer.showScene(state.currentScene, state.currentTour, options);
    this.hotspotRenderer.render(state.currentScene);
    return sceneTransition;
  }

  screenToWorldFromEvent(event, options) {
    return this.renderer?.screenToWorldFromEvent(event, options) ?? null;
  }

  destroy() {
    this.inputController?.destroy();
    this.hotspotRenderer?.destroy();
    this.renderer?.destroy();
  }
}
