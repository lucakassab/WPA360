// js/tour/HotspotPlacement.js

export function normalizeYaw(deg) {
  // traz pra [-180, 180)
  let y = ((deg + 180) % 360 + 360) % 360 - 180;
  if (y === -180) y = 180;
  return y;
}

export function clampPitch(deg, min = -89.9, max = 89.9) {
  return Math.max(min, Math.min(max, deg));
}

export function applySceneOffsets(yawDeg, pitchDeg, sceneCfg = {}) {
  const yawOffset = Number(sceneCfg.yawOffset ?? 0);
  const pitchOffset = Number(sceneCfg.pitchOffset ?? 0);
  return {
    yaw: normalizeYaw(yawDeg + yawOffset),
    pitch: clampPitch(pitchDeg + pitchOffset),
  };
}

export function removeSceneOffsets(yawDeg, pitchDeg, sceneCfg = {}) {
  const yawOffset = Number(sceneCfg.yawOffset ?? 0);
  const pitchOffset = Number(sceneCfg.pitchOffset ?? 0);
  return {
    yaw: normalizeYaw(yawDeg - yawOffset),
    pitch: clampPitch(pitchDeg - pitchOffset),
  };
}

/**
 * yaw/pitch -> direção unitária (forward)
 * Convenção: yaw 0 = frente (-Z), yaw+ = direita (+X), pitch+ = cima (+Y)
 */
export function yawPitchToDirection(yawDeg, pitchDeg) {
  const yaw = (yawDeg * Math.PI) / 180;
  const pitch = (pitchDeg * Math.PI) / 180;

  const cp = Math.cos(pitch);

  // magnitude ~1
  const x = cp * Math.sin(yaw);
  const y = Math.sin(pitch);
  const z = -cp * Math.cos(yaw);

  return { x, y, z };
}

/**
 * forward -> yaw/pitch (pra debug / captura)
 * forward esperado normalizado
 */
export function forwardToYawPitch(forward) {
  const yaw = Math.atan2(forward.x, -forward.z);
  const pitch = Math.asin(Math.max(-1, Math.min(1, forward.y)));

  return {
    yaw: normalizeYaw((yaw * 180) / Math.PI),
    pitch: clampPitch((pitch * 180) / Math.PI),
  };
}

/**
 * Offset fino por hotspot:
 * offset pode ser {x,y,z} ou [x,y,z]
 */
export function applyHotspotOffset(pos, hs = {}) {
  const off = hs.offset;
  if (!off) return pos;

  let ox = 0, oy = 0, oz = 0;
  if (Array.isArray(off)) {
    ox = Number(off[0] ?? 0);
    oy = Number(off[1] ?? 0);
    oz = Number(off[2] ?? 0);
  } else if (typeof off === "object") {
    ox = Number(off.x ?? 0);
    oy = Number(off.y ?? 0);
    oz = Number(off.z ?? 0);
  }

  return { x: pos.x + ox, y: pos.y + oy, z: pos.z + oz };
}

/**
 * Resolve distância:
 * 1) hs.distance
 * 2) scene.hotspotDistance
 * 3) scene.hotspotRadius (compat)
 * 4) fallback
 */
export function resolveDistance(hs, scene, fallback = 4.0) {
  const d =
    (hs?.distance ?? null) ??
    (scene?.hotspotDistance ?? null) ??
    (scene?.hotspotRadius ?? null) ??
    fallback;

  const n = Number(d);
  return Number.isFinite(n) ? n : fallback;
}