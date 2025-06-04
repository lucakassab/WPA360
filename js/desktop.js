// js/desktop.js

import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.158.0/examples/jsm/controls/OrbitControls.js';

let scene, camera, renderer, controls;
let debugSphere = null;
let textureSphere = null;
let animationId = null;
const SPHERE_RADIUS = 500;

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

  // Começa levemente dentro da esfera
  camera.position.set(0, 0, 1);

  // OrbitControls p/ rotacionar e usar scroll como zoom
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;        // sem panning lateral
  controls.enableZoom = true;        // scroll ativa zoom
  controls.minDistance = 0.1;        // não deixa passar pelo centro
  controls.maxDistance = 1500;       // depois disso não precisa enxergar

  addDebugSphere();

  window.addEventListener('resize', onWindowResize);
  animate();
}

// loader.js chama isto quando o usuário escolhe uma mídia
export function loadMedia(url, stereo = false) {
  console.log('[desktop.js] Carregando mídia:', url, 'stereo?', stereo);

  removeDebugSphere();
  removeTextureSphere();

  const loader = new THREE.TextureLoader();
  loader.load(
    url,
    (texture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;

      const geom = new THREE.SphereGeometry(SPHERE_RADIUS, 64, 40);
      geom.scale(-1, 1, 1); // inverte p/ ver a textura por dentro

      const mat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide });
      textureSphere = new THREE.Mesh(geom, mat);
      scene.add(textureSphere);
    },
    undefined,
    (err) => console.error('[desktop.js] Erro ao carregar textura 360:', err)
  );
}

// callbacks usados pelo loader.js
export const onSelectMedia = loadMedia;
export function onPrevMedia() {/* implementar dps */}
export function onNextMedia() {/* implementar dps */}

// ---------- Debug sphere (verde interno / vermelho externo) ---------- //
function addDebugSphere() {
  const geom = new THREE.SphereGeometry(SPHERE_RADIUS, 64, 40);
  const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `
        #include <color_fragment>
        // Front face = vermelho (externo), Back face = verde (interno)
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

// ---------- Render loop ---------- //
function animate() {
  controls.update();            // atualiza rotação/zoom
  renderer.render(scene, camera);
  animationId = requestAnimationFrame(animate);
}

// ---------- Resize ---------- //
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ---------- Limpeza quando sair do modo DESKTOP ---------- //
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
