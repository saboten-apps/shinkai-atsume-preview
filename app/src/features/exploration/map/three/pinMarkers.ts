import * as THREE from 'three';
import { MapPin } from '../types';

export interface Pin3DObject {
  pin: MapPin;
  group: THREE.Group;
  collider: THREE.Mesh;
  halo: THREE.Mesh;
  marker: THREE.Mesh;
  baseY: number;
}

/**
 * 標本図鑑トーンの3Dピンマーカーを生成
 * - 円錐ピン + 光環（Halo） + 透明コライダー
 */
export function createPinMarkers(pins: MapPin[]): Pin3DObject[] {
  const pinObjects: Pin3DObject[] = [];

  // 標本風ピンのマテリアル
  // 深海レッド（#C73E2C）と真鍮ゴールド（#C4A052）
  const pinMaterial = new THREE.MeshStandardMaterial({
    color: 0xc73e2c,
    roughness: 0.3,
    metalness: 0.6,
  });

  const haloMaterial = new THREE.MeshBasicMaterial({
    color: 0xf5f0e6,
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide,
  });

  const brassMaterial = new THREE.MeshStandardMaterial({
    color: 0xd4af37,
    roughness: 0.2,
    metalness: 0.8,
  });

  pins.forEach((pin) => {
    const group = new THREE.Group();
    group.position.set(pin.position[0], pin.position[1], pin.position[2]);
    group.userData = { pinId: pin.id };

    // ピンヘッド（球体: 標本針の頭部）
    const headGeom = new THREE.SphereGeometry(3.0, 16, 16);
    const head = new THREE.Mesh(headGeom, pinMaterial);
    head.position.y = 11.2;
    group.add(head);

    // ピンコーン（下向きの円錐針: 地面 y≈41.7 に接する針先）
    const coneGeom = new THREE.ConeGeometry(1.8, 8.0, 16);
    coneGeom.rotateX(Math.PI); // 針先を下に向ける
    const cone = new THREE.Mesh(coneGeom, brassMaterial);
    cone.position.y = 5.2;
    group.add(cone);

    // 地面の同心円リング（光環・標本インジケーター）
    const haloGeom = new THREE.RingGeometry(2.5, 5.5, 32);
    haloGeom.rotateX(-Math.PI / 2);
    const halo = new THREE.Mesh(haloGeom, haloMaterial);
    halo.position.y = 0.25;
    group.add(halo);

    // タップ判定用不可視コライダー（スマホでもタップしやすい大きめの球体）
    const colliderGeom = new THREE.SphereGeometry(10.0, 8, 8);
    const colliderMat = new THREE.MeshBasicMaterial({
      visible: false,
    });
    const collider = new THREE.Mesh(colliderGeom, colliderMat);
    collider.position.y = 7.5;
    collider.userData = { pinId: pin.id };
    group.add(collider);

    pinObjects.push({
      pin,
      group,
      collider,
      halo,
      marker: head,
      baseY: pin.position[1],
    });
  });

  return pinObjects;
}

/**
 * ピンの浮遊・回転アニメーション
 */
export function updatePinAnimations(
  pinObjects: Pin3DObject[],
  time: number,
  selectedPinId: string | null
) {
  pinObjects.forEach((po) => {
    const isSelected = po.pin.id === selectedPinId;

    // やわらかな上下浮遊
    const bobOffset = Math.sin(time * 2.5 + po.pin.position[0]) * 0.8;
    po.group.position.y = po.baseY + bobOffset + (isSelected ? 2.0 : 0);

    // 光環（リング）のパルス伸縮
    const pulseScale = 1.0 + Math.sin(time * 3 + po.pin.position[2]) * 0.15;
    po.halo.scale.set(pulseScale, pulseScale, pulseScale);

    if (isSelected) {
      po.marker.scale.set(1.35, 1.35, 1.35);
      (po.halo.material as THREE.MeshBasicMaterial).opacity = 0.95;
      (po.marker.material as THREE.MeshStandardMaterial).color.setHex(0xe8533c);
    } else {
      po.marker.scale.set(1.0, 1.0, 1.0);
      (po.halo.material as THREE.MeshBasicMaterial).opacity = 0.5;
      (po.marker.material as THREE.MeshStandardMaterial).color.setHex(0xc73e2c);
    }
  });
}
