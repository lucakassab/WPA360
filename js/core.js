// js/core.js

// 1. Detecta se está rodando como PWA (standalone)
const isStandalone = window.matchMedia('(display-mode: standalone)').matches
  || window.navigator.standalone === true;

console.log(`[core.js] Rodando como PWA? ${isStandalone ? 'SIM' : 'NÃO'}`);

// 2. URL do medialist.json no GitHub (ajusta pra sua URL real)
const MEDIA_LIST_URL = 'https://raw.githubusercontent.com/lucakassab/WPA360/master/medialist.json';

// 3. Nome do cache onde guardaremos as mídias
const MEDIA_CACHE = 'media-cache-v1';

// 4. Variável global pra lista de mídias
window.mediaList = [];

// 5. Função pra obter o medialist.json
async function loadMediaList() {
  try {
    const response = await fetch(MEDIA_LIST_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    if (!Array.isArray(json)) throw new Error('medialist.json não é um array');
    window.mediaList = json;
    console.log('[core.js] mediaList carregada:', window.mediaList);
    // Popula o dropdown (caso desktop/mobile já esteja carregado)
    const select = document.getElementById('mediaDropdown');
    if (select) {
      select.innerHTML = ''; // esvazia antes de preencher
      window.mediaList.forEach(item => {
        const option = document.createElement('option');
        option.value = item.url;
        option.innerText = item.name;
        select.appendChild(option);
      });
    }
  } catch (err) {
    console.error('[core.js] Falha ao carregar medialist.json:', err);
  }
}

// 6. Função pra armazenar uma mídia no cache
async function cacheMedia(url) {
  try {
    const cache = await caches.open(MEDIA_CACHE);
    const match = await cache.match(url);
    if (match) {
      console.log(`[core.js] ${url} já está no cache`);
      return;
    }
    if (!navigator.onLine) {
      console.warn(`[core.js] Offline – não pode baixar ${url}`);
      return;
    }
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await cache.put(url, response.clone());
    console.log(`[core.js] ${url} armazenada no cache "${MEDIA_CACHE}"`);
  } catch (err) {
    console.error(`[core.js] Erro ao cachear mídia ${url}:`, err);
  }
}

// 7. Função pra pré-buscar todas as mídias (só no PWA)
async function prefetchAllMedias() {
  if (!window.mediaList.length) {
    console.warn('[core.js] Nenhuma mídia pra pré-cachear ainda');
    return;
  }
  for (const item of window.mediaList) {
    await cacheMedia(item.url);
  }
}

// 8. Inicialização: carrega lista e, se for PWA, pré-busca todas
window.addEventListener('DOMContentLoaded', async () => {
  // 8.1. Registra o Service Worker (se ainda não tiver sido)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('./sw.js')
      .then(reg => {
        console.log('[core.js] Service Worker registrado:', reg.scope);
      })
      .catch(err => {
        console.warn('[core.js] Falha ao registrar SW:', err);
      });
  } else {
    console.warn('[core.js] Service Worker não suportado');
  }

  // 8.2. Carrega a mediaList
  await loadMediaList();

  // 8.3. Se estiver instalado como PWA, pré-busca tudo
  if (isStandalone) {
    console.log('[core.js] PWA detectado – pré-buscando todas as mídias');
    await prefetchAllMedias();
  }

  // 8.4. Por fim, importa o loader.js pra detectar desktop/mobile/xr
  import('./loader.js');
});


// 9. Expondo funções globais pra outros módulos usarem

// Módulo de desktop/mobile pode chamar isso quando o usuário selecionar uma mídia:
window.fetchAndCacheMedia = async function(url) {
  // Retorna o Blob ou Response cacheado, ou faz fetch caso não tenha
  try {
    const cache = await caches.open(MEDIA_CACHE);
    let res = await cache.match(url);
    if (res) {
      console.log(`[core.js] Recuperando ${url} do cache`);
      return res.clone();
    }
    if (!navigator.onLine) {
      throw new Error('Offline e mídia não está no cache');
    }
    res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await cache.put(url, res.clone());
    console.log(`[core.js] Baixou e cacheou ${url}`);
    return res.clone();
  } catch (err) {
    console.error(`[core.js] Erro fetchAndCacheMedia(${url}):`, err);
    throw err;
  }
};

// Módulo de desktop/mobile pode acessar:
// window.mediaList → array de { name: string, url: string }
// window.isStandalone → boolean
// window.fetchAndCacheMedia(url) → Promise<Response>

