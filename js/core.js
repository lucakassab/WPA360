// js/core.js

// Registra o Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .register('../sw.js')  // ../ porque ele está em js/
    .then(reg => {
      console.log('Service Worker registrado com sucesso:', reg.scope);
    })
    .catch(err => {
      console.warn('Falha ao registrar Service Worker:', err);
    });
} else {
  console.warn('Service Worker não suportado neste navegador');
}

// Aqui você define variáveis/globals que serão usados em desktop/mobile/xr.
// Ex: lista de mídias, funções de carregar e renderizar 360, etc.

// Carrega o loader.js pra detectar a plataforma e importar o módulo certo
import './loader.js';
