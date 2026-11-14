import * as THREE from 'three';

export interface BoxCollider {
  name: string;
  box: THREE.Box3;
  mesh?: THREE.Mesh;
  isTrigger?: boolean;
}

export type GravityDirection = 'up' | 'down' | 'left' | 'right';

export interface PhysicsParams {
  gravityAcc: number;        // 重力加速度 (m/s^2), default: 26.0
  maxSpeed: number;          // 最高終端速度 (m/s), default: 32.0
  airResistance: number;     // 空気抵抗減衰係数 (/frame), default: 0.025
  inertiaRatio: number;      // 方向転換慣性継承率 (0..1), default: 0.45
  restitution: number;       // 反発係数, default: 0.0
  gripMargin: number;        // 接地吸着判定マージン (m), default: 0.20
  colliderRadius: number;    // キャラクタ球体コライダー半径 (m), default: 0.60
  inputBufferTime: number;   // 先行入力バッファ時間 (s), default: 0.15
}

export type GameState = 'ready' | 'playing' | 'cleared' | 'respawning';

export type CourseType = 'A' | 'B' | 'FREE';

export type FreeFlightState = 'ground' | 'air' | 'water';

export type FreeSubMode = 'flight' | 'gravity';

export type GravityState = 'stand' | 'float' | 'fall' | 'water';

export interface FreeFlightStatus {
  active: boolean;
  state: FreeFlightState;
  speed: number;
  altitude: number;
  depth: number;
}

export interface GravityStatus {
  active: boolean;
  state: GravityState;
  dir: { x: number; y: number; z: number };
  surface: string | null;
}

export interface GameStats {
  time: number;
  flicks: number;
  falls: number;
  maxRecordedSpeed: number;
  checkpoint: number; // 現在の進行ステップ
  course: CourseType;
}

export interface ProtoDebugHook {
  course: CourseType;
  state: GameState;
  gravityDir: { x: number; y: number; z: number };
  gravityDirName: GravityDirection;
  grounded: boolean;
  currentSurface: string | null;
  time: number;
  flicks: number;
  falls: number;
  maxSpeed: number;
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  checkpoint: number;
  params: PhysicsParams;
  reset: () => void;
  flick: (dir: GravityDirection) => void;
  setCourse: (course: CourseType) => void;
  toggleDebugBoxes: (visible?: boolean) => void;
  toggleDebugColliders: (visible?: boolean) => void;

  // 自由飛行モード（FREE）検証フック（指示書 §5）
  free: FreeFlightStatus;
  setFree: (active: boolean) => void;
  freeStick: (x: number, y: number) => void;
  freeVertical: (v: number) => void;
  freeLook: (yawDeg: number, pitchDeg: number) => void;
  freeReset: () => void;

  // 重力モード（第2サブモード）検証フック（指示書 TASK-GRAVITYMODE §2 / TASK-GRAVITY-FLICK §3）
  grav: GravityStatus;
  setGrav: (active: boolean) => void;
  gravFloat: () => void;
  gravFall: () => void;
  gravBrake: () => void;
  gravNormal: () => void;
  gravFlick: (dx: number, dy: number) => void;
  freeTeleport: (x: number, y: number, z: number) => void;
}

declare global {
  interface Window {
    __proto_hook?: ProtoDebugHook;
    __proto?: any;
  }
}
