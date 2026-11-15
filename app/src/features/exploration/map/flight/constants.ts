import * as THREE from 'three';
import { PhysicsParams } from './types';

// 初期物理パラメータ（agy-round4.txt 準拠）
export const DEFAULT_PARAMS: PhysicsParams = {
  gravityAcc: 26.0,
  maxSpeed: 32.0,
  airResistance: 0.025,
  inertiaRatio: 0.45,
  restitution: 0.00,
  gripMargin: 0.20,
  colliderRadius: 0.60,
  inputBufferTime: 0.15,
};

// カメラ定数
export const CAMERA_CONFIG = {
  initialPosition: new THREE.Vector3(28.0, 16.0, 42.0),
  fov: 58,
  lookAtLerpAlpha: 0.06,
  railElevatorAlpha: 0.03,
  railYMin: 14.0,
  railYMax: 20.0,
};

// スタート地点・ゴール設定（コースA: びゅうお一往復）
export const START_POSITION_A = new THREE.Vector3(-10.0, 5.10, 0.0);
export const GOAL_CONFIG_A = {
  center: new THREE.Vector3(-10.0, 4.51, 0.0),
  radius: 3.0,
};

// スタート地点・ゴール設定（コースB: 魚市場ルート登頂）
export const START_POSITION_B = new THREE.Vector3(-45.0, 9.60, 0.0);
export const GOAL_CONFIG_B = {
  center: new THREE.Vector3(0.0, 31.55, 0.0),
  radius: 6.0,
};

// スタート地点・初期視線設定（自由飛行モード: FREE）
// 西岸壁上空 (-45, 14, 28) からびゅうお水門 (0, 18, 0) を真正面に見渡す
export const START_POSITION_FREE = new THREE.Vector3(-210, 65, -335);
export const INITIAL_FREE_LOOK = {
  yawDeg: 0.0,    // 北東（びゅうお水門）正面
  pitchDeg: 4.0,   // 水平〜やや見上げでびゅうお全景を美しく画角内に収める
};

// 自由飛行モード（FREE）の物理・動作パラメータ
export const FREE_FLIGHT_CONFIG = {
  maxSpeedGround: 5.5,     // Walking pace after landing (m/s)
  maxSpeedAir: 22.0,       // 空中最高速度 (m/s)
  maxSpeedWater: 10.8,     // 水中最高速度 (m/s)
  accelFactor: 8.0,        // スティック入力への追従加速度係数
  decelFactor: 4.5,        // 入力なし時の減速・ホバー停止係数
  waterBuoyancy: 0.8,      // 水中浮力 (上向き微速 m/s)
  bounds: {
    minX: -1550.0,
    maxX: 1450.0,
    minZ: -2580.0,
    maxZ: 1800.0,
    minY: 27.5,
    maxY: 420.0,
  },
  cameraDistance: 9.0,     // キャラクター後方距離 (m)
  cameraHeight: 2.0,       // キャラクター上方オフセット (m)
  lookAtHeight: 1.1,       // 注視点のキャラクター上方オフセット (m)
  pitchMinDeg: -89.9,      // 見下ろし限界（真下照準対応）
  pitchMaxDeg: 89.9,       // 見上げ限界（真上照準対応）
};

// 自由飛行・重力サブモードの物理・動作パラメータ（TASK-GRAVITYMODE §1）
export const GRAVITY_MODE_CONFIG = {
  gravityAcc: 26.0,        // 重力加速度 (m/s²)
  terminalSpeed: 30.0,     // 終端速度 (m/s)
  floatMaxSpeed: 5.0,      // float ドリフト最高速度 (m/s)
  standMaxSpeed: 6.0,      // stand 面歩行最高速度 (m/s)
  waterMaxSpeed: 10.8,     // 水中最高速度 (m/s)
  accelFactor: 8.0,
  decelFactor: 7.0,
  waterBuoyancy: 0.8,
  charRadius: 0.55,        // キャラクター衝突半径 (m)
};

// 岸壁コライダー（自由飛行モード用に追加）
export const PIER_COLLIDER_DEFINITIONS: BoxDef[] = [
  {
    name: 'Collider_WestPier',
    center: new THREE.Vector3(-45.0, 1.9, 0.0),
    size: new THREE.Vector3(65.0, 3.8, 60.0),
  },
  {
    name: 'Collider_EastPier',
    center: new THREE.Vector3(35.0, 1.9, 0.0),
    size: new THREE.Vector3(40.0, 3.8, 60.0),
  },
];

// 互換用デフォルト参照
export const START_POSITION = START_POSITION_A;
export const GOAL_CONFIG = GOAL_CONFIG_A;

// 手動直方体（Box3）コライダー定義
// コースA・コースB共通で破綻なく機能するハイブリッドコンパウンド設計
export interface BoxDef {
  name: string;
  center: THREE.Vector3;
  size: THREE.Vector3;
  isTrigger?: boolean;
}

export const COLLIDER_DEFINITIONS: BoxDef[] = [
  // --- 魚市場ルート追加建物（フェーズB） ---
  // 1. 魚市場（大屋根・スタート地点）: 中心 X=-48.0, Y=4.5, Z=0.0 (幅12m × 高さ9m × 奥行20m)
  // 屋根上面は Y = 9.0m
  {
    name: 'Collider_Market',
    center: new THREE.Vector3(-48.0, 4.5, 0.0),
    size: new THREE.Vector3(12.0, 9.0, 20.0),
  },
  // 2. 中継棟1（低層倉庫棟）: 中心 X=-35.5, Y=4.0, Z=0.0 (幅7m × 高さ8m × 奥行16m)
  // 屋根上面は Y = 8.0m
  {
    name: 'Collider_Bldg1',
    center: new THREE.Vector3(-35.5, 4.0, 0.0),
    size: new THREE.Vector3(7.0, 8.0, 16.0),
  },
  // 3. 中継棟2（低層市場棟）: 中心 X=-26.0, Y=3.5, Z=0.0 (幅6m × 高さ7m × 奥行16m)
  // 屋根上面は Y = 7.0m
  {
    name: 'Collider_Bldg2',
    center: new THREE.Vector3(-26.0, 3.5, 0.0),
    size: new THREE.Vector3(6.0, 7.0, 16.0),
  },

  // --- びゅうお建築 ---
  // 4. 西塔本体: 幅 8.0m × 奥行 9.5m × 高さ 22.0m (中心 X=-13.0, Y=19.0, Z=0.0)
  // Y範囲: 8.0 〜 30.0m（Y=4.5〜8.0m は地上ピロティ通路として開放し、コースBの合流を可能に）
  // 内壁面は X = -9.0m
  {
    name: 'Collider_WestTower',
    center: new THREE.Vector3(-13.0, 19.0, 0.0),
    size: new THREE.Vector3(8.0, 22.0, 9.5),
  },
  // 5. 東塔本体: 幅 8.0m × 奥行 9.5m × 高さ 30.0m (中心 X=+13.0, Y=15.0, Z=0.0)
  // Y範囲: 0.0 〜 30.0m、内壁面は X = +9.0m (塔間開口幅 18.0m)
  {
    name: 'Collider_EastTower',
    center: new THREE.Vector3(13.0, 15.0, 0.0),
    size: new THREE.Vector3(8.0, 30.0, 9.5),
  },
  // 6. 上部展望回廊: 幅 24.5m × 奥行 7.5m × 高さ 5.5m (中心 X=4.75, Y=28.5, Z=0.0)
  // X範囲: -7.5 〜 +17.0m（西塔内壁 X=-9.0 付近の頭上を開放し、西塔内壁からの垂直登頂ダイブを可能に）
  // 下面は Y = 25.75m
  {
    name: 'Collider_Bridge',
    center: new THREE.Vector3(4.75, 28.5, 0.0),
    size: new THREE.Vector3(24.5, 5.5, 7.5),
  },
  // 7. 西側基礎・機械室屋上: 幅 12.0m × 奥行 14.0m × 高さ 4.5m (中心 X=-13.0, Y=2.25, Z=0.0)
  // 上面は Y = 4.5m (コースAスタート・ゴール、コースB合流足場)
  {
    name: 'Collider_WestBase',
    center: new THREE.Vector3(-13.0, 2.25, 0.0),
    size: new THREE.Vector3(12.0, 4.5, 14.0),
  },
  // 8. 東側基礎・機械室屋上: 幅 12.0m × 奥行 14.0m × 高さ 4.5m (中心 X=+13.0, Y=2.25, Z=0.0)
  // 上面は Y = 4.5m
  {
    name: 'Collider_EastBase',
    center: new THREE.Vector3(13.0, 2.25, 0.0),
    size: new THREE.Vector3(12.0, 4.5, 14.0),
  },
  // 9. 水門扉体・格納部: 幅 16.5m × 奥行 1.8m × 高さ 3.0m (中心 X=0.75, Y=24.25, Z=0.0)
  // X範囲: -7.5 〜 +9.0m (東塔側 Y=22.15 天井吸着面を完全保持)
  {
    name: 'Collider_GateDoor',
    center: new THREE.Vector3(0.75, 24.25, 0.0),
    size: new THREE.Vector3(16.5, 3.0, 1.8),
  },
  // 10. 展望デッキ（回廊上面登頂板）: 幅 20.0m × 奥行 6.5m × 高さ 0.3m (中心 X=0.0, Y=31.4, Z=0.0)
  // 回廊上面 Y=31.25m 上の登頂ゴール板 (上面 Y=31.55m)
  {
    name: 'Collider_Deck',
    center: new THREE.Vector3(0.0, 31.4, 0.0),
    size: new THREE.Vector3(20.0, 0.3, 6.5),
  },
  // 11. 海面・水面リセット判定: 幅 200.0m × 奥行 120.0m × 厚み 1.0m (水面 Y=0.0m)
  {
    name: 'Trigger_Water',
    center: new THREE.Vector3(0.0, -0.5, 0.0),
    size: new THREE.Vector3(200.0, 1.0, 120.0),
    isTrigger: true,
  },
];

// 重力方向ベクトルマップ
export const GRAVITY_VECTORS: Record<'up' | 'down' | 'left' | 'right', THREE.Vector3> = {
  up: new THREE.Vector3(0, 1, 0),     // 天井（回廊下面・登頂）方向
  down: new THREE.Vector3(0, -1, 0),  // 通常（地上・屋根・基礎）方向
  left: new THREE.Vector3(-1, 0, 0),  // 西塔内壁方向
  right: new THREE.Vector3(1, 0, 0),  // 東塔内壁・滑空方向
};

// コースA 目標ステップガイド（びゅうお一往復）
export const CHECKPOINT_STEPS_A = [
  { step: 1, target: '東塔内壁 (▶)', hint: '画面下部を【右】へフリック！東塔内壁へ横落下', surface: 'Collider_EastTower' },
  { step: 2, target: '回廊下面 (▲)', hint: '東塔内壁から【上】へフリック！回廊の天井へ急上昇', surface: 'Collider_GateDoor' },
  { step: 3, target: '西塔内壁 (◀)', hint: '回廊下面から【左】へフリック！西塔内壁へ横落下', surface: 'Collider_WestTower' },
  { step: 4, target: '西塔基礎ゴール (▼)', hint: '西塔内壁から【下】へフリック！緑のゴールサークルへ急降下', surface: 'Collider_WestBase' },
];

// コースB 目標ステップガイド（魚市場ルート登頂）
export const CHECKPOINT_STEPS_B = [
  { step: 1, target: '中継屋根1 (▶/▼)', hint: '【右】へ跳び出し、【下】で中継屋根1へ急降下着地！', surface: 'Collider_Bldg1' },
  { step: 2, target: '中継屋根2 (▶/▼)', hint: '【右】へ跳び出し、【下】で中継屋根2へ着地！', surface: 'Collider_Bldg2' },
  { step: 3, target: 'びゅうお西塔基礎 (▶/▼)', hint: '【右】へ大きく跳び出し、【下】で西塔基礎へ合流着地！', surface: 'Collider_WestBase' },
  { step: 4, target: '東塔内壁 (▶)', hint: '西塔基礎から【右】へフリック！東塔内壁へ横落下', surface: 'Collider_EastTower' },
  { step: 5, target: '回廊下面 (▲)', hint: '東塔内壁から【上】へフリック！回廊の天井へ急上昇', surface: 'Collider_GateDoor' },
  { step: 6, target: '西塔内壁 (◀)', hint: '回廊下面から【左】へフリック！西塔内壁へ横落下', surface: 'Collider_WestTower' },
  { step: 7, target: '展望デッキ登頂 (▲)', hint: '西塔内壁から【上】へ渾身のフリック！びゅうお頂上へ登頂ダイブ！', surface: 'Collider_Deck' },
];

// 互換用デフォルト参照
export const CHECKPOINT_STEPS = CHECKPOINT_STEPS_A;
