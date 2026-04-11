import * as THREE from "../../vendor/three/three.module.js";
import {
  getHotspotLabelText,
  getHotspotLabelWorldPosition,
  isHotspotLabelVisible,
  isHotspotMarkerVisible
} from "./HotspotVisualShared.js";

const MARKER_GEOMETRY = new THREE.PlaneGeometry(1, 1);
const ACTIVE_TINT = new THREE.Color("#fff0c8");
const IDLE_TINT = new THREE.Color("#ffffff");

export class ThreeHotspotLayer {
  constructor({ contentRoot }) {
    this.contentRoot = contentRoot;
    this.group = new THREE.Group();
    this.group.name = "wpa360-xr-hotspots";
    this.group.visible = false;
    this.contentRoot.add(this.group);

    this.entries = [];
    this.hotspotById = new Map();
    this.interactiveObjects = [];
    this.highlightedHotspotId = null;

    this.tempVectors = {
      cameraPosition: new THREE.Vector3(),
      cameraDirection: new THREE.Vector3(),
      worldPosition: new THREE.Vector3(),
      toHotspot: new THREE.Vector3()
    };
  }

  setHotspots(hotspots = []) {
    this.clear();
    this.entries = hotspots.map((hotspot) => this.createEntry(hotspot));
    this.hotspotById = new Map(hotspots.map((hotspot) => [hotspot.id, hotspot]));
    this.syncHighlightState();
  }

  setVisible(visible) {
    this.group.visible = visible;
  }

  setHighlightedHotspot(hotspotId) {
    const nextId = hotspotId ?? null;
    if (this.highlightedHotspotId === nextId) {
      return;
    }

    this.highlightedHotspotId = nextId;
    this.syncHighlightState();
  }

  update(camera) {
    if (!camera || !this.group.visible || this.entries.length === 0) {
      return;
    }

    const cameraPosition = this.tempVectors.cameraPosition;
    camera.getWorldPosition(cameraPosition);

    for (const entry of this.entries) {
      if (entry.marker) {
        orientObject(entry.marker, cameraPosition, entry.markerConfig);
      }

      if (entry.label) {
        orientObject(entry.label, cameraPosition, entry.labelConfig);
      }
    }
  }

  getCenteredHotspot(camera, { maxDegrees = 9 } = {}) {
    if (!camera || this.entries.length === 0) {
      return null;
    }

    const cameraPosition = this.tempVectors.cameraPosition;
    const cameraDirection = this.tempVectors.cameraDirection;
    const worldPosition = this.tempVectors.worldPosition;
    const toHotspot = this.tempVectors.toHotspot;

    camera.getWorldPosition(cameraPosition);
    camera.getWorldDirection(cameraDirection);

    let bestMatch = null;

    for (const entry of this.entries) {
      if (entry.hotspot.type !== "scene_link" || !entry.hotspot.target_scene) {
        continue;
      }

      this.contentRoot.localToWorld(worldPosition.copy(entry.anchorPosition));
      toHotspot.copy(worldPosition).sub(cameraPosition);
      const distance = toHotspot.length();
      if (distance <= 0.001) {
        continue;
      }

      const angle = THREE.MathUtils.radToDeg(cameraDirection.angleTo(toHotspot.normalize()));
      if (angle > maxDegrees) {
        continue;
      }

      if (!bestMatch || angle < bestMatch.angle) {
        bestMatch = {
          hotspot: entry.hotspot,
          angle
        };
      }
    }

    return bestMatch?.hotspot ?? null;
  }

  destroy() {
    this.clear();
    this.group.removeFromParent();
  }

  getInteractiveObjects() {
    return this.interactiveObjects;
  }

  getHotspotByObject(object) {
    let current = object;
    while (current) {
      const hotspotId = current.userData?.hotspotId;
      if (hotspotId && this.hotspotById.has(hotspotId)) {
        return this.hotspotById.get(hotspotId);
      }
      current = current.parent;
    }
    return null;
  }

  intersectRay(raycaster) {
    if (!raycaster || this.interactiveObjects.length === 0) {
      return null;
    }

    const intersection = raycaster.intersectObjects(this.interactiveObjects, false)[0];
    if (!intersection) {
      return null;
    }

    return {
      hotspot: this.getHotspotByObject(intersection.object),
      intersection
    };
  }

  clear() {
    for (const entry of this.entries) {
      disposeObjectTree(entry.marker);
      disposeObjectTree(entry.label);
    }

    this.group.clear();
    this.entries = [];
    this.hotspotById.clear();
    this.interactiveObjects = [];
    this.highlightedHotspotId = null;
  }

  createEntry(hotspot) {
    const entry = {
      hotspot,
      anchorPosition: vectorFrom(hotspot.position),

      marker: null,
      markerGlow: null,
      markerConfig: null,
      markerBaseSize: 1,

      label: null,
      labelGlow: null,
      labelConfig: null,
      labelBaseWidth: 1,
      labelBaseHeight: 1
    };

    if (isHotspotMarkerVisible(hotspot)) {
      const markerSize = 0.7 * resolveScale(hotspot.scale, hotspot.reference_depth);
      const markerMaterial = createMarkerMaterial();
      const marker = new THREE.Mesh(MARKER_GEOMETRY, markerMaterial);
      const markerGlow = createMarkerHighlightMesh();

      marker.position.copy(entry.anchorPosition);
      marker.scale.set(markerSize, markerSize, 1);
      marker.renderOrder = 2;
      marker.userData.hotspotId = hotspot.id;
      marker.userData.hotspotRole = "marker";

      markerGlow.visible = false;
      marker.add(markerGlow);

      this.group.add(marker);
      this.interactiveObjects.push(marker);

      entry.marker = marker;
      entry.markerGlow = markerGlow;
      entry.markerBaseSize = markerSize;
      entry.markerConfig = {
        billboard: hotspot.billboard !== false,
        baseQuaternion: quaternionFromRotation(hotspot.rotation),
        offsetQuaternion: new THREE.Quaternion()
      };
    }

    if (isHotspotLabelVisible(hotspot)) {
      const labelTexture = createLabelTexture(
        getHotspotLabelText(hotspot),
        hotspot.type === "scene_link"
      );

      const labelMaterial = new THREE.MeshBasicMaterial({
        map: labelTexture,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        side: THREE.DoubleSide,
        color: IDLE_TINT.clone()
      });

      const labelSize = resolveLabelSize(
        labelTexture.image.width,
        labelTexture.image.height,
        hotspot.label?.scale,
        hotspot.label?.reference_depth ?? hotspot.reference_depth
      );

      const label = new THREE.Mesh(MARKER_GEOMETRY, labelMaterial);
      const labelGlow = createLabelHighlightMesh();

      label.position.copy(vectorFrom(getHotspotLabelWorldPosition(hotspot)));
      label.scale.set(labelSize.width, labelSize.height, 1);
      label.renderOrder = 3;
      label.userData.hotspotId = hotspot.id;
      label.userData.hotspotRole = "label";

      labelGlow.visible = false;
      label.add(labelGlow);

      this.group.add(label);
      this.interactiveObjects.push(label);

      entry.label = label;
      entry.labelGlow = labelGlow;
      entry.labelBaseWidth = labelSize.width;
      entry.labelBaseHeight = labelSize.height;
      entry.labelConfig = {
        billboard: hotspot.label?.billboard !== false,
        baseQuaternion: quaternionFromRotation(hotspot.rotation),
        offsetQuaternion: quaternionFromRotation(hotspot.label?.rotation_offset)
      };
    }

    return entry;
  }

  syncHighlightState() {
    for (const entry of this.entries) {
      const isActive = Boolean(
        this.highlightedHotspotId &&
        entry.hotspot?.id === this.highlightedHotspotId
      );

      if (entry.marker) {
        const markerScale = isActive ? 1.16 : 1;
        entry.marker.scale.set(
          entry.markerBaseSize * markerScale,
          entry.markerBaseSize * markerScale,
          1
        );
        entry.marker.renderOrder = isActive ? 10 : 2;

        if (entry.marker.material?.color) {
          entry.marker.material.color.copy(isActive ? ACTIVE_TINT : IDLE_TINT);
        }
        if ("opacity" in entry.marker.material) {
          entry.marker.material.opacity = isActive ? 1 : 0.96;
        }
        if (entry.markerGlow) {
          entry.markerGlow.visible = isActive;
        }
      }

      if (entry.label) {
        const labelScale = isActive ? 1.06 : 1;
        entry.label.scale.set(
          entry.labelBaseWidth * labelScale,
          entry.labelBaseHeight * labelScale,
          1
        );
        entry.label.renderOrder = isActive ? 11 : 3;

        if (entry.label.material?.color) {
          entry.label.material.color.copy(isActive ? ACTIVE_TINT : IDLE_TINT);
        }
        if ("opacity" in entry.label.material) {
          entry.label.material.opacity = isActive ? 1 : 0.98;
        }
        if (entry.labelGlow) {
          entry.labelGlow.visible = isActive;
        }
      }
    }
  }
}

function orientObject(object, cameraPosition, config) {
  if (!object || !config) {
    return;
  }

  if (config.billboard) {
    object.lookAt(cameraPosition);
    object.quaternion.multiply(config.offsetQuaternion);
    return;
  }

  object.quaternion.copy(config.baseQuaternion).multiply(config.offsetQuaternion);
}

function createMarkerMaterial() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.beginPath();
  ctx.arc(128, 128, 82, 0, Math.PI * 2);
  ctx.fillStyle = "#f0a85d";
  ctx.fill();

  ctx.lineWidth = 18;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(128, 128, 24, 0, Math.PI * 2);
  ctx.fillStyle = "#0b2b33";
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  return new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
    color: IDLE_TINT.clone(),
    opacity: 0.96
  });
}

function createMarkerHighlightMesh() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createRadialGradient(128, 128, 22, 128, 128, 118);
  gradient.addColorStop(0, "rgba(240, 168, 93, 0.35)");
  gradient.addColorStop(0.55, "rgba(240, 168, 93, 0.18)");
  gradient.addColorStop(1, "rgba(240, 168, 93, 0)");

  ctx.clearRect(0, 0, 256, 256);
  ctx.beginPath();
  ctx.arc(128, 128, 118, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(128, 128, 96, 0, Math.PI * 2);
  ctx.lineWidth = 16;
  ctx.strokeStyle = "rgba(255, 226, 169, 0.85)";
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
    opacity: 1
  });

  const mesh = new THREE.Mesh(MARKER_GEOMETRY, material);
  mesh.scale.set(1.7, 1.7, 1);
  mesh.position.z = -0.001;
  mesh.renderOrder = 1;
  return mesh;
}

function createLabelTexture(text, linked) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const fontSize = 44;

  ctx.font = `700 ${fontSize}px "Segoe UI", sans-serif`;
  const paddingX = 40;
  const paddingY = 24;
  const metrics = ctx.measureText(text);

  canvas.width = Math.max(256, Math.ceil(metrics.width + paddingX * 2));
  canvas.height = fontSize + paddingY * 2;

  ctx.font = `700 ${fontSize}px "Segoe UI", sans-serif`;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  roundRect(ctx, 0, 0, canvas.width, canvas.height, canvas.height / 2);
  ctx.fillStyle = linked ? "#f0a85d" : "rgba(9, 25, 30, 0.88)";
  ctx.fill();

  ctx.lineWidth = 3;
  ctx.strokeStyle = linked ? "rgba(255, 255, 255, 0.92)" : "rgba(255, 255, 255, 0.22)";
  ctx.stroke();

  ctx.fillStyle = linked ? "#0b2b33" : "#f6f0e6";
  ctx.textBaseline = "middle";
  ctx.fillText(text, paddingX, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createLabelHighlightMesh() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  roundRect(ctx, 8, 8, canvas.width - 16, canvas.height - 16, canvas.height / 2 - 8);
  ctx.fillStyle = "rgba(240, 168, 93, 0.22)";
  ctx.fill();

  ctx.lineWidth = 10;
  ctx.strokeStyle = "rgba(255, 231, 184, 0.95)";
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
    opacity: 1
  });

  const mesh = new THREE.Mesh(MARKER_GEOMETRY, material);
  mesh.scale.set(1.12, 1.14, 1);
  mesh.position.z = -0.001;
  mesh.renderOrder = 2;
  return mesh;
}

function resolveLabelSize(width, height, scale, referenceDepth) {
  const baseHeight = 0.55 * resolveScale(scale, referenceDepth);
  const ratio = width / Math.max(1, height);
  return {
    width: baseHeight * ratio,
    height: baseHeight
  };
}

function resolveScale(scale, referenceDepth) {
  const safeScale = Math.max(0.001, Number(scale ?? 1) || 1);
  const safeDepth = Math.max(0.001, Number(referenceDepth ?? 8) || 8);
  return safeScale * (safeDepth / 8);
}

function quaternionFromRotation(rotation) {
  const euler = new THREE.Euler(
    THREE.MathUtils.degToRad(Number(rotation?.pitch ?? 0)),
    THREE.MathUtils.degToRad(Number(rotation?.yaw ?? 0)),
    THREE.MathUtils.degToRad(Number(rotation?.roll ?? 0)),
    "YXZ"
  );
  return new THREE.Quaternion().setFromEuler(euler);
}

function vectorFrom(position) {
  return new THREE.Vector3(
    Number(position?.x ?? 0),
    Number(position?.y ?? 0),
    Number(position?.z ?? -8)
  );
}

function disposeObjectTree(object) {
  if (!object) {
    return;
  }

  object.traverse?.((child) => {
    if (child.material) {
      if (Array.isArray(child.material)) {
        for (const material of child.material) {
          material?.map?.dispose?.();
          material?.dispose?.();
        }
      } else {
        child.material?.map?.dispose?.();
        child.material?.dispose?.();
      }
    }
  });

  object.removeFromParent();
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}