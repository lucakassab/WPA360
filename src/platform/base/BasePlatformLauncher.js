export class BasePlatformLauncher {
  constructor({ root, context }) {
    this.root = root;
    this.context = context;
    this.shell = null;
  }

  mount(_options = {}) {
    this.shell = document.createElement("section");
    this.shell.className = "platform-shell";
    this.root.append(this.shell);
  }

  async render(_state, _options = {}) {}

  unmount() {
    this.shell?.replaceChildren();
    this.shell?.remove();
    this.shell = null;
  }
}
