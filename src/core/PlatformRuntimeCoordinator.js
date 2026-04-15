export class PlatformRuntimeCoordinator {
  constructor({ root, context, launchers }) {
    this.root = root;
    this.context = context;
    this.launchers = launchers;
    this.activePlatform = null;
    this.activePlatformId = null;
    this.switchToken = 0;
    this.renderToken = 0;
  }

  async switchPlatform(platformId, options = {}) {
    const switchToken = ++this.switchToken;
    const deferRender = options.deferRender === true;
    if (!this.launchers[platformId]) {
      throw new Error(`Unknown platform: ${platformId}`);
    }

    if (this.activePlatformId === platformId && this.activePlatform) {
      if (!deferRender) {
        await this.renderCurrent(options);
      }
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
    if (switchToken !== this.switchToken || this.activePlatformId !== platformId) {
      return null;
    }
    if (!deferRender) {
      return await this.renderCurrent(options);
    }
    return null;
  }

  async renderCurrent(options = {}) {
    if (!this.activePlatform) {
      return;
    }
    const renderToken = ++this.renderToken;
    const platform = this.activePlatform;
    const platformId = this.activePlatformId;
    const result = await platform.render(this.context.store.getSnapshot(), options);
    if (
      renderToken !== this.renderToken
      || platform !== this.activePlatform
      || platformId !== this.activePlatformId
    ) {
      return null;
    }
    return result;
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
