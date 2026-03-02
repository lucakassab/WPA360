// js/tour/HotspotDebug.js
import { forwardToYawPitch, removeSceneOffsets } from "./HotspotPlacement.js";

const LS_KEY = "tour_hotspot_draft_v13";

export default class HotspotDebug {
  constructor(app) {
    this.app = app;

    this.enabled = false;
    this.step = 1.0;

    this._raf = null;
    this._yawWorld = 0;
    this._pitchWorld = 0;

    this._el = null;
    this._listEl = null;
    this._sceneEl = null;
    this._readoutEl = null;

    this._inputTo = null;
    this._inputLabel = null;

    this._inputTourFolder = null;
    this._inputJpeg = null;

    // ✅ Map position controls
    this._inputMapX = null;
    this._inputMapY = null;
    this._btnSetMapPos = null;
    this._previewMapTimer = null;

    this._btnAdd = null;
    this._btnSetToYaw = null;
    this._btnMove = null;
    this._btnCopy = null;

    this._btnExportScene = null;
    this._btnExportAll = null;
    this._btnClearScene = null;
    this._btnClearAll = null;

    this._selectedIndex = -1;

    this._move = {
      active: false,
      key: null,
      index: -1,
      original: null,
      lastRenderMs: 0,
    };

    // Draft POR TOUR + CENA
    this._draft = {
      byKey: {}, // "tourId::sceneId" -> hotspots[]
      meta: {
        tourFolderByTour: {}, // tourId -> folder
        panoByKey: {},        // "tourId::sceneId" -> pano override (string)
        mapPosByKey: {},      // ✅ "tourId::sceneId" -> "x,y" (%)
        lastJpeg: "",
      },
    };

    this._toursPromise = this._fetchToursRoot();
    this._lastKey = null;

    this._onKeyDown = this._onKeyDown.bind(this);
    this._tick = this._tick.bind(this);
  }

  init({ enabled = false } = {}) {
    this.enabled = !!enabled;

    this._loadDraft();
    this._buildUI();

    window.addEventListener("keydown", this._onKeyDown);

    this._ensureDraftForCurrent();
    this._applyDraftToRuntimeCurrent();

    this._syncTourFolderInput();
    this._syncMapInputsFromScene();

    this._tick();
    this._render();
    this._refreshList();
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    window.removeEventListener("keydown", this._onKeyDown);
    this._el?.remove();
  }

  // ===================== Key / Context =====================

  _currentTourId() {
    return this.app.currentTourId ?? this.app._defaultTourId ?? "tour01";
  }

  _currentSceneId() {
    return this.app.currentSceneId ?? "unknown";
  }

  _currentKey() {
    return `${this._currentTourId()}::${this._currentSceneId()}`;
  }

  _splitKey(key) {
    const s = String(key || "");
    const i = s.indexOf("::");
    if (i < 0) return { tourId: "tour01", sceneId: s };
    return { tourId: s.slice(0, i), sceneId: s.slice(i + 2) };
  }

  _currentSceneCfg() {
    return this.app.getCurrentScene?.() ?? {};
  }

  _currentAnglesLocal() {
    const scene = this._currentSceneCfg();
    const local = removeSceneOffsets(this._yawWorld, this._pitchWorld, scene);
    return { yaw: roundTo(local.yaw, this.step), pitch: roundTo(local.pitch, this.step) };
  }

  // ===================== Tick =====================

  _tick() {
    this._raf = requestAnimationFrame(this._tick);

    const key = this._currentKey();
    if (key !== this._lastKey) {
      this._lastKey = key;
      this._selectedIndex = -1;

      if (this._move.active) this._cancelMove(true);

      this._ensureDraftForCurrent();
      this._applyDraftToRuntimeCurrent();

      this._syncTourFolderInput();
      this._syncMapInputsFromScene();

      this._refreshList();
    }

    const THREE = window.AFRAME?.THREE;
    if (!THREE) return;

    const camObj = this.app.cameraEl?.object3D;
    if (!camObj) return;

    const q = new THREE.Quaternion();
    camObj.getWorldQuaternion(q);

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(q).normalize();
    const { yaw, pitch } = forwardToYawPitch(forward);

    this._yawWorld = yaw;
    this._pitchWorld = pitch;

    if (this._move.active) this._updateMove();
    if (this.enabled) this._render();
  }

  // ===================== Draft =====================

  _getDraftByKey(key) {
    return this._draft.byKey[key] ?? null;
  }

  _sceneListByKey(key) {
    if (!this._draft.byKey[key]) this._draft.byKey[key] = [];
    return this._draft.byKey[key];
  }

  _ensureDraftForCurrent() {
    const key = this._currentKey();
    if (this._draft.byKey[key]) return;

    const scene = this.app.getCurrentScene?.();
    const src = Array.isArray(scene?.hotspots) ? scene.hotspots : [];
    this._draft.byKey[key] = src.map((h) => ({ ...h }));

    const tid = this._currentTourId();
    if (!this._draft.meta.tourFolderByTour[tid]) {
      this._draft.meta.tourFolderByTour[tid] = tid;
    }

    this._saveDraft();
  }

  _applyDraftToRuntimeCurrent() {
    const key = this._currentKey();
    const { sceneId } = this._splitKey(key);

    const scene = this.app.getCurrentScene?.();
    if (!scene || String(scene.id) !== String(sceneId)) return;

    const arr = this._getDraftByKey(key);
    if (!arr) return;

    scene.hotspots = arr;

    if (typeof this.app._renderHotspots === "function") {
      this.app._renderHotspots(scene);
    } else {
      this.app.goToScene?.(sceneId, { pushHash: false, tourId: this._currentTourId() });
    }

    // aplica map pos persistido (se tiver)
    const mp = this._draft.meta.mapPosByKey[key];
    if (mp != null && String(mp).trim() !== "") {
      scene.scene_map_position = String(mp);
      this._updateMapPreview();
    }
  }

  _syncAndRerenderCurrent() {
    const scene = this.app.getCurrentScene?.();
    if (!scene) return;

    const arr = this._sceneListByKey(this._currentKey());
    scene.hotspots = arr;

    if (typeof this.app._renderHotspots === "function") {
      this.app._renderHotspots(scene);
    } else {
      this.app.goToScene?.(this._currentSceneId(), { pushHash: false, tourId: this._currentTourId() });
    }
  }

  // ===================== UI =====================

  _buildUI() {
    const root = document.createElement("div");
    root.id = "hsdebug";
    root.style.position = "fixed";
    root.style.right = "12px";
    root.style.bottom = "12px";
    root.style.zIndex = "99999";
    root.style.width = "440px";
    root.style.maxWidth = "96vw";
    root.style.background = "rgba(15,15,15,0.82)";
    root.style.border = "1px solid rgba(255,255,255,0.14)";
    root.style.borderRadius = "14px";
    root.style.backdropFilter = "blur(10px)";
    root.style.color = "rgba(255,255,255,0.92)";
    root.style.font = "12px/1.35 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    root.style.padding = "10px";
    root.style.pointerEvents = "auto";

    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.alignItems = "center";
    header.style.justifyContent = "space-between";
    header.style.gap = "10px";

    const title = document.createElement("div");
    title.textContent = "HOTSPOT DEBUG";
    title.style.fontWeight = "900";
    title.style.letterSpacing = "0.6px";

    const hint = document.createElement("div");
    hint.textContent = "E: toggle • P: copia • ESC: cancela mover";
    hint.style.opacity = "0.75";

    header.appendChild(title);
    header.appendChild(hint);

    const sceneLine = document.createElement("div");
    sceneLine.style.marginTop = "8px";
    sceneLine.style.display = "flex";
    sceneLine.style.justifyContent = "space-between";
    sceneLine.style.gap = "8px";

    this._sceneEl = document.createElement("div");
    this._sceneEl.style.opacity = "0.95";

    const stepEl = document.createElement("div");
    stepEl.style.opacity = "0.75";
    stepEl.textContent = `step: ${this.step}`;

    sceneLine.appendChild(this._sceneEl);
    sceneLine.appendChild(stepEl);

    // cfg row (folder/jpeg)
    const cfgRow = document.createElement("div");
    cfgRow.style.marginTop = "8px";
    cfgRow.style.display = "grid";
    cfgRow.style.gridTemplateColumns = "1fr 1fr";
    cfgRow.style.gap = "8px";

    this._inputTourFolder = makeInput("tour folder (ex: colunaA)");
    this._inputTourFolder.addEventListener("input", () => {
      const tid = this._currentTourId();
      this._draft.meta.tourFolderByTour[tid] = (this._inputTourFolder.value || "").trim() || tid;
      this._saveDraft();
    });

    this._inputJpeg = makeInput("jpeg (ex: Banheiro_tb.jpg)");
    this._inputJpeg.value = this._draft.meta.lastJpeg || "";
    this._inputJpeg.addEventListener("input", () => {
      this._draft.meta.lastJpeg = (this._inputJpeg.value || "").trim();
      this._saveDraft();
    });

    cfgRow.appendChild(this._inputTourFolder);
    cfgRow.appendChild(this._inputJpeg);

    // ✅ Map row (x/y + button)
    const mapRow = document.createElement("div");
    mapRow.style.marginTop = "8px";
    mapRow.style.display = "grid";
    mapRow.style.gridTemplateColumns = "1fr 1fr auto";
    mapRow.style.gap = "8px";
    mapRow.style.alignItems = "center";

    this._inputMapX = makeNumberInput("map X% (0-100)", 0, 100, 0.1);
    this._inputMapY = makeNumberInput("map Y% (0-100)", 0, 100, 0.1);

    // preview em tempo real ao digitar
    const onPreview = () => {
      clearTimeout(this._previewMapTimer);
      this._previewMapTimer = setTimeout(() => {
        this._applyMapPosFromInputs({ persist: false });
      }, 30);
    };
    this._inputMapX.addEventListener("input", onPreview);
    this._inputMapY.addEventListener("input", onPreview);

    this._btnSetMapPos = makeBtn("Set MapPos", () => {
      this._applyMapPosFromInputs({ persist: true });
      this.app.toast?.("scene_map_position salvo");
    });

    mapRow.appendChild(this._inputMapX);
    mapRow.appendChild(this._inputMapY);
    mapRow.appendChild(this._btnSetMapPos);

    // readout
    this._readoutEl = document.createElement("div");
    this._readoutEl.style.marginTop = "8px";
    this._readoutEl.style.padding = "8px";
    this._readoutEl.style.borderRadius = "10px";
    this._readoutEl.style.background = "rgba(255,255,255,0.06)";
    this._readoutEl.style.border = "1px solid rgba(255,255,255,0.10)";
    this._readoutEl.style.whiteSpace = "pre";

    // inputs
    const form = document.createElement("div");
    form.style.marginTop = "10px";
    form.style.display = "grid";
    form.style.gridTemplateColumns = "1fr 1fr";
    form.style.gap = "8px";

    this._inputLabel = makeInput("label");
    this._inputTo = makeInput("to (scene id)");
    form.appendChild(this._inputLabel);
    form.appendChild(this._inputTo);

    // action buttons
    const btnRow = document.createElement("div");
    btnRow.style.marginTop = "10px";
    btnRow.style.display = "grid";
    btnRow.style.gridTemplateColumns = "1fr 1fr 1fr 1fr";
    btnRow.style.gap = "8px";

    this._btnAdd = makeBtn("+ Ponto", () => this._addPoint());
    this._btnSetToYaw = makeBtn("Set toYaw", () => this._setToYawOnSelected());
    this._btnMove = makeBtn("Mover", () => this._toggleMoveSelected());
    this._btnCopy = makeBtn("Copiar", () => this._copyCurrentSnippet());

    btnRow.appendChild(this._btnAdd);
    btnRow.appendChild(this._btnSetToYaw);
    btnRow.appendChild(this._btnMove);
    btnRow.appendChild(this._btnCopy);

    // export buttons
    const exportRow = document.createElement("div");
    exportRow.style.marginTop = "8px";
    exportRow.style.display = "grid";
    exportRow.style.gridTemplateColumns = "1fr 1fr 1fr 1fr";
    exportRow.style.gap = "8px";

    this._btnExportScene = makeBtn("Export cena", () => this._exportScene());
    this._btnExportAll = makeBtn("Export tudo", () => this._exportAll());
    this._btnClearScene = makeBtn("Limpa cena", () => this._clearScene());
    this._btnClearAll = makeBtn("Limpa tudo", () => this._clearAll());

    exportRow.appendChild(this._btnExportScene);
    exportRow.appendChild(this._btnExportAll);
    exportRow.appendChild(this._btnClearScene);
    exportRow.appendChild(this._btnClearAll);

    // list
    const listWrap = document.createElement("div");
    listWrap.style.marginTop = "10px";

    const listTitle = document.createElement("div");
    listTitle.textContent = "Pontos (tour+cena atual)";
    listTitle.style.fontWeight = "800";
    listTitle.style.marginBottom = "6px";

    this._listEl = document.createElement("div");
    this._listEl.style.maxHeight = "240px";
    this._listEl.style.overflow = "auto";
    this._listEl.style.display = "flex";
    this._listEl.style.flexDirection = "column";
    this._listEl.style.gap = "6px";

    listWrap.appendChild(listTitle);
    listWrap.appendChild(this._listEl);

    root.appendChild(header);
    root.appendChild(sceneLine);
    root.appendChild(cfgRow);
    root.appendChild(mapRow);
    root.appendChild(this._readoutEl);
    root.appendChild(form);
    root.appendChild(btnRow);
    root.appendChild(exportRow);
    root.appendChild(listWrap);

    document.body.appendChild(root);
    this._el = root;

    this._updateEnabledUI();
  }

  _updateEnabledUI() {
    if (!this._el) return;
    this._el.style.opacity = this.enabled ? "1" : "0.45";
  }

  _render() {
    if (!this._el) return;

    const tid = this._currentTourId();
    const sid = this._currentSceneId();
    this._sceneEl.textContent = `tour: ${tid} | scene: ${sid}`;

    const { yaw, pitch } = this._currentAnglesLocal();
    const moving = this._move.active ? `\n\n[MOVENDO] hotspot #${this._move.index + 1} (Fixar / ESC)` : "";

    const mp = parsePercentPair(this.app.getCurrentScene?.()?.scene_map_position);
    const mpLine = mp ? `\nmap:  ${mp.x.toFixed(1)}%, ${mp.y.toFixed(1)}%` : `\nmap:  (sem)`;

    this._readoutEl.textContent =
      `yaw:   ${yaw.toFixed(1)}\n` +
      `pitch: ${pitch.toFixed(1)}` +
      mpLine +
      moving;

    const hasSel = this._selectedIndex >= 0;
    this._btnSetToYaw.disabled = !hasSel;
    this._btnMove.disabled = !hasSel;
    this._btnMove.textContent = this._move.active ? "Fixar" : "Mover";

    this._updateEnabledUI();
  }

  _syncTourFolderInput() {
    const tid = this._currentTourId();
    const val = this._draft.meta.tourFolderByTour[tid] || tid;
    if (this._inputTourFolder) this._inputTourFolder.value = val;
  }

  // ✅ atualiza inputs X/Y com o que a cena tem (ou o que tá no draft)
  _syncMapInputsFromScene() {
    const key = this._currentKey();

    // prioriza o draft salvo
    const saved = this._draft.meta.mapPosByKey[key];
    const scene = this.app.getCurrentScene?.();

    const pos = parsePercentPair(saved ?? scene?.scene_map_position);
    if (!pos) {
      if (this._inputMapX) this._inputMapX.value = "";
      if (this._inputMapY) this._inputMapY.value = "";
      return;
    }

    if (this._inputMapX) this._inputMapX.value = String(pos.x);
    if (this._inputMapY) this._inputMapY.value = String(pos.y);

    // garante runtime alinhado
    if (scene) scene.scene_map_position = `${pos.x},${pos.y}`;
    this._updateMapPreview();
  }

  // aplica o que tá nos inputs no runtime e (opcionalmente) persiste no draft
  _applyMapPosFromInputs({ persist }) {
    const x = Number(this._inputMapX?.value);
    const y = Number(this._inputMapY?.value);

    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

    const cx = clampNum(x, 0, 100);
    const cy = clampNum(y, 0, 100);

    const scene = this.app.getCurrentScene?.();
    if (scene) scene.scene_map_position = `${cx},${cy}`;

    if (persist) {
      const key = this._currentKey();
      this._draft.meta.mapPosByKey[key] = `${cx},${cy}`;
      this._saveDraft();
    }

    this._updateMapPreview();
  }

  _updateMapPreview() {
    // Atualiza marker do overlay em tempo real (se o App tiver a função)
    if (typeof this.app._updateMapMarker === "function") {
      this.app._updateMapMarker();
    }
  }

  // ===================== Move =====================

  _toggleMoveSelected() {
    if (!this.enabled) return;

    if (this._move.active) {
      this._move.active = false;
      this._move.key = null;
      this._move.index = -1;
      this._move.original = null;

      this._saveDraft();
      this._refreshList();
      this.app.toast?.("Ponto fixado");
      return;
    }

    const key = this._currentKey();
    const arr = this._sceneListByKey(key);
    const idx = this._selectedIndex;
    if (idx < 0 || idx >= arr.length) return;

    this._move.active = true;
    this._move.key = key;
    this._move.index = idx;
    this._move.original = { yaw: arr[idx].yaw, pitch: arr[idx].pitch };
    this._move.lastRenderMs = 0;

    this.app.toast?.("Modo mover: olha pro lugar e clica Fixar (ESC cancela)");
  }

  _cancelMove(silent = false) {
    if (!this._move.active) return;

    const key = this._move.key;
    const idx = this._move.index;
    const orig = this._move.original;

    if (key && orig && idx >= 0) {
      const arr = this._sceneListByKey(key);
      if (arr[idx]) {
        arr[idx].yaw = orig.yaw;
        arr[idx].pitch = orig.pitch;
      }
    }

    this._move.active = false;
    this._move.key = null;
    this._move.index = -1;
    this._move.original = null;

    this._syncAndRerenderCurrent();
    if (!silent) this.app.toast?.("Mover cancelado");
  }

  _updateMove() {
    const now = performance.now();
    if (now - this._move.lastRenderMs < 40) return;

    const keyNow = this._currentKey();
    if (keyNow !== this._move.key) {
      this._cancelMove(true);
      return;
    }

    if (this._selectedIndex !== this._move.index) {
      this._cancelMove(false);
      return;
    }

    const arr = this._sceneListByKey(keyNow);
    const idx = this._move.index;
    if (!arr[idx]) {
      this._cancelMove(true);
      return;
    }

    const { yaw, pitch } = this._currentAnglesLocal();
    arr[idx].yaw = Number(yaw.toFixed(1));
    arr[idx].pitch = Number(pitch.toFixed(1));

    this._move.lastRenderMs = now;
    this._syncAndRerenderCurrent();
  }

  // ===================== Actions =====================

  _addPoint() {
    if (!this.enabled) return;

    const key = this._currentKey();
    const arr = this._sceneListByKey(key);

    const { yaw, pitch } = this._currentAnglesLocal();

    const label = (this._inputLabel.value || "").trim();
    const to = (this._inputTo.value || "").trim();
    const jpeg = (this._inputJpeg.value || "").trim();

    if (jpeg) {
      this._draft.meta.lastJpeg = jpeg;
      this._saveDraft();
    }

    const hs = {
      yaw: Number(yaw.toFixed(1)),
      pitch: Number(pitch.toFixed(1)),
      to,
      label
    };

    arr.push(hs);
    this._selectedIndex = arr.length - 1;

    this._saveDraft();
    this._refreshList();
    this._syncAndRerenderCurrent();

    this.app.toast?.("Ponto criado");
  }

  _setToYawOnSelected() {
    if (!this.enabled) return;

    const key = this._currentKey();
    const arr = this._sceneListByKey(key);
    if (this._selectedIndex < 0 || this._selectedIndex >= arr.length) return;

    const { yaw } = this._currentAnglesLocal();
    arr[this._selectedIndex].toYaw = Number(yaw.toFixed(1));

    this._saveDraft();
    this._refreshList();
    this._syncAndRerenderCurrent();
    this.app.toast?.("toYaw setado");
  }

  _clearScene() {
    if (this._move.active) this._cancelMove(true);

    const key = this._currentKey();
    this._draft.byKey[key] = [];
    delete this._draft.meta.mapPosByKey[key];
    this._selectedIndex = -1;

    this._saveDraft();
    this._refreshList();
    this._syncAndRerenderCurrent();
    this._syncMapInputsFromScene();
    this.app.toast?.("Cena limpa (draft)");
  }

  _clearAll() {
    if (this._move.active) this._cancelMove(true);

    this._draft = {
      byKey: {},
      meta: {
        tourFolderByTour: this._draft?.meta?.tourFolderByTour || {},
        panoByKey: {},
        mapPosByKey: {},
        lastJpeg: this._draft?.meta?.lastJpeg || ""
      }
    };

    this._selectedIndex = -1;
    this._saveDraft();
    this._refreshList();
    this._syncAndRerenderCurrent();
    this._syncMapInputsFromScene();
    this.app.toast?.("Draft limpo");
  }

  async _copyCurrentSnippet() {
    const { yaw, pitch } = this._currentAnglesLocal();
    const snippet = `{ "yaw": ${yaw.toFixed(1)}, "pitch": ${pitch.toFixed(1)}, "to": "", "label": "" }`;

    try {
      await navigator.clipboard.writeText(snippet);
      this.app.toast?.("Copiado");
    } catch {
      console.log("HOTSPOT:", snippet);
      this.app.toast?.("Clipboard falhou (veja console)");
    }
  }

  // ===================== Export =====================

  async _exportScene() {
    const root = await this._toursPromise;
    const key = this._currentKey();
    const { tourId, sceneId } = this._splitKey(key);

    const out = this._buildToursJson(root, { mode: "scene", onlyTourId: tourId, onlySceneId: sceneId });
    downloadJson(out, `tours_${safeName(tourId)}_${safeName(sceneId)}.json`);
    this.app.toast?.("Export cena ok");
  }

  async _exportAll() {
    const root = await this._toursPromise;
    const out = this._buildToursJson(root, { mode: "all" });
    downloadJson(out, `tours_full.json`);
    this.app.toast?.("Export tudo ok");
  }

  _buildToursJson(root, { mode, onlyTourId = null, onlySceneId = null }) {
    const toursMap = root?.tours ?? {};
    const tourIds = Object.keys(toursMap);

    const defaultTour = root?.defaultTour && toursMap[root.defaultTour]
      ? root.defaultTour
      : (tourIds[0] || "tour01");

    const out = { defaultTour, tours: {} };

    const draftByKey = this._draft.byKey || {};
    const panoByKey = this._draft.meta.panoByKey || {};
    const folderByTour = this._draft.meta.tourFolderByTour || {};
    const mapPosByKey = this._draft.meta.mapPosByKey || {};

    const pickTours = (mode === "scene" && onlyTourId) ? [onlyTourId] : tourIds;

    for (const tid of pickTours) {
      const tour = toursMap[tid];
      if (!tour) continue;

      const folder = folderByTour[tid] || tid;
      const origScenes = Array.isArray(tour.scenes) ? tour.scenes : [];

      const scenesOut = [];

      for (const s of origScenes) {
        if (mode === "scene" && onlySceneId && String(s.id) !== String(onlySceneId)) continue;

        const key = `${tid}::${s.id}`;

        // hotspots: draft override se existir
        const hsDraft = draftByKey[key];
        const hotspots = Array.isArray(hsDraft)
          ? hsDraft.map(h => ({ ...h }))
          : (Array.isArray(s.hotspots) ? s.hotspots.map(h => ({ ...h })) : []);

        // pano override
        let pano = s.pano;
        const panoRaw = panoByKey[key];
        if (panoRaw) pano = panoRaw;

        // ✅ map position override (percent "x,y")
        let scene_map_position = s.scene_map_position;
        const mp = mapPosByKey[key];
        if (mp != null && String(mp).trim() !== "") scene_map_position = String(mp);

        scenesOut.push({
          ...s,
          id: String(s.id),
          pano,
          scene_map_position,
          hotspots
        });
      }

      out.tours[tid] = {
        title: tour.title ?? tid,
        map_png: tour.map_png, // mantém se existir
        scenes: scenesOut
      };
    }

    return out;
  }

  // ===================== List =====================

  _refreshList() {
    if (!this._listEl) return;

    const key = this._currentKey();
    const arr = this._sceneListByKey(key);

    this._listEl.innerHTML = "";

    if (!arr.length) {
      const empty = document.createElement("div");
      empty.textContent = "(nenhum ponto ainda)";
      empty.style.opacity = "0.7";
      empty.style.padding = "6px";
      this._listEl.appendChild(empty);
      return;
    }

    arr.forEach((hs, i) => {
      const row = document.createElement("div");
      row.style.display = "grid";
      row.style.gridTemplateColumns = "1fr auto";
      row.style.gap = "8px";
      row.style.alignItems = "center";
      row.style.padding = "8px";
      row.style.borderRadius = "10px";
      row.style.border = "1px solid rgba(255,255,255,0.12)";
      row.style.background = (i === this._selectedIndex)
        ? "rgba(0,160,255,0.18)"
        : "rgba(255,255,255,0.05)";
      row.style.cursor = "pointer";

      const left = document.createElement("div");
      left.style.display = "flex";
      left.style.flexDirection = "column";
      left.style.gap = "2px";

      const line1 = document.createElement("div");
      line1.style.fontWeight = "800";
      line1.textContent = `${i + 1}. ${hs.label || "(sem label)"} → ${hs.to || "(sem to)"}`;

      const line2 = document.createElement("div");
      line2.style.opacity = "0.85";
      line2.textContent =
        `yaw ${Number(hs.yaw).toFixed(1)} | pitch ${Number(hs.pitch).toFixed(1)}` +
        (hs.toYaw !== undefined ? ` | toYaw ${Number(hs.toYaw).toFixed(1)}` : "");

      left.appendChild(line1);
      left.appendChild(line2);

      const del = document.createElement("button");
      del.textContent = "X";
      del.title = "Remover";
      del.style.border = "1px solid rgba(255,255,255,0.16)";
      del.style.background = "rgba(255,255,255,0.08)";
      del.style.color = "rgba(255,255,255,0.9)";
      del.style.borderRadius = "10px";
      del.style.padding = "6px 10px";
      del.style.cursor = "pointer";

      del.addEventListener("click", (e) => {
        e.stopPropagation();
        if (this._move.active) this._cancelMove(true);

        arr.splice(i, 1);
        if (this._selectedIndex === i) this._selectedIndex = -1;
        if (this._selectedIndex > i) this._selectedIndex -= 1;

        this._saveDraft();
        this._refreshList();
        this._syncAndRerenderCurrent();
      });

      row.addEventListener("click", () => {
        if (this._move.active) this._cancelMove(false);
        this._selectedIndex = i;
        this._refreshList();
      });

      row.appendChild(left);
      row.appendChild(del);
      this._listEl.appendChild(row);
    });
  }

  // ===================== Keyboard =====================

  _onKeyDown(e) {
    if (e.key === "Escape") {
      if (this._move.active) this._cancelMove(false);
      return;
    }

    if (e.key.toLowerCase() === "e") {
      this.enabled = !this.enabled;
      this._render();
      return;
    }

    if (e.key === "+" || e.key === "=") {
      this.step = Math.min(10, this.step * 2);
      this._render();
      return;
    }
    if (e.key === "-" || e.key === "_") {
      this.step = Math.max(0.1, this.step / 2);
      this._render();
      return;
    }

    if (e.key.toLowerCase() === "p") {
      this._copyCurrentSnippet();
      return;
    }
  }

  // ===================== Storage =====================

  _loadDraft() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const obj = JSON.parse(raw);

      if (obj?.byKey && typeof obj.byKey === "object") {
        this._draft.byKey = obj.byKey || {};
        this._draft.meta = {
          tourFolderByTour: obj?.meta?.tourFolderByTour || {},
          panoByKey: obj?.meta?.panoByKey || {},
          mapPosByKey: obj?.meta?.mapPosByKey || {},
          lastJpeg: obj?.meta?.lastJpeg || ""
        };
      }
    } catch {}
  }

  _saveDraft() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(this._draft));
    } catch {}
  }

  // ===================== tours.json fetch =====================

  async _fetchToursRoot() {
    try {
      const res = await fetch("./tours.json", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn("HotspotDebug: falha ao ler tours.json (export vai usar fallback).", e);
      return { defaultTour: "tour01", tours: { tour01: { title: "Tour", scenes: [] } } };
    }
  }
}

// ===================== Helpers =====================

function makeBtn(label, onClick) {
  const b = document.createElement("button");
  b.textContent = label;
  b.style.border = "1px solid rgba(255,255,255,0.16)";
  b.style.background = "rgba(255,255,255,0.10)";
  b.style.color = "rgba(255,255,255,0.92)";
  b.style.borderRadius = "10px";
  b.style.padding = "8px 10px";
  b.style.cursor = "pointer";
  b.style.fontWeight = "800";
  b.addEventListener("click", onClick);
  return b;
}

function makeInput(placeholder) {
  const i = document.createElement("input");
  i.type = "text";
  i.placeholder = placeholder;
  i.style.width = "100%";
  i.style.boxSizing = "border-box";
  i.style.border = "1px solid rgba(255,255,255,0.14)";
  i.style.background = "rgba(255,255,255,0.06)";
  i.style.color = "rgba(255,255,255,0.92)";
  i.style.borderRadius = "10px";
  i.style.padding = "8px 10px";
  i.style.outline = "none";
  return i;
}

function makeNumberInput(placeholder, min, max, step) {
  const i = makeInput(placeholder);
  i.type = "number";
  i.min = String(min);
  i.max = String(max);
  i.step = String(step);
  return i;
}

function roundTo(v, step) {
  return Math.round(v / step) * step;
}

function clampNum(v, a, b) {
  const n = Number(v);
  if (!Number.isFinite(n)) return a;
  return Math.max(a, Math.min(b, n));
}

function downloadJson(obj, filename) {
  const text = JSON.stringify(obj, null, 2);
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function safeName(s) {
  return String(s).replace(/[^\w\-]+/g, "_").slice(0, 80);
}

// aceita "x,y" ou {x,y} ou [x,y]
function parsePercentPair(v) {
  if (v == null) return null;

  let x, y;

  if (typeof v === "string") {
    const parts = v.split(",").map(s => Number(String(s).trim()));
    x = parts[0];
    y = parts[1];
  } else if (Array.isArray(v)) {
    x = Number(v[0]);
    y = Number(v[1]);
  } else if (typeof v === "object") {
    x = Number(v.x);
    y = Number(v.y);
  }

  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  x = Math.max(0, Math.min(100, x));
  y = Math.max(0, Math.min(100, y));

  return { x, y };
}