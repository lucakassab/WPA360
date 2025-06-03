// js/core.js

// Detecta se está rodando como PWA (standalone)
const isStandalone = window.matchMedia('(display-mode: standalone)').matches
  || window.navigator.standalone === true;

console.log(`[core.js] Rodando como PWA? ${isStandalone ? 'SIM' : 'NÃO'}`);

// Mostra aviso visual se estiver em modo standalone
if (isStandalone) {
  const banner = document.createElement('div');
  banner.innerText = 'Rodando como PWA';
  banner.style.position = 'fixed';
  banner.style.top = '15px';
  banner.style.left = '50%';
  banner.style.transform = 'translateX(-50%)';
  banner.style.background = '#4caf50';
  banner.style.color = '#fff';
  banner.style.padding = '8px 16px';
  banner.style.borderRadius = '6px';
  banner.style.zIndex = '9999';
  banner.style.boxShadow = '0 2px 5px rgba(0,0,0,0.5)';
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 1500);
}

// Registra o Service Worker assim que possível
if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .register('./sw.js')
    .then(reg => {
      console.log('Service Worker registrado com sucesso:', reg.scope);
    })
    .catch(err => {
      console.warn('Falha ao registrar Service Worker:', err);
    });
} else {
  console.warn('Service Worker não suportado neste navegador');
}

// Só importa o loader.js para rodar a detecção de plataforma
import './loader.js';
