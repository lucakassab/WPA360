export class PlatformRuntimeCoordinator {
  constructor({ root, context, launchers }) {
    this.root = root;
    this.context = context;
    this.launchers = launchers;
    this.activePlatform = null;
    this.activePlatformId = null;
  }

  async switchPlatform(platformId, options = {}) {
    if (!this.launchers[platformId]) {
      throw new Error(`Unknown platform: ${platformId}`);
    }

    if (this.activePlatformId === platformId && this.activePlatform) {
      await this.renderCurrent(options);
      return;
    }

    if (this.activePlatform) {
      this.activePlatform.unmount();
      this.activePlatform = null;
    }

    this.root.replaceChildren();

    const Launcher = this.launchers[platformId];
    this.activePlatform = new Launcher({
      root: this.root,
      context: this.context
    });
    this.activePlatformId = platformId;
    this.context.store.patch({ platformId });

    this.activePlatform.mount(options);
    await this.renderCurrent(options);
  }

  async renderCurrent(options = {}) {
    if (!this.activePlatform) {
      return;
    }
    await this.activePlatform.render(this.context.store.getSnapshot(), options);
  }

  screenToWorldFromEvent(event, options) {
    return this.activePlatform?.screenToWorldFromEvent?.(event, options) ?? null;
  }

  getActiveRenderer() {
    return this.activePlatform?.sceneController?.renderer ?? null;
  }

  async unmount() {
    if (this.activePlatform) {
      this.activePlatform.unmount();
      this.activePlatform = null;
      this.activePlatformId = null;
      this.root.replaceChildren();
    }
  }
}
