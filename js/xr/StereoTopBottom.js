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

  function isPowerOfTwo(n) {
    n = n | 0;
    return n > 0 && (n & (n - 1)) === 0;
  }

  function getMaxTextureSize(sceneEl) {
    const r = sceneEl?.renderer;
    const max = r?.capabilities?.maxTextureSize;
    return Number.isFinite(max) ? max : 8192;
  }

  function getMaxAnisotropy(sceneEl) {
    const r = sceneEl?.renderer;
    try {
      const a = r?.capabilities?.getMaxAnisotropy?.();
      return Number.isFinite(a) ? a : 1;
    } catch {
      return 1;
    }
  }

  function loadTextureCached(url, sceneEl) {
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
          const img = tex.image;
          const w = img?.width || 0;
          const h = img?.height || 0;

          const maxTex = getMaxTextureSize(sceneEl);
          const fits = (w > 0 && h > 0 && w <= maxTex && h <= maxTex);
          const pot = isPowerOfTwo(w) && isPowerOfTwo(h);

          if (fits && pot) {
            tex.generateMipmaps = true;
            tex.minFilter = THREE.LinearMipmapLinearFilter;
            tex.magFilter = THREE.LinearFilter;

            const maxA = getMaxAnisotropy(sceneEl);
            tex.anisotropy = Math.min(4, maxA);
          } else {
            tex.generateMipmaps = false;
            tex.minFilter = THREE.LinearFilter;
            tex.magFilter = THREE.LinearFilter;
            tex.anisotropy = 1;
          }

          tex.wrapS = THREE.ClampToEdgeWrapping;
          tex.wrapT = THREE.ClampToEdgeWrapping;

          tex.needsUpdate = true;

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
      segmentsWidth: { type: "int", default: 128 },
      segmentsHeight: { type: "int", default: 64 },
      flipX: { type: "boolean", default: true },

      // ===== WebXR quality knobs =====
      xrScale: { type: "number", default: 1.4 },
      disableFoveation: { type: "boolean", default: true },
      fixedFoveation: { type: "number", default: 0.0 },

      // ✅ TESTE: inverter olhos (L/R) pra validar estereo
      invertStereo: { type: "boolean", default: false }
    },

    init() {
      this._currentUrl = "";
      this._currentSrc = "";
      this._lastQualityApplyMs = 0;

      this._makeMesh();
      this._bindBeforeRender();

      // API programática
      this.setSrc = async (src) => this._setSrcInternal(src);
      this.preload = async (src) => {
        if (!src) return null;
        const url = resolveUrl(src);
        try { return await loadTextureCached(url, this.el.sceneEl); } catch { return null; }
      };
      this.isCached = (src) => isCached(src);

      // tenta aplicar qualidade quando entrar no VR
      this.el.sceneEl?.addEventListener?.("enter-vr", () => {
        this._applyXrQuality(true);
      });

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

      // invertStereo não precisa uniform — só afeta cálculo do uEye no beforeRender

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
          precision highp float;
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          precision highp float;

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

            // top/bottom: metade da altura por olho
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

    _applyXrQuality(force = false) {
      const sceneEl = this.el.sceneEl;
      const renderer = sceneEl?.renderer;
      if (!renderer?.xr) return;

      if (!renderer.xr.isPresenting) return;

      const now = performance.now();
      if (!force && (now - this._lastQualityApplyMs) < 500) return;
      this._lastQualityApplyMs = now;

      const s = Number(this.data.xrScale);
      const scale = Number.isFinite(s) ? Math.max(0.5, Math.min(2.0, s)) : 1.0;
      try {
        renderer.xr.setFramebufferScaleFactor?.(scale);
      } catch {}

      try {
        const session = renderer.xr.getSession?.();
        const baseLayer = session?.renderState?.baseLayer;

        if (baseLayer && ("fixedFoveation" in baseLayer)) {
          const want = this.data.disableFoveation
            ? 0.0
            : Math.max(0.0, Math.min(1.0, Number(this.data.fixedFoveation) || 0.0));

          baseLayer.fixedFoveation = want;
        }

        if (this.data.disableFoveation) {
          renderer.xr.setFoveation?.(0);
        }
      } catch {}
    },

    _bindBeforeRender() {
      const sceneEl = this.el.sceneEl;

      this.mesh.onBeforeRender = (renderer, _scene, camera) => {
        const presenting = sceneEl.is("vr-mode") || sceneEl.is("ar-mode");
        this.material.uniforms.uStereo.value = presenting ? 1.0 : 0.0;

        if (presenting) this._applyXrQuality(false);

        if (!presenting) {
          this.material.uniforms.uEye.value = 0.0;
          return;
        }

        const baseCam = sceneEl.camera;
        const xrCam = renderer.xr?.getCamera?.(baseCam);
        const left = xrCam?.cameras?.[0];
        const right = xrCam?.cameras?.[1];

        // identifica olho atual
        let eye = 0.0;
        if (left && camera === left) eye = 0.0;
        else if (right && camera === right) eye = 1.0;
        else eye = 0.0;

        // ✅ TESTE: inverter olhos
        if (this.data.invertStereo) eye = 1.0 - eye;

        this.material.uniforms.uEye.value = eye;
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

      this._currentSrc = src;
      this._currentUrl = url;

      try {
        const tex = await loadTextureCached(url, this.el.sceneEl);
        touch(url);

        this.material.uniforms.uMap.value = tex;
        this.material.uniforms.uHasMap.value = 1.0;

        this._applyXrQuality(true);

        this.el.emit("stereo-loaded", { src, url, cached: wasCached }, false);
      } catch (err) {
        console.error("Falha ao carregar panorama:", src, err);
        this.el.emit("stereo-error", { src, url }, false);
      }
    }
  });
}