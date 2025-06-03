// js/xr.js

let xrSession = null;

export async function initXR(onExitCallback) {
  console.log('[xr.js] Tentando iniciar modo XR');

  if (!navigator.xr) {
    console.warn('[xr.js] XR não disponível neste dispositivo');
    return null;
  }

  try {
    xrSession = await navigator.xr.requestSession('immersive-vr');
    console.log('[xr.js] Sessão XR iniciada');

    // Adiciona listener pro fim da sessão
    xrSession.addEventListener('end', () => {
      console.log('[xr.js] Sessão XR encerrada');
      if (typeof onExitCallback === 'function') {
        onExitCallback();
      }
    });

    // Aqui tu coloca o resto da lógica de WebXR (render loop, etc)
    return xrSession;
  } catch (err) {
    console.error('[xr.js] Falha ao iniciar sessão XR:', err);
    return null;
  }
}

export function disposeXR() {
  console.log('[xr.js] Limpando modo XR');
  if (xrSession) {
    try {
      xrSession.end(); // Se quiser forçar fim de sessão (opcional)
    } catch (e) {
      console.warn('[xr.js] Erro ao encerrar sessão XR:', e);
    }
    xrSession = null;
  }
}
