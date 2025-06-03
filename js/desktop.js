// js/desktop.js

// Importa Three.js como módulo via CDN
import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js';

let scene, camera, renderer, sphereMesh, animationId;

// Chamado pelo loader.js quando detectar modo DESKTOP
export function init() {
  console.log('[desktop.js] Iniciando modo DESKTOP');

  // Pega o canvas do index.html
  const canvas = document.getElementById('viewer');

  // Cria o renderer usando esse canvas
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);

  // Cria cena e câmera
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(
    75,                              // FOV
    window.innerWidth / window.innerHeight, // aspect
    0.1,                             // near
    1000                             // far
  );
  camera.position.set(0, 0, 0.1);

  // Ajusta onResize
  window.addEventListener('resize', onWindowResize);
}

// Função para carregar e renderizar a mídia 360 (URL já cacheado ou remoto)
// stereo: booleano (se for stereo, você pode futuramente lidar com side-by-side, top-bottom, etc.)
export function loadMedia(url, stereo) {
  console.log('[desktop.js] Carregando mídia:', url, 'stereo?', stereo);

  const loader = new THREE.TextureLoader();

  // Se já tiver uma esfera antiga, remove e libera memória
  if (sphereMesh) {
    scene.remove(sphereMesh);
    sphereMesh.geometry.dispose();
    sphereMesh.material.dispose();
    sphereMesh = null;
  }

  // Carrega a textura
  loader.load(
    url,
    (texture) => {
      // Ao finalizar load:
      // Define mapeamento e cria esfera invertida
      texture.mapping = THREE.EquirectangularReflectionMapping;

      const geometry = new THREE.SphereGeometry(500, 60, 40);
      geometry.scale(-1, 1, 1); // Inverte normals

      const material = new THREE.MeshBasicMaterial({ map: texture });

      sphereMesh = new THREE.Mesh(geometry, material);
      scene.add(sphereMesh);

      // Começa o loop de render
      animate();
    },
    undefined,
    (err) => {
      console.error('[desktop.js] Erro ao carregar textura 360:', err);
    }
  );
}

// Loop de render contínuo
function animate() {
  renderer.render(scene, camera);
  animationId = requestAnimationFrame(animate);
}

// Ajusta câmera e renderer ao redimensionar janela
function onWindowResize() {
  if (!renderer || !camera) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// Chamado pelo loader.js quando mudar de modo ou descartar este módulo
export function dispose() {
  console.log('[desktop.js] Limpando modo DESKTOP');

  // Para o loop de animação
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  // Remove e libera a esfera
  if (sphereMesh) {
    scene.remove(sphereMesh);
    sphereMesh.geometry.dispose();
    sphereMesh.material.dispose();
    sphereMesh = null;
  }

  // Dispose do renderer
  if (renderer) {
    renderer.dispose();
    renderer = null;
  }

  // Remove listeners
  window.removeEventListener('resize', onWindowResize);

  // Limpa cena e câmera
  scene = null;
  camera = null;
}
