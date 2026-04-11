import { BasePlatformLauncher } from "../base/BasePlatformLauncher.js";
import { VRSceneController } from "./VRSceneController.js";

export class VRPlatformLauncher extends BasePlatformLauncher {
  mount(options = {}) {
    super.mount(options);
    this.shell.dataset.platform = "VR_platform";
    this.sceneController = new VRSceneController({
      root: this.shell,
      context: this.context
    });
    this.sceneController.mount(options);
  }

  async render(state, options = {}) {
    await this.sceneController?.render(state, options);
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
