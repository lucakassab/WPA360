export class MinimapWidget {
  constructor({ root }) {
    this.root = root;
  }

  render(state) {
    if (!this.root) {
      return;
    }

    const enabled = state.cfg?.features?.minimap_widget === true;
    const scene = state.currentScene;
    const minimapImage = scene?.minimap_image;

    if (!enabled || !minimapImage) {
      this.root.replaceChildren();
      return;
    }

    const widget = document.createElement("article");
    widget.id = "minimap_widget";
    widget.setAttribute("aria-label", "Scene minimap");

    const header = document.createElement("header");
    const title = document.createElement("h2");
    title.textContent = "Minimap";
    const sceneLabel = document.createElement("span");
    sceneLabel.className = "eyebrow";
    sceneLabel.textContent = scene.title ?? scene.id;
    header.append(title, sceneLabel);

    const image = document.createElement("img");
    image.src = minimapImage;
    image.alt = `${scene.title ?? scene.id} minimap`;
    image.loading = "lazy";
    image.onerror = () => this.root.replaceChildren();

    widget.append(header, image);
    this.root.replaceChildren(widget);
  }
}
