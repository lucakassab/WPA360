import * as THREE from "../../../vendor/three/three.module.js";

const BUTTON_GEOMETRY = new THREE.PlaneGeometry(0.095, 0.04);
const BACKGROUND_GEOMETRY = new THREE.PlaneGeometry(0.5, 0.42);
const INFO_GEOMETRY = new THREE.PlaneGeometry(0.44, 0.11);
const DESCRIPTION_GEOMETRY = new THREE.PlaneGeometry(0.44, 0.12);
const BUTTON_PADDING = 0.016;
const BUTTON_DEPTH_THRESHOLD = 0.03;

const MODE_ACTIONS = [
  { id: "mode-move", label: "Mover", position: [-0.165, 0.11, 0.004], kind: "mode" },
  { id: "mode-rotate", label: "Girar", position: [-0.055, 0.11, 0.004], kind: "mode" },
  { id: "mode-label", label: "Label", position: [0.055, 0.11, 0.004], kind: "mode" },
  { id: "mode-link", label: "Link", position: [0.165, 0.11, 0.004], kind: "mode" }
];

const GLOBAL_ACTIONS = [
  { id: "save-draft", label: "Salvar", position: [-0.11, 0.06, 0.004], kind: "global" },
  { id: "undo-draft", label: "Desfazer", position: [0, 0.06, 0.004], kind: "global" },
  { id: "close-editor", label: "Fechar", position: [0.11, 0.06, 0.004], kind: "danger" }
];

const PAGE_ACTIONS = {
  move: [
    { id: "scene-prev", label: "Cena -", position: [-0.165, 0.005, 0.004] },
    { id: "scene-next", label: "Cena +", position: [-0.055, 0.005, 0.004] },
    { id: "hotspot-prev", label: "Hot -", position: [0.055, 0.005, 0.004] },
    { id: "hotspot-next", label: "Hot +", position: [0.165, 0.005, 0.004] },

    { id: "move-x-minus", label: "X -", position: [-0.165, -0.05, 0.004] },
    { id: "move-x-plus", label: "X +", position: [-0.055, -0.05, 0.004] },
    { id: "move-y-minus", label: "Y -", position: [0.055, -0.05, 0.004] },
    { id: "move-y-plus", label: "Y +", position: [0.165, -0.05, 0.004] },

    { id: "move-z-minus", label: "Z -", position: [-0.165, -0.105, 0.004] },
    { id: "move-z-plus", label: "Z +", position: [-0.055, -0.105, 0.004] },
    { id: "move-ref-minus", label: "Ref -", position: [0.055, -0.105, 0.004] },
    { id: "move-ref-plus", label: "Ref +", position: [0.165, -0.105, 0.004] },

    { id: "create-link-hotspot", label: "Novo Link", position: [-0.165, -0.16, 0.004] },
    { id: "create-note-hotspot", label: "Nova Nota", position: [-0.055, -0.16, 0.004] },
    { id: "pick-hotspot", label: "Escolher", position: [0.055, -0.16, 0.004] },
    { id: "delete-hotspot", label: "Excluir", position: [0.165, -0.16, 0.004], kind: "danger" }
  ],
  rotate: [
    { id: "scene-prev", label: "Cena -", position: [-0.165, 0.005, 0.004] },
    { id: "scene-next", label: "Cena +", position: [-0.055, 0.005, 0.004] },
    { id: "hotspot-prev", label: "Hot -", position: [0.055, 0.005, 0.004] },
    { id: "hotspot-next", label: "Hot +", position: [0.165, 0.005, 0.004] },

    { id: "rotate-yaw-minus", label: "Yaw -", position: [-0.165, -0.05, 0.004] },
    { id: "rotate-yaw-plus", label: "Yaw +", position: [-0.055, -0.05, 0.004] },
    { id: "rotate-pitch-minus", label: "Pitch -", position: [0.055, -0.05, 0.004] },
    { id: "rotate-pitch-plus", label: "Pitch +", position: [0.165, -0.05, 0.004] },

    { id: "rotate-roll-minus", label: "Roll -", position: [-0.165, -0.105, 0.004] },
    { id: "rotate-roll-plus", label: "Roll +", position: [-0.055, -0.105, 0.004] },
    { id: "toggle-hotspot-billboard", label: "BB Hot", position: [0.055, -0.105, 0.004], kind: "toggle" },
    { id: "toggle-marker-visible", label: "Marker", position: [0.165, -0.105, 0.004], kind: "toggle" }
  ],
  label: [
    { id: "toggle-label-visible", label: "Lbl On", position: [-0.165, 0.005, 0.004], kind: "toggle" },
    { id: "toggle-label-billboard", label: "BB Lbl", position: [-0.055, 0.005, 0.004], kind: "toggle" },
    { id: "label-scale-minus", label: "Esc -", position: [0.055, 0.005, 0.004] },
    { id: "label-scale-plus", label: "Esc +", position: [0.165, 0.005, 0.004] },

    { id: "label-offset-x-minus", label: "X -", position: [-0.165, -0.05, 0.004] },
    { id: "label-offset-x-plus", label: "X +", position: [-0.055, -0.05, 0.004] },
    { id: "label-offset-y-minus", label: "Y -", position: [0.055, -0.05, 0.004] },
    { id: "label-offset-y-plus", label: "Y +", position: [0.165, -0.05, 0.004] },

    { id: "label-offset-z-minus", label: "Z -", position: [-0.165, -0.105, 0.004] },
    { id: "label-offset-z-plus", label: "Z +", position: [-0.055, -0.105, 0.004] },
    { id: "label-yaw-minus", label: "Yaw -", position: [0.055, -0.105, 0.004] },
    { id: "label-yaw-plus", label: "Yaw +", position: [0.165, -0.105, 0.004] }
  ],
  link: [
    { id: "link-type-toggle", label: "Tipo", position: [-0.165, 0.005, 0.004] },
    { id: "link-tour-prev", label: "Tour -", position: [-0.055, 0.005, 0.004] },
    { id: "link-tour-next", label: "Tour +", position: [0.055, 0.005, 0.004] },
    { id: "link-use-current-scene", label: "Atual", position: [0.165, 0.005, 0.004] },

    { id: "link-scene-prev", label: "Cena -", position: [-0.165, -0.05, 0.004] },
    { id: "link-scene-next", label: "Cena +", position: [-0.055, -0.05, 0.004] },
    { id: "hotspot-prev", label: "Hot -", position: [0.055, -0.05, 0.004] },
    { id: "hotspot-next", label: "Hot +", position: [0.165, -0.05, 0.004] },

    { id: "toggle-marker-visible", label: "Marker", position: [-0.165, -0.105, 0.004], kind: "toggle" },
    { id: "toggle-hotspot-billboard", label: "BB Hot", position: [-0.055, -0.105, 0.004], kind: "toggle" },
    { id: "toggle-label-visible", label: "Lbl On", position: [0.055, -0.105, 0.004], kind: "toggle" },
    { id: "toggle-label-billboard", label: "BB Lbl", position: [0.165, -0.105, 0.004], kind: "toggle" }
  ]
};

const LIST_ACTIONS = [
  { id: "hotspot-list-prev", label: "Lista -", position: [-0.165, -0.16, 0.004] },
  { id: "hotspot-list-next", label: "Lista +", position: [-0.055, -0.16, 0.004] },
  { id: "hotspot-list-close", label: "Fechar Lista", position: [0.055, -0.16, 0.004] },
  { id: "delete-hotspot", label: "Excluir", position: [0.165, -0.16, 0.004], kind: "danger" },
  { id: "hotspot-list-item-0", label: "Slot 1", position: [-0.165, -0.215, 0.004] },
  { id: "hotspot-list-item-1", label: "-", position: [-0.055, -0.215, 0.004] },
  { id: "hotspot-list-item-2", label: "-", position: [0.055, -0.215, 0.004] },
  { id: "hotspot-list-item-3", label: "-", position: [0.165, -0.215, 0.004] }
];

const CREATE_SCENE_LIST_ACTIONS = [
  { id: "create-scene-list-prev", label: "Destino -", position: [-0.165, -0.16, 0.004] },
  { id: "create-scene-list-next", label: "Destino +", position: [-0.055, -0.16, 0.004] },
  { id: "create-scene-list-close", label: "Fechar Lista", position: [0.055, -0.16, 0.004] },
  { id: "create-scene-list-confirm", label: "Criar Link", position: [0.165, -0.16, 0.004] },
  { id: "create-scene-list-item-0", label: "Slot 1", position: [-0.165, -0.215, 0.004] },
  { id: "create-scene-list-item-1", label: "-", position: [-0.055, -0.215, 0.004] },
  { id: "create-scene-list-item-2", label: "-", position: [0.055, -0.215, 0.004] },
  { id: "create-scene-list-item-3", label: "-", position: [0.165, -0.215, 0.004] }
];

const DEFAULT_DESCRIPTION = {
  title: "Editor VR por maos",
  summary: "Abra a palma esquerda para ver o menu contextual do editor.",
  usage: "Use pinch curto na mao direita para selecionar e pinch continuo para manipular no modo atual."
};

const ACTION_DESCRIPTIONS = {
  "mode-move": {
    title: "Modo mover",
    summary: "Ativa o modo de posicionamento do hotspot com a reticula da mao direita.",
    usage: "Selecione um hotspot com pinch curto e segure a pinch para arrastar no espaco."
  },
  "mode-rotate": {
    title: "Modo girar",
    summary: "Ativa o modo de rotacao do hotspot selecionado.",
    usage: "Segure a pinch continua com a mao direita para girar yaw e pitch; use os botoes do menu para ajuste fino."
  },
  "mode-label": {
    title: "Modo label",
    summary: "Mostra os controles de visibilidade, billboard e offsets da label.",
    usage: "Toque nos botoes com a ponta do dedo indicador ou use a reticula para ajustar a label sem digitar."
  },
  "mode-link": {
    title: "Modo link",
    summary: "Mostra os controles de tipo do hotspot e de destino por tour e cena.",
    usage: "Use Tour +/- e Cena +/- para escolher o destino do hotspot selecionado."
  },
  "save-draft": {
    title: "Salvar draft",
    summary: "Marca o draft atual como salvo dentro do fluxo do editor.",
    usage: "Use quando quiser confirmar o estado atual antes de continuar editando ou sair do editor VR."
  },
  "undo-draft": {
    title: "Desfazer",
    summary: "Restaura o ultimo snapshot salvo no historico do editor.",
    usage: "Use para voltar a ultima mudanca de posicao, rotacao ou configuracao de hotspot."
  },
  "close-editor": {
    title: "Fechar editor VR",
    summary: "Fecha a interface imersiva do editor e volta ao tour normal.",
    usage: "Abra novamente pela mao esquerda quando quiser retomar a edicao."
  },
  "scene-prev": {
    title: "Cena anterior",
    summary: "Muda a cena ativa do draft para a anterior.",
    usage: "Use para navegar entre cenas do tour sem sair do VR."
  },
  "scene-next": {
    title: "Proxima cena",
    summary: "Muda a cena ativa do draft para a seguinte.",
    usage: "Use para revisar hotspots de outras cenas diretamente no ambiente imersivo."
  },
  "hotspot-prev": {
    title: "Hotspot anterior",
    summary: "Seleciona o hotspot anterior da cena ativa.",
    usage: "Use como atalho rapido quando nao quiser selecionar pelo pinch."
  },
  "hotspot-next": {
    title: "Proximo hotspot",
    summary: "Seleciona o proximo hotspot da cena ativa.",
    usage: "Bom para percorrer hotspots em sequencia durante a revisao."
  },
  "pick-hotspot": {
    title: "Escolher hotspot",
    summary: "Ativa o modo de selecao direta para escolher um hotspot visivel no panorama.",
    usage: "Aponte para o hotspot desejado e confirme com pinch ou trigger."
  },
  "create-link-hotspot": {
    title: "Criar hotspot de navegacao",
    summary: "Abre a lista de cenas destino antes de entrar no modo de criacao do link.",
    usage: "Escolha a cena destino na lista e depois confirme para apontar o local onde o novo hotspot sera criado."
  },
  "create-note-hotspot": {
    title: "Criar anotacao",
    summary: "Entra no modo de criacao de um hotspot de anotacao no ponto apontado.",
    usage: "Aponte para o panorama e confirme para criar a anotacao com configuracoes padrao."
  },
  "delete-hotspot": {
    title: "Excluir hotspot",
    summary: "Remove o hotspot atualmente selecionado do draft da cena ativa.",
    usage: "Use quando tiver certeza de que o hotspot nao sera mais utilizado."
  },
  "hotspot-list-prev": describeAction("Lista anterior", "Mostra o grupo anterior de hotspots da cena atual.", "Use quando a cena tiver muitos hotspots na lista."),
  "hotspot-list-next": describeAction("Proxima lista", "Mostra o proximo grupo de hotspots da cena atual.", "Use para navegar pelas paginas da lista de hotspots."),
  "hotspot-list-close": describeAction("Fechar lista", "Fecha a lista de hotspots e volta aos controles normais do modo atual.", "Use quando ja tiver escolhido o hotspot desejado."),
  "create-scene-list-prev": describeAction("Lista anterior de destinos", "Mostra o grupo anterior de cenas disponiveis como destino do novo link.", "Use quando houver muitas cenas no tour atual."),
  "create-scene-list-next": describeAction("Proxima lista de destinos", "Mostra o proximo grupo de cenas disponiveis para o novo hotspot.", "Use para navegar entre as paginas da lista de destinos."),
  "create-scene-list-close": describeAction("Fechar lista de destinos", "Fecha a escolha de destino sem iniciar a criacao do hotspot.", "Use quando quiser cancelar a criacao do link por enquanto."),
  "create-scene-list-confirm": describeAction("Criar link para destino", "Entra no modo de posicionamento do novo hotspot usando a cena destacada como destino.", "Primeiro escolha a cena na lista; depois acione este botao para apontar o local do novo hotspot."),
  "create-scene-list-item-0": describeAction("Destino do novo link", "Seleciona uma das cenas da lista como destino do hotspot que sera criado.", "Toque ou aponte para o item desejado antes de iniciar a criacao."),
  "create-scene-list-item-1": describeAction("Destino do novo link", "Seleciona uma das cenas da lista como destino do hotspot que sera criado.", "Toque ou aponte para o item desejado antes de iniciar a criacao."),
  "create-scene-list-item-2": describeAction("Destino do novo link", "Seleciona uma das cenas da lista como destino do hotspot que sera criado.", "Toque ou aponte para o item desejado antes de iniciar a criacao."),
  "create-scene-list-item-3": describeAction("Destino do novo link", "Seleciona uma das cenas da lista como destino do hotspot que sera criado.", "Toque ou aponte para o item desejado antes de iniciar a criacao."),
  "move-x-minus": describeAction("Mover X -", "Desloca o hotspot para o lado negativo do eixo X.", "Acione varias vezes para refinamento fino lateral."),
  "move-x-plus": describeAction("Mover X +", "Desloca o hotspot para o lado positivo do eixo X.", "Combine com o arraste por pinch para ajustes precisos."),
  "move-y-minus": describeAction("Mover Y -", "Desloca o hotspot para baixo.", "Use para acertar a altura sem precisar reposicionar do zero."),
  "move-y-plus": describeAction("Mover Y +", "Desloca o hotspot para cima.", "Acione para subir o hotspot em pequenos passos."),
  "move-z-minus": describeAction("Mover Z -", "Puxa o hotspot no eixo Z local da cena.", "Use para ajustar profundidade no referencial do tour."),
  "move-z-plus": describeAction("Mover Z +", "Empurra o hotspot no eixo Z local da cena.", "Ideal para refinamento fino depois do arraste pela reticula."),
  "move-ref-minus": describeAction("Ref -", "Reduz a profundidade de referencia do hotspot.", "Use para aproximar a base da manipulacao pela reticula."),
  "move-ref-plus": describeAction("Ref +", "Aumenta a profundidade de referencia do hotspot.", "Use para levar a base da manipulacao mais para longe."),
  "rotate-yaw-minus": describeAction("Yaw -", "Gira o hotspot negativamente no eixo yaw.", "Use para ajuste fino depois da rotacao por pinch continuo."),
  "rotate-yaw-plus": describeAction("Yaw +", "Gira o hotspot positivamente no eixo yaw.", "Bom para orientar marker e label com precisao."),
  "rotate-pitch-minus": describeAction("Pitch -", "Inclina o hotspot negativamente no pitch.", "Use para ajustar a inclinacao vertical do hotspot."),
  "rotate-pitch-plus": describeAction("Pitch +", "Inclina o hotspot positivamente no pitch.", "Acione em pequenos passos para nao exagerar a inclinacao."),
  "rotate-roll-minus": describeAction("Roll -", "Gira o hotspot negativamente no roll.", "Use quando precisar torcer marker e label no proprio eixo."),
  "rotate-roll-plus": describeAction("Roll +", "Gira o hotspot positivamente no roll.", "Bom para alinhamentos finos quando a label nao fecha visualmente."),
  "toggle-marker-visible": describeAction("Marker", "Liga ou desliga a visibilidade do marcador do hotspot.", "Use para manter o hotspot ativo mesmo sem mostrar o marker."),
  "toggle-hotspot-billboard": describeAction("Billboard do hotspot", "Alterna se o hotspot acompanha o usuario ou preserva rotacao fixa.", "Teste ligado e desligado para ver o comportamento mais adequado no panorama."),
  "toggle-label-visible": describeAction("Label visivel", "Liga ou desliga a label vinculada ao hotspot.", "Use para mostrar ou ocultar o texto sem apagar a configuracao."),
  "toggle-label-billboard": describeAction("Billboard da label", "Alterna se a label segue o usuario ou fica com rotacao fixa.", "Bom para equilibrar legibilidade e alinhamento visual."),
  "label-scale-minus": describeAction("Escala da label -", "Reduz a escala da label.", "Acione para deixar a label mais compacta no ambiente VR."),
  "label-scale-plus": describeAction("Escala da label +", "Aumenta a escala da label.", "Use para melhorar a leitura quando o texto parecer pequeno demais."),
  "label-offset-x-minus": describeAction("Offset X -", "Move a label no eixo X local do hotspot.", "Use para afastar a label para a esquerda do marker."),
  "label-offset-x-plus": describeAction("Offset X +", "Move a label no eixo X local do hotspot.", "Use para deslocar a label para a direita."),
  "label-offset-y-minus": describeAction("Offset Y -", "Move a label para baixo em relacao ao hotspot.", "Ajuda a corrigir sobreposicao entre marker e texto."),
  "label-offset-y-plus": describeAction("Offset Y +", "Move a label para cima em relacao ao hotspot.", "Use para abrir mais espaco visual acima do marker."),
  "label-offset-z-minus": describeAction("Offset Z -", "Move a label para tras no eixo local Z.", "Bom para pequenos ajustes de profundidade da label."),
  "label-offset-z-plus": describeAction("Offset Z +", "Move a label para frente no eixo local Z.", "Use para trazer a label um pouco mais para frente."),
  "label-yaw-minus": describeAction("Yaw da label -", "Diminui o yaw da label.", "Use para ajustar a orientacao da label sem mexer no hotspot."),
  "label-yaw-plus": describeAction("Yaw da label +", "Aumenta o yaw da label.", "Acione para girar a label no proprio referencial."),
  "link-type-toggle": {
    title: "Tipo do hotspot",
    summary: "Alterna entre hotspot de navegacao e anotacao.",
    usage: "Use quando quiser converter o hotspot sem recria-lo."
  },
  "link-tour-prev": {
    title: "Tour destino anterior",
    summary: "Troca o tour de destino do hotspot para o tour anterior no master.json.",
    usage: "Ao mudar o tour, a cena destino e atualizada para uma opcao valida desse tour."
  },
  "link-tour-next": {
    title: "Proximo tour destino",
    summary: "Troca o tour de destino do hotspot para o proximo tour.",
    usage: "Use para montar links entre tours sem sair do editor VR."
  },
  "link-scene-prev": {
    title: "Cena destino anterior",
    summary: "Seleciona a cena anterior dentro do tour de destino atual.",
    usage: "Acione ate encontrar a cena certa para o link."
  },
  "link-scene-next": {
    title: "Proxima cena destino",
    summary: "Seleciona a proxima cena dentro do tour de destino atual.",
    usage: "Use para percorrer as cenas do tour escolhido."
  },
  "link-use-current-scene": {
    title: "Usar cena atual",
    summary: "Aponta o hotspot para a cena atual do tour aberto no editor.",
    usage: "Use como atalho para definir rapidamente o link para a cena que esta visivel agora."
  }
};

export class VRHandEditorMenu {
  constructor({ root, context }) {
    this.root = root;
    this.context = context;
    this.group = new THREE.Group();
    this.group.name = "wpa360-vr-hand-editor-menu";
    this.group.visible = false;
    this.root.add(this.group);

    this.background = new THREE.Mesh(
      BACKGROUND_GEOMETRY,
      new THREE.MeshBasicMaterial({
        color: new THREE.Color("#09161b"),
        transparent: true,
        opacity: 0.96,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false
      })
    );
    this.background.renderOrder = 16;
    this.group.add(this.background);

    this.infoTexture = createCanvasTexture(1024, 300);
    this.infoMaterial = new THREE.MeshBasicMaterial({
      map: this.infoTexture,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false
    });
    this.infoPanel = new THREE.Mesh(INFO_GEOMETRY, this.infoMaterial);
    this.infoPanel.position.set(0, 0.185, 0.004);
    this.infoPanel.renderOrder = 17;
    this.group.add(this.infoPanel);

    this.descriptionTexture = createCanvasTexture(1024, 260);
    this.descriptionMaterial = new THREE.MeshBasicMaterial({
      map: this.descriptionTexture,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false
    });
    this.descriptionPanel = new THREE.Mesh(DESCRIPTION_GEOMETRY, this.descriptionMaterial);
    this.descriptionPanel.position.set(0, -0.275, 0.004);
    this.descriptionPanel.renderOrder = 17;
    this.group.add(this.descriptionPanel);

    this.temp = {
      wrist: new THREE.Vector3(),
      indexMeta: new THREE.Vector3(),
      pinkyMeta: new THREE.Vector3(),
      middleMeta: new THREE.Vector3(),
      thumbTip: new THREE.Vector3(),
      indexTip: new THREE.Vector3(),
      middleTip: new THREE.Vector3(),
      ringTip: new THREE.Vector3(),
      pinkyTip: new THREE.Vector3(),
      palmCenter: new THREE.Vector3(),
      palmAcross: new THREE.Vector3(),
      fingerAxis: new THREE.Vector3(),
      fingerDelta: new THREE.Vector3(),
      palmNormal: new THREE.Vector3(),
      toHead: new THREE.Vector3(),
      averageTips: new THREE.Vector3(),
      targetPosition: new THREE.Vector3(),
      xAxis: new THREE.Vector3(),
      yAxis: new THREE.Vector3(),
      zAxis: new THREE.Vector3(),
      targetQuaternion: new THREE.Quaternion(),
      rotationMatrix: new THREE.Matrix4(),
      localTouchPoint: new THREE.Vector3()
    };

    this.requestedOpen = false;
    this.visibilityScore = 0;
    this.highlightedActionId = null;
    this.hotspotPickerOpen = false;
    this.hotspotPickerPage = 0;
    this.createScenePickerOpen = false;
    this.createScenePickerPage = 0;
    this.lastInfoSignature = null;
    this.lastDescriptionSignature = null;
    this.entries = new Map();
    this.buttonEntries = [];

    this.createEntries();
    this.syncEntryVisibility();
    this.refreshButtonVisuals();
    this.redrawInfo();
    this.redrawDescription();
  }

  createEntries() {
    for (const definition of [...MODE_ACTIONS, ...GLOBAL_ACTIONS, ...Object.values(PAGE_ACTIONS).flat(), ...LIST_ACTIONS, ...CREATE_SCENE_LIST_ACTIONS]) {
      const entry = createButtonEntry(definition);
      entry.mesh.position.set(...definition.position);
      entry.mesh.userData.handEditorActionId = definition.id;
      this.entries.set(definition.id, entry);
      this.buttonEntries.push(entry);
      this.group.add(entry.mesh);
    }
  }

  isAvailable() {
    return Boolean(this.context.isVrHandEditorAvailable?.());
  }

  isOpen() {
    return this.requestedOpen && this.isAvailable();
  }

  open() {
    if (!this.isAvailable()) {
      return false;
    }
    this.requestedOpen = true;
    return true;
  }

  close() {
    this.requestedOpen = false;
    this.group.visible = false;
    this.setHighlightedAction(null);
    return true;
  }

  toggle() {
    if (this.isOpen()) {
      this.close();
      return false;
    }
    this.open();
    return true;
  }

  update(leftHandState, headPosition) {
    this.refreshListEntries();
    this.syncEntryVisibility();
    this.refreshButtonVisuals();
    this.redrawInfo();
    this.redrawDescription();

    const shouldShowPose = this.isOpen() && leftHandState
      ? this.computePose(leftHandState, headPosition)
      : null;

    const targetScore = shouldShowPose ? 1 : 0;
    this.visibilityScore = THREE.MathUtils.clamp(
      THREE.MathUtils.lerp(
        this.visibilityScore,
        targetScore,
        targetScore > this.visibilityScore ? 0.22 : 0.12
      ),
      0,
      1
    );

    if (shouldShowPose && this.visibilityScore > 0.08) {
      if (!this.group.visible) {
        this.group.position.copy(this.temp.targetPosition);
        this.group.quaternion.copy(this.temp.targetQuaternion);
      } else {
        this.group.position.lerp(this.temp.targetPosition, 0.28);
        this.group.quaternion.slerp(this.temp.targetQuaternion, 0.28);
      }
    }

    this.group.visible = this.visibilityScore > 0.42;
    if (!this.group.visible) {
      this.setHighlightedAction(null);
    }
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
      if (current.userData?.handEditorActionId) {
        return current.userData.handEditorActionId;
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

    return bestEntry?.action?.id ?? null;
  }

  setHighlightedAction(actionId) {
    if (this.highlightedActionId === actionId) {
      return;
    }

    this.highlightedActionId = actionId ?? null;
    this.refreshButtonVisuals();
    this.redrawDescription();
  }

  executeAction(actionId) {
    if (!actionId) {
      return false;
    }

    if (actionId === "close-editor") {
      this.context.closeVrHandEditor?.();
      return true;
    }

    if (actionId === "pick-hotspot") {
      this.createScenePickerOpen = false;
      this.hotspotPickerOpen = true;
      this.hotspotPickerPage = 0;
      this.refreshListEntries();
      return true;
    }

    if (actionId === "hotspot-list-close") {
      this.hotspotPickerOpen = false;
      this.refreshListEntries();
      return true;
    }

    if (actionId === "hotspot-list-prev") {
      this.shiftHotspotPickerPage(-1);
      return true;
    }

    if (actionId === "hotspot-list-next") {
      this.shiftHotspotPickerPage(1);
      return true;
    }

    if (actionId.startsWith("hotspot-list-item-")) {
      return this.selectHotspotFromListAction(actionId);
    }

    if (actionId === "create-link-hotspot") {
      this.hotspotPickerOpen = false;
      this.createScenePickerOpen = true;
      this.createScenePickerPage = 0;
      this.refreshListEntries();
      return true;
    }

    if (actionId === "create-scene-list-close") {
      this.createScenePickerOpen = false;
      this.refreshListEntries();
      return true;
    }

    if (actionId === "create-scene-list-prev") {
      this.shiftCreateScenePickerPage(-1);
      return true;
    }

    if (actionId === "create-scene-list-next") {
      this.shiftCreateScenePickerPage(1);
      return true;
    }

    if (actionId === "create-scene-list-confirm") {
      const didStart = this.context.requestCreateHotspotMode?.("scene_link") ?? false;
      if (didStart) {
        this.createScenePickerOpen = false;
        this.refreshListEntries();
      }
      return didStart;
    }

    if (actionId.startsWith("create-scene-list-item-")) {
      return this.selectCreateSceneFromListAction(actionId);
    }

    if (actionId.startsWith("mode-")) {
      return this.context.setVrHandEditorMode?.(actionId.slice(5)) ?? false;
    }

    return this.context.executeVrHandEditorAction?.(actionId) ?? false;
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
    this.infoPanel.removeFromParent();
    this.descriptionPanel.removeFromParent();
    this.background.removeFromParent();
    this.group.removeFromParent();
  }

  syncEntryVisibility() {
    const activeMode = normalizeMode(this.context.getVrHandEditorMode?.());
    const activeIds = new Set([
      ...MODE_ACTIONS.map((entry) => entry.id),
      ...GLOBAL_ACTIONS.map((entry) => entry.id)
    ]);

    if (!this.hotspotPickerOpen && !this.createScenePickerOpen) {
      for (const entry of PAGE_ACTIONS[activeMode] ?? []) {
        activeIds.add(entry.id);
      }
    }

    if (this.hotspotPickerOpen) {
      for (const entry of LIST_ACTIONS) {
        activeIds.add(entry.id);
      }
    }

    if (this.createScenePickerOpen) {
      for (const entry of CREATE_SCENE_LIST_ACTIONS) {
        activeIds.add(entry.id);
      }
    }

    for (const entry of this.buttonEntries) {
      entry.mesh.visible = activeIds.has(entry.action.id);
    }
  }

  refreshButtonVisuals() {
    const activeMode = normalizeMode(this.context.getVrHandEditorMode?.());

    for (const entry of this.buttonEntries) {
      const isHighlighted = entry.action.id === this.highlightedActionId;
      const isSelectedMode = entry.action.kind === "mode" && entry.action.id === `mode-${activeMode}`;
      const isToggleOn = entry.action.kind === "toggle" && Boolean(this.context.getVrHandEditorActionState?.(entry.action.id));

      entry.mesh.material.map = isHighlighted || isSelectedMode || isToggleOn
        ? entry.activeTexture
        : entry.idleTexture;
      entry.mesh.material.needsUpdate = true;
    }
  }

  redrawInfo() {
    const summary = this.context.getVrHandEditorSummary?.() ?? {};
    const createTarget = this.context.getVrCreateTargetSummary?.() ?? {};
    const signature = JSON.stringify({
      ...summary,
      hotspotPickerOpen: this.hotspotPickerOpen,
      hotspotPickerPage: this.hotspotPickerPage,
      createScenePickerOpen: this.createScenePickerOpen,
      createScenePickerPage: this.createScenePickerPage,
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
    ctx.fillStyle = "rgba(6, 18, 23, 0.96)";
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
    ctx.stroke();

    ctx.fillStyle = "#f0a85d";
    ctx.font = '700 38px "Segoe UI", sans-serif';
    ctx.fillText("Hand Editor VR", 28, 46);

    ctx.fillStyle = "#f6f0e6";
    ctx.font = '600 24px "Segoe UI", sans-serif';
    const selectedLine = summary.selectedHotspotId
      ? `Hotspot: ${summary.selectedHotspotId} (${summary.selectedHotspotLabel ?? summary.selectedHotspotId})`
      : "Hotspot: selecione com pinch curto na mao direita";
    const sceneLine = `Cena ativa: ${summary.selectedSceneTitle ?? "-"}`;
    const linkLine = `Destino: ${summary.targetTourTitle ?? "-"} / ${summary.targetSceneTitle ?? "-"}`;
    const statusLine = `Modo: ${getModeLabel(summary.mode)} | Draft: ${summary.dirty ? "editado" : "sincronizado"}`;
    const hotspotList = this.context.getVrHotspotListOptions?.() ?? [];
    const createSceneList = this.context.getVrCreateSceneListOptions?.() ?? [];
    const pickerHint = this.hotspotPickerOpen
      ? `Lista aberta: ${hotspotList.length} hotspot(s) nesta cena.`
      : this.createScenePickerOpen
        ? `Destino do novo link: ${createTarget.sceneTitle ?? "-"} | ${createSceneList.length} cena(s) disponivel(is).`
      : String(summary.hint ?? "Pinch curto seleciona. Pinch continuo manipula no modo atual.");
    const hintLine = pickerHint;

    fillWrappedText(ctx, selectedLine, 28, 86, width - 56, 28);
    fillWrappedText(ctx, sceneLine, 28, 118, width - 56, 28);
    fillWrappedText(ctx, linkLine, 28, 150, width - 56, 28);
    fillWrappedText(ctx, statusLine, 28, 182, width - 56, 28);
    fillWrappedText(ctx, hintLine, 28, 218, width - 56, 28);

    this.infoTexture.needsUpdate = true;
  }

  redrawDescription() {
    const activeMode = normalizeMode(this.context.getVrHandEditorMode?.());
    const description = ACTION_DESCRIPTIONS[this.highlightedActionId] ?? getDefaultDescription(activeMode);
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
    ctx.font = '700 32px "Segoe UI", sans-serif';
    ctx.fillText(description.title, 28, 42);

    ctx.fillStyle = "#f6f0e6";
    ctx.font = '600 24px "Segoe UI", sans-serif';
    fillWrappedText(ctx, `O que faz: ${description.summary}`, 28, 82, width - 56, 28);
    fillWrappedText(ctx, `Como usar: ${description.usage}`, 28, 148, width - 56, 28);

    this.descriptionTexture.needsUpdate = true;
  }

  refreshListEntries() {
    const options = this.context.getVrHotspotListOptions?.() ?? [];
    const startIndex = this.hotspotPickerPage * 4;
    const visibleOptions = options.slice(startIndex, startIndex + 4);

    for (let index = 0; index < 4; index += 1) {
      const actionId = `hotspot-list-item-${index}`;
      const entry = this.entries.get(actionId);
      if (!entry) {
        continue;
      }

      const option = visibleOptions[index] ?? null;
      entry.action.optionHotspotId = option?.id ?? null;
      const nextLabel = option
        ? truncateLabel(option.selected ? `* ${option.label}` : option.label, 10)
        : "-";
      if (entry.action.label === nextLabel) {
        continue;
      }
      entry.action.label = nextLabel;
      entry.idleTexture.dispose();
      entry.activeTexture.dispose();
      entry.idleTexture = createButtonTexture(nextLabel, false, entry.action.kind);
      entry.activeTexture = createButtonTexture(nextLabel, true, entry.action.kind);
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
      entry.action.optionSceneId = option?.id ?? null;
      const nextLabel = option
        ? truncateLabel(option.selected ? `* ${option.label}` : option.label, 10)
        : "-";
      if (entry.action.label === nextLabel) {
        continue;
      }
      entry.action.label = nextLabel;
      entry.idleTexture.dispose();
      entry.activeTexture.dispose();
      entry.idleTexture = createButtonTexture(nextLabel, false, entry.action.kind);
      entry.activeTexture = createButtonTexture(nextLabel, true, entry.action.kind);
      entry.mesh.material.map = entry.idleTexture;
      entry.mesh.material.needsUpdate = true;
    }
  }

  shiftHotspotPickerPage(step) {
    const total = this.context.getVrHotspotListOptions?.().length ?? 0;
    const maxPage = Math.max(0, Math.ceil(total / 4) - 1);
    this.hotspotPickerPage = Math.min(maxPage, Math.max(0, this.hotspotPickerPage + step));
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
    }
    return didSelect;
  }

  shiftCreateScenePickerPage(step) {
    const total = this.context.getVrCreateSceneListOptions?.().length ?? 0;
    const maxPage = Math.max(0, Math.ceil(total / 4) - 1);
    this.createScenePickerPage = Math.min(maxPage, Math.max(0, this.createScenePickerPage + step));
    this.refreshListEntries();
  }

  selectCreateSceneFromListAction(actionId) {
    const entry = this.entries.get(actionId);
    const sceneId = entry?.action?.optionSceneId ?? null;
    if (!sceneId) {
      return false;
    }

    return this.context.selectVrCreateSceneById?.(sceneId) ?? false;
  }

  computePose(leftHandState, headPosition) {
    const wrist = copyJointPosition(leftHandState.hand, "wrist", this.temp.wrist);
    const indexMeta = copyJointPosition(leftHandState.hand, "index-finger-metacarpal", this.temp.indexMeta);
    const pinkyMeta = copyJointPosition(leftHandState.hand, "pinky-finger-metacarpal", this.temp.pinkyMeta);
    const middleMeta = copyJointPosition(leftHandState.hand, "middle-finger-metacarpal", this.temp.middleMeta);
    const thumbTip = copyJointPosition(leftHandState.hand, "thumb-tip", this.temp.thumbTip);
    const indexTip = copyJointPosition(leftHandState.hand, "index-finger-tip", this.temp.indexTip);
    const middleTip = copyJointPosition(leftHandState.hand, "middle-finger-tip", this.temp.middleTip);
    const ringTip = copyJointPosition(leftHandState.hand, "ring-finger-tip", this.temp.ringTip);
    const pinkyTip = copyJointPosition(leftHandState.hand, "pinky-finger-tip", this.temp.pinkyTip);

    if (!wrist || !indexMeta || !pinkyMeta || !middleMeta || !thumbTip || !indexTip || !middleTip || !ringTip || !pinkyTip) {
      return null;
    }

    const palmCenter = this.temp.palmCenter
      .copy(wrist)
      .add(indexMeta)
      .add(pinkyMeta)
      .add(middleMeta)
      .multiplyScalar(0.25);

    const palmAcross = this.temp.palmAcross.copy(indexMeta).sub(pinkyMeta);
    const averageTips = this.temp.averageTips
      .copy(indexTip)
      .add(middleTip)
      .add(ringTip)
      .add(pinkyTip)
      .multiplyScalar(0.25);

    const fingerAxis = this.temp.fingerAxis.copy(averageTips).sub(wrist);
    if (palmAcross.lengthSq() < 0.000001 || fingerAxis.lengthSq() < 0.000001) {
      return null;
    }

    palmAcross.normalize();
    fingerAxis.normalize();

    const palmNormal = this.temp.palmNormal.copy(fingerAxis).cross(palmAcross);
    if (palmNormal.lengthSq() < 0.000001) {
      return null;
    }
    palmNormal.normalize();

    const toHead = this.temp.toHead.copy(headPosition).sub(palmCenter).normalize();
    const palmFacingScore = palmNormal.dot(toHead);

    let openFingers = 0;
    if (this.temp.fingerDelta.copy(indexTip).sub(wrist).dot(fingerAxis) > 0.065) {
      openFingers += 1;
    }
    if (this.temp.fingerDelta.copy(middleTip).sub(wrist).dot(fingerAxis) > 0.065) {
      openFingers += 1;
    }
    if (this.temp.fingerDelta.copy(ringTip).sub(wrist).dot(fingerAxis) > 0.065) {
      openFingers += 1;
    }
    if (this.temp.fingerDelta.copy(pinkyTip).sub(wrist).dot(fingerAxis) > 0.065) {
      openFingers += 1;
    }

    const thumbIndexDistance = thumbTip.distanceTo(indexTip);
    const shouldShow = palmFacingScore > 0.42 && openFingers >= 3 && thumbIndexDistance > 0.045;

    const yAxis = this.temp.yAxis.copy(fingerAxis);
    const xAxis = this.temp.xAxis
      .copy(palmAcross)
      .addScaledVector(yAxis, -palmAcross.dot(yAxis));

    if (xAxis.lengthSq() < 0.000001) {
      return null;
    }
    xAxis.normalize();

    const zAxis = this.temp.zAxis.copy(xAxis).cross(yAxis);
    if (zAxis.lengthSq() < 0.000001) {
      return null;
    }
    zAxis.normalize();

    if (zAxis.dot(toHead) < 0) {
      xAxis.negate();
      zAxis.negate();
    }

    this.temp.targetPosition
      .copy(palmCenter)
      .addScaledVector(palmNormal, 0.062)
      .addScaledVector(yAxis, 0.014);

    this.temp.rotationMatrix.makeBasis(xAxis, yAxis, zAxis);
    this.temp.targetQuaternion.setFromRotationMatrix(this.temp.rotationMatrix);

    return shouldShow;
  }
}

function normalizeMode(value) {
  return value === "rotate" || value === "label" || value === "link"
    ? value
    : "move";
}

function getModeLabel(mode) {
  switch (normalizeMode(mode)) {
    case "rotate":
      return "rotacao";
    case "label":
      return "label";
    case "link":
      return "link";
    default:
      return "movimento";
  }
}

function getDefaultDescription(mode) {
  switch (normalizeMode(mode)) {
    case "rotate":
      return {
        title: "Rotacao por pinch",
        summary: "Pinch continuo na mao direita gira yaw e pitch do hotspot selecionado.",
        usage: "Use os botoes de roll, yaw e pitch para refinamento enquanto a palma esquerda estiver aberta."
      };
    case "label":
      return {
        title: "Ajustes da label",
        summary: "Este modo concentra visibilidade, billboard, offsets e yaw da label.",
        usage: "Toque nos botoes com a ponta do dedo indicador ou mire com a reticula para editar sem teclado."
      };
    case "link":
      return {
        title: "Destino do hotspot",
        summary: "Escolha tour e cena de destino do hotspot no proprio ambiente VR.",
        usage: "Combine Tour +/- e Cena +/- para definir o link, sem precisar sair do modo imersivo."
      };
    default:
      return DEFAULT_DESCRIPTION;
  }
}

function describeAction(title, summary, usage) {
  return { title, summary, usage };
}

function truncateLabel(value, maxLength = 12) {
  const text = String(value ?? "").trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(1, maxLength - 1))}…`;
}

function createButtonEntry(action) {
  const idleTexture = createButtonTexture(action.label, false, action.kind);
  const activeTexture = createButtonTexture(action.label, true, action.kind);
  const material = new THREE.MeshBasicMaterial({
    map: idleTexture,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(BUTTON_GEOMETRY, material);
  mesh.renderOrder = 18;

  return {
    action,
    idleTexture,
    activeTexture,
    mesh
  };
}

function createButtonTexture(label, active, kind = "default") {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawRoundedCard(ctx, 4, 4, canvas.width - 8, canvas.height - 8, 58);

  if (kind === "danger") {
    ctx.fillStyle = active ? "#ffd8cc" : "rgba(77, 22, 15, 0.92)";
    ctx.fill();
    ctx.lineWidth = active ? 8 : 5;
    ctx.strokeStyle = active ? "#ff9c84" : "rgba(255, 190, 176, 0.32)";
    ctx.stroke();
    ctx.fillStyle = active ? "#3c110b" : "#ffd6ca";
  } else if (kind === "mode" || kind === "toggle") {
    ctx.fillStyle = active ? "#fff2c4" : "rgba(10, 28, 34, 0.92)";
    ctx.fill();
    ctx.lineWidth = active ? 8 : 5;
    ctx.strokeStyle = active ? "#f0a85d" : "rgba(255, 255, 255, 0.2)";
    ctx.stroke();
    ctx.fillStyle = active ? "#0b2b33" : "#f6f0e6";
  } else {
    ctx.fillStyle = active ? "#ffe7b8" : "rgba(11, 31, 38, 0.9)";
    ctx.fill();
    ctx.lineWidth = active ? 8 : 5;
    ctx.strokeStyle = active ? "#f0a85d" : "rgba(255, 255, 255, 0.18)";
    ctx.stroke();
    ctx.fillStyle = active ? "#0b2b33" : "#f6f0e6";
  }

  ctx.font = '700 40px "Segoe UI", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createCanvasTexture(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function copyJointPosition(hand, jointName, target) {
  const joint = hand?.joints?.[jointName];
  if (!joint?.visible) {
    return null;
  }
  return joint.getWorldPosition(target);
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
