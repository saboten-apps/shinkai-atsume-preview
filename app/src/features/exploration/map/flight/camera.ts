import * as THREE from 'three';
import { CAMERA_CONFIG } from './constants';
import { BoxCollider } from './types';

export class SmartRailCamera {
  public camera: THREE.PerspectiveCamera;
  private targetLookAt: THREE.Vector3;
  private currentLookAt: THREE.Vector3;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(
      CAMERA_CONFIG.fov,
      aspect,
      0.1,
      1000
    );

    // 初期配置: びゅうお北東斜め上空 (28.0, 16.0, 42.0)
    this.camera.position.copy(CAMERA_CONFIG.initialPosition);

    // Roll角完全固定（絶対水平維持ルール）
    this.camera.up.set(0, 1, 0);

    // 初期注視点は原点付近
    this.targetLookAt = new THREE.Vector3(0, 16.0, 0);
    this.currentLookAt = new THREE.Vector3(0, 16.0, 0);
    this.camera.lookAt(this.currentLookAt);
  }

  public update(playerPos: THREE.Vector3, dt: number): void {
    // 1. Roll角の完全固定（常に上方向はワールドY、水平線回転ゼロ）
    this.camera.up.set(0, 1, 0);

    // 2. カメラ位置のレールエレベーター移動（Y軸追従）
    // キャラの高さ Y に応じて 14.0m 〜 22.0m の範囲をスライド（登頂時 31.5m も視野に収める）
    const normalizedY = THREE.MathUtils.clamp((playerPos.y - 4.5) / 27.0, 0, 1);
    const targetCamY = THREE.MathUtils.lerp(CAMERA_CONFIG.railYMin, CAMERA_CONFIG.railYMax + 3.0, normalizedY);
    
    const elevatorFactor = 1.0 - Math.pow(1.0 - CAMERA_CONFIG.railElevatorAlpha, dt * 60);
    this.camera.position.y += (targetCamY - this.camera.position.y) * elevatorFactor;

    // 3. コースB用 X軸レール拡張（フェーズAの画角は完全維持）
    // キャラが西側（X < -10）にいるとき、進行方向（東・びゅうお）を見通せる斜めオフセットで追従
    // キャラがびゅうおエリア（X >= -10）では、従来の固定位置 X=28.0 にスムーズにクランプ
    const targetCamX = THREE.MathUtils.clamp(playerPos.x + 36.0, -12.0, CAMERA_CONFIG.initialPosition.x);
    const railXAlpha = 0.04;
    const railXFactor = 1.0 - Math.pow(1.0 - railXAlpha, dt * 60);
    this.camera.position.x += (targetCamX - this.camera.position.x) * railXFactor;

    // Z は固定 (42.0)
    this.camera.position.z = CAMERA_CONFIG.initialPosition.z;

    // 4. 注視点の遅延追従 (alpha = 0.06)
    this.targetLookAt.copy(playerPos);
    const lookAtFactor = 1.0 - Math.pow(1.0 - CAMERA_CONFIG.lookAtLerpAlpha, dt * 60);
    this.currentLookAt.lerp(this.targetLookAt, lookAtFactor);

    this.camera.lookAt(this.currentLookAt);
  }

  public resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  public getLookAt(): THREE.Vector3 {
    return this.currentLookAt.clone();
  }
}

/**
 * カメラの希望位置とキャラ注視点の間の線分と、全コライダーの遮蔽交差を判定し、
 * 最適なカメラ位置を算出して返却する（FREEモード・重力モード共通）。
 *
 * 準拠仕様: TASK-GRAVITYMODE-FIX1 §修正要件1
 * - カメラの希望位置に対し、キャラ→希望位置の線分と全コライダー（建物Box＋岸壁）の交差を判定
 * - 遮蔽される場合は、最も近い交差点の手前（キャラ側へ約0.5m寄せ）までカメラを近づける
 * - 最小距離は約1.5m確保し、近すぎる場合は距離を詰めた位置でキャラを見続ける
 * - カメラが建物内部や裏側に回り込む状態を作らない
 */
export function resolveCameraOcclusion(
  charCenter: THREE.Vector3,
  desiredCamPos: THREE.Vector3,
  colliders: BoxCollider[],
  minDist: number = 1.5,
  safeMargin: number = 0.5
): THREE.Vector3 {
  const toCam = desiredCamPos.clone().sub(charCenter);
  const desiredDist = toCam.length();
  if (desiredDist < 0.001) {
    return desiredCamPos.clone();
  }

  const rayDir = toCam.clone().normalize();
  const ray = new THREE.Ray(charCenter, rayDir);
  const hitPoint = new THREE.Vector3();

  let nearestHitDist = desiredDist;
  let isOccluded = false;

  for (const col of colliders) {
    if (col.isTrigger) continue;

    // 始点自身がボックス内部にある場合（通常ないがフェイルセーフ）はスキップ
    if (col.box.containsPoint(charCenter)) {
      continue;
    }

    if (ray.intersectBox(col.box, hitPoint)) {
      const dist = charCenter.distanceTo(hitPoint);
      if (dist < nearestHitDist && dist > 0.05) {
        nearestHitDist = dist;
        isOccluded = true;
      }
    }
  }

  if (isOccluded) {
    // 最も近い交差点の手前（キャラ側へ約0.5m寄せ）
    let actualDist = nearestHitDist - safeMargin;

    // 最小距離は約1.5m確保
    if (actualDist < minDist) {
      // 交差点自体が1.5m未満など近すぎる場合は、壁の内部に入らないよう距離を詰めた位置でキャラを見続ける
      if (nearestHitDist > 0.5) {
        actualDist = Math.max(0.4, nearestHitDist - 0.15);
      } else {
        actualDist = Math.max(0.3, nearestHitDist * 0.7);
      }
    }

    const actualCamPos = charCenter.clone().addScaledVector(rayDir, actualDist);

    // 二重フェイルセーフ：もし計算されたカメラ位置がコライダー内部に入っていれば、手前に寄せる
    const tempClamped = new THREE.Vector3();
    for (const col of colliders) {
      if (col.isTrigger) continue;
      if (col.box.containsPoint(actualCamPos)) {
        col.box.clampPoint(actualCamPos, tempClamped);
        const distToClamp = charCenter.distanceTo(tempClamped);
        actualDist = Math.max(0.3, distToClamp - 0.2);
        actualCamPos.copy(charCenter).addScaledVector(rayDir, actualDist);
        break;
      }
    }

    return actualCamPos;
  }

  // 遮蔽なしの場合でも、希望位置そのものがコライダー内部にないかチェック
  const tempClamped = new THREE.Vector3();
  for (const col of colliders) {
    if (col.isTrigger) continue;
    if (col.box.containsPoint(desiredCamPos)) {
      col.box.clampPoint(desiredCamPos, tempClamped);
      const distToClamp = charCenter.distanceTo(tempClamped);
      const actualDist = Math.max(0.4, distToClamp - safeMargin);
      return charCenter.clone().addScaledVector(rayDir, actualDist);
    }
  }

  return desiredCamPos.clone();
}
