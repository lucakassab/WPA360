import * as THREE from "../../../vendor/three/three.module.js";
import { getHotspotLabelText } from "../../shared/HotspotVisualShared.js";

const BUTTON_GEOMETRY = new THREE.PlaneGeometry(0.145, 0.048);
const INFO_GEOMETRY = new THREE.PlaneGeometry(0.68, 0.2);
const DESCRIPTION_GEOMETRY = new THREE.PlaneGeometry(0.66, 0.16);
const PANEL_GEOMETRY = new THREE.PlaneGeometry(0.8, 0.82);
const SECTION_GEOMETRY = new THREE.PlaneGeometry(0.72, 0.23);
const FLOW_PAGE = "flow";
const ADJUST_PAGE = "adjust";
const BUTTON_PADDING = 0.016;
const BUTTON_DEPTH_THRESHOLD = 0.028;
const POSITION_STEP = 0.25;
const ROTATION_STEP = 5;
const SCALE_STEP = 0.1;
const REFERENCE_DEPTH_STEP = 0.25;
const LABEL_OFFSET_STEP = 0.1;
const LABEL_SCALE_STEP = 0.1;
const DEFAULT_DESCRIPTION = {
  title: "Ajuda do widget",
  summary: "Passe a reticula ou o dedo sobre um botao para ver a descricao dele aqui.",
  usage: "Use o trigger do controle, o pinch ou o toque direto para ativar a acao destacada."
};

const GLOBAL_ACTIONS = [
  { id: "page-flow", label: "Fluxo do\neditor", position: [-0.29, 0.065, 0.004], variant: "tab" },
  { id: "page-adjust", label: "Ajustes\nfinos", position: [-0.13, 0.065, 0.004], variant: "tab" },
  { id: "toggle-dev-controls", label: "Dev\nControls", position: [0.03, 0.065, 0.004], variant: "tab" },
  { id: "recenter-widget", label: "Recentrar\nwidget", position: [0.19, 0.065, 0.004], variant: "tab" },
  { id: "close-widget", label: "Fechar\nwidget", position: [0.33, 0.065, 0.004], variant: "danger" }
];

const PAGE_ACTIONS = {
  [FLOW_PAGE]: [
    { id: "scene-prev", label: "Cena\nanterior", position: [-0.24, -0.03, 0.004] },
    { id: "scene-next", label: "Cena\nseguinte", position: [-0.08, -0.03, 0.004] },
    { id: "hotspot-prev", label: "Hotspot\nanterior", position: [0.08, -0.03, 0.004] },
    { id: "hotspot-next", label: "Hotspot\nseguinte", position: [0.24, -0.03, 0.004] },

    { id: "add-nav-hotspot", label: "Novo\nlink", position: [-0.24, -0.105, 0.004] },
    { id: "add-note-hotspot", label: "Nova\nanotacao", position: [-0.08, -0.105, 0.004] },
    { id: "pick-hotspot", label: "Selecionar\nhotspot", position: [0.08, -0.105, 0.004] },
    { id: "move-hotspot", label: "Reposicionar\nhotspot", position: [0.24, -0.105, 0.004] },

    { id: "toggle-hotspot-type", label: "Trocar\ntipo", position: [-0.24, -0.18, 0.004] },
    { id: "target-scene-prev", label: "Destino\nanterior", position: [-0.08, -0.18, 0.004] },
    { id: "target-scene-next", label: "Prox.\ndestino", position: [0.08, -0.18, 0.004] },
    { id: "delete-hotspot", label: "Apagar\nhotspot", position: [0.24, -0.18, 0.004], variant: "danger" },

    { id: "toggle-marker-visible", label: "Marker\nvisivel", position: [-0.24, -0.255, 0.004] },
    { id: "toggle-hotspot-billboard", label: "Billboard\nhotspot", position: [-0.08, -0.255, 0.004] },
    { id: "toggle-label-visible", label: "Label\nvisivel", position: [0.08, -0.255, 0.004] },
    { id: "toggle-label-billboard", label: "Billboard\nlabel", position: [0.24, -0.255, 0.004] }
  ],
  [ADJUST_PAGE]: [
    { id: "pos-x-minus", label: "Mover X\n-", position: [-0.24, -0.03, 0.004] },
    { id: "pos-x-plus", label: "Mover X\n+", position: [-0.08, -0.03, 0.004] },
    { id: "pos-y-minus", label: "Mover Y\n-", position: [0.08, -0.03, 0.004] },
    { id: "pos-y-plus", label: "Mover Y\n+", position: [0.24, -0.03, 0.004] },

    { id: "pos-z-minus", label: "Mover Z\n-", position: [-0.24, -0.105, 0.004] },
    { id: "pos-z-plus", label: "Mover Z\n+", position: [-0.08, -0.105, 0.004] },
    { id: "rot-yaw-minus", label: "Yaw\n-", position: [0.08, -0.105, 0.004] },
    { id: "rot-yaw-plus", label: "Yaw\n+", position: [0.24, -0.105, 0.004] },

    { id: "scale-minus", label: "Escala\n-", position: [-0.24, -0.18, 0.004] },
    { id: "scale-plus", label: "Escala\n+", position: [-0.08, -0.18, 0.004] },
    { id: "reference-depth-minus", label: "Prof. ref.\n-", position: [0.08, -0.18, 0.004] },
    { id: "reference-depth-plus", label: "Prof. ref.\n+", position: [0.24, -0.18, 0.004] },

    { id: "label-offset-y-minus", label: "Label Y\n-", position: [-0.24, -0.255, 0.004] },
    { id: "label-offset-y-plus", label: "Label Y\n+", position: [-0.08, -0.255, 0.004] },
    { id: "label-scale-minus", label: "Esc. label\n-", position: [0.08, -0.255, 0.004] },
    { id: "label-scale-plus", label: "Esc. label\n+", position: [0.24, -0.255, 0.004] }
  ]
};

const HOTSPOT_LIST_ACTIONS = [
  { id: "hotspot-list-prev", label: "Lista\n-", position: [-0.24, -0.165, 0.004] },
  { id: "hotspot-list-next", label: "Lista\n+", position: [-0.08, -0.165, 0.004] },
  { id: "hotspot-list-close", label: "Fechar\nlista", position: [0.08, -0.165, 0.004] },
  { id: "hotspot-list-item-0", label: "-", position: [0.24, -0.165, 0.004] },
  { id: "hotspot-list-item-1", label: "-", position: [-0.24, -0.235, 0.004] },
  { id: "hotspot-list-item-2", label: "-", position: [-0.08, -0.235, 0.004] },
  { id: "hotspot-list-item-3", label: "-", position: [0.08, -0.235, 0.004] },
  { id: "hotspot-list-item-4", label: "-", position: [0.24, -0.235, 0.004] }
];

const CREATE_SCENE_LIST_ACTIONS = [
  { id: "create-scene-list-prev", label: "Destinos\n-", position: [-0.24, -0.165, 0.004] },
  { id: "create-scene-list-next", label: "Destinos\n+", position: [-0.08, -0.165, 0.004] },
  { id: "create-scene-list-close", label: "Fechar\nlista", position: [0.08, -0.165, 0.004] },
  { id: "create-scene-list-confirm", label: "Criar\nlink", position: [0.24, -0.165, 0.004] },
  { id: "create-scene-list-item-0", label: "-", position: [-0.24, -0.235, 0.004] },
  { id: "create-scene-list-item-1", label: "-", position: [-0.08, -0.235, 0.004] },
  { id: "create-scene-list-item-2", label: "-", position: [0.08, -0.235, 0.004] },
  { id: "create-scene-list-item-3", label: "-", position: [0.24, -0.235, 0.004] }
];

const ACTION_DESCRIPTIONS = {
  "page-flow": {
    title: "Pagina Fluxo",
    summary: "Abre a pagina com navegacao entre cenas, selecao de hotspot e acoes principais do fluxo.",
    usage: "Aponte para o botao e confirme para trocar para a pagina de fluxo."
  },
  "page-adjust": {
    title: "Pagina Ajustes",
    summary: "Abre a pagina com ajustes finos de posicao, rotacao, escala e configuracoes da label.",
    usage: "Use este botao quando quiser fazer refinamento numerico no hotspot selecionado."
  },
  "recenter-widget": {
    title: "Recentro",
    summary: "Reposiciona o widget de edicao novamente a sua frente.",
    usage: "Acione quando o painel ficar fora do campo de visao ou em uma posicao desconfortavel."
  },
  "close-widget": {
    title: "Fechar",
    summary: "Fecha o widget de edicao no ambiente VR.",
    usage: "Use para limpar a interface quando terminar de editar ou quiser voltar ao tour."
  },
  "toggle-dev-controls": {
    title: "Toggle Dev Controls",
    summary: "Liga ou desliga o modo rapido de edicao por controle direito dentro do VR.",
    usage: "Com o modo ligado, aponte para um hotspot e segure o grip para editar com movimento, thumbstick e botoes."
  },
  "scene-prev": {
    title: "Cena anterior",
    summary: "Seleciona a cena anterior no draft do editor.",
    usage: "Acione repetidamente para navegar pela lista de cenas do tour."
  },
  "scene-next": {
    title: "Proxima cena",
    summary: "Seleciona a proxima cena no draft do editor.",
    usage: "Use para percorrer as cenas disponiveis sem sair do VR."
  },
  "hotspot-prev": {
    title: "Hotspot anterior",
    summary: "Move a selecao para o hotspot anterior da cena ativa.",
    usage: "Ideal para revisar rapidamente os hotspots ja existentes."
  },
  "hotspot-next": {
    title: "Proximo hotspot",
    summary: "Move a selecao para o proximo hotspot da cena ativa.",
    usage: "Acione para alternar entre hotspots sem abrir o editor desktop."
  },
  "add-nav-hotspot": {
    title: "Adicionar hotspot de navegacao",
    summary: "Abre a lista de cenas destino antes de iniciar a criacao do novo hotspot de navegacao.",
    usage: "Escolha a cena destino na lista e depois use Criar link para apontar o local do panorama."
  },
  "add-note-hotspot": {
    title: "Adicionar anotacao",
    summary: "Entra no modo de criacao de um novo hotspot do tipo annotation na cena atual.",
    usage: "Aponte para o panorama e confirme para criar a anotacao no local desejado."
  },
  "pick-hotspot": {
    title: "Abrir lista de hotspots",
    summary: "Abre uma lista com os hotspots da cena atual para selecao direta no widget.",
    usage: "Escolha o hotspot desejado na lista usando trigger, pinch ou toque direto."
  },
  "create-scene-list-prev": {
    title: "Destinos anteriores",
    summary: "Mostra a pagina anterior da lista de cenas disponiveis para o novo link.",
    usage: "Use quando o tour tiver varias cenas de destino."
  },
  "create-scene-list-next": {
    title: "Proximos destinos",
    summary: "Mostra a pagina seguinte da lista de cenas disponiveis para o novo link.",
    usage: "Acione para navegar por mais opcoes de destino."
  },
  "create-scene-list-close": {
    title: "Fechar lista de destinos",
    summary: "Fecha a escolha de destino sem iniciar a criacao do novo hotspot.",
    usage: "Use para cancelar a criacao do link por enquanto."
  },
  "create-scene-list-confirm": {
    title: "Criar link",
    summary: "Entra no modo de posicionamento usando a cena destacada como destino do novo hotspot.",
    usage: "Primeiro selecione uma cena na lista; depois acione este botao para apontar o local e confirmar."
  },
  "create-scene-list-item-0": {
    title: "Destino do novo hotspot",
    summary: "Seleciona uma das cenas da lista como destino do novo hotspot de navegacao.",
    usage: "Aponte para o item desejado e confirme para marcar essa cena como destino."
  },
  "create-scene-list-item-1": {
    title: "Destino do novo hotspot",
    summary: "Seleciona uma das cenas da lista como destino do novo hotspot de navegacao.",
    usage: "Aponte para o item desejado e confirme para marcar essa cena como destino."
  },
  "create-scene-list-item-2": {
    title: "Destino do novo hotspot",
    summary: "Seleciona uma das cenas da lista como destino do novo hotspot de navegacao.",
    usage: "Aponte para o item desejado e confirme para marcar essa cena como destino."
  },
  "create-scene-list-item-3": {
    title: "Destino do novo hotspot",
    summary: "Seleciona uma das cenas da lista como destino do novo hotspot de navegacao.",
    usage: "Aponte para o item desejado e confirme para marcar essa cena como destino."
  },
  "move-hotspot": {
    title: "Mover hotspot",
    summary: "Entra no modo de reposicionamento do hotspot atualmente selecionado.",
    usage: "Aponte para o panorama e confirme para gravar a nova posicao."
  },
  "toggle-hotspot-type": {
    title: "Alternar tipo",
    summary: "Troca o hotspot selecionado entre scene_link e annotation.",
    usage: "Use quando precisar converter a finalidade do hotspot sem recria-lo."
  },
  "target-scene-prev": {
    title: "Destino anterior",
    summary: "Seleciona a cena de destino anterior para um hotspot de navegacao.",
    usage: "Acione ate chegar na cena correta que o hotspot deve abrir."
  },
  "target-scene-next": {
    title: "Proximo destino",
    summary: "Seleciona a proxima cena de destino para um hotspot de navegacao.",
    usage: "Use para navegar entre as opcoes de destino disponiveis."
  },
  "delete-hotspot": {
    title: "Apagar hotspot",
    summary: "Remove o hotspot atualmente selecionado do draft do editor.",
    usage: "Acione apenas quando tiver certeza, pois o hotspot sai da cena atual."
  },
  "toggle-marker-visible": {
    title: "Marker",
    summary: "Liga ou desliga a visibilidade do marcador principal do hotspot.",
    usage: "Use para ocultar o marker sem perder o hotspot ou sua label."
  },
  "toggle-hotspot-billboard": {
    title: "Billboard do hotspot",
    summary: "Alterna se o hotspot acompanha o usuario em billboard ou mantem rotacao fixa.",
    usage: "Ative ou desative conforme o comportamento visual esperado no panorama."
  },
  "toggle-label-visible": {
    title: "Label",
    summary: "Liga ou desliga a visibilidade da label do hotspot selecionado.",
    usage: "Use para mostrar ou ocultar o texto sem apagar a configuracao da label."
  },
  "toggle-label-billboard": {
    title: "Billboard da label",
    summary: "Alterna se a label acompanha o usuario em billboard ou fica com rotacao fixa.",
    usage: "Bom para testar leitura versus alinhamento visual da label."
  },
  "pos-x-minus": {
    title: "Mover X -",
    summary: "Desloca o hotspot um passo negativo no eixo X local da cena.",
    usage: "Acione varias vezes para pequenos ajustes laterais."
  },
  "pos-x-plus": {
    title: "Mover X +",
    summary: "Desloca o hotspot um passo positivo no eixo X local da cena.",
    usage: "Use para refinamento lateral fino do hotspot."
  },
  "pos-y-minus": {
    title: "Mover Y -",
    summary: "Desloca o hotspot para baixo no eixo Y.",
    usage: "Ajuste a altura do hotspot em pequenos passos."
  },
  "pos-y-plus": {
    title: "Mover Y +",
    summary: "Desloca o hotspot para cima no eixo Y.",
    usage: "Use para alinhar o hotspot verticalmente com a cena."
  },
  "pos-z-minus": {
    title: "Mover Z -",
    summary: "Desloca o hotspot um passo negativo no eixo Z local.",
    usage: "Serve para ajustar profundidade no referencial da cena."
  },
  "pos-z-plus": {
    title: "Mover Z +",
    summary: "Desloca o hotspot um passo positivo no eixo Z local.",
    usage: "Use para refinamento de profundidade e alinhamento espacial."
  },
  "rot-yaw-minus": {
    title: "Yaw -",
    summary: "Diminui a rotacao yaw do hotspot selecionado.",
    usage: "Acione para girar o hotspot em pequenos incrementos."
  },
  "rot-yaw-plus": {
    title: "Yaw +",
    summary: "Aumenta a rotacao yaw do hotspot selecionado.",
    usage: "Use para orientar marker e label na direcao desejada."
  },
  "scale-minus": {
    title: "Escala -",
    summary: "Reduz a escala geral do hotspot.",
    usage: "Bom para diminuir o marker quando ele estiver grande demais."
  },
  "scale-plus": {
    title: "Escala +",
    summary: "Aumenta a escala geral do hotspot.",
    usage: "Use para melhorar visibilidade do hotspot no panorama."
  },
  "reference-depth-minus": {
    title: "Profundidade ref -",
    summary: "Reduz a profundidade de referencia usada pelo hotspot.",
    usage: "Ajuste quando a percepcao espacial do hotspot parecer exagerada."
  },
  "reference-depth-plus": {
    title: "Profundidade ref +",
    summary: "Aumenta a profundidade de referencia usada pelo hotspot.",
    usage: "Use para empurrar a referencia espacial do hotspot para mais longe."
  },
  "label-offset-y-minus": {
    title: "Offset Y da label -",
    summary: "Move a label para baixo em relacao ao hotspot.",
    usage: "Acione para aproximar a label do marker ou corrigir sobreposicoes."
  },
  "label-offset-y-plus": {
    title: "Offset Y da label +",
    summary: "Move a label para cima em relacao ao hotspot.",
    usage: "Use para ganhar distancia vertical entre marker e texto."
  },
  "label-scale-minus": {
    title: "Escala da label -",
    summary: "Reduz a escala da label do hotspot.",
    usage: "Util para evitar texto grande demais no ambiente imersivo."
  },
  "label-scale-plus": {
    title: "Escala da label +",
    summary: "Aumenta a escala da label do hotspot.",
    usage: "Use para melhorar a leitura da label quando ela estiver pequena."
  }
};

export class VRHotspotEditorWidget {
  constructor({ root, panoramaRenderer, context }) {
    this.root = root;
    this.panoramaRenderer = panoramaRenderer;
    this.context = context;
    this.group = new THREE.Group();
    this.group.name = "wpa360-vr-hotspot-editor";
    this.group.visible = false;
    this.root.add(this.group);

    this.background = new THREE.Mesh(
      PANEL_GEOMETRY,
      new THREE.MeshBasicMaterial({
        color: new THREE.Color("#081418"),
        transparent: true,
        opacity: 0.94,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false
      })
    );
    this.background.renderOrder = 15;
    this.group.add(this.background);

    this.infoSection = new THREE.Mesh(
      SECTION_GEOMETRY,
      new THREE.MeshBasicMaterial({
        color: new THREE.Color("#0d2228"),
        transparent: true,
        opacity: 0.98,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false
      })
    );
    this.infoSection.position.set(0, 0.265, 0.0015);
    this.infoSection.renderOrder = 15.2;
    this.group.add(this.infoSection);

    this.toolbarSection = new THREE.Mesh(
      new THREE.PlaneGeometry(0.72, 0.11),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color("#0b1d23"),
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false
      })
    );
    this.toolbarSection.position.set(0, 0.065, 0.0015);
    this.toolbarSection.renderOrder = 15.15;
    this.group.add(this.toolbarSection);

    this.controlsSection = new THREE.Mesh(
      new THREE.PlaneGeometry(0.72, 0.46),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color("#0a1a1f"),
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false
      })
    );
    this.controlsSection.position.set(0, -0.145, 0.0015);
    this.controlsSection.renderOrder = 15.1;
    this.group.add(this.controlsSection);

    this.infoTexture = createInfoTexture();
    this.infoMaterial = new THREE.MeshBasicMaterial({
      map: this.infoTexture,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false
    });
    this.infoPanel = new THREE.Mesh(INFO_GEOMETRY, this.infoMaterial);
    this.infoPanel.position.set(0, 0.265, 0.0045);
    this.infoPanel.renderOrder = 16;
    this.group.add(this.infoPanel);

    this.descriptionTexture = createDescriptionTexture();
    this.descriptionMaterial = new THREE.MeshBasicMaterial({
      map: this.descriptionTexture,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false
    });
    this.descriptionPanel = new THREE.Mesh(DESCRIPTION_GEOMETRY, this.descriptionMaterial);
    this.descriptionPanel.position.set(0, -0.5, 0.0045);
    this.descriptionPanel.renderOrder = 16;
    this.group.add(this.descriptionPanel);

    this.temp = {
      headPosition: new THREE.Vector3(),
      forward: new THREE.Vector3(),
      up: new THREE.Vector3(0, 1, 0),
      targetPosition: new THREE.Vector3(),
      lookTarget: new THREE.Vector3(),
      rotationMatrix: new THREE.Matrix4(),
      targetQuaternion: new THREE.Quaternion(),
      localTouchPoint: new THREE.Vector3()
    };

    this.currentPage = FLOW_PAGE;
    this.requestedOpen = false;
    this.highlightedActionId = null;
    this.hotspotPickerOpen = false;
    this.hotspotPickerPage = 0;
    this.createScenePickerOpen = false;
    this.createScenePickerPage = 0;
    this.lastInfoSignature = null;
    this.lastDescriptionSignature = null;
    this.lastHeadPosition = null;
    this.lastCamera = null;
    this.entries = new Map();
    this.buttonEntries = [];

    this.createEntries();
    this.syncEntryVisibility();
    this.refreshButtonVisuals();
    this.redrawInfo();
    this.redrawDescription();
  }

  createEntries() {
    for (const definition of [...GLOBAL_ACTIONS, ...PAGE_ACTIONS[FLOW_PAGE], ...PAGE_ACTIONS[ADJUST_PAGE], ...HOTSPOT_LIST_ACTIONS, ...CREATE_SCENE_LIST_ACTIONS]) {
      const entry = createButtonEntry(definition);
      entry.mesh.position.set(...definition.position);
      entry.mesh.userData.editorActionId = definition.id;
      this.group.add(entry.mesh);
      this.entries.set(definition.id, entry);
      this.buttonEntries.push(entry);
    }
  }

  isAvailable() {
    return Boolean(this.context.getEditorBridge?.());
  }

  isOpen() {
    return this.requestedOpen && this.isAvailable();
  }

  toggle() {
    if (this.isOpen()) {
      this.close();
      return false;
    }

    return this.open();
  }

  open() {
    if (!this.isAvailable()) {
      this.context.setStatus?.("O editor do tour nao esta habilitado nesta sessao.", { hideAfterMs: 1800 });
      return false;
    }

    this.requestedOpen = true;
    this.placeInFrontOfUser();
    this.group.visible = true;
    this.context.setStatus?.("Widget de hotspot aberto no VR.", { hideAfterMs: 1500 });
    return true;
  }

  close() {
    this.requestedOpen = false;
    this.group.visible = false;
    this.setHighlightedAction(null);
  }

  update(frameState, headPosition) {
    if (frameState?.camera) {
      this.lastCamera = frameState.camera;
    }

    if (headPosition) {
      if (!this.lastHeadPosition) {
        this.lastHeadPosition = new THREE.Vector3();
      }
      this.lastHeadPosition.set(
        Number(headPosition.x ?? 0),
        Number(headPosition.y ?? 0),
        Number(headPosition.z ?? 0)
      );
    }

    if (!frameState?.presenting || !this.requestedOpen || !this.isAvailable()) {
      this.group.visible = false;
      this.setHighlightedAction(null);
      return;
    }

    this.group.visible = true;
    this.refreshListEntries();
    this.syncEntryVisibility();
    this.refreshButtonVisuals();
    this.redrawInfo();
  }

  setHighlightedAction(actionId) {
    if (this.highlightedActionId === actionId) {
      return;
    }

    this.highlightedActionId = actionId ?? null;
    this.refreshButtonVisuals();
    this.redrawDescription();
  }

  getInteractiveObjects() {
    if (!this.group.visible) {
      return [];
    }

    return this.buttonEntries
      .filter((entry) => entry.mesh.visible)
      .map((entry) => entry.mesh);
  }

  getActionByObject(object) {
    let current = object;
    while (current) {
      if (current.userData?.editorActionId) {
        return current.userData.editorActionId;
      }
      current = current.parent;
    }
    return null;
  }

  getDirectTouchAction(worldPosition) {
    if (!this.group.visible || !worldPosition) {
      return null;
    }

    const localPoint = this.temp.localTouchPoint.copy(worldPosition);
    this.group.worldToLocal(localPoint);

    let bestEntry = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const entry of this.buttonEntries) {
      if (!entry.mesh.visible) {
        continue;
      }

      const halfWidth = (BUTTON_GEOMETRY.parameters.width * entry.mesh.scale.x) * 0.5;
      const halfHeight = (BUTTON_GEOMETRY.parameters.height * entry.mesh.scale.y) * 0.5;
      const dx = localPoint.x - entry.mesh.position.x;
      const dy = localPoint.y - entry.mesh.position.y;
      const dz = localPoint.z - entry.mesh.position.z;

      if (Math.abs(dz) > BUTTON_DEPTH_THRESHOLD) {
        continue;
      }

      if (Math.abs(dx) > halfWidth + BUTTON_PADDING || Math.abs(dy) > halfHeight + BUTTON_PADDING) {
        continue;
      }

      const score =
        Math.abs(dx) / Math.max(0.0001, halfWidth + BUTTON_PADDING)
        + Math.abs(dy) / Math.max(0.0001, halfHeight + BUTTON_PADDING)
        + Math.abs(dz) / Math.max(0.0001, BUTTON_DEPTH_THRESHOLD) * 0.35;

      if (score < bestScore) {
        bestScore = score;
        bestEntry = entry;
      }
    }

    return bestEntry?.action.id ?? null;
  }

  executeAction(actionId) {
    const bridge = this.context.getEditorBridge?.();
    if (!bridge) {
      this.context.setStatus?.("O editor do tour nao esta disponivel no VR.", { hideAfterMs: 1800 });
      return false;
    }

    this.context.debugLog?.("vr:hotspot-editor:action", {
      actionId,
      page: this.currentPage
    });

    switch (actionId) {
      case "page-flow":
        this.currentPage = FLOW_PAGE;
        break;

      case "page-adjust":
        this.currentPage = ADJUST_PAGE;
        break;

      case "close-widget":
        this.close();
        break;

      case "toggle-dev-controls":
        this.context.toggleVrDevControls?.();
        this.context.setStatus?.(
          this.context.isVrDevControlsEnabled?.()
            ? "Dev Controls ligados no widget VR."
            : "Dev Controls desligados no widget VR.",
          { hideAfterMs: 1600 }
        );
        break;

      case "recenter-widget":
        this.placeInFrontOfUser();
        this.context.setStatus?.("Widget reposicionado a sua frente.", { hideAfterMs: 1400 });
        break;

      case "scene-prev":
        this.cycleScene(-1);
        break;

      case "scene-next":
        this.cycleScene(1);
        break;

      case "hotspot-prev":
        this.cycleHotspot(-1);
        break;

      case "hotspot-next":
        this.cycleHotspot(1);
        break;

      case "add-nav-hotspot":
        this.hotspotPickerOpen = false;
        this.createScenePickerOpen = true;
        this.createScenePickerPage = 0;
        this.refreshListEntries();
        break;

      case "add-note-hotspot":
        this.createScenePickerOpen = false;
        this.close();
        this.context.requestCreateHotspotMode?.("annotation");
        break;

      case "pick-hotspot":
        this.createScenePickerOpen = false;
        this.hotspotPickerOpen = true;
        this.hotspotPickerPage = 0;
        this.refreshListEntries();
        break;

      case "hotspot-list-close":
        this.hotspotPickerOpen = false;
        this.refreshListEntries();
        break;

      case "hotspot-list-prev":
        this.shiftHotspotPickerPage(-1);
        break;

      case "hotspot-list-next":
        this.shiftHotspotPickerPage(1);
        break;

      case "hotspot-list-item-0":
      case "hotspot-list-item-1":
      case "hotspot-list-item-2":
      case "hotspot-list-item-3":
      case "hotspot-list-item-4":
        return this.selectHotspotFromListAction(actionId);

      case "create-scene-list-close":
        this.createScenePickerOpen = false;
        this.refreshListEntries();
        break;

      case "create-scene-list-prev":
        this.shiftCreateScenePickerPage(-1);
        break;

      case "create-scene-list-next":
        this.shiftCreateScenePickerPage(1);
        break;

      case "create-scene-list-confirm":
        if (this.context.requestCreateHotspotMode?.("scene_link")) {
          this.createScenePickerOpen = false;
          this.close();
        }
        break;

      case "create-scene-list-item-0":
      case "create-scene-list-item-1":
      case "create-scene-list-item-2":
      case "create-scene-list-item-3":
        return this.selectCreateSceneFromListAction(actionId);

      case "move-hotspot":
        this.close();
        this.context.requestHotspotPlacementMode?.();
        break;

      case "toggle-hotspot-type":
        this.toggleHotspotType();
        break;

      case "target-scene-prev":
        this.cycleTargetScene(-1);
        break;

      case "target-scene-next":
        this.cycleTargetScene(1);
        break;

      case "delete-hotspot":
        bridge.draftStore.deleteHotspot();
        break;

      case "toggle-marker-visible":
        this.toggleHotspotField("marker_visible");
        break;

      case "toggle-hotspot-billboard":
        this.toggleHotspotField("billboard");
        break;

      case "toggle-label-visible":
        this.toggleLabelField("visible");
        break;

      case "toggle-label-billboard":
        this.toggleLabelField("billboard");
        break;

      case "pos-x-minus":
        this.nudgeHotspotField("position.x", -POSITION_STEP);
        break;

      case "pos-x-plus":
        this.nudgeHotspotField("position.x", POSITION_STEP);
        break;

      case "pos-y-minus":
        this.nudgeHotspotField("position.y", -POSITION_STEP);
        break;

      case "pos-y-plus":
        this.nudgeHotspotField("position.y", POSITION_STEP);
        break;

      case "pos-z-minus":
        this.nudgeHotspotField("position.z", -POSITION_STEP);
        break;

      case "pos-z-plus":
        this.nudgeHotspotField("position.z", POSITION_STEP);
        break;

      case "rot-yaw-minus":
        this.nudgeHotspotField("rotation.yaw", -ROTATION_STEP);
        break;

      case "rot-yaw-plus":
        this.nudgeHotspotField("rotation.yaw", ROTATION_STEP);
        break;

      case "scale-minus":
        this.nudgeHotspotField("scale", -SCALE_STEP, { min: 0.1 });
        break;

      case "scale-plus":
        this.nudgeHotspotField("scale", SCALE_STEP, { min: 0.1 });
        break;

      case "reference-depth-minus":
        this.nudgeHotspotField("reference_depth", -REFERENCE_DEPTH_STEP, { min: 0.25 });
        break;

      case "reference-depth-plus":
        this.nudgeHotspotField("reference_depth", REFERENCE_DEPTH_STEP, { min: 0.25 });
        break;

      case "label-offset-y-minus":
        this.nudgeLabelField("position_offset.y", -LABEL_OFFSET_STEP);
        break;

      case "label-offset-y-plus":
        this.nudgeLabelField("position_offset.y", LABEL_OFFSET_STEP);
        break;

      case "label-scale-minus":
        this.nudgeLabelField("scale", -LABEL_SCALE_STEP, { min: 0.1 });
        break;

      case "label-scale-plus":
        this.nudgeLabelField("scale", LABEL_SCALE_STEP, { min: 0.1 });
        break;

      default:
        return false;
    }

    this.syncEntryVisibility();
    this.refreshButtonVisuals();
    this.redrawInfo();
    this.redrawDescription();
    return true;
  }

  destroy() {
    for (const entry of this.buttonEntries) {
      entry.idleTexture.dispose();
      entry.activeTexture.dispose();
      entry.mesh.material.dispose();
      entry.mesh.removeFromParent();
    }

    this.buttonEntries = [];
    this.entries.clear();
    this.infoTexture.dispose();
    this.infoMaterial.dispose();
    this.descriptionTexture.dispose();
    this.descriptionMaterial.dispose();
    this.background.material.dispose();
    this.infoSection.material.dispose();
    this.toolbarSection.material.dispose();
    this.controlsSection.material.dispose();
    this.background.removeFromParent();
    this.infoSection.removeFromParent();
    this.toolbarSection.removeFromParent();
    this.controlsSection.removeFromParent();
    this.infoPanel.removeFromParent();
    this.descriptionPanel.removeFromParent();
    this.group.removeFromParent();
  }

  placeInFrontOfUser() {
    if (!this.lastCamera || !this.lastHeadPosition) {
      return false;
    }

    this.lastCamera.getWorldDirection(this.temp.forward);
    this.temp.forward.y = 0;
    if (this.temp.forward.lengthSq() < 0.0001) {
      this.temp.forward.set(0, 0, -1);
    }
    this.temp.forward.normalize();

    this.temp.headPosition.copy(this.lastHeadPosition);
    this.temp.targetPosition
      .copy(this.temp.headPosition)
      .addScaledVector(this.temp.forward, 0.86)
      .addScaledVector(this.temp.up, -0.08);

    this.temp.lookTarget.copy(this.temp.headPosition).addScaledVector(this.temp.up, -0.02);
    this.temp.rotationMatrix.lookAt(this.temp.lookTarget, this.temp.targetPosition, this.temp.up);
    this.temp.targetQuaternion.setFromRotationMatrix(this.temp.rotationMatrix);

    this.group.position.copy(this.temp.targetPosition);
    this.group.quaternion.copy(this.temp.targetQuaternion);
    return true;
  }

  syncEntryVisibility() {
    for (const entry of this.buttonEntries) {
      const isGlobal = GLOBAL_ACTIONS.some((candidate) => candidate.id === entry.action.id);
      const allowPageActions = !this.hotspotPickerOpen && !this.createScenePickerOpen;
      const isCurrentPageAction = allowPageActions && PAGE_ACTIONS[this.currentPage].some((candidate) => candidate.id === entry.action.id);
      const isListAction = this.hotspotPickerOpen && HOTSPOT_LIST_ACTIONS.some((candidate) => candidate.id === entry.action.id);
      const isCreateSceneListAction = this.createScenePickerOpen && CREATE_SCENE_LIST_ACTIONS.some((candidate) => candidate.id === entry.action.id);
      entry.mesh.visible = isGlobal || isCurrentPageAction || isListAction || isCreateSceneListAction;
    }
  }

  refreshButtonVisuals() {
    for (const entry of this.buttonEntries) {
      const isHighlighted = entry.action.id === this.highlightedActionId;
      const isSelectedTab = (entry.action.id === "page-flow" && this.currentPage === FLOW_PAGE)
        || (entry.action.id === "page-adjust" && this.currentPage === ADJUST_PAGE);
      const isSelectedToggle = entry.action.id === "toggle-dev-controls"
        && this.context.isVrDevControlsEnabled?.();

      entry.mesh.material.map = isHighlighted || isSelectedTab || isSelectedToggle
        ? entry.activeTexture
        : entry.idleTexture;
      entry.mesh.material.needsUpdate = true;
    }
  }

  redrawInfo() {
    const bridge = this.context.getEditorBridge?.();
    const draftState = bridge?.draftStore?.getSnapshot?.();
    const selectedScene = getSelectedScene(draftState);
    const selectedHotspot = getSelectedHotspot(draftState);
    const toolMode = this.context.getVrEditorToolMode?.() ?? "idle";
    const devControlsEnabled = Boolean(this.context.isVrDevControlsEnabled?.());
    const devControlsMode = this.context.getVrDevControlsMode?.() ?? "move";
    const createTarget = this.context.getVrCreateTargetSummary?.() ?? {};

    const signature = JSON.stringify({
      page: this.currentPage,
      toolMode,
      devControlsEnabled,
      devControlsMode,
      dirty: draftState?.dirty ?? false,
      error: draftState?.error ?? null,
      sceneId: selectedScene?.id ?? null,
      hotspotId: selectedHotspot?.id ?? null,
      hotspotType: selectedHotspot?.type ?? null,
      targetScene: selectedHotspot?.target_scene ?? null,
      markerVisible: selectedHotspot?.marker_visible !== false,
      hotspotBillboard: selectedHotspot?.billboard !== false,
      labelVisible: selectedHotspot?.label?.visible !== false,
      labelBillboard: selectedHotspot?.label?.billboard !== false,
      position: selectedHotspot?.position ?? null,
      rotation: selectedHotspot?.rotation ?? null,
      scale: selectedHotspot?.scale ?? null,
      referenceDepth: selectedHotspot?.reference_depth ?? null,
      labelOffsetY: selectedHotspot?.label?.position_offset?.y ?? null,
      labelScale: selectedHotspot?.label?.scale ?? null,
      hotspotPickerOpen: this.hotspotPickerOpen,
      createScenePickerOpen: this.createScenePickerOpen,
      createTargetSceneId: createTarget.sceneId ?? null
    });

    if (signature === this.lastInfoSignature) {
      return;
    }

    this.lastInfoSignature = signature;

    const ctx = this.infoTexture.image.getContext("2d");
    const width = this.infoTexture.image.width;
    const height = this.infoTexture.image.height;
    ctx.clearRect(0, 0, width, height);
    drawRoundedCard(ctx, 0, 0, width, height, 34);
    ctx.fillStyle = "rgba(5, 16, 20, 0.92)";
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
    ctx.stroke();

    ctx.fillStyle = "#f0a85d";
    ctx.font = '700 40px "Segoe UI", sans-serif';
    ctx.fillText("Hotspot Editor VR", 34, 50);

    ctx.fillStyle = "#f6f0e6";
    ctx.font = '700 28px "Segoe UI", sans-serif';

    const sceneLine = `Cena: ${selectedScene?.title ?? selectedScene?.id ?? "nenhuma"}`;
    const hotspotLine = selectedHotspot
      ? `Hotspot: ${selectedHotspot.id} (${getHotspotLabelText(selectedHotspot)})`
      : "Hotspot: nenhum selecionado";
    const typeLine = selectedHotspot
      ? `Tipo: ${selectedHotspot.type} | Destino: ${selectedHotspot.target_scene ?? "-"}`
      : "Tipo: -";
    const poseLine = selectedHotspot
      ? `Pos ${formatVector(selectedHotspot.position)} | Yaw ${formatNumber(selectedHotspot.rotation?.yaw)} | Esc ${formatNumber(selectedHotspot.scale)} | Ref ${formatNumber(selectedHotspot.reference_depth)}`
      : "Pos - | Yaw - | Esc - | Ref -";
    const flagsLine = selectedHotspot
      ? `Marker ${toOnOff(selectedHotspot.marker_visible !== false)} | BB Hot ${toOnOff(selectedHotspot.billboard !== false)} | Label ${toOnOff(selectedHotspot.label?.visible !== false)} | BB Label ${toOnOff(selectedHotspot.label?.billboard !== false)}`
      : "Marker - | BB Hot - | Label - | BB Label -";
    const devLine = `Dev Controls: ${devControlsEnabled ? `on (${devControlsMode})` : "off"}`;
    const listLine = this.hotspotPickerOpen
      ? `Lista de hotspots: ${this.context.getVrHotspotListOptions?.().length ?? 0} item(ns) na cena atual.`
      : this.createScenePickerOpen
        ? `Destino do novo link: ${createTarget.sceneTitle ?? "-"} | ${this.context.getVrCreateSceneListOptions?.().length ?? 0} cena(s) disponivel(is).`
      : null;
    const footerLine = draftState?.error
      ? `Erro: ${draftState.error}`
      : `Estado: ${draftState?.dirty ? "draft editado" : "sincronizado"} | Ferramenta: ${toolMode}`;

    const lines = [sceneLine, hotspotLine, typeLine, poseLine, flagsLine, devLine, listLine, footerLine].filter(Boolean);
    lines.forEach((line, index) => {
      ctx.fillStyle = index === lines.length - 1 && draftState?.error ? "#ffb4a4" : "#f6f0e6";
      fillWrappedText(ctx, line, 34, 92 + index * 34, width - 68, 30);
    });

    this.infoTexture.needsUpdate = true;
  }

  redrawDescription() {
    const description = ACTION_DESCRIPTIONS[this.highlightedActionId] ?? DEFAULT_DESCRIPTION;
    const signature = `${this.highlightedActionId ?? "default"}|${description.title}|${description.summary}|${description.usage}`;
    if (signature === this.lastDescriptionSignature) {
      return;
    }

    this.lastDescriptionSignature = signature;

    const ctx = this.descriptionTexture.image.getContext("2d");
    const width = this.descriptionTexture.image.width;
    const height = this.descriptionTexture.image.height;
    ctx.clearRect(0, 0, width, height);
    drawRoundedCard(ctx, 0, 0, width, height, 34);
    ctx.fillStyle = "rgba(7, 19, 24, 0.96)";
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = this.highlightedActionId ? "rgba(240, 168, 93, 0.65)" : "rgba(255, 255, 255, 0.14)";
    ctx.stroke();

    ctx.fillStyle = "#f0a85d";
    ctx.font = '700 34px "Segoe UI", sans-serif';
    ctx.fillText(description.title, 32, 44);

    ctx.fillStyle = "#f6f0e6";
    ctx.font = '600 25px "Segoe UI", sans-serif';
    fillWrappedText(ctx, `O que faz: ${description.summary}`, 32, 86, width - 64, 28);
    fillWrappedText(ctx, `Como usar: ${description.usage}`, 32, 150, width - 64, 28);

    this.descriptionTexture.needsUpdate = true;
  }

  refreshListEntries() {
    const options = this.context.getVrHotspotListOptions?.() ?? [];
    const startIndex = this.hotspotPickerPage * 5;
    const visibleOptions = options.slice(startIndex, startIndex + 5);

    for (let index = 0; index < 5; index += 1) {
      const actionId = `hotspot-list-item-${index}`;
      const entry = this.entries.get(actionId);
      if (!entry) {
        continue;
      }

      const option = visibleOptions[index] ?? null;
      const nextLabel = option
        ? truncateLabel(option.selected ? `* ${option.label}` : option.label, 18)
        : "-";
      entry.action.optionHotspotId = option?.id ?? null;
      if (entry.action.label === nextLabel) {
        continue;
      }
      entry.action.label = nextLabel;
      entry.idleTexture.dispose();
      entry.activeTexture.dispose();
      entry.idleTexture = createButtonTexture(nextLabel, false, entry.action.variant);
      entry.activeTexture = createButtonTexture(nextLabel, true, entry.action.variant);
      entry.mesh.material.map = entry.idleTexture;
      entry.mesh.material.needsUpdate = true;
    }

    const createSceneOptions = this.context.getVrCreateSceneListOptions?.() ?? [];
    const createSceneStartIndex = this.createScenePickerPage * 4;
    const visibleCreateScenes = createSceneOptions.slice(createSceneStartIndex, createSceneStartIndex + 4);

    for (let index = 0; index < 4; index += 1) {
      const actionId = `create-scene-list-item-${index}`;
      const entry = this.entries.get(actionId);
      if (!entry) {
        continue;
      }

      const option = visibleCreateScenes[index] ?? null;
      const nextLabel = option
        ? truncateLabel(option.selected ? `* ${option.label}` : option.label, 18)
        : "-";
      entry.action.optionSceneId = option?.id ?? null;
      if (entry.action.label === nextLabel) {
        continue;
      }
      entry.action.label = nextLabel;
      entry.idleTexture.dispose();
      entry.activeTexture.dispose();
      entry.idleTexture = createButtonTexture(nextLabel, false, entry.action.variant);
      entry.activeTexture = createButtonTexture(nextLabel, true, entry.action.variant);
      entry.mesh.material.map = entry.idleTexture;
      entry.mesh.material.needsUpdate = true;
    }
  }

  shiftHotspotPickerPage(step) {
    const total = this.context.getVrHotspotListOptions?.().length ?? 0;
    const maxPage = Math.max(0, Math.ceil(total / 5) - 1);
    this.hotspotPickerPage = Math.min(maxPage, Math.max(0, this.hotspotPickerPage + step));
    this.refreshListEntries();
  }

  shiftCreateScenePickerPage(step) {
    const total = this.context.getVrCreateSceneListOptions?.().length ?? 0;
    const maxPage = Math.max(0, Math.ceil(total / 4) - 1);
    this.createScenePickerPage = Math.min(maxPage, Math.max(0, this.createScenePickerPage + step));
    this.refreshListEntries();
  }

  selectHotspotFromListAction(actionId) {
    const entry = this.entries.get(actionId);
    const hotspotId = entry?.action?.optionHotspotId ?? null;
    if (!hotspotId) {
      return false;
    }

    const didSelect = this.context.selectVrHotspotById?.(hotspotId) ?? false;
    if (didSelect) {
      this.hotspotPickerOpen = false;
      this.refreshListEntries();
      this.syncEntryVisibility();
      this.redrawInfo();
    }
    return didSelect;
  }

  selectCreateSceneFromListAction(actionId) {
    const entry = this.entries.get(actionId);
    const sceneId = entry?.action?.optionSceneId ?? null;
    if (!sceneId) {
      return false;
    }

    return this.context.selectVrCreateSceneById?.(sceneId) ?? false;
  }

  cycleScene(step) {
    const bridge = this.context.getEditorBridge?.();
    const draftState = bridge?.draftStore?.getSnapshot?.();
    const scenes = draftState?.draft?.scenes ?? [];
    if (scenes.length === 0) {
      this.context.setStatus?.("Nao ha cenas disponiveis para edicao.", { hideAfterMs: 1600 });
      return;
    }

    const currentIndex = scenes.findIndex((scene) => scene.id === draftState.selectedSceneId);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextScene = scenes[modulo(safeIndex + step, scenes.length)];
    bridge.draftStore.setSelectedScene(nextScene.id);
  }

  cycleHotspot(step) {
    const bridge = this.context.getEditorBridge?.();
    const draftState = bridge?.draftStore?.getSnapshot?.();
    const scene = getSelectedScene(draftState);
    const hotspots = scene?.hotspots ?? [];
    if (hotspots.length === 0) {
      this.context.setStatus?.("A cena atual nao possui hotspots para editar.", { hideAfterMs: 1600 });
      return;
    }

    const currentIndex = hotspots.findIndex((hotspot) => hotspot.id === draftState.selectedHotspotId);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextHotspot = hotspots[modulo(safeIndex + step, hotspots.length)];
    bridge.draftStore.setSelectedHotspot(nextHotspot.id);
  }

  toggleHotspotType() {
    const bridge = this.context.getEditorBridge?.();
    const hotspot = getSelectedHotspot(bridge?.draftStore?.getSnapshot?.());
    if (!hotspot) {
      this.context.setStatus?.("Selecione um hotspot antes de alterar o tipo.", { hideAfterMs: 1600 });
      return;
    }

    const nextType = hotspot.type === "scene_link" ? "annotation" : "scene_link";
    bridge.draftStore.updateHotspotField("type", nextType);
  }

  cycleTargetScene(step) {
    const bridge = this.context.getEditorBridge?.();
    const draftState = bridge?.draftStore?.getSnapshot?.();
    const hotspot = getSelectedHotspot(draftState);
    const selectedScene = getSelectedScene(draftState);
    if (!hotspot || !selectedScene) {
      this.context.setStatus?.("Selecione um hotspot antes de ajustar o destino.", { hideAfterMs: 1600 });
      return;
    }

    const options = (draftState?.draft?.scenes ?? []).filter((scene) => scene.id !== selectedScene.id);
    if (options.length === 0) {
      this.context.setStatus?.("Nao existe outra cena para usar como destino.", { hideAfterMs: 1800 });
      return;
    }

    const currentIndex = options.findIndex((scene) => scene.id === hotspot.target_scene);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextScene = options[modulo(safeIndex + step, options.length)];
    bridge.draftStore.updateHotspotField("target_scene", nextScene.id);
  }

  toggleHotspotField(field) {
    const bridge = this.context.getEditorBridge?.();
    const hotspot = getSelectedHotspot(bridge?.draftStore?.getSnapshot?.());
    if (!hotspot) {
      this.context.setStatus?.("Selecione um hotspot antes de editar.", { hideAfterMs: 1600 });
      return;
    }

    bridge.draftStore.updateHotspotField(field, !(getPathValue(hotspot, field) !== false));
  }

  toggleLabelField(field) {
    const bridge = this.context.getEditorBridge?.();
    const hotspot = getSelectedHotspot(bridge?.draftStore?.getSnapshot?.());
    if (!hotspot) {
      this.context.setStatus?.("Selecione um hotspot antes de editar a label.", { hideAfterMs: 1600 });
      return;
    }

    bridge.draftStore.updateHotspotLabelField(field, !(getPathValue(hotspot.label ?? {}, field) !== false));
  }

  nudgeHotspotField(path, delta, { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = {}) {
    const bridge = this.context.getEditorBridge?.();
    const hotspot = getSelectedHotspot(bridge?.draftStore?.getSnapshot?.());
    if (!hotspot) {
      this.context.setStatus?.("Selecione um hotspot antes de ajustar valores.", { hideAfterMs: 1600 });
      return;
    }

    const currentValue = Number(getPathValue(hotspot, path) ?? 0);
    const nextValue = clamp(roundNumber(currentValue + delta), min, max);
    bridge.draftStore.updateHotspotField(path, nextValue);
  }

  nudgeLabelField(path, delta, { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = {}) {
    const bridge = this.context.getEditorBridge?.();
    const hotspot = getSelectedHotspot(bridge?.draftStore?.getSnapshot?.());
    if (!hotspot) {
      this.context.setStatus?.("Selecione um hotspot antes de ajustar a label.", { hideAfterMs: 1600 });
      return;
    }

    const currentValue = Number(getPathValue(hotspot.label ?? {}, path) ?? 0);
    const nextValue = clamp(roundNumber(currentValue + delta), min, max);
    bridge.draftStore.updateHotspotLabelField(path, nextValue);
  }
}

function createButtonEntry(action) {
  const idleTexture = createButtonTexture(action.label, false, action.variant);
  const activeTexture = createButtonTexture(action.label, true, action.variant);
  const material = new THREE.MeshBasicMaterial({
    map: idleTexture,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(BUTTON_GEOMETRY, material);
  mesh.renderOrder = 17;

  return {
    action,
    idleTexture,
    activeTexture,
    mesh
  };
}

function createInfoTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 360;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createDescriptionTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 240;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createButtonTexture(label, active, variant = "default") {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 176;
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawRoundedCard(ctx, 4, 4, canvas.width - 8, canvas.height - 8, 58);

  if (variant === "danger") {
    ctx.fillStyle = active ? "#ffd4ca" : "rgba(74, 21, 14, 0.92)";
    ctx.fill();
    ctx.lineWidth = active ? 8 : 5;
    ctx.strokeStyle = active ? "#ff9c84" : "rgba(255, 190, 176, 0.34)";
    ctx.stroke();
    ctx.fillStyle = active ? "#3a100b" : "#ffd6ca";
  } else if (variant === "tab") {
    ctx.fillStyle = active ? "#fff2c4" : "rgba(12, 32, 39, 0.88)";
    ctx.fill();
    ctx.lineWidth = active ? 8 : 5;
    ctx.strokeStyle = active ? "#f0a85d" : "rgba(255, 255, 255, 0.18)";
    ctx.stroke();
    ctx.fillStyle = active ? "#0b2b33" : "#f6f0e6";
  } else {
    ctx.fillStyle = active ? "#fff3bc" : "rgba(10, 28, 34, 0.92)";
    ctx.fill();
    ctx.lineWidth = active ? 8 : 5;
    ctx.strokeStyle = active ? "#f0a85d" : "rgba(255, 255, 255, 0.2)";
    ctx.stroke();
    ctx.fillStyle = active ? "#0b2b33" : "#f6f0e6";
  }

  drawCenteredButtonText(ctx, label, canvas.width / 2, canvas.height / 2, canvas.width - 54);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function drawRoundedCard(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function fillWrappedText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  let line = "";
  let cursorY = y;

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width <= maxWidth) {
      line = testLine;
      continue;
    }

    if (line) {
      ctx.fillText(line, x, cursorY);
      cursorY += lineHeight;
    }
    line = word;
  }

  if (line) {
    ctx.fillText(line, x, cursorY);
  }
}

function drawCenteredButtonText(ctx, label, centerX, centerY, maxWidth) {
  const lines = String(label ?? "").split("\n").filter(Boolean);
  const fontSize = lines.length > 1 ? 34 : 44;
  const lineHeight = lines.length > 1 ? 40 : 48;
  ctx.font = `700 ${fontSize}px "Segoe UI", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const renderedLines = [];
  for (const rawLine of lines) {
    const wrapped = wrapTextToWidth(ctx, rawLine, maxWidth);
    renderedLines.push(...wrapped);
  }

  const totalHeight = (renderedLines.length - 1) * lineHeight;
  let cursorY = centerY - totalHeight / 2;
  for (const line of renderedLines) {
    ctx.fillText(line, centerX, cursorY);
    cursorY += lineHeight;
  }
}

function wrapTextToWidth(ctx, text, maxWidth) {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [""];
  }

  const lines = [];
  let line = "";

  for (const word of words) {
    const nextLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(nextLine).width <= maxWidth || !line) {
      line = nextLine;
      continue;
    }

    lines.push(line);
    line = word;
  }

  if (line) {
    lines.push(line);
  }

  return lines;
}

function truncateLabel(value, maxLength = 18) {
  const text = String(value ?? "").trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(1, maxLength - 1))}…`;
}

function getSelectedScene(state) {
  return state?.draft?.scenes?.find((scene) => scene.id === state.selectedSceneId) ?? null;
}

function getSelectedHotspot(state) {
  const scene = getSelectedScene(state);
  return scene?.hotspots?.find((hotspot) => hotspot.id === state.selectedHotspotId) ?? null;
}

function getPathValue(source, path) {
  return path.split(".").reduce((value, part) => value?.[part], source);
}

function roundNumber(value) {
  return Math.round(Number(value ?? 0) * 1000) / 1000;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function modulo(value, length) {
  return ((value % length) + length) % length;
}

function formatNumber(value) {
  const numericValue = Number(value ?? 0);
  return Number.isFinite(numericValue) ? numericValue.toFixed(2) : "-";
}

function formatVector(vector) {
  if (!vector) {
    return "(-, -, -)";
  }

  return `(${formatNumber(vector.x)}, ${formatNumber(vector.y)}, ${formatNumber(vector.z)})`;
}

function toOnOff(value) {
  return value ? "on" : "off";
}
