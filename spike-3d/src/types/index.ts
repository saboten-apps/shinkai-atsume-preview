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
  fps: number;
  drawCalls: number;
  triangles: number;
  dpr: number;
  geometries: number;
  textures: number;
}
