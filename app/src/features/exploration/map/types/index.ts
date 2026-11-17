export interface Fish {
  id: string;
  name_ja: string;
  name_alias: string | null;
  scientific_name: string;
  scientific_name_note: string | null;
  name_en: string | null;
  depth_text: string;
  fact: string;
  eat_or_display_note: string;
  rarity: number;
  illustration: string;
  sources: string[];
  needs_check: boolean;
}

export interface MapPin {
  id: string;
  name: string;
  category: string;
  description: string;
  fishId: string;
  googleMapQuery: string;
  // 3D 空間上の座標 (X: 東西, Y: 高さ, Z: 南北)
  position: [number, number, number];
  // 2D マップ上の正規化座標 (0〜100%)
  coords2d: { x: number; y: number };
  note: string;
}

export interface PerformanceStats {
  renderTargetFps?: number;
  cameraPosition?: [number,number,number];
  flightActive?: boolean;
  frameP50Ms?: number;
  frameP95Ms?: number;
  elapsedMs?: number;
  fps: number;
  drawCalls: number;
  triangles: number;
  dpr: number;
  geometries: number;
  textures: number;
  /** Rendered frames since the 3D view opened; differences give an exact average FPS. */
  frames?: number;
  /** Interval between browser animation callbacks, capped or not: shows the display rate and main-thread stalls. */
  rafP50Ms?: number;
  rafP95Ms?: number;
  /** Main-thread time per rendered frame over the last second: scene update, then draw submission. */
  updateMsAvg?: number;
  renderMsAvg?: number;
  renderMsMax?: number;
  /** Resolution changes since the 3D view opened. */
  dprChanges?: number;
  loadedChunks?: number;
  /** Chrome only. */
  jsHeapMB?: number;
  /** Drawing-buffer size in pixels. */
  canvas?: [number, number];
  gpu?: string;
}
