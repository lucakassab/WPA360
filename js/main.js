import App from "./App.js";
import PlatformManager from "./PlatformManager.js";
import { registerStereoTopBottom } from "./xr/StereoTopBottom.js";
import { registerFaceCamera } from "./tour/FaceCamera.js";
import { registerRenderOnTop } from "./tour/RenderOnTop.js";
import { initPWA } from "./pwa/pwa.js";
import { registerVrDebugConsole } from "./xr/VrDebugConsole.js";
import { registerVrWidget } from "./xr/vr_widget.js"; // ✅ novo

window.addEventListener("DOMContentLoaded", async () => {
  const DEBUG_HOTSPOTS = false;

  const vr_debug = false;

  const vr_foveated_rendering_enabled = false;
  const vr_foveation_level = 0.7;
  const vr_framebuffer_scale = 1.6;

  const vr_log_inputs = true;
  const vr_handtracking_logging = true;

  registerStereoTopBottom(window.AFRAME);
  registerFaceCamera(window.AFRAME);
  registerRenderOnTop(window.AFRAME);

  if (vr_debug) registerVrDebugConsole(window.AFRAME);
  registerVrWidget(window.AFRAME); // ✅ sempre registra

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
      btnMiniMap: document.querySelector("#btnMiniMap"),

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

  app.vrConfig = {
    debugConsole: vr_debug,
    logInputs: vr_debug && vr_log_inputs,

    foveatedRenderingEnabled: vr_foveated_rendering_enabled,
    foveationLevel: vr_foveation_level,

    framebufferScale: vr_framebuffer_scale,

    handTrackingLogging: vr_debug && vr_handtracking_logging
  };

  await app.init({ debugHotspots: DEBUG_HOTSPOTS, vrDebug: vr_debug });

  const pm = new PlatformManager();
  await pm.init(app);

  await initPWA(app);
});

