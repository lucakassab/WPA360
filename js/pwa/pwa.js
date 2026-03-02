export async function initPWA(app) {
  // Service Worker
  if ("serviceWorker" in navigator) {
    try {
      // Sai de /js/pwa/ → volta pro root
      const swUrl = new URL("../../service-worker.js", import.meta.url);
      await navigator.serviceWorker.register(swUrl, { scope: "./" });
    } catch (e) {
      console.warn("SW falhou:", e);
    }
  }

  // Install prompt (Chrome/Edge/Android etc.)
  let deferredPrompt = null;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    app.setInstallButtonVisible(true);
  });

  app.ui.btnInstall.addEventListener("click", async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    deferredPrompt = null;
    app.setInstallButtonVisible(false);

    if (choice?.outcome === "accepted") app.toast("Instalando…");
  });

  window.addEventListener("appinstalled", () => {
    app.toast("Instalado 👌");
    app.setInstallButtonVisible(false);
  });
}