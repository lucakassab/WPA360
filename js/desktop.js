// js/desktop.js

import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';

let scene, camera, renderer, controls;
let debugSphere   = null;      // esfera única de debug (verde interno / vermelho externo)
let textureSphere = null;      // esfera texturizada
let animationId   = null;

// ---------- API para o loader.js ---------- //
export function init() {
  console.log('[desktop.js] Iniciando modo DESKTOP');

  const canvas = document.getElementById('viewer');

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);

  scene  = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    5000
  );
  camera.position.set(0, 0, 0.1); // começa dentro da esfera

  // OrbitControls — habilita rotação e zoom
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.rotateSpeed   = 0.3;
  controls.minDistance   = 0.1;
  controls.maxDistance   = 1500;

  addDebugSphere();

  window.addEventListener('resize', onWindowResize);
  animate();
}

export async function loadMedia(url, stereo = false) {
  console.log('[desktop.js] Carregando mídia:', url, 'stereo?', stereo);

  removeDebugSphere();
  removeTextureSphere();

  try {
    // 1) Pega a imagem via fetchAndCacheMedia (usa cache do SW)
    const response = await window.fetchAndCacheMedia(url);
    const blob     = await response.blob();
    const objectURL = URL.createObjectURL(blob);

    // 2) Carrega a textura a partir do objectURL local
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous'); // só pra garantir, mas objectURL não costuma exigir
    loader.load(
      objectURL,
      (texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;

        const geom = new THREE.SphereGeometry(500, 64, 40);
        geom.scale(-1, 1, 1); // inverte pra ver por dentro

        const mat = new THREE.MeshBasicMaterial({
          map: texture,
          side: THREE.BackSide
        });
        textureSphere = new THREE.Mesh(geom, mat);
        scene.add(textureSphere);

        // libera o objectURL pra não vazar memória
        URL.revokeObjectURL(objectURL);
      },
      undefined,
      err => console.error('[desktop.js] Erro ao carregar textura 360:', err)
    );
  } catch (err) {
    console.error('[desktop.js] Falha no fetchAndCacheMedia ou blob:', err);
  }
}

// callbacks pro loader.js
export const onSelectMedia = loadMedia;
export function onPrevMedia() { /* implementar depois */ }
export function onNextMedia() { /* implementar depois */ }

// ---------- Debug Sphere ---------- //
function addDebugSphere() {
  const geom = new THREE.SphereGeometry(500, 64, 40);
  const mat  = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });

  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `
        #include <color_fragment>
        if (gl_FrontFacing) {
          diffuseColor.rgb = vec3(1.0, 0.0, 0.0);
        } else {
          diffuseColor.rgb = vec3(0.0, 1.0, 0.0);
        }
      `
    );
  };

  debugSphere = new THREE.Mesh(geom, mat);
  scene.add(debugSphere);
}

function removeDebugSphere() {
  if (debugSphere) {
    scene.remove(debugSphere);
    debugSphere.geometry.dispose();
    debugSphere.material.dispose();
    debugSphere = null;
  }
}

function removeTextureSphere() {
  if (textureSphere) {
    scene.remove(textureSphere);
    textureSphere.geometry.dispose();
    textureSphere.material.dispose();
    textureSphere = null;
  }
}

// ---------- Loop de render ---------- //
function animate() {
  controls.update();
  renderer.render(scene, camera);
  animationId = requestAnimationFrame(animate);
}

// ---------- Resize ---------- //
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ---------- Dispose ---------- //
export function dispose() {
  console.log('[desktop.js] Limpando modo DESKTOP');
  cancelAnimationFrame(animationId);
  removeDebugSphere();
  removeTextureSphere();
  controls?.dispose();
  renderer?.dispose();
  window.removeEventListener('resize', onWindowResize);
  scene = camera = renderer = controls = null;
}
