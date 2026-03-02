// js/xr/StereoTopBottom.js
export function registerStereoTopBottom(AFRAME) {
  if (!AFRAME) throw new Error("AFRAME não carregou (vendor/aframe.min.js).");

  const THREE = AFRAME.THREE;

  // ===== Cache global de textures (memória) =====
  const MAX_CACHE = 12;
  const cache = new Map(); // url -> { tex, promise, lastUsed }

  function resolveUrl(src) {
    return new URL(src, window.location.href).toString();
  }

  function touch(url) {
    const e = cache.get(url);
    if (e) e.lastUsed = performance.now();
  }

  function trimCache() {
    if (cache.size <= MAX_CACHE) return;

    const entries = Array.from(cache.entries())
      .filter(([, v]) => v?.tex)
      .sort((a, b) => (a[1].lastUsed ?? 0) - (b[1].lastUsed ?? 0));

    while (cache.size > MAX_CACHE && entries.length) {
      const [url, v] = entries.shift();
      try { v.tex?.dispose?.(); } catch {}
      cache.delete(url);
    }
  }

  function loadTextureCached(url) {
    const existing = cache.get(url);

    if (existing?.tex) {
      touch(url);
      return Promise.resolve(existing.tex);
    }
    if (existing?.promise) {
      touch(url);
      return existing.promise;
    }

    const loader = new THREE.TextureLoader();
    const promise = new Promise((resolve, reject) => {
      loader.load(
        url,
        (tex) => {
          tex.minFilter = THREE.LinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.generateMipmaps = false;

          cache.set(url, { tex, promise: null, lastUsed: performance.now() });
          trimCache();
          resolve(tex);
        },
        undefined,
        (err) => {
          cache.delete(url);
          reject(err);
        }
      );
    });

    cache.set(url, { tex: null, promise, lastUsed: performance.now() });
    return promise;
  }

  function isCached(src) {
    if (!src) return false;
    const url = resolveUrl(src);
    return !!cache.get(url)?.tex;
  }

  AFRAME.registerComponent("stereo-top-bottom", {
    schema: {
      src: { type: "string", default: "" },
      radius: { type: "number", default: 5000 },
      segmentsWidth: { type: "int", default: 64 },
      segmentsHeight: { type: "int", default: 32 },
      flipX: { type: "boolean", default: true }
    },

    init() {
      this._currentUrl = "";
      this._currentSrc = "";
      this._makeMesh();
      this._bindBeforeRender();

      // API programática
      this.setSrc = async (src) => this._setSrcInternal(src);
      this.preload = async (src) => {
        if (!src) return null;
        const url = resolveUrl(src);
        try { return await loadTextureCached(url); } catch { return null; }
      };
      this.isCached = (src) => isCached(src);

      if (this.data.src) this._setSrcInternal(this.data.src);
    },

    update(oldData) {
      const srcChanged = this.data.src && this.data.src !== oldData.src;

      if (
        this.data.radius !== oldData.radius ||
        this.data.segmentsWidth !== oldData.segmentsWidth ||
        this.data.segmentsHeight !== oldData.segmentsHeight
      ) {
        this._makeMesh(true);
        this._bindBeforeRender();
      }

      if (this.material && this.data.flipX !== oldData.flipX) {
        this.material.uniforms.uFlipX.value = this.data.flipX ? 1.0 : 0.0;
      }

      if (srcChanged) this._setSrcInternal(this.data.src);
    },

    remove() {
      if (this.el.getObject3D("mesh")) this.el.removeObject3D("mesh");
      // não dá dispose: cache segura
    },

    _makeMesh(rebuild = false) {
      this.material = new THREE.ShaderMaterial({
        uniforms: {
          uMap: { value: null },
          uHasMap: { value: 0.0 },
          uStereo: { value: 0.0 },
          uEye: { value: 0.0 },
          uFlipX: { value: this.data.flipX ? 1.0 : 0.0 }
        },
        vertexShader: `
          precision mediump float;
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          precision mediump float;

          uniform sampler2D uMap;
          uniform float uHasMap;
          uniform float uStereo;
          uniform float uEye;
          uniform float uFlipX;

          varying vec2 vUv;

          void main() {
            if (uHasMap < 0.5) {
              gl_FragColor = vec4(0.0,0.0,0.0,1.0);
              return;
            }

            vec2 uv = vUv;

            if (uFlipX > 0.5) uv.x = 1.0 - uv.x;

            uv.y = uv.y * 0.5;
            if (uStereo > 0.5) {
              uv.y += 0.5 * uEye;
            }

            gl_FragColor = texture2D(uMap, uv);
          }
        `,
        side: THREE.BackSide,
        depthWrite: false
      });

      const geo = new THREE.SphereGeometry(
        this.data.radius,
        this.data.segmentsWidth,
        this.data.segmentsHeight
      );

      this.mesh = new THREE.Mesh(geo, this.material);

      if (rebuild && this.el.getObject3D("mesh")) this.el.removeObject3D("mesh");
      this.el.setObject3D("mesh", this.mesh);
    },

    _bindBeforeRender() {
      const sceneEl = this.el.sceneEl;

      this.mesh.onBeforeRender = (renderer, _scene, camera) => {
        const presenting = sceneEl.is("vr-mode") || sceneEl.is("ar-mode");
        this.material.uniforms.uStereo.value = presenting ? 1.0 : 0.0;

        if (!presenting) {
          this.material.uniforms.uEye.value = 0.0;
          return;
        }

        const baseCam = sceneEl.camera;
        const xrCam = renderer.xr?.getCamera?.(baseCam);
        const left = xrCam?.cameras?.[0];
        const right = xrCam?.cameras?.[1];

        if (left && camera === left) this.material.uniforms.uEye.value = 0.0;
        else if (right && camera === right) this.material.uniforms.uEye.value = 1.0;
        else this.material.uniforms.uEye.value = 0.0;
      };
    },

    async _setSrcInternal(src) {
      if (!src) {
        this.material.uniforms.uHasMap.value = 0.0;
        this.material.uniforms.uMap.value = null;
        this._currentSrc = "";
        this._currentUrl = "";
        return;
      }

      const url = resolveUrl(src);
      const wasCached = !!cache.get(url)?.tex;

      if (url === this._currentUrl) {
        touch(url);
        queueMicrotask(() => {
          this.el.emit("stereo-loaded", { src, url, cached: true }, false);
        });
        return;
      }

      // mantém textura antiga até a nova ficar pronta
      this._currentSrc = src;
      this._currentUrl = url;

      try {
        const tex = await loadTextureCached(url);
        touch(url);

        this.material.uniforms.uMap.value = tex;
        this.material.uniforms.uHasMap.value = 1.0;

        this.el.emit("stereo-loaded", { src, url, cached: wasCached }, false);
      } catch (err) {
        console.error("Falha ao carregar panorama:", src, err);
        this.el.emit("stereo-error", { src, url }, false);
      }
    }
  });
}