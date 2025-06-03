// js/core.js

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
