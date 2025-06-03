// js/desktop.js

export async function init() {
  console.log('[desktop.js] Iniciando modo DESKTOP');

  const select = document.getElementById('mediaDropdown');
  if (!select) return;

  // Função que carrega e exibe a mídia baseada na URL
  async function loadAndDisplayMedia(url) {
    try {
      // Usa a função global pra buscar/cachear a mídia
      const res = await window.fetchAndCacheMedia(url);
      const blob = await res.blob();
      const objectURL = URL.createObjectURL(blob);

      // Aqui você coloca a lógica pra exibir no canvas/WebGL ou <video>
      // Por enquanto, só loga o objectURL
      console.log('[desktop.js] Mídia pronta para renderizar:', objectURL);

      // Exemplo simples: se fosse um <video> ou <img>, você poderia fazer algo assim:
      // const viewer = document.getElementById('viewer');
      // if (url.endsWith('.mp4')) {
      //   // Para vídeo
      //   const video = document.createElement('video');
      //   video.src = objectURL;
      //   video.loop = true;
      //   video.autoplay = true;
      //   video.style.width = '100%';
      //   video.style.height = '100%';
      //   viewer.replaceWith(video);
      // } else {
      //   // Para imagem 360 (precisa de renderer WebGL real)
      //   // Supondo que você tenha uma função render360(objectURL, canvasElement)
      //   render360(objectURL, document.getElementById('viewer'));
      // }
    } catch (err) {
      console.error('[desktop.js] Falha ao carregar mídia:', err);
    }
  }

  // Quando o usuário mudar o dropdown
  select.addEventListener('change', async (e) => {
    const url = e.target.value;
    if (!url) return;
    await loadAndDisplayMedia(url);
  });

  // Se houver botões “Próxima” e “Anterior”, pode-se implementá-los assim:
  let currentIndex = 0;
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (window.mediaList.length === 0) return;
      currentIndex = (currentIndex - 1 + window.mediaList.length) % window.mediaList.length;
      select.selectedIndex = currentIndex;
      select.dispatchEvent(new Event('change'));
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (window.mediaList.length === 0) return;
      currentIndex = (currentIndex + 1) % window.mediaList.length;
      select.selectedIndex = currentIndex;
      select.dispatchEvent(new Event('change'));
    });
  }

  // **Carrega automaticamente a primeira mídia** (se houver)
  if (select.options.length > 0) {
    // Ajusta o índice para 0 (primeira opção disponível que tenha URL)
    currentIndex = 0;
    select.selectedIndex = 0;
    const firstUrl = select.options[0].value;
    if (firstUrl) {
      await loadAndDisplayMedia(firstUrl);
    }
  }
}

export function dispose() {
  console.log('[desktop.js] Limpando modo DESKTOP');
  // Limpe listeners, revokeObjectURLs, etc., conforme necessário
}
