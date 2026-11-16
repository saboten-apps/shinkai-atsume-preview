import { afterEach, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { BuildingOverrideManager } from '../features/exploration/map/three/buildingOverride';
import { BuildingSelectionManager } from '../features/exploration/map/three/buildingSelection';
const manifest = JSON.parse(readFileSync('public/map/data/release-manifest.json', 'utf8'));
afterEach(() => vi.unstubAllGlobals());

it('preserves the unverified demolition pilot and rejects mismatched releases', () => {
  const manager = new BuildingOverrideManager();
  expect(manager.setManifest(manifest)).toBe(true);
  expect(manager.getChunkUrl('station-5-2', 'original.glb')).toBe('original.glb');
  expect(manager.getOverridesForChunk('station-5-2')).toEqual([]);
  expect(manager.setManifest({...manifest, releaseId:'unrelated-release'})).toBe(false);
  expect(manager.getChunkUrl('port', 'original.glb')).toBe('original.glb');
});

it('attaches Byuuo without admin metadata and does not recut regenerated neighbours', () => {
  const manager = new BuildingOverrideManager();
  manager.setManifest(manifest);
  const geometry = new THREE.BoxGeometry(5, 10, 5);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geometry));
  const original = Array.from(geometry.index!.array);
  const scene = new THREE.Scene();
  const unregister = vi.fn();
  const addCollider = vi.fn(() => unregister);
  const result = manager.applyOverridesToChunk('port', group, new BuildingSelectionManager(), scene, addCollider, true);
  expect(scene.getObjectByName('numazu-byuuo')).toBeDefined();
  expect(Array.from(geometry.index!.array)).toEqual(original);
  expect(result.trianglesRemoved).toBe(0);
  result.dispose();
  expect(scene.getObjectByName('numazu-byuuo')).toBeUndefined();
  expect(unregister).toHaveBeenCalledOnce();
});

it('ignores an in-flight sidecar response after unloading its chunk', async () => {
  let respond!: (value: unknown) => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => {respond=resolve;})));
  const manager = new BuildingSelectionManager();
  const pending = manager.loadChunk('port', '/map/');
  manager.unloadChunk('port');
  respond({ok:true, json:async()=>({chunk:'port',year:2023,buildings:[]})});
  expect(await pending).toBe(false);
  expect(manager.loadedChunkCount).toBe(0);
});
