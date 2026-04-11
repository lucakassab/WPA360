export const PLATFORM_2D = "2D_platform";
export const PLATFORM_VR = "VR_platform";

export class PlatformSelector {
  constructor({ url = new URL(window.location.href) } = {}) {
    this.url = url;
  }

  async detectInitialPlatform(cfg) {
    const requested = this.url.searchParams.get("platform") || this.url.searchParams.get("mode");
    const wantsVr = requested === "vr" || this.url.searchParams.get("vr") === "1";
    const defaultPlatform = cfg?.app?.default_platform;
    const vrEnabled = cfg?.features?.vr !== false && cfg?.platform?.vr?.enabled !== false;

    if (wantsVr && vrEnabled) {
      return PLATFORM_VR;
    }

    if (defaultPlatform === PLATFORM_VR && vrEnabled) {
      return PLATFORM_VR;
    }

    return PLATFORM_2D;
  }

  getInputProfile() {
    const coarse = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
    return {
      pointer: coarse ? "touch" : "mouse",
      coarse
    };
  }
}
