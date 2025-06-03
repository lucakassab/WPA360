// js/loader.js
//
// Agora a lista vem de: 
//   https://api.github.com/repos/lucakassab/WPA360/contents/Media
// e cada URL de mídia é o próprio raw.githubusercontent.com (download_url).

(async () => {
  /* ---------- CONFIG ---------- */
  const CACHE_MEDIA = "tour360-media-v1";
  // AQUI: apontando para a pasta Media do repo WPA360
  const GITHUB_API  = "https://api.github.com/repos/lucakassab/WPA360/contents/Media";
  const EXT         = [".jpg", ".png", ".mp4", ".webm", ".mov"];

  /* ---------- Inicializa módulo desktop / mobile ---------- */
  const isMobile   = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  let   mediaModule = await import(isMobile ? "./mobile.js" : "./desktop.js");
  mediaModule.initialize();

  /* ---------- Funções utilitárias ---------- */
  const openMediaCache = () => caches.open(CACHE_MEDIA);

  async function listCachedMedia() {
    const cache = await openMediaCache();
    const keys  = await cache.keys();
    return keys
      .filter(req => req.url.includes("/media/"))
      .map(req  => {
        const name = req.url.split("/").pop();
        return {
          name,
          url:  `media/${name}`,
          stereo: name.toLowerCase().includes("_stereo")
        };
      });
  }

  async function downloadAndCacheAll() {
    const resp = await fetch(GITHUB_API);
    if (!resp.ok) throw new Error("GitHub API falhou: " + resp.status);
    const arr  = await resp.json();

    // Filtra só arquivos com extensão válida
    const mediaFromApi = arr
      .filter(f => EXT.some(ext => f.name.toLowerCase().endsWith(ext)))
      .map(f => ({
        name:   f.name,
        url:    f.download_url, 
        stereo: f.name.toLowerCase().includes("_stereo")
      }));

    const cache = await openMediaCache();
    let   done  = 0;
    for (const m of mediaFromApi) {
      try {
        // Baixa do raw.githubusercontent.com
        const r = await fetch(m.url, { cache: "no-cache" });
        if (r.ok) {
          // Armazena sob a chave "media/NOME.ext" no cache local
          await cache.put(`media/${m.name}`, r.clone());
        } else {
          console.warn("Não baixou:", m.url, r.status);
        }
      } catch (e) {
        console.warn("Falhou baixar:", m.url, e);
      }
      console.log(`Pré-cache ${(++done)}/${mediaFromApi.length}:`, m.name);
    }
    return mediaFromApi.map(m => ({
      name:   m.name,
      url:    `media/${m.name}`,   // agora fica relativo ao app
      stereo: m.stereo
    }));
  }

  /* ---------- Obtém a lista final (cache ou rede) ---------- */
  let mediaList = await listCachedMedia();

  if (mediaList.length === 0) {
    if (!navigator.onLine) {
      alert("Sem mídias no cache e você está offline. Conecte para baixar.");
      return;
    }
    try {
      mediaList = await downloadAndCacheAll();
    } catch (e) {
      console.error("Não deu pra baixar mídias:", e);
      alert("Falha ao baixar mídias. Veja o console.");
      return;
    }
  }

  /* ---------- Preenche UI ---------- */
  const select = document.getElementById("mediaSelect");
  mediaList.forEach((m, i) => {
    const opt = document.createElement("option");
    opt.value         = i;
    opt.textContent   = m.name;
    opt.dataset.url   = m.url;
    opt.dataset.stereo= m.stereo ? "true" : "false";
    select.appendChild(opt);
  });

  /* change → load */
  select.addEventListener("change", () => {
    const opt = select.selectedOptions[0];
    if (opt) mediaModule.loadMedia(opt.dataset.url, opt.dataset.stereo === "true");
  });

  /* Botões Prev / Next */
  const step = delta => {
    if (!select.options.length) return;
    let idx = (parseInt(select.value) + delta + select.options.length) % select.options.length;
    select.value = idx;
    select.dispatchEvent(new Event("change"));
  };
  document.getElementById("prevBtn").onclick = () => step(-1);
  document.getElementById("nextBtn").onclick = () => step(+1);

  /* Carrega a primeira mídia */
  if (mediaList.length) {
    select.value = 0;
    select.dispatchEvent(new Event("change"));
  }

  /* ---------- VR (opcional) ---------- */
  if (navigator.xr && await navigator.xr.isSessionSupported?.("immersive-vr")) {
    try {
      const vrModule = await import("./vr.js");
      vrModule.initialize();
      vrModule.onEnterXR = () => {
        mediaModule = vrModule;
        if (vrModule.lastMediaURL) {
          vrModule.loadMedia(vrModule.lastMediaURL, vrModule.lastMediaStereo);
        }
      };
    } catch (e) {
      console.warn("VR não disponível:", e);
    }
  }
})();
