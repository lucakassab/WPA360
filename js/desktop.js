// js/desktop.js

import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js';

let scene, camera, renderer, sphereMesh, animationId;

export function init() {
  console.log('[desktop.js] Iniciando modo DESKTOP');

  const canvas = document.getElementById('viewer');

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);

  // ⚠️ IMPORTANTE: coloca a câmera LEVEMENTE fora do centro da esfera pra enxergar
  camera.position.set(0.1, 0, 0);

  window.addEventListener('resize', onWindowResize);
}

export function loadMedia(url, stereo) {
  console.log('[desktop.js] Carregando mídia:', url, 'stereo?', stereo);

  const loader = new THREE.TextureLoader();

  if (sphereMesh) {
    scene.remove(sphereMesh);
    sphereMesh.geometry.dispose();
    sphereMesh.material.dispose();
    sphereMesh = null;
  }

  loader.load(
    url,
    (texture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      texture.colorSpace = THREE.SRGBColorSpace;

      const geometry = new THREE.SphereGeometry(500, 64, 32);
      geometry.scale(-1, 1, 1); // Inverte pra ver por dentro

      const material = new THREE.MeshBasicMaterial({ map: texture });

      sphereMesh = new THREE.Mesh(geometry, material);
      scene.add(sphereMesh);

      animate();
    },
    undefined,
    (err) => {
      console.error('[desktop.js] Erro ao carregar textura 360:', err);
    }
  );
}

function animate() {
  renderer.render(scene, camera);
  animationId = requestAnimationFrame(animate);
}

function onWindowResize() {
  if (!renderer || !camera) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

export function dispose() {
  console.log('[desktop.js] Limpando modo DESKTOP');

  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  if (sphereMesh) {
    scene.remove(sphereMesh);
    sphereMesh.geometry.dispose();
    sphereMesh.material.dispose();
    sphereMesh = null;
  }

  if (renderer) {
    renderer.dispose();
    renderer = null;
  }

  window.removeEventListener('resize', onWindowResize);

  scene = null;
  camera = null;
}
