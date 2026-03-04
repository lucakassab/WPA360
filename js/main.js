// js/main.js
import App from "./App.js";
import PlatformManager from "./PlatformManager.js";
import { registerStereoTopBottom } from "./xr/StereoTopBottom.js";
import { registerFaceCamera } from "./tour/FaceCamera.js";
import { registerRenderOnTop } from "./tour/RenderOnTop.js";
import { registerVrDebugConsole } from "./xr/VrDebugConsole.js";
import { registerVrWidget } from "./xr/vr_widget.js";
import { initPWA } from "./pwa/pwa.js";

window.addEventListener("DOMContentLoaded", async () => {
  const DEBUG_HOTSPOTS = true;

  // flag
  const VR_DEBUG = false; // muda pra false quando quiser

  registerStereoTopBottom(window.AFRAME);
  registerFaceCamera(window.AFRAME);
  registerRenderOnTop(window.AFRAME);

  // ✅ registra componentes VR
  registerVrDebugConsole(window.AFRAME);
  registerVrWidget(window.AFRAME);

  const app = new App({
    sceneEl: document.querySelector("#scene"),
    panoEl: document.querySelector("#pano"),
    cameraRigEl: document.querySelector("#cameraRig"),
    cameraEl: document.querySelector("#camera"),
    cursorEl: document.querySelector("#cursor"),
    hotspotsEl: document.querySelector("#hotspots"),
    leftHandEl: document.querySelector("#leftHand"),
    rightHandEl: document.querySelector("#rightHand"),
    ui: {
      btnTopMenu: document.querySelector("#btnTopMenu"),
      topMenuBar: document.querySelector("#topMenuBar"),
      titleEl: document.querySelector("#sceneTitle"),

      topTourSelect: document.querySelector("#topTourSelect"),
      topSceneSelect: document.querySelector("#topSceneSelect"),
      linkToursToggle: document.querySelector("#linkToursToggle"),

      btnMap: document.querySelector("#btnMap"),
      mapOverlay: document.querySelector("#mapOverlay"),
      mapTitle: document.querySelector("#mapTitle"),
      mapImg: document.querySelector("#mapImg"),
      mapMarker: document.querySelector("#mapMarker"),
      btnMapClose: document.querySelector("#btnMapClose"),

      btnDownloadTour: document.querySelector("#btnDownloadTour"),

      fovSlider: document.querySelector("#fovSlider"),
      fovValue: document.querySelector("#fovValue"),

      btnPrev: document.querySelector("#btnPrev"),
      btnNext: document.querySelector("#btnNext"),
      btnVR: document.querySelector("#btnVR"),
      btnInstall: document.querySelector("#btnInstall"),

      toast: document.querySelector("#toast"),
      tooltip: document.querySelector("#tooltip"),
    },
  });

  await app.init({ debugHotspots: DEBUG_HOTSPOTS, vrDebug: VR_DEBUG });

  const pm = new PlatformManager();
  await pm.init(app);

  await initPWA(app);
});
