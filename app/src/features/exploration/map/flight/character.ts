import * as THREE from 'three';
import {type AvatarId,type PhotoPose,type VehicleId} from './avatarOptions';
import {createSubmarine} from './submarine';
import {createCar} from './car';

export class HumanoidCharacter {
  public group: THREE.Group;
  private modelRoot: THREE.Group;
  private head: THREE.Group;
  private torso: THREE.Mesh;
  private leftArm: THREE.Group;
  private rightArm: THREE.Group;
  private leftLeg: THREE.Group;
  private rightLeg: THREE.Group;
  private backpackLight: THREE.PointLight;
  private chestLight: THREE.PointLight;
  private suitMat: THREE.MeshStandardMaterial;

  private hoodMat:THREE.MeshStandardMaterial;
  private headShell:THREE.Mesh;
  private fins:THREE.Mesh[]=[];
  private jellySkirt:THREE.Mesh;
  private lure:THREE.Group;
  private submarine=createSubmarine();
  private car=createCar();
  private vehicle:VehicleId='none';
  private walkPhase=0;
  private currentYaw: number = 0;
  private currentPitch: number = 0;
  private currentUp: THREE.Vector3 = new THREE.Vector3(0, 1, 0);

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'HumanoidCharacter';

    this.modelRoot = new THREE.Group();
    this.group.add(this.modelRoot);

    // --- マテリアル（夕景の港・水中で視認性の高い白＋ネオンオレンジ＋シアン発光） ---
    this.suitMat = new THREE.MeshStandardMaterial({
      color: 0xe6ddcb,
      roughness: 0.75,
      metalness: 0.02,
      emissive: 0x000000,
      emissiveIntensity: 0,
    });
    const suitMat = this.suitMat;
    const hoodMat = this.hoodMat = new THREE.MeshStandardMaterial({color:0xba7770, roughness:.9});
    hoodMat.userData.atmosphereExempt=true;this.suitMat.userData.atmosphereExempt=true;

    const accentMat = new THREE.MeshStandardMaterial({
      color: 0xf4d7a7, // 潜水服のあたたかい縁
      roughness: 0.3,
      emissive: 0x5a3625,
      emissiveIntensity: 0.12,
    });

    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.6,
      metalness: 0.2,
      emissive: 0x0f172a,
      emissiveIntensity: 0.3,
    });

    const visorMat = new THREE.MeshStandardMaterial({
      color: 0x052640,
      emissive: 0x38bdf8,
      emissiveIntensity: .3,
      roughness: 0.1,
    });

    // 1. 胴体（トルソー）
    const torsoGeom = new THREE.CapsuleGeometry(0.29, 0.32, 8, 16);
    this.torso = new THREE.Mesh(torsoGeom, suitMat);
    this.torso.position.y = 0.82;
    this.modelRoot.add(this.torso);

    // 胴体アクセント帯
    const chestStripe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.25, 0.14, 16),
      accentMat
    );
    chestStripe.position.y = 0.85;
    this.modelRoot.add(chestStripe);

    // 2. 頭部
    this.head = new THREE.Group();
    this.head.position.y = 1.25;

    const headSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 16, 12),
      hoodMat
    );
    this.headShell=headSphere;
    headSphere.scale.set(1.15, .98, 1.03);
    this.head.add(headSphere);
    // メンダコらしい耳ひれ。正面・背面のどちらからも輪郭が見える。
    const finGeometry = new THREE.SphereGeometry(.16, 12, 8);
    for (const side of [-1,1]) {
      const fin=new THREE.Mesh(finGeometry,hoodMat);
      fin.scale.set(.58,1.05,.34);fin.position.set(side*.36,.19,0);
      fin.rotation.z=-side*.72;this.head.add(fin);this.fins.push(fin);
    }

    this.jellySkirt=new THREE.Mesh(new THREE.CylinderGeometry(.33,.45,.16,12),hoodMat);
    this.jellySkirt.name='jelly-skirt';this.jellySkirt.position.y=-.15;this.jellySkirt.visible=false;this.head.add(this.jellySkirt);
    this.lure=new THREE.Group();this.lure.name='angler-lure';this.lure.visible=false;
    const stalk=new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,.35,6),accentMat);stalk.rotation.x=-.6;stalk.position.set(0,.37,-.12);
    const glow=new THREE.Mesh(new THREE.SphereGeometry(.065,8,6),new THREE.MeshBasicMaterial({color:0xffeb9c}));glow.position.set(0,.52,-.22);
    this.lure.add(stalk,glow);this.head.add(this.lure);
    this.modelRoot.add(this.submarine.root,this.car.root);

    // バイザー（顔の前方：-Z 方向をローカル正面とする）
    // A flat inset sits in front of the hood surface, avoiding intersecting meshes.
    const visorMesh = new THREE.Mesh(new THREE.CircleGeometry(.245,32), new THREE.MeshBasicMaterial({color:0x20373b}));
    visorMesh.scale.set(1,.78,1);visorMesh.position.set(0,.02,-.355);visorMesh.rotation.y=Math.PI;
    this.head.add(visorMesh);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(.255,.022,6,32),accentMat);
    rim.scale.y=.78;rim.position.set(0,.02,-.364);this.head.add(rim);
    const eyeMat=new THREE.MeshBasicMaterial({color:0xf8ede0});
    const eyeGeometry=new THREE.CircleGeometry(.025,12);
    for(const side of [-1,1]){
      const eye=new THREE.Mesh(eyeGeometry,eyeMat);eye.rotation.y=Math.PI;
      eye.position.set(side*.085,.03,-.37);this.head.add(eye);
    }

    this.modelRoot.add(this.head);

    // 3. バックパック（飛行用小型スラスター：背中 +Z 方向）
    const backpackGeom = new THREE.BoxGeometry(0.26, 0.34, 0.14);
    const backpackMesh = new THREE.Mesh(backpackGeom, darkMat);
    backpackMesh.position.set(0, 0.84, 0.22);
    this.modelRoot.add(backpackMesh);
    // 後ろ姿で分かる丸い空気タンクと浮き輪の縁。
    const tank = new THREE.Mesh(new THREE.SphereGeometry(.18,12,8), accentMat);
    tank.scale.set(1,1.25,.45);tank.position.set(0,.86,.32);this.modelRoot.add(tank);
    const tankWindow = new THREE.Mesh(new THREE.SphereGeometry(.095,10,8), visorMat);
    tankWindow.scale.set(1,1,.35);tankWindow.position.set(0,.86,.405);this.modelRoot.add(tankWindow);

    const thrusterRing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.10, 0.08, 12),
      visorMat
    );
    thrusterRing.rotation.x = Math.PI / 2;
    thrusterRing.position.set(0, 0.74, 0.28);
    this.modelRoot.add(thrusterRing);

    // スラスターライト（背後からの照光：白飛び防止のため初期値・水上を適正化）
    this.backpackLight = new THREE.PointLight(0x7dd3fc, 0, 4.0);
    this.backpackLight.position.set(0, 0.74, 0.45);
    this.modelRoot.add(this.backpackLight);

    // チェストライト（水中でも胸元・手足を照らす補助光）
    this.chestLight = new THREE.PointLight(0x7dd3fc, 0, 3.0);
    this.chestLight.position.set(0, 0.85, -0.45);
    this.modelRoot.add(this.chestLight);

    // 4. 腕（左腕・右腕：肩関節グループ）
    const armGeom = new THREE.CapsuleGeometry(0.10, 0.25, 6, 12);

    // 左腕
    this.leftArm = new THREE.Group();this.leftArm.name='left-arm';
    this.leftArm.position.set(0.34, 0.98, 0);
    const leftArmMesh = new THREE.Mesh(armGeom, suitMat);
    leftArmMesh.position.y = -0.20;
    this.leftArm.add(leftArmMesh);
    this.modelRoot.add(this.leftArm);

    // 右腕
    this.rightArm = new THREE.Group();this.rightArm.name='right-arm';
    this.rightArm.position.set(-0.34, 0.98, 0);
    const rightArmMesh = new THREE.Mesh(armGeom, suitMat);
    rightArmMesh.position.y = -0.20;
    this.rightArm.add(rightArmMesh);
    this.modelRoot.add(this.rightArm);

    // 5. 脚（左脚・右脚：股関節グループ）
    const legGeom = new THREE.CapsuleGeometry(0.12, 0.32, 6, 12);

    // 左脚
    this.leftLeg = new THREE.Group();
    this.leftLeg.name='left-leg';
    this.leftLeg.position.set(0.14, 0.54, 0);
    const leftLegMesh = new THREE.Mesh(legGeom, suitMat);
    leftLegMesh.position.y = -0.24;
    this.leftLeg.add(leftLegMesh);
    this.modelRoot.add(this.leftLeg);

    // 右脚
    this.rightLeg = new THREE.Group();
    this.rightLeg.name='right-leg';
    this.rightLeg.position.set(-0.14, 0.54, 0);
    const rightLegMesh = new THREE.Mesh(legGeom, suitMat);
    rightLegMesh.position.y = -0.24;
    this.rightLeg.add(rightLegMesh);
    this.modelRoot.add(this.rightLeg);

    // 初期状態では非表示（コースモードがデフォルトのため）
    this.group.visible = false;
  }

  public setAvatar(id:AvatarId):void{
    const palette={mendako:[0xba7770,0xe6ddcb],jellyfish:[0x8cb8cc,0xdce5ea],angler:[0x778866,0xe4d4ad]}[id];
    this.hoodMat.color.setHex(palette[0]);this.suitMat.color.setHex(palette[1]);
    this.fins.forEach(f=>f.visible=id==='mendako');this.jellySkirt.visible=id==='jellyfish';this.lure.visible=id==='angler';
    this.headShell.scale.set(id==='jellyfish'?1.25:1.15,id==='jellyfish'?.9:.98,1.03);
    this.group.userData.avatar=id;
  }
  public setVehicle(id:VehicleId):void{this.vehicle=id;this.submarine.root.visible=id==='submarine';this.car.root.visible=id==='car';this.group.userData.vehicle=id;}
  public applyPhotoPose(pose:PhotoPose,yaw:number):void{
    this.resetOrientation(yaw);
    this.leftArm.rotation.set(0,0,.08);this.rightArm.rotation.set(0,0,-.08);
    this.leftLeg.rotation.set(0,0,0);this.rightLeg.rotation.set(0,0,0);
    if(pose==='wave')this.leftArm.rotation.set(-.15,0,2.5);
    if(pose==='cheer'){this.leftArm.rotation.z=2.65;this.rightArm.rotation.z=-2.65;}
    if(pose==='salute')this.rightArm.quaternion.setFromUnitVectors(new THREE.Vector3(0,-1,0),new THREE.Vector3(.14,.32,-.3).normalize());
    if(this.vehicle!=='none'){this.leftLeg.rotation.x=-1.1;this.rightLeg.rotation.x=-1.1;}
    this.group.userData.photoPose=pose;
  }
  public getYaw():number { return this.currentYaw; }
  public dispose():void {
    const geometries=new Set<THREE.BufferGeometry>(), materials=new Set<THREE.Material>();
    this.group.traverse(o=>{if(o instanceof THREE.Mesh){geometries.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));}});
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());this.group.removeFromParent();
  }
  public setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  public setPosition(pos: THREE.Vector3): void {
    this.group.position.copy(pos);
  }

  /**
   * キャラクターの姿勢・ポーズ更新
   * @param targetYaw 目標Yaw角（カメラ基準または進行方向）
   * @param speed 現在の速度 (m/s)
   * @param maxSpeed 最大速度 (m/s)
   * @param state 'ground' | 'air' | 'water'
   * @param dt デルタタイム
   * @param time 経過時間
   */
  public updatePose(
    targetYaw: number,
    speed: number,
    maxSpeed: number,
    state: 'ground' | 'air' | 'water',
    dt: number,
    time: number
  ): void {
    // 1. Yaw回転の滑らかな補間（最短回転）
    let dy = targetYaw - this.currentYaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    const yawAlpha = 1.0 - Math.pow(0.001, dt);
    this.currentYaw += dy * THREE.MathUtils.clamp(yawAlpha * 2.5, 0, 1);
    this.modelRoot.rotation.y = this.currentYaw;

    // 2. 速度に応じた前傾（Pitch：頭が前進方向-Zへ倒れる負の回転）
    const speedRatio = THREE.MathUtils.clamp(speed / Math.max(maxSpeed, 1.0), 0, 1);
    let targetPitch = 0;
    if (state !== 'ground') {
      // 空中・水中では前進速度に応じて最大約 50度 前傾
      targetPitch = -(speedRatio * 0.85);
    }
    this.currentPitch += (targetPitch - this.currentPitch) * (1.0 - Math.pow(0.01, dt));
    this.modelRoot.rotation.x = this.currentPitch;

    // 3. ホバー中の上下微動（浮遊感）
    if (state === 'air') {
      const hoverY = Math.sin(time * 3.2) * 0.08 * (1.0 - speedRatio * 0.7);
      this.modelRoot.position.y = hoverY;
    } else if (state === 'water') {
      const hoverY = Math.sin(time * 2.0) * 0.12;
      this.modelRoot.position.y = hoverY;
    } else {
      this.modelRoot.position.y = 0;
    }

    // 4. 手足のアニメーション
    if (state === 'water') {
      // 水中：ゆっくりした平泳ぎ・キック
      const swimFreq = 3.0;
      const armSwing = Math.sin(time * swimFreq) * 0.55;
      const legKick = Math.sin(time * swimFreq + Math.PI / 2) * 0.40;

      this.leftArm.rotation.x = -armSwing;
      this.rightArm.rotation.x = -armSwing;
      this.leftArm.rotation.z = Math.abs(armSwing) * 0.4;
      this.rightArm.rotation.z = -Math.abs(armSwing) * 0.4;

      this.leftLeg.rotation.x = legKick;
      this.rightLeg.rotation.x = -legKick;
    } else if (state === 'air') {
      // 空中：飛行姿勢（腕をやや後ろに開き、脚を伸ばす）
      const flyArmX = speedRatio * 0.6;
      this.leftArm.rotation.x = flyArmX;
      this.rightArm.rotation.x = flyArmX;
      this.leftArm.rotation.z = 0.15 + speedRatio * 0.25;
      this.rightArm.rotation.z = -(0.15 + speedRatio * 0.25);

      this.leftLeg.rotation.x = speedRatio * 0.35;
      this.rightLeg.rotation.x = speedRatio * 0.35;
    } else {
      // Distance-driven stride: stop swinging when the player stops.
      this.walkPhase+=Math.min(speed,2.8)*dt*4.8;
      const stride=Math.sin(this.walkPhase)*.52*speedRatio;
      this.leftArm.rotation.set(-stride*.75,0,.08);
      this.rightArm.rotation.set(stride*.75,0,-.08);
      this.leftLeg.rotation.set(stride,0,0);
      this.rightLeg.rotation.set(-stride,0,0);
      this.modelRoot.position.y=Math.abs(Math.sin(this.walkPhase))*.025*speedRatio;
    }

    if(this.vehicle!=='none'){
      this.leftArm.rotation.set(-1,0,.15);this.rightArm.rotation.set(-1,0,-.15);
      this.leftLeg.rotation.set(-1.1,0,0);this.rightLeg.rotation.set(-1.1,0,0);
      this.modelRoot.rotation.x*=.2;if(this.vehicle==='submarine')this.submarine.update(time,speed);else this.car.update(dt,speed);
    }
    // 5. 状態に応じたライトと自発光の最適化（白飛び防止と水中視認性の両立）
    if (state === 'water') {
      this.backpackLight.intensity = 0;
      this.backpackLight.distance = 6.0;
      this.chestLight.intensity = 0;
      this.chestLight.distance = 5.0;
      this.suitMat.emissiveIntensity = 0;
    } else if(state==='ground'){
      this.backpackLight.intensity=0;this.chestLight.intensity=0;
      this.suitMat.emissiveIntensity=0;
    } else {
      this.backpackLight.intensity = 0;
      this.backpackLight.distance = 4.0;
      this.chestLight.intensity = 0;
      this.chestLight.distance = 3.0;
      this.suitMat.emissiveIntensity = 0;
    }
  }

  public resetOrientation(yaw: number): void {
    this.currentYaw = yaw;
    this.currentPitch = 0;
    this.currentUp.set(0, 1, 0);
    this.modelRoot.quaternion.identity();
    this.modelRoot.rotation.set(0, yaw, 0);
    this.modelRoot.position.set(0, 0, 0);
  }

  /**
   * 重力モード用姿勢・ポーズ更新
   * キャラの上方向 = -重力方向（足が重力側）、float/water では世界の上(0,1,0)へ滑らかに補間
   */
  public updateGravityPose(
    targetYaw: number,
    speed: number,
    maxSpeed: number,
    state: 'stand' | 'float' | 'fall' | 'water',
    gravityDir: THREE.Vector3,
    dt: number,
    time: number
  ): void {
    // 1. 目標の上方向ベクトルの決定
    const targetUp = new THREE.Vector3(0, 1, 0);
    if (state === 'fall' || state === 'stand') {
      targetUp.copy(gravityDir).multiplyScalar(-1);
      if (targetUp.lengthSq() < 0.001) {
        targetUp.set(0, 1, 0);
      } else {
        targetUp.normalize();
      }
    }

    // 2. 上方向ベクトルの滑らかな補間（球面回転に近いlerp+normalize）
    const upLerpAlpha = 1.0 - Math.pow(0.0005, dt);
    this.currentUp.lerp(targetUp, THREE.MathUtils.clamp(upLerpAlpha * 3.0, 0, 1));
    if (this.currentUp.lengthSq() < 0.001) {
      this.currentUp.set(0, 1, 0);
    } else {
      this.currentUp.normalize();
    }

    // 3. 上方向への回転クォータニオン
    const baseUp = new THREE.Vector3(0, 1, 0);
    const qUp = new THREE.Quaternion().setFromUnitVectors(baseUp, this.currentUp);

    // 4. 水平Yaw回転の補間
    let dy = targetYaw - this.currentYaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    const yawAlpha = 1.0 - Math.pow(0.001, dt);
    this.currentYaw += dy * THREE.MathUtils.clamp(yawAlpha * 2.5, 0, 1);
    const qYaw = new THREE.Quaternion().setFromAxisAngle(baseUp, this.currentYaw);

    // 全体クォータニオンの合成
    this.modelRoot.quaternion.copy(qUp).multiply(qYaw);

    // 5. ホバー・浮遊の微動
    const speedRatio = THREE.MathUtils.clamp(speed / Math.max(maxSpeed, 1.0), 0, 1);
    if (state === 'float') {
      const hoverY = Math.sin(time * 3.2) * 0.08 * (1.0 - speedRatio * 0.7);
      this.modelRoot.position.set(0, 0, 0).addScaledVector(this.currentUp, hoverY);
    } else if (state === 'water') {
      const hoverY = Math.sin(time * 2.0) * 0.12;
      this.modelRoot.position.set(0, 0, 0).addScaledVector(this.currentUp, hoverY);
    } else {
      this.modelRoot.position.set(0, 0, 0);
    }

    // 6. 手足のアニメーション
    if (state === 'water') {
      // 水中：平泳ぎ
      const swimFreq = 3.0;
      const armSwing = Math.sin(time * swimFreq) * 0.55;
      const legKick = Math.sin(time * swimFreq + Math.PI / 2) * 0.40;
      this.leftArm.rotation.x = -armSwing;
      this.rightArm.rotation.x = -armSwing;
      this.leftArm.rotation.z = Math.abs(armSwing) * 0.4;
      this.rightArm.rotation.z = -Math.abs(armSwing) * 0.4;
      this.leftLeg.rotation.x = legKick;
      this.rightLeg.rotation.x = -legKick;
    } else if (state === 'fall') {
      // 落下中：手足をやや広げた安定姿勢
      this.leftArm.rotation.set(0.35, 0, 0.45);
      this.rightArm.rotation.set(0.35, 0, -0.45);
      this.leftLeg.rotation.set(0.2, 0, 0.2);
      this.rightLeg.rotation.set(0.2, 0, -0.2);
    } else if (state === 'stand') {
      // 接地歩行
      if (speedRatio > 0.08) {
        const walkFreq = 7.0;
        const walkSwing = Math.sin(time * walkFreq) * 0.45 * speedRatio;
        this.leftArm.rotation.set(-walkSwing, 0, 0.08);
        this.rightArm.rotation.set(walkSwing, 0, -0.08);
        this.leftLeg.rotation.set(walkSwing, 0, 0);
        this.rightLeg.rotation.set(-walkSwing, 0, 0);
      } else {
        this.leftArm.rotation.set(0, 0, 0.08);
        this.rightArm.rotation.set(0, 0, -0.08);
        this.leftLeg.rotation.set(0, 0, 0);
        this.rightLeg.rotation.set(0, 0, 0);
      }
    } else {
      // float 浮遊
      const floatBreath = Math.sin(time * 2.5) * 0.06;
      this.leftArm.rotation.set(0.1 + floatBreath, 0, 0.18);
      this.rightArm.rotation.set(0.1 + floatBreath, 0, -0.18);
      this.leftLeg.rotation.set(0.05, 0, 0.08);
      this.rightLeg.rotation.set(0.05, 0, -0.08);
    }

    // 7. 状態に応じたライトと自発光の最適化（TASK-GRAVITYMODE-FIX1 §修正要件3: 正対時の白飛び軽減）
    if (state === 'water') {
      this.backpackLight.intensity = 0;
      this.backpackLight.distance = 6.0;
      this.chestLight.intensity = 0;
      this.chestLight.distance = 5.0;
      this.suitMat.emissiveIntensity = 0;
    } else if (state === 'stand') {
      // 壁立ち時は壁面直近（0.55m）での照り返し・白飛びを徹底抑制
      this.backpackLight.intensity = 0;
      this.backpackLight.distance = 2.5;
      this.chestLight.intensity = 0;
      this.chestLight.distance = 2.0;
      this.suitMat.emissiveIntensity = 0;
    } else {
      // 通常空中（float / fall）
      this.backpackLight.intensity = 0;
      this.backpackLight.distance = 4.0;
      this.chestLight.intensity = 0;
      this.chestLight.distance = 3.0;
      this.suitMat.emissiveIntensity = 0;
    }
  }
}
