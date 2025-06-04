// js/loader.js

// … (todo o código que você já tem)

// Função principal de detecção de plataforma
function detectAndLoad() {
  console.log('[loader.js] detectAndLoad() iniciado');
  const isCoarse = window.matchMedia('(pointer: coarse)').matches;
  console.log('[loader.js] window.matchMedia("(pointer: coarse)").matches =', isCoarse);

  if (isCoarse) {
    loadMobile();
  } else {
    loadDesktop();
  }

  setupVRButton();

  // Configura o dropdown e botões
  const select = document.getElementById('mediaDropdown');
  if (select) {
    select.addEventListener('change', (e) => {
      if (currentModule && currentModule.onSelectMedia) {
        currentModule.onSelectMedia(e.target.value);
      }
    });

    // *** Carrega a primeira mídia assim que o dropdown for povoado ***
    // (o core.js já preenche o select antes de importar este loader.js)
    if (select.options.length > 0) {
      // Seleciona o primeiro item
      select.selectedIndex = 0;
      // Dispara o evento `change`
      const event = new Event('change');
      select.dispatchEvent(event);
    }
  }

  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (currentModule && currentModule.onPrevMedia) {
        currentModule.onPrevMedia();
      }
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (currentModule && currentModule.onNextMedia) {
        currentModule.onNextMedia();
      }
    });
  }
}

// Chamamos detectAndLoad() assim que o loader.js é importado
console.log('[loader.js] arquivo importado – chamando detectAndLoad() imediatamente');
detectAndLoad();
