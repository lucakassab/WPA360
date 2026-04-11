import { HotspotLoaderShared, isSceneLabelHotspot } from "../shared/HotspotLoaderShared.js";

const hotspotLoader = new HotspotLoaderShared();

export class EditorDraftStore {
  constructor({ context }) {
    this.context = context;
    this.listeners = new Set();
    this.state = {
      draft: null,
      activeSceneId: null,
      selectedSceneId: null,
      selectedHotspotId: null,
      dirty: false,
      error: null
    };
  }

  mount() {
    this.unsubscribeRuntime = this.context.store.subscribe((runtimeState) => {
      this.syncFromRuntime(runtimeState);
    });
  }

  destroy() {
    this.unsubscribeRuntime?.();
    this.listeners.clear();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  syncFromRuntime(runtimeState) {
    const tour = runtimeState.currentTour;
    if (!tour) {
      return;
    }

    const runtimeDraft = normalizeTour(deepClone(tour));
    const activeSceneId = getScene(runtimeDraft, runtimeState.currentSceneId)?.id
      ?? runtimeDraft.initial_scene
      ?? runtimeDraft.scenes[0]?.id
      ?? null;
    const shouldReplaceDraft = !this.state.draft
      || this.state.draft.id !== tour.id
      || !this.state.dirty;

    if (!shouldReplaceDraft) {
      this.syncSelectionToActiveScene(activeSceneId);
      return;
    }

    const activeScene = getScene(runtimeDraft, activeSceneId);

    this.patch({
      draft: runtimeDraft,
      activeSceneId,
      selectedSceneId: activeSceneId,
      selectedHotspotId: activeScene?.hotspots?.[0]?.id ?? null,
      dirty: false,
      error: null
    });
  }

  syncSelectionToActiveScene(activeSceneId) {
    if (!activeSceneId || activeSceneId === this.state.activeSceneId) {
      return;
    }

    const activeScene = getScene(this.state.draft, activeSceneId);
    if (!activeScene) {
      return;
    }

    this.patch({
      activeSceneId,
      selectedSceneId: activeScene.id,
      selectedHotspotId: activeScene.hotspots?.[0]?.id ?? null
    });
  }

  getSnapshot() {
    return this.state;
  }

  setSelectedScene(sceneId) {
    const scene = getScene(this.state.draft, sceneId);
    if (!scene) {
      return;
    }

    this.patch({
      activeSceneId: scene.id,
      selectedSceneId: scene.id,
      selectedHotspotId: scene.hotspots?.[0]?.id ?? null
    });
    this.applyRuntime();
  }

  setSelectedHotspot(hotspotId) {
    const scene = getScene(this.state.draft, this.state.selectedSceneId);
    const hotspot = getHotspot(scene, hotspotId);
    this.patch({ selectedHotspotId: hotspot?.id ?? null });
  }

  selectHotspot(sceneId, hotspotId) {
    const scene = getScene(this.state.draft, sceneId);
    const hotspot = getHotspot(scene, hotspotId);
    if (!scene || !hotspot) {
      return false;
    }

    this.patch({
      activeSceneId: scene.id,
      selectedSceneId: scene.id,
      selectedHotspotId: hotspot.id
    });
    return true;
  }

  updateTourField(field, value) {
    this.updateDraft((draft) => {
      if (field === "initial_scene" && !getScene(draft, value)) {
        return;
      }
      draft[field] = value;
    });
  }

  updateTourSetting(path, value) {
    this.updateDraft((draft) => {
      draft.settings ??= {};
      draft.settings.rotation ??= defaultRotation();
      setPath(draft.settings, path, value);
    });
  }

  updateSceneField(field, value) {
    this.updateDraft((draft) => {
      const scene = getScene(draft, this.state.selectedSceneId);
      if (!scene) {
        return;
      }

      if (field === "id") {
        const nextId = slugify(value);
        if (!nextId || draft.scenes.some((candidate) => candidate.id === nextId && candidate !== scene)) {
          return;
        }

        const previousId = scene.id;
        renameScene(draft, previousId, nextId);
        if (this.state.selectedSceneId === previousId) {
          this.state.selectedSceneId = nextId;
        }
        if (this.state.activeSceneId === previousId) {
          this.state.activeSceneId = nextId;
        }
        return;
      }

      if (field.startsWith("media.")) {
        scene.media ??= createSceneMedia();
        setPath(scene, field, value);
        return;
      }

      if (field.startsWith("rotation.")) {
        scene.rotation ??= defaultRotation();
        setPath(scene, field, value);
        return;
      }

      scene[field] = value;
    });
  }

  updateHotspotField(field, value) {
    this.updateDraft((draft) => {
      const scene = getScene(draft, this.state.selectedSceneId);
      const hotspot = getHotspot(scene, this.state.selectedHotspotId);
      if (!hotspot) {
        return;
      }

      if (field === "id") {
        const nextId = slugify(value);
        if (!nextId || scene.hotspots.some((candidate) => candidate.id === nextId && candidate !== hotspot)) {
          return;
        }
        hotspot.id = nextId;
        this.state.selectedHotspotId = nextId;
        return;
      }

      if (field === "type") {
        const nextType = value === "scene_link" ? "scene_link" : "annotation";
        hotspot.type = nextType;
        hotspot.target_scene = nextType === "scene_link"
          ? hotspot.target_scene ?? getAlternateSceneId(draft.scenes, scene.id)
          : null;
        hotspot.label ??= createHotspotLabel(nextType);
        hotspot.label.text ||= nextType === "scene_link" ? "Ir para cena" : "Anotacao";
        return;
      }

      if (field === "target_scene") {
        hotspot.target_scene = value || null;
        if (hotspot.target_scene) {
          hotspot.type = "scene_link";
        }
        return;
      }

      if (field.startsWith("position.")) {
        hotspot.position ??= defaultHotspotPosition();
        setPath(hotspot, field, value);
        return;
      }

      if (field.startsWith("rotation.")) {
        hotspot.rotation ??= defaultRotation();
        setPath(hotspot, field, value);
        return;
      }

      hotspot[field] = value;
    });
  }

  updateHotspotLabelField(field, value) {
    this.updateDraft((draft) => {
      const scene = getScene(draft, this.state.selectedSceneId);
      const hotspot = getHotspot(scene, this.state.selectedHotspotId);
      if (!hotspot) {
        return;
      }

      hotspot.label ??= createHotspotLabel(hotspot.type);

      if (field.startsWith("position_offset.")) {
        hotspot.label.position_offset ??= defaultLabelOffset();
        setPath(hotspot.label, field, value);
        return;
      }

      if (field.startsWith("rotation_offset.")) {
        hotspot.label.rotation_offset ??= defaultRotation();
        setPath(hotspot.label, field, value);
        return;
      }

      hotspot.label[field] = value;
    });
  }

  moveSelectedHotspotTo(position) {
    this.updateDraft((draft) => {
      if (this.state.selectedSceneId !== this.state.activeSceneId) {
        throw new Error("Selected hotspot does not belong to the active scene.");
      }

      const scene = getScene(draft, this.state.selectedSceneId);
      const hotspot = getHotspot(scene, this.state.selectedHotspotId);
      if (!hotspot || !position) {
        return;
      }

      hotspot.position = {
        x: roundPosition(position.x),
        y: roundPosition(position.y),
        z: roundPosition(position.z)
      };
      hotspot.reference_depth = roundPosition(position.depth ?? distanceFromOrigin(hotspot.position));
    });
  }

  addScene() {
    this.updateDraft((draft) => {
      const id = uniqueId(draft.scenes.map((scene) => scene.id), "new-scene");
      draft.scenes.push(createScene(id));
      draft.initial_scene ??= id;
      this.state.activeSceneId = id;
      this.state.selectedSceneId = id;
      this.state.selectedHotspotId = null;
    });
  }

  duplicateScene() {
    this.updateDraft((draft) => {
      const source = getScene(draft, this.state.selectedSceneId);
      if (!source) {
        return;
      }

      const id = uniqueId(draft.scenes.map((scene) => scene.id), `${source.id}-copy`);
      const copy = deepClone(source);
      copy.id = id;
      copy.title = `${source.title ?? source.id} Copy`;
      copy.hotspots = (copy.hotspots ?? []).map((hotspot, index) => ({
        ...hotspot,
        id: uniqueId([], `${id}-hotspot-${index + 1}`)
      }));

      draft.scenes.push(copy);
      this.state.activeSceneId = id;
      this.state.selectedSceneId = id;
      this.state.selectedHotspotId = copy.hotspots?.[0]?.id ?? null;
    });
  }

  deleteScene() {
    this.updateDraft((draft) => {
      if (draft.scenes.length <= 1) {
        return;
      }

      const removedId = this.state.selectedSceneId;
      draft.scenes = draft.scenes.filter((scene) => scene.id !== removedId);
      for (const scene of draft.scenes) {
        scene.hotspots = (scene.hotspots ?? []).map((hotspot) => ({
          ...hotspot,
          target_scene: hotspot.target_scene === removedId ? null : hotspot.target_scene
        }));
      }
      if (draft.initial_scene === removedId) {
        draft.initial_scene = draft.scenes[0]?.id ?? null;
      }
      this.state.activeSceneId = draft.initial_scene ?? draft.scenes[0]?.id ?? null;
      this.state.selectedSceneId = this.state.activeSceneId;
      this.state.selectedHotspotId = getScene(draft, this.state.selectedSceneId)?.hotspots?.[0]?.id ?? null;
    });
  }

  addHotspot(type = "scene_link") {
    this.updateDraft((draft) => {
      const scene = getScene(draft, this.state.selectedSceneId);
      if (!scene) {
        return;
      }

      scene.hotspots ??= [];
      const id = uniqueId(scene.hotspots.map((hotspot) => hotspot.id), `${scene.id}-hotspot`);
      const targetScene = getAlternateSceneId(draft.scenes, scene.id);
      const hotspot = createHotspot(id, type, targetScene);
      scene.hotspots.push(hotspot);
      this.state.selectedHotspotId = hotspot.id;
    });
  }

  deleteHotspot() {
    this.updateDraft((draft) => {
      const scene = getScene(draft, this.state.selectedSceneId);
      if (!scene) {
        return;
      }

      scene.hotspots = (scene.hotspots ?? []).filter((hotspot) => hotspot.id !== this.state.selectedHotspotId);
      this.state.selectedHotspotId = scene.hotspots[0]?.id ?? null;
    });
  }

  importJson(jsonText) {
    try {
      const draft = normalizeTour(JSON.parse(jsonText));
      const selectedSceneId = draft.initial_scene ?? draft.scenes[0]?.id ?? null;
      const selectedScene = getScene(draft, selectedSceneId);
      this.patch({
        draft,
        activeSceneId: selectedSceneId,
        selectedSceneId,
        selectedHotspotId: selectedScene?.hotspots?.[0]?.id ?? null,
        dirty: true,
        error: null
      });
      this.applyRuntime();
    } catch (error) {
      this.patch({ error: `JSON invalido: ${error.message}` });
    }
  }

  exportJson() {
    return JSON.stringify(toExportableTour(this.state.draft), null, 2);
  }

  updateDraft(mutator) {
    if (!this.state.draft) {
      return;
    }

    try {
      const draft = deepClone(this.state.draft);
      mutator(draft);
      const normalizedDraft = normalizeTour(draft);
      const selectedSceneId = getScene(normalizedDraft, this.state.selectedSceneId)?.id
        ?? normalizedDraft.initial_scene
        ?? normalizedDraft.scenes[0]?.id
        ?? null;
      const selectedScene = getScene(normalizedDraft, selectedSceneId);
      const selectedHotspotId = getHotspot(selectedScene, this.state.selectedHotspotId)?.id
        ?? selectedScene?.hotspots?.[0]?.id
        ?? null;

      this.patch({
        draft: normalizedDraft,
        activeSceneId: selectedSceneId,
        selectedSceneId,
        selectedHotspotId,
        dirty: true,
        error: null
      });
      this.applyRuntime();
    } catch (error) {
      this.patch({ error: error.message });
    }
  }

  applyRuntime() {
    const draft = toExportableTour(this.state.draft);
    if (!draft) {
      return;
    }

    this.context.applyEditorDraft?.(draft, this.state.selectedSceneId)
      ?.catch?.((error) => this.patch({ error: error.message }));
  }

  patch(partialState) {
    this.state = {
      ...this.state,
      ...partialState
    };
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}

function normalizeTour(tour) {
  const source = isObject(tour) ? tour : {};
  const {
    scenes: sourceScenes,
    settings: sourceSettings,
    raw: _raw,
    ...tourRest
  } = source;

  const nextTour = {
    ...tourRest,
    id: source.id || "tour",
    title: source.title || source.id || "Tour",
    initial_scene: source.initial_scene ?? null,
    media_type: source.media_type || "equirectangular-image",
    settings: {
      ...(isObject(sourceSettings) ? sourceSettings : {}),
      rotation: {
        ...(isObject(sourceSettings?.rotation) ? sourceSettings.rotation : {}),
        yaw: safeNumber(sourceSettings?.rotation?.yaw, 0),
        pitch: safeNumber(sourceSettings?.rotation?.pitch, 0),
        roll: safeNumber(sourceSettings?.rotation?.roll, 0)
      },
      scale: safeNumber(sourceSettings?.scale, 1),
      billboard: sourceSettings?.billboard !== false
    },
    scenes: Array.isArray(sourceScenes) ? sourceScenes.map(normalizeScene) : []
  };

  if (!nextTour.initial_scene || !nextTour.scenes.some((scene) => scene.id === nextTour.initial_scene)) {
    nextTour.initial_scene = nextTour.scenes[0]?.id ?? null;
  }

  return nextTour;
}

function normalizeScene(scene, index) {
  const source = isObject(scene) ? scene : {};
  const {
    media: sourceMedia,
    rotation: sourceRotation,
    hotspots: sourceHotspots,
    labels: _labels,
    raw: _raw,
    ...sceneRest
  } = source;
  const id = source.id ? slugify(source.id) : `scene-${index + 1}`;
  const media = typeof sourceMedia === "string"
    ? { type: "image", src: sourceMedia, projection: "equirectangular" }
    : {
        ...(isObject(sourceMedia) ? sourceMedia : {}),
        type: sourceMedia?.type || "image",
        src: sourceMedia?.src || "",
        projection: sourceMedia?.projection || "equirectangular",
        stereo_layout: sourceMedia?.stereo_layout || "top-bottom",
        eye_order: sourceMedia?.eye_order || "left-right",
        mono_eye: sourceMedia?.mono_eye || "left"
      };

  return {
    ...sceneRest,
    id,
    title: source.title || id,
    media_type: source.media_type || "equirectangular-image",
    media,
    rotation: {
      ...(isObject(sourceRotation) ? sourceRotation : {}),
      yaw: safeNumber(sourceRotation?.yaw, 0),
      pitch: safeNumber(sourceRotation?.pitch, 0),
      roll: safeNumber(sourceRotation?.roll, 0)
    },
    scale: safeNumber(source.scale, 1),
    billboard: source.billboard !== false,
    minimap_image: source.minimap_image || null,
    hotspots: Array.isArray(sourceHotspots)
      ? sourceHotspots
          .filter((hotspot) => !isSceneLabelHotspot(hotspot, source))
          .map(normalizeHotspot)
      : []
  };
}

function normalizeHotspot(hotspot, index) {
  const source = hotspotLoader.normalizeHotspot(hotspot, index);
  const type = source.type === "scene_link" ? "scene_link" : "annotation";

  return {
    ...source,
    id: source.id ? slugify(source.id) : `hotspot-${index + 1}`,
    type,
    target_scene: type === "scene_link" ? source.target_scene ?? null : null,
    position: normalizeVector(source.position, defaultHotspotPosition()),
    rotation: normalizeRotation(source.rotation),
    scale: safeNumber(source.scale, 1),
    reference_depth: safeNumber(source.reference_depth, 8),
    billboard: source.billboard !== false,
    marker_visible: source.marker_visible !== false,
    label: normalizeHotspotLabel(source.label, {
      fallbackText: type === "scene_link" ? "Ir para cena" : "Anotacao",
      defaultVisible: true,
      defaultPositionOffset: { x: 0, y: 0.9, z: 0 },
      fallbackScale: 1,
      fallbackReferenceDepth: safeNumber(source.reference_depth, 8),
      defaultBillboard: true
    })
  };
}

function normalizeHotspotLabel(label, {
  fallbackText = "",
  defaultVisible = Boolean(fallbackText),
  defaultPositionOffset = { x: 0, y: 0.9, z: 0 },
  fallbackScale = 1,
  fallbackReferenceDepth = 8,
  defaultBillboard = true
} = {}) {
  const source = isObject(label) ? label : {};

  return {
    text: String(source.text ?? fallbackText),
    visible: source.visible ?? defaultVisible,
    position_offset: normalizeVector(source.position_offset, defaultPositionOffset),
    rotation_offset: normalizeRotation(source.rotation_offset),
    scale: safeNumber(source.scale, fallbackScale),
    reference_depth: safeNumber(source.reference_depth, fallbackReferenceDepth),
    billboard: source.billboard ?? defaultBillboard
  };
}

function createScene(id) {
  return {
    id,
    title: id,
    media_type: "equirectangular-image",
    media: createSceneMedia(),
    rotation: defaultRotation(),
    scale: 1,
    billboard: true,
    minimap_image: null,
    hotspots: []
  };
}

function createSceneMedia() {
  return {
    type: "image",
    src: "",
    projection: "equirectangular",
    stereo_layout: "top-bottom",
    eye_order: "left-right",
    mono_eye: "left"
  };
}

function createHotspot(id, type, targetScene) {
  const normalizedType = type === "scene_link" ? "scene_link" : "annotation";
  return {
    id,
    type: normalizedType,
    target_scene: normalizedType === "scene_link" ? targetScene ?? null : null,
    position: defaultHotspotPosition(),
    rotation: defaultRotation(),
    scale: 1,
    reference_depth: 8,
    billboard: true,
    marker_visible: true,
    label: createHotspotLabel(normalizedType)
  };
}

function createHotspotLabel(type) {
  return normalizeHotspotLabel({}, {
    fallbackText: type === "scene_link" ? "Ir para cena" : "Anotacao",
    defaultVisible: true,
    defaultPositionOffset: defaultLabelOffset(),
    fallbackScale: 1,
    fallbackReferenceDepth: 8,
    defaultBillboard: true
  });
}

function toExportableTour(tour) {
  if (!tour) {
    return null;
  }

  return stripRuntimeFields(normalizeTour(tour));
}

function stripRuntimeFields(value) {
  if (Array.isArray(value)) {
    return value.map(stripRuntimeFields);
  }

  if (value && typeof value === "object") {
    const output = {};
    for (const [key, item] of Object.entries(value)) {
      if (key === "raw" || key === "media_available") {
        continue;
      }
      output[key] = stripRuntimeFields(item);
    }
    return output;
  }

  return value;
}

function renameScene(draft, oldId, nextId) {
  const scene = getScene(draft, oldId);
  if (!scene) {
    return;
  }

  scene.id = nextId;
  if (draft.initial_scene === oldId) {
    draft.initial_scene = nextId;
  }

  for (const candidate of draft.scenes) {
    for (const hotspot of candidate.hotspots ?? []) {
      if (hotspot.target_scene === oldId) {
        hotspot.target_scene = nextId;
      }
    }
  }
}

function getScene(tour, sceneId) {
  return tour?.scenes?.find((scene) => scene.id === sceneId) ?? null;
}

function getHotspot(scene, hotspotId) {
  return scene?.hotspots?.find((hotspot) => hotspot.id === hotspotId) ?? null;
}

function setPath(target, path, value) {
  const parts = path.split(".");
  let cursor = target;
  while (parts.length > 1) {
    const part = parts.shift();
    cursor[part] ??= {};
    cursor = cursor[part];
  }
  cursor[parts[0]] = value;
}

function uniqueId(existingIds, preferredId) {
  const used = new Set(existingIds);
  const baseId = slugify(preferredId || "item");
  let id = baseId;
  let index = 2;
  while (used.has(id)) {
    id = `${baseId}-${index}`;
    index += 1;
  }
  return id;
}

function getAlternateSceneId(scenes, currentSceneId) {
  return scenes.find((candidate) => candidate.id !== currentSceneId)?.id ?? currentSceneId ?? null;
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeVector(vector, fallback) {
  return {
    x: safeNumber(vector?.x, fallback.x),
    y: safeNumber(vector?.y, fallback.y),
    z: safeNumber(vector?.z, fallback.z)
  };
}

function normalizeRotation(rotation) {
  return {
    ...(isObject(rotation) ? rotation : {}),
    yaw: safeNumber(rotation?.yaw, 0),
    pitch: safeNumber(rotation?.pitch, 0),
    roll: safeNumber(rotation?.roll, 0)
  };
}

function defaultRotation() {
  return { yaw: 0, pitch: 0, roll: 0 };
}

function defaultHotspotPosition() {
  return { x: 5, y: 0.25, z: -8 };
}

function defaultLabelOffset() {
  return { x: 0, y: 0.9, z: 0 };
}

function roundPosition(value) {
  return Math.round(safeNumber(value, 0) * 1000) / 1000;
}

function distanceFromOrigin(position) {
  return Math.hypot(
    safeNumber(position?.x, 0),
    safeNumber(position?.y, 0),
    safeNumber(position?.z, 0)
  );
}

function slugify(value) {
  const slug = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "item";
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}
