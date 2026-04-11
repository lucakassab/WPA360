import { AppKernel } from "../core/AppKernel.js";

const kernel = new AppKernel({
  root: document.querySelector("#app-root"),
  runtimeRoot: document.querySelector("#runtime-root"),
  editorRoot: document.querySelector("#editor-root"),
  minimapRoot: document.querySelector("#minimap-slot"),
  statusRoot: document.querySelector("#app-status"),
  titleRoot: document.querySelector("#app-title"),
  tourSelect: document.querySelector("#tour-select"),
  platformButtons: Array.from(document.querySelectorAll("[data-platform-switch]"))
});

window.__WPA360__ = {
  kernel,
  getState: () => kernel.store.getSnapshot(),
  getRenderer: () => kernel.context.getActiveRenderer?.() ?? null,
  getDebugSnapshot: () => kernel.getDebugSnapshot()
};

kernel.start().catch((error) => {
  console.error("[WPA360] boot failed", error);
  const status = document.querySelector("#app-status");
  if (status) {
    status.textContent = `Boot failed: ${error.message}`;
    status.classList.remove("is-hidden");
  }
});
