import { TwoDHotspotRenderer } from "./TwoDHotspotRenderer.js";
import { TwoDInputController } from "./TwoDInputController.js";
import { TwoDRenderer } from "./TwoDRenderer.js";

export class TwoDSceneController {
  constructor({ root, context }) {
    this.root = root;
    this.context = context;
  }

  mount() {
    this.renderer = new TwoDRenderer({
      root: this.root,
      cfgProvider: () => this.context.store.getSnapshot().cfg,
      assetCache: this.context.assetCache
    });
    this.hotspotRenderer = new TwoDHotspotRenderer({
      root: this.renderer.hotspotLayer,
      context: this.context,
      project: (position) => this.renderer.projectWorldToScreen(position)
    });
    this.inputController = new TwoDInputController({
      target: this.renderer.stage,
      renderer: this.renderer,
      inputProfile: this.context.getInputProfile()
    });
    this.renderer.onViewChange(() => this.hotspotRenderer.updateProjection());
    this.inputController.attach();
  }

  async render(state) {
    if (!state.currentScene) {
      return;
    }

    await this.renderer.showScene(state.currentScene, state.currentTour);
    this.hotspotRenderer.render(state.currentScene);
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
