export class EditorPanel {
  constructor({ root, context, draftStore, placementController }) {
    this.root = root;
    this.context = context;
    this.draftStore = draftStore;
    this.placementController = placementController;
    this.unsubscribe = null;
    this.controls = {};
  }

  mount() {
    this.abortController = new AbortController();
    this.panel = document.createElement("aside");
    this.panel.className = "editor-panel";
    this.panel.setAttribute("aria-label", "Runtime tour editor");

    this.panel.append(
      this.createHeader(),
      this.createTourSection(),
      this.createSceneSection(),
      this.createHotspotSection(),
      this.createHotspotLabelSection(),
      this.createJsonSection()
    );
    this.root.replaceChildren(this.panel);
    this.unsubscribe = this.draftStore.subscribe((state) => this.sync(state));
  }

  createHeader() {
    const header = document.createElement("header");
    header.className = "editor-panel__header";

    const title = document.createElement("h2");
    title.textContent = "Editor";

    this.controls.status = document.createElement("span");
    this.controls.status.className = "editor-status";

    header.append(title, this.controls.status);
    return header;
  }

  createTourSection() {
    const section = this.createSection("Tour");
    this.controls.tourId = this.createInput("Tour ID");
    this.controls.tourTitle = this.createInput("Titulo");
    this.controls.tourMediaType = this.createInput("Tipo de midia");
    this.controls.initialScene = this.createSelect("Cena inicial");
    this.controls.tourYaw = this.createNumberInput("Yaw global");
    this.controls.tourPitch = this.createNumberInput("Pitch global");
    this.controls.tourRoll = this.createNumberInput("Roll global");
    this.controls.tourScale = this.createNumberInput("Escala global", 0.1);
    this.controls.tourBillboard = this.createCheckbox("Billboard global");

    this.bindInput(this.controls.tourId.input, () => this.draftStore.updateTourField("id", this.controls.tourId.input.value), "change");
    this.bindInput(this.controls.tourTitle.input, () => this.draftStore.updateTourField("title", this.controls.tourTitle.input.value));
    this.bindInput(this.controls.tourMediaType.input, () => this.draftStore.updateTourField("media_type", this.controls.tourMediaType.input.value));
    this.bindInput(this.controls.initialScene.input, () => this.draftStore.updateTourField("initial_scene", this.controls.initialScene.input.value), "change");
    this.bindInput(this.controls.tourYaw.input, () => this.draftStore.updateTourSetting("rotation.yaw", readNumber(this.controls.tourYaw.input)));
    this.bindInput(this.controls.tourPitch.input, () => this.draftStore.updateTourSetting("rotation.pitch", readNumber(this.controls.tourPitch.input)));
    this.bindInput(this.controls.tourRoll.input, () => this.draftStore.updateTourSetting("rotation.roll", readNumber(this.controls.tourRoll.input)));
    this.bindInput(this.controls.tourScale.input, () => this.draftStore.updateTourSetting("scale", readNumber(this.controls.tourScale.input, 1)));
    this.bindInput(this.controls.tourBillboard.input, () => this.draftStore.updateTourSetting("billboard", this.controls.tourBillboard.input.checked), "change");

    section.append(
      this.controls.tourId.label,
      this.controls.tourTitle.label,
      this.controls.tourMediaType.label,
      this.controls.initialScene.label,
      this.createFieldGrid(
        this.controls.tourYaw.label,
        this.controls.tourPitch.label,
        this.controls.tourRoll.label,
        this.controls.tourScale.label
      ),
      this.controls.tourBillboard.label
    );
    return section;
  }

  createSceneSection() {
    const section = this.createSection("Cenas");
    this.controls.sceneSelect = this.createSelect("Cena selecionada");
    this.controls.sceneId = this.createInput("Scene ID");
    this.controls.sceneTitle = this.createInput("Titulo da cena");
    this.controls.sceneMediaSrc = this.createInput("Imagem / media.src");
    this.controls.sceneProjection = this.createInput("Projection");
    this.controls.sceneStereoLayout = this.createSelect("Stereo layout", [
      ["top-bottom", "top-bottom"],
      ["mono", "mono"]
    ]);
    this.controls.sceneEyeOrder = this.createSelect("Eye order", [
      ["left-right", "left/right"],
      ["right-left", "right/left"]
    ]);
    this.controls.sceneMonoEye = this.createSelect("Olho usado no 2D", [
      ["left", "left/top"],
      ["right", "right/bottom"]
    ]);
    this.controls.sceneMinimap = this.createInput("Minimap image");
    this.controls.sceneYaw = this.createNumberInput("Yaw");
    this.controls.scenePitch = this.createNumberInput("Pitch");
    this.controls.sceneRoll = this.createNumberInput("Roll");
    this.controls.sceneScale = this.createNumberInput("Escala", 0.1);
    this.controls.sceneBillboard = this.createCheckbox("Billboard");

    const actions = this.createActions([
      ["Adicionar cena", () => this.draftStore.addScene()],
      ["Duplicar cena", () => this.draftStore.duplicateScene()],
      ["Remover cena", () => this.draftStore.deleteScene()]
    ]);

    this.bindInput(this.controls.sceneSelect.input, () => this.draftStore.setSelectedScene(this.controls.sceneSelect.input.value), "change");
    this.bindInput(this.controls.sceneId.input, () => this.draftStore.updateSceneField("id", this.controls.sceneId.input.value), "change");
    this.bindInput(this.controls.sceneTitle.input, () => this.draftStore.updateSceneField("title", this.controls.sceneTitle.input.value));
    this.bindInput(this.controls.sceneMediaSrc.input, () => this.draftStore.updateSceneField("media.src", this.controls.sceneMediaSrc.input.value));
    this.bindInput(this.controls.sceneProjection.input, () => this.draftStore.updateSceneField("media.projection", this.controls.sceneProjection.input.value));
    this.bindInput(this.controls.sceneStereoLayout.input, () => this.draftStore.updateSceneField("media.stereo_layout", this.controls.sceneStereoLayout.input.value), "change");
    this.bindInput(this.controls.sceneEyeOrder.input, () => this.draftStore.updateSceneField("media.eye_order", this.controls.sceneEyeOrder.input.value), "change");
    this.bindInput(this.controls.sceneMonoEye.input, () => this.draftStore.updateSceneField("media.mono_eye", this.controls.sceneMonoEye.input.value), "change");
    this.bindInput(this.controls.sceneMinimap.input, () => this.draftStore.updateSceneField("minimap_image", this.controls.sceneMinimap.input.value || null));
    this.bindInput(this.controls.sceneYaw.input, () => this.draftStore.updateSceneField("rotation.yaw", readNumber(this.controls.sceneYaw.input)));
    this.bindInput(this.controls.scenePitch.input, () => this.draftStore.updateSceneField("rotation.pitch", readNumber(this.controls.scenePitch.input)));
    this.bindInput(this.controls.sceneRoll.input, () => this.draftStore.updateSceneField("rotation.roll", readNumber(this.controls.sceneRoll.input)));
    this.bindInput(this.controls.sceneScale.input, () => this.draftStore.updateSceneField("scale", readNumber(this.controls.sceneScale.input, 1)));
    this.bindInput(this.controls.sceneBillboard.input, () => this.draftStore.updateSceneField("billboard", this.controls.sceneBillboard.input.checked), "change");

    section.append(
      this.controls.sceneSelect.label,
      actions,
      this.controls.sceneId.label,
      this.controls.sceneTitle.label,
      this.controls.sceneMediaSrc.label,
      this.createFieldGrid(
        this.controls.sceneProjection.label,
        this.controls.sceneStereoLayout.label,
        this.controls.sceneEyeOrder.label,
        this.controls.sceneMonoEye.label
      ),
      this.controls.sceneMinimap.label,
      this.createFieldGrid(
        this.controls.sceneYaw.label,
        this.controls.scenePitch.label,
        this.controls.sceneRoll.label,
        this.controls.sceneScale.label
      ),
      this.controls.sceneBillboard.label
    );
    return section;
  }

  createHotspotSection() {
    const section = this.createSection("Hotspots");
    this.controls.hotspotSelect = this.createSelect("Hotspot selecionado");
    this.controls.hotspotId = this.createInput("Hotspot ID");
    this.controls.hotspotType = this.createSelect("Tipo", [
      ["scene_link", "scene_link"],
      ["annotation", "annotation"]
    ]);
    this.controls.hotspotTargetScene = this.createSelect("Target scene");
    this.controls.hotspotMarkerVisible = this.createCheckbox("Marker visivel");
    this.controls.hotspotX = this.createNumberInput("X", 0.01);
    this.controls.hotspotY = this.createNumberInput("Y", 0.01);
    this.controls.hotspotZ = this.createNumberInput("Z", 0.01);
    this.controls.hotspotYaw = this.createNumberInput("Yaw");
    this.controls.hotspotPitch = this.createNumberInput("Pitch");
    this.controls.hotspotRoll = this.createNumberInput("Roll");
    this.controls.hotspotScale = this.createNumberInput("Escala", 0.1);
    this.controls.hotspotReferenceDepth = this.createNumberInput("Reference depth", 0.1);
    this.controls.hotspotBillboard = this.createCheckbox("Billboard do hotspot");

    const actions = this.createActions([
      ["Adicionar navegacao", () => this.draftStore.addHotspot("scene_link")],
      ["Adicionar anotacao", () => this.draftStore.addHotspot("annotation")],
      ["Move Hotspot to Location", () => this.placementController.startHotspotPlacement()],
      ["Remover hotspot", () => this.draftStore.deleteHotspot()]
    ]);

    this.bindInput(this.controls.hotspotSelect.input, () => this.draftStore.setSelectedHotspot(this.controls.hotspotSelect.input.value), "change");
    this.bindInput(this.controls.hotspotId.input, () => this.draftStore.updateHotspotField("id", this.controls.hotspotId.input.value), "change");
    this.bindInput(this.controls.hotspotType.input, () => this.draftStore.updateHotspotField("type", this.controls.hotspotType.input.value), "change");
    this.bindInput(this.controls.hotspotTargetScene.input, () => this.draftStore.updateHotspotField("target_scene", this.controls.hotspotTargetScene.input.value || null), "change");
    this.bindInput(this.controls.hotspotMarkerVisible.input, () => this.draftStore.updateHotspotField("marker_visible", this.controls.hotspotMarkerVisible.input.checked), "change");
    this.bindInput(this.controls.hotspotX.input, () => this.draftStore.updateHotspotField("position.x", readNumber(this.controls.hotspotX.input)));
    this.bindInput(this.controls.hotspotY.input, () => this.draftStore.updateHotspotField("position.y", readNumber(this.controls.hotspotY.input)));
    this.bindInput(this.controls.hotspotZ.input, () => this.draftStore.updateHotspotField("position.z", readNumber(this.controls.hotspotZ.input, -8)));
    this.bindInput(this.controls.hotspotYaw.input, () => this.draftStore.updateHotspotField("rotation.yaw", readNumber(this.controls.hotspotYaw.input)));
    this.bindInput(this.controls.hotspotPitch.input, () => this.draftStore.updateHotspotField("rotation.pitch", readNumber(this.controls.hotspotPitch.input)));
    this.bindInput(this.controls.hotspotRoll.input, () => this.draftStore.updateHotspotField("rotation.roll", readNumber(this.controls.hotspotRoll.input)));
    this.bindInput(this.controls.hotspotScale.input, () => this.draftStore.updateHotspotField("scale", readNumber(this.controls.hotspotScale.input, 1)));
    this.bindInput(this.controls.hotspotReferenceDepth.input, () => this.draftStore.updateHotspotField("reference_depth", readNumber(this.controls.hotspotReferenceDepth.input, 8)));
    this.bindInput(this.controls.hotspotBillboard.input, () => this.draftStore.updateHotspotField("billboard", this.controls.hotspotBillboard.input.checked), "change");

    section.append(
      this.controls.hotspotSelect.label,
      actions,
      this.controls.hotspotId.label,
      this.createFieldGrid(this.controls.hotspotType.label, this.controls.hotspotTargetScene.label),
      this.createFieldGrid(this.controls.hotspotMarkerVisible.label, this.controls.hotspotBillboard.label),
      this.createFieldGrid(this.controls.hotspotX.label, this.controls.hotspotY.label, this.controls.hotspotZ.label),
      this.createFieldGrid(this.controls.hotspotYaw.label, this.controls.hotspotPitch.label, this.controls.hotspotRoll.label, this.controls.hotspotScale.label),
      this.controls.hotspotReferenceDepth.label
    );
    return section;
  }

  createHotspotLabelSection() {
    const section = this.createSection("Label do hotspot");
    this.controls.labelScope = document.createElement("p");
    this.controls.labelScope.className = "editor-help-text";

    this.controls.labelText = this.createInput("Texto");
    this.controls.labelVisible = this.createCheckbox("Label visivel");
    this.controls.labelOffsetX = this.createNumberInput("Offset X", 0.01);
    this.controls.labelOffsetY = this.createNumberInput("Offset Y", 0.01);
    this.controls.labelOffsetZ = this.createNumberInput("Offset Z", 0.01);
    this.controls.labelYaw = this.createNumberInput("Offset yaw");
    this.controls.labelPitch = this.createNumberInput("Offset pitch");
    this.controls.labelRoll = this.createNumberInput("Offset roll");
    this.controls.labelScale = this.createNumberInput("Escala da label", 0.1);
    this.controls.labelReferenceDepth = this.createNumberInput("Reference depth", 0.1);
    this.controls.labelBillboard = this.createCheckbox("Billboard da label");

    this.bindInput(this.controls.labelText.input, () => this.draftStore.updateHotspotLabelField("text", this.controls.labelText.input.value));
    this.bindInput(this.controls.labelVisible.input, () => this.draftStore.updateHotspotLabelField("visible", this.controls.labelVisible.input.checked), "change");
    this.bindInput(this.controls.labelOffsetX.input, () => this.draftStore.updateHotspotLabelField("position_offset.x", readNumber(this.controls.labelOffsetX.input)));
    this.bindInput(this.controls.labelOffsetY.input, () => this.draftStore.updateHotspotLabelField("position_offset.y", readNumber(this.controls.labelOffsetY.input, 0.9)));
    this.bindInput(this.controls.labelOffsetZ.input, () => this.draftStore.updateHotspotLabelField("position_offset.z", readNumber(this.controls.labelOffsetZ.input)));
    this.bindInput(this.controls.labelYaw.input, () => this.draftStore.updateHotspotLabelField("rotation_offset.yaw", readNumber(this.controls.labelYaw.input)));
    this.bindInput(this.controls.labelPitch.input, () => this.draftStore.updateHotspotLabelField("rotation_offset.pitch", readNumber(this.controls.labelPitch.input)));
    this.bindInput(this.controls.labelRoll.input, () => this.draftStore.updateHotspotLabelField("rotation_offset.roll", readNumber(this.controls.labelRoll.input)));
    this.bindInput(this.controls.labelScale.input, () => this.draftStore.updateHotspotLabelField("scale", readNumber(this.controls.labelScale.input, 1)));
    this.bindInput(this.controls.labelReferenceDepth.input, () => this.draftStore.updateHotspotLabelField("reference_depth", readNumber(this.controls.labelReferenceDepth.input, 8)));
    this.bindInput(this.controls.labelBillboard.input, () => this.draftStore.updateHotspotLabelField("billboard", this.controls.labelBillboard.input.checked), "change");

    section.append(
      this.controls.labelScope,
      this.controls.labelText.label,
      this.createFieldGrid(this.controls.labelVisible.label, this.controls.labelBillboard.label),
      this.createFieldGrid(this.controls.labelOffsetX.label, this.controls.labelOffsetY.label, this.controls.labelOffsetZ.label),
      this.createFieldGrid(this.controls.labelYaw.label, this.controls.labelPitch.label, this.controls.labelRoll.label, this.controls.labelScale.label),
      this.controls.labelReferenceDepth.label
    );
    return section;
  }

  createJsonSection() {
    const section = this.createSection("Exportacao");
    this.controls.jsonEditor = this.createTextarea("tour.json final");
    const actions = this.createActions([
      ["Aplicar JSON", () => this.draftStore.importJson(this.controls.jsonEditor.input.value)],
      ["Copiar JSON", () => this.copyJson()],
      ["Baixar tour.json", () => this.downloadJson()]
    ]);

    section.append(this.controls.jsonEditor.label, actions);
    return section;
  }

  sync(state) {
    const draft = state.draft;
    const scene = getScene(draft, state.selectedSceneId);
    const hotspot = getHotspot(scene, state.selectedHotspotId);

    this.controls.status.textContent = state.error ?? this.getStatusText(state, hotspot);
    this.controls.status.classList.toggle("has-error", Boolean(state.error));

    if (!draft) {
      this.setAllDisabled(true);
      return;
    }

    this.setAllDisabled(false);
    this.syncTourControls(draft);
    this.syncSceneControls(draft, scene, state.selectedSceneId);
    this.syncHotspotControls(draft, scene, hotspot, state.selectedHotspotId);
    this.syncHotspotLabelControls(hotspot);
    this.setValue(this.controls.jsonEditor.input, this.draftStore.exportJson());
  }

  getStatusText(state, hotspot) {
    if (state.selectedSceneId && state.activeSceneId && state.selectedSceneId !== state.activeSceneId) {
      return `Editando ${state.selectedSceneId}; visivel ${state.activeSceneId}`;
    }

    if (hotspot?.id) {
      return state.dirty
        ? `Draft editado: ${state.activeSceneId} / ${hotspot.id}`
        : `Cena ativa: ${state.activeSceneId} / ${hotspot.id}`;
    }

    if (state.activeSceneId) {
      return state.dirty ? `Draft editado: ${state.activeSceneId}` : `Cena ativa: ${state.activeSceneId}`;
    }

    return state.dirty ? "Draft editado" : "Sincronizado";
  }

  syncTourControls(draft) {
    this.setValue(this.controls.tourId.input, draft.id);
    this.setValue(this.controls.tourTitle.input, draft.title);
    this.setValue(this.controls.tourMediaType.input, draft.media_type);
    this.setOptions(this.controls.initialScene.input, draft.scenes.map((scene) => [scene.id, scene.title || scene.id]), draft.initial_scene);
    this.setValue(this.controls.tourYaw.input, draft.settings?.rotation?.yaw);
    this.setValue(this.controls.tourPitch.input, draft.settings?.rotation?.pitch);
    this.setValue(this.controls.tourRoll.input, draft.settings?.rotation?.roll);
    this.setValue(this.controls.tourScale.input, draft.settings?.scale);
    this.controls.tourBillboard.input.checked = draft.settings?.billboard !== false;
  }

  syncSceneControls(draft, scene, selectedSceneId) {
    this.setOptions(this.controls.sceneSelect.input, draft.scenes.map((candidate) => [candidate.id, candidate.title || candidate.id]), selectedSceneId);
    this.setValue(this.controls.sceneId.input, scene?.id);
    this.setValue(this.controls.sceneTitle.input, scene?.title);
    this.setValue(this.controls.sceneMediaSrc.input, scene?.media?.src);
    this.setValue(this.controls.sceneProjection.input, scene?.media?.projection);
    this.setOptions(this.controls.sceneStereoLayout.input, [["top-bottom", "top-bottom"], ["mono", "mono"]], scene?.media?.stereo_layout ?? "top-bottom");
    this.setOptions(this.controls.sceneEyeOrder.input, [["left-right", "left/right"], ["right-left", "right/left"]], scene?.media?.eye_order ?? "left-right");
    this.setOptions(this.controls.sceneMonoEye.input, [["left", "left/top"], ["right", "right/bottom"]], scene?.media?.mono_eye ?? "left");
    this.setValue(this.controls.sceneMinimap.input, scene?.minimap_image ?? "");
    this.setValue(this.controls.sceneYaw.input, scene?.rotation?.yaw);
    this.setValue(this.controls.scenePitch.input, scene?.rotation?.pitch);
    this.setValue(this.controls.sceneRoll.input, scene?.rotation?.roll);
    this.setValue(this.controls.sceneScale.input, scene?.scale);
    this.controls.sceneBillboard.input.checked = scene?.billboard !== false;
  }

  syncHotspotControls(draft, scene, hotspot, selectedHotspotId) {
    const hotspots = scene?.hotspots ?? [];
    this.setOptions(this.controls.hotspotSelect.input, hotspots.map((candidate) => [candidate.id, getHotspotDisplayName(candidate)]), selectedHotspotId);
    this.setOptions(this.controls.hotspotTargetScene.input, [["", "Sem destino"], ...draft.scenes.map((candidate) => [candidate.id, candidate.title || candidate.id])], hotspot?.target_scene ?? "");
    this.setOptions(this.controls.hotspotType.input, [["scene_link", "scene_link"], ["annotation", "annotation"]], hotspot?.type ?? "scene_link");
    this.setValue(this.controls.hotspotId.input, hotspot?.id ?? "");
    this.setValue(this.controls.hotspotX.input, hotspot?.position?.x ?? "");
    this.setValue(this.controls.hotspotY.input, hotspot?.position?.y ?? "");
    this.setValue(this.controls.hotspotZ.input, hotspot?.position?.z ?? "");
    this.setValue(this.controls.hotspotYaw.input, hotspot?.rotation?.yaw ?? "");
    this.setValue(this.controls.hotspotPitch.input, hotspot?.rotation?.pitch ?? "");
    this.setValue(this.controls.hotspotRoll.input, hotspot?.rotation?.roll ?? "");
    this.setValue(this.controls.hotspotScale.input, hotspot?.scale ?? "");
    this.setValue(this.controls.hotspotReferenceDepth.input, hotspot?.reference_depth ?? 8);
    this.controls.hotspotMarkerVisible.input.checked = hotspot?.marker_visible !== false;
    this.controls.hotspotBillboard.input.checked = hotspot?.billboard !== false;

    const controls = [
      this.controls.hotspotId,
      this.controls.hotspotType,
      this.controls.hotspotTargetScene,
      this.controls.hotspotMarkerVisible,
      this.controls.hotspotX,
      this.controls.hotspotY,
      this.controls.hotspotZ,
      this.controls.hotspotYaw,
      this.controls.hotspotPitch,
      this.controls.hotspotRoll,
      this.controls.hotspotScale,
      this.controls.hotspotReferenceDepth,
      this.controls.hotspotBillboard
    ];

    for (const control of controls) {
      control.input.disabled = !hotspot;
    }

    this.controls.hotspotTargetScene.input.disabled = !hotspot || hotspot.type !== "scene_link";
  }

  syncHotspotLabelControls(hotspot) {
    const label = hotspot?.label ?? null;
    this.controls.labelScope.textContent = hotspot
      ? `Editando a label vinculada ao hotspot ${hotspot.id}.`
      : "Selecione um hotspot para editar sua label.";

    this.setValue(this.controls.labelText.input, label?.text ?? "");
    this.controls.labelVisible.input.checked = label?.visible !== false;
    this.setValue(this.controls.labelOffsetX.input, label?.position_offset?.x ?? "");
    this.setValue(this.controls.labelOffsetY.input, label?.position_offset?.y ?? "");
    this.setValue(this.controls.labelOffsetZ.input, label?.position_offset?.z ?? "");
    this.setValue(this.controls.labelYaw.input, label?.rotation_offset?.yaw ?? "");
    this.setValue(this.controls.labelPitch.input, label?.rotation_offset?.pitch ?? "");
    this.setValue(this.controls.labelRoll.input, label?.rotation_offset?.roll ?? "");
    this.setValue(this.controls.labelScale.input, label?.scale ?? "");
    this.setValue(this.controls.labelReferenceDepth.input, label?.reference_depth ?? 8);
    this.controls.labelBillboard.input.checked = label?.billboard !== false;

    for (const control of [
      this.controls.labelText,
      this.controls.labelVisible,
      this.controls.labelOffsetX,
      this.controls.labelOffsetY,
      this.controls.labelOffsetZ,
      this.controls.labelYaw,
      this.controls.labelPitch,
      this.controls.labelRoll,
      this.controls.labelScale,
      this.controls.labelReferenceDepth,
      this.controls.labelBillboard
    ]) {
      control.input.disabled = !hotspot;
    }
  }

  createSection(titleText) {
    const section = document.createElement("section");
    section.className = "editor-section";
    const title = document.createElement("h3");
    title.textContent = titleText;
    section.append(title);
    return section;
  }

  createInput(labelText) {
    const input = document.createElement("input");
    input.type = "text";
    return this.wrapControl(labelText, input);
  }

  createNumberInput(labelText, step = 1) {
    const input = document.createElement("input");
    input.type = "number";
    input.step = String(step);
    return this.wrapControl(labelText, input);
  }

  createSelect(labelText, options = []) {
    const input = document.createElement("select");
    this.setOptions(input, options);
    return this.wrapControl(labelText, input);
  }

  createCheckbox(labelText) {
    const input = document.createElement("input");
    input.type = "checkbox";
    return this.wrapControl(labelText, input);
  }

  createTextarea(labelText) {
    const input = document.createElement("textarea");
    input.spellcheck = false;
    return this.wrapControl(labelText, input);
  }

  wrapControl(labelText, input) {
    const label = document.createElement("label");
    label.textContent = labelText;
    label.append(input);
    return { label, input };
  }

  createFieldGrid(...children) {
    const grid = document.createElement("div");
    grid.className = "editor-field-grid";
    grid.append(...children);
    return grid;
  }

  createActions(actions) {
    const group = document.createElement("div");
    group.className = "editor-actions";
    for (const [label, handler] of actions) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.addEventListener("click", handler, { signal: this.abortController.signal });
      group.append(button);
    }
    return group;
  }

  bindInput(input, handler, eventName = "input") {
    input.addEventListener(eventName, handler, { signal: this.abortController.signal });
  }

  setOptions(select, options, selectedValue = select.value) {
    const active = document.activeElement === select;
    if (!active) {
      select.replaceChildren(...options.map(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        return option;
      }));
      select.value = selectedValue ?? "";
    }
  }

  setValue(input, value) {
    if (document.activeElement === input) {
      return;
    }
    input.value = value == null ? "" : String(value);
  }

  setAllDisabled(isDisabled) {
    for (const control of Object.values(this.controls)) {
      if (control?.input) {
        control.input.disabled = isDisabled;
      }
    }
  }

  async copyJson() {
    const json = this.draftStore.exportJson();
    try {
      await navigator.clipboard.writeText(json);
      this.context.setStatus("JSON copiado para a area de transferencia.", { hideAfterMs: 1400 });
    } catch (error) {
      this.controls.jsonEditor.input.focus();
      this.controls.jsonEditor.input.select();
      this.context.setStatus("Nao consegui copiar automaticamente; o JSON foi selecionado.", { hideAfterMs: 1800 });
    }
  }

  downloadJson() {
    const json = this.draftStore.exportJson();
    const draft = this.draftStore.getSnapshot().draft;
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${draft?.id || "tour"}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  destroy() {
    this.unsubscribe?.();
    this.abortController?.abort();
    this.draftStore.destroy();
    this.root.replaceChildren();
  }
}

function getScene(tour, sceneId) {
  return tour?.scenes?.find((scene) => scene.id === sceneId) ?? null;
}

function getHotspot(scene, hotspotId) {
  return scene?.hotspots?.find((hotspot) => hotspot.id === hotspotId) ?? null;
}

function getHotspotDisplayName(hotspot) {
  const text = String(hotspot?.label?.text ?? "").trim();
  return text || hotspot?.id || "Hotspot";
}

function readNumber(input, fallback = 0) {
  const value = Number(input.value);
  return Number.isFinite(value) ? value : fallback;
}
