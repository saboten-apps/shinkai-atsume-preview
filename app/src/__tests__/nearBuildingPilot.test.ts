import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createNearBuildingPilot, NEAR_BUILDING_PILOT, pilotPosition } from '../features/exploration/map/three/nearBuildingPilot';

describe('near building pilot', () => {
  it('aligns to the measured facade plane and stays within a small rendering budget', () => {
    const pilot = createNearBuildingPilot(), [nx, nz] = NEAR_BUILDING_PILOT.normal;
    const center = pilotPosition();
    expect(center.x * nx + center.z * nz).toBeCloseTo(NEAR_BUILDING_PILOT.plane, 5);
    const outward = new THREE.Vector3(0, 0, 1).transformDirection(pilot.root.matrixWorld);
    expect(outward.x).toBeCloseTo(nx, 5); expect(outward.z).toBeCloseTo(nz, 5);
    const meshes = pilot.root.children as THREE.Mesh[];
    expect(meshes).toHaveLength(6);
    expect(meshes.reduce((n, m) => n + m.geometry.index!.count / 3, 0)).toBeLessThan(1200);
    const wall = pilot.root.getObjectByName('pilot-wall') as THREE.Mesh;
    const uv = wall.geometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) {
      expect(uv.getX(i)).toBeGreaterThanOrEqual(-.0001); expect(uv.getX(i)).toBeLessThanOrEqual(1.0001);
      expect(uv.getY(i)).toBeGreaterThanOrEqual(-.0001); expect(uv.getY(i)).toBeLessThanOrEqual(1.0001);
    }
    pilot.dispose();
  });
  it('supports comparison, distance hysteresis, and idempotent resource release', () => {
    const pilot = createNearBuildingPilot(), scene = new THREE.Scene(); scene.add(pilot.root);
    const near = pilotPosition().add(new THREE.Vector3(10, 3, 0));
    pilot.update(near); expect(pilot.root.visible).toBe(true);
    pilot.update(near, false); expect(pilot.root.visible).toBe(false);
    pilot.update(near); expect(pilot.root.visible).toBe(true);
    pilot.update(near.clone().add(new THREE.Vector3(1000, 0, 0))); expect(pilot.root.visible).toBe(false);
    const mesh = pilot.root.children[0] as THREE.Mesh;
    const geometry = vi.spyOn(mesh.geometry, 'dispose'), material = vi.spyOn(mesh.material as THREE.Material, 'dispose');
    pilot.dispose(); pilot.dispose();
    expect(pilot.root.parent).toBeNull(); expect(geometry).toHaveBeenCalledTimes(1); expect(material).toHaveBeenCalledTimes(1);
  });
});
