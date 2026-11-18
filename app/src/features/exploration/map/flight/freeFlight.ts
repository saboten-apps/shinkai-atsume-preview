import * as THREE from 'three';
import type {VehicleId} from './avatarOptions';
import {boatFitsWater} from './boat';
import { FreeFlightState, FreeFlightStatus } from './types';
import {
  START_POSITION_FREE,
  INITIAL_FREE_LOOK,
  FREE_FLIGHT_CONFIG,
} from './constants';
import { HumanoidCharacter } from './character';
import { Octree } from 'three/examples/jsm/math/Octree.js';
import { Capsule } from 'three/examples/jsm/math/Capsule.js';
export const SEA = 41.5;

export class FreeFlightController {
  public active: boolean = false;
  public state: FreeFlightState = 'air';
  public vehicle:VehicleId='none';
  public autopilotSpeed:number|undefined;
  public setVehicle(id:VehicleId,colliders:Octree[]=[]):boolean {
    if(id!=='none'&&!this.availableVehicles(colliders).includes(id))return false;
    if(id==='boat'){this.position.y=SEA+.04;this.state='air';}
    if(id==='submarine'&&this.position.y>=SEA){this.position.y=SEA-.5;this.state='water';}
    this.vehicle=id;this.velocity.set(0,0,0);return true;
  }
  public availableVehicles(colliders:Octree[]=[]):VehicleId[]{
    if(!this.active)return [];
    const result:VehicleId[]=[];
    if(this.waterQuery(this.position.x,this.position.z)){
      if(Math.abs(this.position.y-SEA)<=2&&boatFitsWater(this.waterQuery,this.position.x,this.position.z))result.push('boat');
      if(this.position.y<=SEA+2)result.push('submarine');
    }else if(this.state==='ground'&&this.isGroundedOnSurface&&this.carFitsAt(this.position,colliders))result.push('car');
    return result;
  }
  private carFitsAt(point:THREE.Vector3,colliders:Octree[]):boolean {
    const probe=this.capsule;probe.radius=1.2;probe.start.copy(point);probe.start.y+=1.2;probe.end.copy(probe.start);
    return !colliders.some(tree=>{const hit=tree.capsuleIntersect(probe);return hit&&hit.depth>.015;});
  }
  /** Find a flat dry footprint at harbor ground height, rejecting roofs and walls. */
  public findCarParking(colliders:Octree[],x:number,z:number):THREE.Vector3|null {
    if(this.waterQuery(x,z))return null;
    let center:THREE.Vector3|null=null;
    for(const [dx,dz]of [[0,0],[1.2,0],[-1.2,0],[0,1.2],[0,-1.2]]){
      if(this.waterQuery(x+dx,z+dz))return null;
      this.groundRay.origin.set(x+dx,SEA+10,z+dz);let nearest=Infinity,point:THREE.Vector3|null=null;
      for(const tree of colliders){const hit=tree.rayIntersect(this.groundRay);if(hit&&hit.distance<nearest){nearest=hit.distance;point=hit.position.clone();if(hit.triangle.getNormal(this.groundNormal).y<.9)return null;}}
      if(!point||point.y<SEA||point.y>SEA+8)return null;
      if(!center)center=point;else if(Math.abs(point.y-center.y)>.15)return null;
    }
    center!.y+=.001;return this.carFitsAt(center!,colliders)?center:null;
  }
  public parkCarAt(colliders:Octree[],x:number,z:number):boolean {
    if(!this.active)return false;const point=this.findCarParking(colliders,x,z);if(!point)return false;
    this.teleport(point.x,point.y,point.z);this.state='ground';this.isGroundedOnSurface=true;return this.setVehicle('car',colliders);
  }

  public position: THREE.Vector3;
  public velocity: THREE.Vector3;

  // 視線・カメラ角度（rad）
  public yaw: number;
  public pitch: number;

  // 入力保持
  private stickInput = new THREE.Vector2(0, 0); // x: 左右 (-1..1), y: 前進(+1)/後退(-1)
  private verticalInput: number = 0;             // 上昇(+1)/下降(-1)
  // Reused per-frame math objects avoid allocating vectors and collision shapes
  // during flight, which otherwise adds garbage-collection pauses on mobile.
  private forwardH = new THREE.Vector3();
  private rightH = new THREE.Vector3();
  private targetVel = new THREE.Vector3();
  private targetLookAt = new THREE.Vector3();
  private forward3D = new THREE.Vector3();
  private camOffset = new THREE.Vector3();
  private desiredCamPos = new THREE.Vector3();
  private cameraDirection = new THREE.Vector3();
  private actualCamPos = new THREE.Vector3();
  private cameraRay = new THREE.Ray();
  private groundRay = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0,-1,0));
  private groundNormal = new THREE.Vector3();
  private capsulePush = new THREE.Vector3();
  private capsule = new Capsule(new THREE.Vector3(), new THREE.Vector3(0,.7,0), .5);

  // スクリプト検証フックからの永続入力フラグ
  private scriptStick = new THREE.Vector2(0, 0);
  private scriptVertical: number = 0;
  private hasScriptStick: boolean = false;
  private hasScriptVertical: boolean = false;

  private isGroundedOnSurface: boolean = false;
  private walkingOffEdge = false;
  private waterQuery: (x:number,z:number)=>boolean = () => true;

  public setWaterQuery(query:(x:number,z:number)=>boolean):void { this.waterQuery=query; }
  private isSubmerged():boolean { return this.position.y < SEA && this.waterQuery(this.position.x,this.position.z); }


  constructor() {
    this.position = START_POSITION_FREE.clone();
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.yaw = THREE.MathUtils.degToRad(INITIAL_FREE_LOOK.yawDeg);
    this.pitch = THREE.MathUtils.degToRad(INITIAL_FREE_LOOK.pitchDeg);
  }

  public activate(active: boolean): void {
    this.active = active;
    this.vehicle='none';
    if (active) {
      this.resetPosition();
    }
  }

  public resetPosition(): void {
    this.vehicle='none';
    this.position.copy(START_POSITION_FREE);
    this.velocity.set(0, 0, 0);
    this.yaw = THREE.MathUtils.degToRad(INITIAL_FREE_LOOK.yawDeg);
    this.pitch = THREE.MathUtils.degToRad(INITIAL_FREE_LOOK.pitchDeg);
    this.state = 'air';
    this.isGroundedOnSurface = false;
    this.walkingOffEdge = false;
    this.stickInput.set(0, 0);
    this.verticalInput = 0;
    this.scriptStick.set(0, 0);
    this.scriptVertical = 0;
    this.hasScriptStick = false;
    this.hasScriptVertical = false;
  }

  public teleport(x: number, y: number, z: number): void {
    this.vehicle='none';
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this.state = this.isSubmerged() ? 'water' : 'air';
    this.isGroundedOnSurface = false;
    this.walkingOffEdge = false;
    this.stickInput.set(0, 0);
    this.verticalInput = 0;
  }

  // --- 入力設定メソッド（UI・キーボード・検証フック用） ---

  public setStick(x: number, y: number): void {
    this.stickInput.set(
      THREE.MathUtils.clamp(x, -1, 1),
      THREE.MathUtils.clamp(y, -1, 1)
    );
  }

  public setVertical(v: number): void {
    this.verticalInput = (this.vehicle==='car'||this.vehicle==='boat')?0:THREE.MathUtils.clamp(v, -1, 1);
    if(Math.abs(this.verticalInput)<.02)this.velocity.y=0;
  }

  public setLookDegrees(yawDeg: number, pitchDeg: number): void {
    this.yaw = THREE.MathUtils.degToRad(yawDeg);
    const minP = THREE.MathUtils.degToRad(FREE_FLIGHT_CONFIG.pitchMinDeg);
    const maxP = THREE.MathUtils.degToRad(FREE_FLIGHT_CONFIG.pitchMaxDeg);
    this.pitch = THREE.MathUtils.clamp(THREE.MathUtils.degToRad(pitchDeg), minP, maxP);
  }

  public addLookDelta(deltaYawRad: number, deltaPitchRad: number): void {
    this.yaw += deltaYawRad;
    const minP = THREE.MathUtils.degToRad(FREE_FLIGHT_CONFIG.pitchMinDeg);
    const maxP = THREE.MathUtils.degToRad(FREE_FLIGHT_CONFIG.pitchMaxDeg);
    this.pitch = THREE.MathUtils.clamp(this.pitch + deltaPitchRad, minP, maxP);
  }

  // 検証フック用（値を永続保持）
  public setScriptStick(x: number, y: number): void {
    this.scriptStick.set(
      THREE.MathUtils.clamp(x, -1, 1),
      THREE.MathUtils.clamp(y, -1, 1)
    );
    this.hasScriptStick = true;
  }

  public setScriptVertical(v: number): void {
    this.scriptVertical = THREE.MathUtils.clamp(v, -1, 1);
    this.hasScriptVertical = true;
  }

  /**
   * 物理更新ステップ
   */
  public update(
    dt: number,
    colliders: Octree[],
    character: HumanoidCharacter,
    camera: THREE.PerspectiveCamera,
    time: number,
    destination: THREE.Vector3 | null = null,
    falling = false
  ): void {
    if (!this.active) return;

    // 1. 実効入力の決定（検証フックによる保持入力を優先統合）
    const effectiveStickX = this.hasScriptStick ? this.scriptStick.x : this.stickInput.x;
    const effectiveStickY = this.hasScriptStick ? this.scriptStick.y : this.stickInput.y;
    const effectiveVert = (this.vehicle==='car'||this.vehicle==='boat')?0:this.hasScriptVertical ? this.scriptVertical : this.verticalInput;

    const wasGrounded = this.isGroundedOnSurface;
    const inWater = this.isSubmerged();
    if(!inWater&&this.vehicle==='submarine')this.vehicle='none';
    if(inWater&&this.vehicle==='car')this.vehicle='none';
    const takingOff = effectiveVert > .1;
    if(takingOff || inWater)this.walkingOffEdge=false;
    const walking = !inWater && !takingOff && (wasGrounded || this.walkingOffEdge);
    if(this.vehicle==='boat'&&!boatFitsWater(this.waterQuery,this.position.x,this.position.z))this.vehicle='none';
    const boating=this.vehicle==='boat';
    const maxSpeed = boating?8:walking ? (this.vehicle==='car'?12:FREE_FLIGHT_CONFIG.maxSpeedGround) : inWater ? (this.vehicle==='submarine'?15:FREE_FLIGHT_CONFIG.maxSpeedWater) : FREE_FLIGHT_CONFIG.maxSpeedAir;

    // 2. カメラ方向ベクトルの算出
    // 水平前進ベクトル (yaw 基準, +Zが南、-Zが北、+Xが東、-Xが西)
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    // 移動は水平面に固定する。視点を上下に向けても高度は変わらず、
    // 上昇・下降ボタンを押したときだけ垂直方向へ動く。
    const forwardH = this.forwardH.set(sinY, 0, -cosY);
    const rightH = this.rightH.set(cosY, 0, sinY);

    // 3. 目標速度ベクトルの生成
    const targetVel = this.targetVel.set(0, 0, 0);

    // スティック前進・後退
    if (Math.abs(effectiveStickY) > 0.02) {
      if (effectiveStickY > 0) {
        // 前進・後退は常に水平。高度の変更は右側の上下ボタンだけで行う。
        targetVel.addScaledVector(forwardH, effectiveStickY);
      } else {
        // 後退：水平後退
        targetVel.addScaledVector(forwardH, effectiveStickY);
      }
    }

    // スティック左右
    if (Math.abs(effectiveStickX) > 0.02) {
      targetVel.addScaledVector(rightH, effectiveStickX);
    }

    // 上がる・下がる（垂直ボタン）
    if (Math.abs(effectiveVert) > 0.02) {
      targetVel.y += effectiveVert;
    }

    // スティック入力があれば正規化して最高速度スケール
    const inputMag = Math.hypot(effectiveStickX, effectiveStickY, effectiveVert);
    if (inputMag > 0.02) {
      if(walking){
        targetVel.y=0;
        if(targetVel.lengthSq()>0)targetVel.setLength(Math.min(Math.hypot(effectiveStickX,effectiveStickY),1)*maxSpeed);
      } else {
        if (targetVel.length() > 1.0) targetVel.normalize();
        targetVel.multiplyScalar(Math.min(inputMag, 1.0) * maxSpeed);
      }
    }

    // Releasing the vertical controls holds depth as well as altitude.

    if (destination) {
      targetVel.subVectors(destination, this.position);
      if(walking||boating)targetVel.y=0;
      targetVel.clampLength(0,maxSpeed/2).multiplyScalar(2);if(this.autopilotSpeed)targetVel.clampLength(0,this.autopilotSpeed);
    }
    const previousVertical = this.velocity.y;

    // 4. 加速・減速（慣性とホバー停止）
    const hasInput = inputMag > 0.05 || destination !== null || falling;
    const accelRate = this.vehicle==='car'?(hasInput?4:9):hasInput ? FREE_FLIGHT_CONFIG.accelFactor : FREE_FLIGHT_CONFIG.decelFactor;
    const lerpAlpha = 1.0 - Math.pow(0.01, accelRate * dt * 0.15);

    this.velocity.lerp(targetVel, THREE.MathUtils.clamp(lerpAlpha, 0, 1));

    if (falling) this.velocity.y = Math.min(0, previousVertical) - 9.8 * dt;

    // 入力ゼロ時の微小速度カット（確実なホバー静止）
    if (!hasInput && this.velocity.length() < 0.15) {
      this.velocity.set(0, 0, 0);
    }

    // Only an explicit upward command takes off. Looking up while walking stays horizontal.
    if(takingOff)this.isGroundedOnSurface=false;
    if(walking){this.velocity.y=Math.min(0,previousVertical)-9.8*dt;}

    // 5. 位置の更新
    // 高速落下時は移動を分割して薄い屋根をすり抜けにくくする。
    const steps = Math.max(1, Math.ceil(this.velocity.length() * dt / ((falling||walking||this.velocity.y<-.5)?.25:.5)));
    for (let step = 0; step < steps; step++) {
      const oldX=this.position.x,oldZ=this.position.z;
      this.position.addScaledVector(this.velocity, dt / steps);
      if(boating&&!boatFitsWater(this.waterQuery,this.position.x,this.position.z)){this.position.x=oldX;this.position.z=oldZ;this.velocity.x=0;this.velocity.z=0;}
      if(boating){this.position.y=SEA+.04;this.velocity.y=0;}
      this.resolveCollisions(colliders);
      if(boating&&!boatFitsWater(this.waterQuery,this.position.x,this.position.z)){this.position.x=oldX;this.position.z=oldZ;this.velocity.x=0;this.velocity.z=0;}
      if (falling && (this.isGroundedOnSurface || this.isSubmerged())) {
        this.velocity.y = 0;
        break;
      }
    }

    // Keep contact over small gaps and slopes; a real ledge transitions into a fall.
    if(!boating&&!takingOff && this.velocity.y<=.5)this.snapToGround(colliders,wasGrounded ? .45 : .06);
    if(boating){this.isGroundedOnSurface=false;this.position.y=SEA+.04;this.velocity.y=0;}
    if(this.isGroundedOnSurface){
      this.walkingOffEdge=false;
      const horizontal=Math.hypot(this.velocity.x,this.velocity.z);
      const groundLimit=this.vehicle==='car'?12:FREE_FLIGHT_CONFIG.maxSpeedGround;
      if(horizontal>groundLimit){const scale=groundLimit/horizontal;this.velocity.x*=scale;this.velocity.z*=scale;}
      this.velocity.y=0;
    } else if(wasGrounded&&!takingOff&&!this.isSubmerged())this.walkingOffEdge=true;

    // 7. 移動範囲のクランプ
    const bounds = FREE_FLIGHT_CONFIG.bounds;
    this.position.x = THREE.MathUtils.clamp(this.position.x, bounds.minX, bounds.maxX);
    this.position.z = THREE.MathUtils.clamp(this.position.z, bounds.minZ, bounds.maxZ);
    this.position.y = THREE.MathUtils.clamp(this.position.y, bounds.minY, bounds.maxY);

    // 8. 状態の更新 ('ground' | 'air' | 'water')
    if (this.isSubmerged()) {
      this.state = 'water';
      this.isGroundedOnSurface = false;
      this.walkingOffEdge = false;
    } else if (this.isGroundedOnSurface) {
      this.state = 'ground';
    } else {
      this.state = 'air';
    }

    // 9. 人型キャラクターモデルの同期と姿勢制御
    if((this.vehicle==='submarine'&&this.state!=='water')||(this.vehicle==='car'&&this.state!=='ground'))this.vehicle='none';
    character.setVehicle(this.vehicle);
    character.setPosition(this.position);
    
    // キャラクターの向き：移動速度が一定以上あれば移動方向、それ以外はカメラの水平向き
    let charTargetYaw = (this.vehicle==='car'||boating)?character.getYaw():this.yaw;
    const curSpeed = this.velocity.length();
    const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (horizSpeed > 0.4) {
      charTargetYaw = Math.atan2((this.vehicle==='car'||boating)?-this.velocity.x:this.velocity.x, -this.velocity.z);
    }
    character.updatePose(charTargetYaw, curSpeed, this.state==='ground'&&this.vehicle!=='car'?FREE_FLIGHT_CONFIG.maxSpeedGround:maxSpeed, this.state, dt, time);

    // 10. 三人称追従カメラの更新（Roll=0度固定、水面出入りも同一カメラでシームレス）
    this.updateCamera(camera, colliders);
  }

  /**
   * 三人称追従カメラワーク（TASK-GRAVITYMODE-FIX1 §修正要件1: 遮蔽対策）
   */
  private updateCamera(camera: THREE.PerspectiveCamera, colliders: Octree[]): void {
    const config = FREE_FLIGHT_CONFIG;
    // 注視点：キャラクターの胸〜頭部付近
    const targetLookAt = this.targetLookAt.set(this.position.x,this.position.y+config.lookAtHeight,this.position.z);

    // 視線ベクトル（ヨー・ピッチ基準）
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    const sinP = Math.sin(this.pitch);
    const cosP = Math.cos(this.pitch);
    const forward3D = this.forward3D.set(sinY * cosP, sinP, -cosY * cosP);

    // 真上・真下照準時に camera.up (0,1,0) と平行になって特異点（NaN）が生じるのを防止
    const camOffset = this.camOffset.copy(forward3D);
    if (Math.abs(camOffset.x) < 0.001 && Math.abs(camOffset.z) < 0.001) {
      camOffset.z = camOffset.y > 0 ? 0.001 : -0.001;
      camOffset.normalize();
    }

    // カメラ希望位置：注視点から後方へ距離 9m
    const desiredCamPos = this.desiredCamPos.copy(targetLookAt).addScaledVector(camOffset, -config.cameraDistance);
    if(this.state==='ground')desiredCamPos.y=Math.max(desiredCamPos.y,this.position.y+1.8);

    // 遮蔽判定（キャラ→希望位置の線分と全コライダーの交差を判定し最適位置へクランプ）
    const dir = this.cameraDirection.copy(desiredCamPos).sub(targetLookAt); const distance = dir.length(); dir.normalize();
    const ray=this.cameraRay.set(targetLookAt,dir);
    let safe = distance;
    for (const tree of colliders) { if(this.skipWaterTerrain(tree))continue;const hit = tree.rayIntersect(ray); if (hit && hit.distance < safe) safe = Math.max(0.3, hit.distance - 0.3); }
    const actualCamPos = this.actualCamPos.copy(targetLookAt).addScaledVector(dir, safe);

    // 海底面（Y=-16）より下にカメラが入らないよう微調整
    if (actualCamPos.y < SEA - 15.2) {
      actualCamPos.y = SEA - 15.2;
    }

    if(this.state==='water')actualCamPos.y=Math.min(actualCamPos.y,SEA-.4);
    if(this.vehicle==='boat')actualCamPos.y=Math.max(actualCamPos.y,SEA+2);
    camera.position.copy(actualCamPos);
    camera.up.set(0, 1, 0); // Roll=0度完全固定
    camera.lookAt(targetLookAt);
  }

  /**
   * 建物・岸壁コライダーとの衝突解決（AABB押し出し＋着地）
   */
  private skipWaterTerrain(tree:Octree):boolean {
    return !!(tree as Octree & {waterTerrain?:boolean}).waterTerrain&&this.position.y<SEA+3&&this.waterQuery(this.position.x,this.position.z);
  }
  private resolveCollisions(colliders: Octree[]): void {
    const capsule = this.capsule;
    capsule.radius=this.vehicle==='car'?1.2:this.vehicle==='boat'?1.3:.5;
    capsule.start.copy(this.position);capsule.start.y+=capsule.radius;
    capsule.end.copy(this.position);capsule.end.y+=Math.max(1.2,capsule.radius);
    let landed = false;
    for (const tree of colliders) {
      if(this.skipWaterTerrain(tree))continue;
      for (let i = 0; i < 3; i++) {
        const hit = tree.capsuleIntersect(capsule); if (!hit) break;
        const push = this.capsulePush.copy(hit.normal).multiplyScalar(hit.depth + 0.001);
        capsule.translate(push); this.position.add(push);
        const v = this.velocity.dot(hit.normal); if (v < 0) this.velocity.addScaledVector(hit.normal, -v);
        if (hit.normal.y > 0.7 && !this.isSubmerged()) landed = true;
      }
    }
    this.isGroundedOnSurface = landed;
  }

  private snapToGround(colliders:Octree[],reach:number):void {
    if(this.isSubmerged())return;
    const ray=this.groundRay.set(this.position,this.groundRay.direction);
    ray.origin.y+=.35;
    let nearest=Infinity,groundY:number|undefined;
    for(const tree of colliders){
      if(this.skipWaterTerrain(tree))continue;
      const hit=tree.rayIntersect(ray);
      if(!hit || hit.distance> .35+reach || hit.distance>=nearest)continue;
      if(hit.triangle.getNormal(this.groundNormal).y<.7)continue;
      if(hit.position.y<SEA && this.waterQuery(this.position.x,this.position.z))continue;
      nearest=hit.distance;groundY=hit.position.y;
    }
    if(groundY!==undefined){this.position.y=groundY+.001;this.velocity.y=0;this.isGroundedOnSurface=true;}
  }

  /**
   * 指示書 §5 準拠のフック状態オブジェクト取得
   */
  public getHookData(): FreeFlightStatus {
    return {
      active: this.active,
      state: this.state,
      speed: Number(this.velocity.length().toFixed(2)),
      altitude: Number(Math.max(0, this.position.y - SEA).toFixed(2)),
      depth: Number(Math.max(0, SEA - this.position.y).toFixed(2)),
    };
  }
}
