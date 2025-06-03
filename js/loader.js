// js/loader.js

let currentMode = null;
let currentModule = null;
let xrSession = null;

// Carrega módulo Desktop
async function loadDesktop() {
  console.log('[loader.js] Chamando loadDesktop()');
  if (currentMode === 'desktop') {
    console.log('[loader.js] Já estava em desktop, nada a fazer.');
    return;
  }
  if (currentModule && currentModule.dispose) {
    try {
      console.log('[loader.js] Dispôndo módulo anterior antes de desktop...');
      currentModule.dispose();
    } catch (e) {
      console.warn('[loader.js] Erro ao dispôr módulo anterior:', e);
    }
  }
  currentMode = 'desktop';
  try {
    // Importa o desktop.js (deve estar em mesma pasta)
    currentModule = await import('./desktop.js');
    if (currentModule.init) {
      console.log('[loader.js] Invocando desktop.init()');
      await currentModule.init();
    }
  } catch (err) {
    console.error('[loader.js] Falha ao carregar desktop.js:', err);
  }
}

// Carrega módulo Mobile
async function loadMobile() {
  console.log('[loader.js] Chamando loadMobile()');
  if (currentMode === 'mobile') {
    console.log('[loader.js] Já estava em mobile, nada a fazer.');
    return;
  }
  if (currentModule && currentModule.dispose) {
    try {
      console.log('[loader.js] Dispôndo módulo anterior antes de mobile...');
      currentModule.dispose();
    } catch (e) {
      console.warn('[loader.js] Erro ao dispôr módulo anterior:', e);
    }
  }
  currentMode = 'mobile';
  try {
    currentModule = await import('./mobile.js');
    if (currentModule.init) {
      console.log('[loader.js] Invocando mobile.init()');
      await currentModule.init();
    }
  } catch (err) {
    console.error('[loader.js] Falha ao carregar mobile.js:', err);
  }
}

// Carrega módulo XR quando usuário clicar em "Entrar no VR"
async function loadXR() {
  console.log('[loader.js] Chamando loadXR()');
  if (currentModule && currentModule.dispose) {
    try {
      console.log('[loader.js] Dispôndo módulo anterior antes de XR...');
      currentModule.dispose();
    } catch (e) {
      console.warn('[loader.js] Erro ao dispôr módulo antes do XR:', e);
    }
  }
  currentMode = 'xr';
  try {
    const xrModule = await import('./xr.js');
    currentModule = xrModule;
    if (xrModule.initXR) {
      console.log('[loader.js] Invocando xr.initXR()');
      xrSession = await xrModule.initXR(onXRExit);
    } else {
      console.warn('[loader.js] xr.js não exportou initXR()');
    }
  } catch (err) {
    console.error('[loader.js] Falha ao carregar xr.js:', err);
    restorePreviousMode();
  }
}

// Callback quando sai do XR
function onXRExit() {
  console.log('[loader.js] Chamada onXRExit()');
  xrSession = null;
  if (currentModule && currentModule.disposeXR) {
    try {
      console.log('[loader.js] Dispôndo XR via disposeXR()');
      currentModule.disposeXR();
    } catch (e) {
      console.warn('[loader.js] Erro ao dispôr XR:', e);
    }
  }
  restorePreviousMode();
}

// Restaura Desktop ou Mobile após sair do XR
function restorePreviousMode() {
  console.log('[loader.js] Chamando restorePreviousMode()');
  if (window.matchMedia('(pointer: coarse)').matches) {
    console.log('[loader.js] detectou pointer: coarse → chama loadMobile()');
    loadMobile();
  } else {
    console.log('[loader.js] detectou pointer: fine → chama loadDesktop()');
    loadDesktop();
  }
}

// Exibe o botão “Entrar no VR” se suportado
async function setupVRButton() {
  console.log('[loader.js] Verificando suporte XR...');
  if (navigator.xr && navigator.xr.isSessionSupported) {
    try {
      const supported = await navigator.xr.isSessionSupported('immersive-vr');
      console.log('[loader.js] Suporte XR?', supported);
      if (supported) {
        const btn = document.getElementById('enterVrBtn');
        if (btn) {
          btn.style.display = 'inline-block';
          btn.addEventListener('click', (e) => {
            e.preventDefault();
            loadXR();
          });
        }
      }
    } catch (err) {
      console.warn('[loader.js] Erro ao checar suporte XR:', err);
    }
  }
}

// Função principal de detecção de plataforma
function detectAndLoad() {
  console.log('[loader.js] detectAndLoad() iniciado');
  const isCoarse = window.matchMedia('(pointer: coarse)').matches;
  console.log('[loader.js] window.matchMedia("(pointer: coarse)").matches =', isCoarse);

  // Carrega Desktop ou Mobile conforme o dispositivo
  if (isCoarse) {
    console.log('[loader.js] Chamando loadMobile() via detectAndLoad');
    loadMobile();
  } else {
    console.log('[loader.js] Chamando loadDesktop() via detectAndLoad');
    loadDesktop();
  }

  // Configura o botão de VR, se suportado
  setupVRButton();

  // Eventual lógica de dropdown e botões (será delegada aos módulos desktop/mobile)
  const select = document.getElementById('mediaDropdown');
  if (select) {
    select.addEventListener('change', (e) => {
      if (currentModule && currentModule.onSelectMedia) {
        currentModule.onSelectMedia(e.target.value);
      }
    });
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

// **Aqui** chamamos detectAndLoad() assim que o loader.js é importado
console.log('[loader.js] arquivo importado – chamando detectAndLoad() imediatamente');
detectAndLoad();
