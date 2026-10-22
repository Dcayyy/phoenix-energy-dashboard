import type { DeviceScene } from './DeviceScene';

/** The mounted 3D scene, for the demo to drive directly (detail level, flick). */
let current: DeviceScene | null = null;

export const activeScene = () => current;

export function setActiveScene(scene: DeviceScene | null) {
  current = scene;
}
