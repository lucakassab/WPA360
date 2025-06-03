// js/loader.js

let currentMode = null;
let currentModule = null;
let xrSession = null;

// Carrega módulo Desktop
async function loadDesktop() {
  if (currentMode === 'desktop') return;
  if (currentModule && currentModule.dispose) {
    try { currentModule.dispose(); } catch (e) { console.warn('Erro ao dispôr módulo:', e); }
  }
  currentMode = 'desktop';
  try {
    currentModule = await import('./desktop.js');
    if (currentModule.init) currentModule.init();
  } catch (err) {
    console.error('Falha ao carregar desktop.js:', err);
  }
}

// Carrega módulo Mobile
async function loadMobile() {
  if (currentMode === 'mobile') return;
  if (currentModule && currentModule.dispose) {
    try { currentModule.dispose(); } catch (e) { console.warn('Erro ao dispôr módulo:', e); }
  }
  currentMode = 'mobile';
  try {
    currentModule = await import('./mobile.js');
    if (currentModule.init) currentModule.init();
  } catch (err) {
    console.error('Falha ao carregar mobile.js:', err);
  }
}

// Carrega módulo XR quando usuário clicar em entrar no VR
async function loadXR() {
  if (currentModule && currentModule.dispose) {
    try { currentModule.dispose(); } catch (e) { console.warn('Erro ao dispôr módulo antes do XR:', e); }
  }
  currentMode = 'xr';
  try {
    const xrModule = await import('./xr.js');
    currentModule = xrModule;
    if (xrModule.initXR) {
      xrSession = await xrModule.initXR(onXRExit);
    } else {
      console.warn('xr.js não exportou initXR()');
    }
  } catch (err) {
    console.error('Falha ao carregar xr.js:', err);
    restorePreviousMode();
  }
}

// Callback quando sai do XR
function onXRExit() {
  xrSession = null;
  if (currentModule && currentModule.disposeXR) {
    try { currentModule.disposeXR(); } catch (e) { console.warn('Erro ao dispôr XR:', e); }
  }
  restorePreviousMode();
}

// Volta pro Desktop ou Mobile após sair do VR
function restorePreviousMode() {
  if (window.matchMedia('(pointer: coarse)').matches) {
    loadMobile();
  } else {
    loadDesktop();
  }
}

// Exibe botão “Entrar no VR” se suportado
async function setupVRButton() {
  if (navigator.xr && navigator.xr.isSessionSupported) {
    try {
      const supported = await navigator.xr.isSessionSupported('immersive-vr');
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
      console.warn('Erro ao checar suporte XR:', err);
    }
  }
}

// Detecta se é mobile ou desktop e carrega o módulo certo
function detectAndLoad() {
  if (window.matchMedia('(pointer: coarse)').matches) {
    loadMobile();
  } else {
    loadDesktop();
  }
  setupVRButton();
}

window.addEventListener('DOMContentLoaded', () => {
  detectAndLoad();
});
