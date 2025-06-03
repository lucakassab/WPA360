// js/desktop.js

import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js';

let scene, camera, renderer;
let debugSphere = null;        // esfera única p/ debug (verde interno, vermelho externo)
let textureSphere = null;      // esfera texturizada
let animationId = null;

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
  camera.position.set(0, 0, 0);

  addDebugSphere();

  window.addEventListener('resize', onWindowResize);
  animate();
}

// loader.js chama isto quando o usuário escolhe uma mídia
export function loadMedia(url, stereo = false) {
  console.log('[desktop.js] Carregando mídia:', url, 'stereo?', stereo);

  removeDebugSphere(); // tira a esfera de debug
  removeTextureSphere(); // remove anterior se existir

  const loader = new THREE.TextureLoader();
  loader.load(
    url,
    (texture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;

      const geom = new THREE.SphereGeometry(500, 64, 40);
      geom.scale(-1, 1, 1); // inverte para ficar dentro

      const mat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide });
      textureSphere = new THREE.Mesh(geom, mat);
      scene.add(textureSphere);
    },
    undefined,
    (err) => console.error('[desktop.js] Erro ao carregar textura 360:', err)
  );
}

// opcional – chamadas do loader.js
export const onSelectMedia = loadMedia;
export function onPrevMedia() {/* implementar depois */}
export function onNextMedia() {/* implementar depois */}

// ---------- Debug sphere ---------- //
function addDebugSphere() {
  const geom = new THREE.SphereGeometry(500, 64, 40);
  // NÃO faz scale(-1); queremos ver ambos os lados

  const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  // patcha o shader p/ cores diferentes
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `
        #include <color_fragment>
        // Front face = vermelho, Back face = verde
        if (gl_FrontFacing) {
          diffuseColor.rgb = vec3(1.0, 0.0, 0.0);  // vermelho externo
        } else {
          diffuseColor.rgb = vec3(0.0, 1.0, 0.0);  // verde interno
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

  renderer?.dispose();
  window.removeEventListener('resize', onWindowResize);

  scene = camera = renderer = null;
}
