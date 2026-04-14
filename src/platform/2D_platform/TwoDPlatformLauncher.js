import { BasePlatformLauncher } from "../base/BasePlatformLauncher.js";
import { TwoDSceneController } from "./TwoDSceneController.js";

export class TwoDPlatformLauncher extends BasePlatformLauncher {
  mount(options = {}) {
    super.mount(options);
    this.shell.dataset.platform = "2D_platform";
    this.sceneController = new TwoDSceneController({
      root: this.shell,
      context: this.context
    });
    this.sceneController.mount();
  }

  async render(state, options = {}) {
    return this.sceneController?.render(state, options);
  }

  screenToWorldFromEvent(event, options) {
    return this.sceneController?.screenToWorldFromEvent(event, options) ?? null;
  }

  unmount() {
    this.sceneController?.destroy();
    this.sceneController = null;
    super.unmount();
  }
}
