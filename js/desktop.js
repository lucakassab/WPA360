// js/desktop.js

import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js';

let scene, camera, renderer;
let debugInner, debugOuter;            // esferas-wireframe p/ debug
let textureSphere;                     // esfera com a mídia
let animationId;

// ---------- API chamada pelo loader.js ---------- //
export function init() {
  console.log('[desktop.js] Iniciando modo DESKTOP');

  const canvas = document.getElementById('viewer');

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    2000
  );
  camera.position.set(0, 0, 0);        // fica no centro da esfera

  addDebugSpheres();

  window.addEventListener('resize', onWindowResize);
  animate();
}

// loader.js chama isto quando o usuário escolhe uma mídia
export function loadMedia(url, stereo = false) {
  console.log('[desktop.js] Carregando mídia:', url, 'stereo?', stereo);

  // Remove esferas de debug se ainda existirem
  removeDebugSpheres();

  // Remove esfera anterior (se houver)
  if (textureSphere) {
    scene.remove(textureSphere);
    textureSphere.geometry.dispose();
    textureSphere.material.dispose();
    textureSphere = null;
  }

  const loader = new THREE.TextureLoader();
  loader.load(
    url,
    (texture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;

      const geom = new THREE.SphereGeometry(500, 64, 40);
      geom.scale(-1, 1, 1);  // inverte as faces

      const mat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide });
      textureSphere = new THREE.Mesh(geom, mat);
      scene.add(textureSphere);
    },
    undefined,
    (err) => console.error('[desktop.js] Erro ao carregar textura 360:', err)
  );
}

// opcional: o loader.js verifica essas funções
export const onSelectMedia = loadMedia;
export function onPrevMedia() { /* implementar quando tiver navegação */ }
export function onNextMedia() { /* implementar quando tiver navegação */ }

// ---------- Funções internas ---------- //
function addDebugSpheres() {
  // Esfera interna (verde, wireframe)
  const gInner = new THREE.SphereGeometry(500, 32, 32);
  gInner.scale(-1, 1, 1);
  const mInner = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
  debugInner = new THREE.Mesh(gInner, mInner);
  scene.add(debugInner);

  // Esfera externa (vermelha, wireframe)  — ligeiramente maior pra enxergar
  const gOuter = new THREE.SphereGeometry(510, 32, 32);
  const mOuter = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true });
  debugOuter = new THREE.Mesh(gOuter, mOuter);
  scene.add(debugOuter);
}

function removeDebugSpheres() {
  if (debugInner) {
    scene.remove(debugInner);
    debugInner.geometry.dispose();
    debugInner.material.dispose();
    debugInner = null;
  }
  if (debugOuter) {
    scene.remove(debugOuter);
    debugOuter.geometry.dispose();
    debugOuter.material.dispose();
    debugOuter = null;
  }
}

function animate() {
  renderer.render(scene, camera);
  animationId = requestAnimationFrame(animate);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ---------- Limpeza quando sair do modo DESKTOP ---------- //
export function dispose() {
  console.log('[desktop.js] Limpando modo DESKTOP');
  cancelAnimationFrame(animationId);
  removeDebugSpheres();

  if (textureSphere) {
    scene.remove(textureSphere);
    textureSphere.geometry.dispose();
    textureSphere.material.dispose();
    textureSphere = null;
  }

  renderer?.dispose();
  window.removeEventListener('resize', onWindowResize);

  scene = camera = renderer = null;
}
