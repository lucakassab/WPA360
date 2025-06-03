// js/desktop.js

export async function init() {
  console.log('[desktop.js] Iniciando modo DESKTOP');

  // Exemplo de como responder quando o dropdown mudar:
  const select = document.getElementById('mediaDropdown');
  if (select) {
    select.addEventListener('change', async (e) => {
      const url = e.target.value;
      if (!url) return;
      try {
        const res = await window.fetchAndCacheMedia(url);
        const blob = await res.blob();
        const objectURL = URL.createObjectURL(blob);
        // aqui você passa objectURL pro seu canvas/WebGL ou <video>
        console.log('[desktop.js] Mídia pronta para renderizar:', objectURL);
        // ex.: render360(objectURL);
      } catch (err) {
        console.error('[desktop.js] Falha ao carregar mídia:', err);
      }
    });
  }

  // Você pode também implementar “Próxima” e “Anterior” usando index de window.mediaList
}

export function dispose() {
  console.log('[desktop.js] Limpando modo DESKTOP');
  // Limpe listeners, revokeObjectURLs, etc.
}
