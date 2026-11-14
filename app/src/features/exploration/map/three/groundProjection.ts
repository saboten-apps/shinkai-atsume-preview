/** Same WGS84 ENU frame as the PLATEAU converters: east, up, -north. */
const LAT = 35.0815 * Math.PI / 180;
const LON = 138.8576 * Math.PI / 180;
const A = 6378137;
const E2 = 6.69437999014e-3;
const SIN_LAT = Math.sin(LAT), COS_LAT = Math.cos(LAT);
const SIN_LON = Math.sin(LON), COS_LON = Math.cos(LON);
const N = A / Math.sqrt(1 - E2 * SIN_LAT * SIN_LAT);
const ORIGIN = [N * COS_LAT * COS_LON, N * COS_LAT * SIN_LON, N * (1 - E2) * SIN_LAT];
export const DETAIL_ZOOM = 18;
export const OVERVIEW_ZOOM = 15;
export const TILE_ORIGIN = lonLatToTile(138.8576, 35.0815, DETAIL_ZOOM).map(Math.floor);

export function lonLatToTile(lon: number, lat: number, zoom: number): [number, number] {
  const size = 2 ** zoom;
  return [(lon + 180) / 360 * size, (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * size];
}
export function worldToLonLat(x: number, y: number, z: number): [number, number] {
  const east = x, north = -z;
  const ex = ORIGIN[0] - SIN_LON * east - SIN_LAT * COS_LON * north + COS_LAT * COS_LON * y;
  const ey = ORIGIN[1] + COS_LON * east - SIN_LAT * SIN_LON * north + COS_LAT * SIN_LON * y;
  const ez = ORIGIN[2] + COS_LAT * north + SIN_LAT * y;
  const p = Math.hypot(ex, ey);
  let lat = Math.atan2(ez, p * (1 - E2));
  for (let i = 0; i < 4; i++) {
    const sin = Math.sin(lat);
    const radius = A / Math.sqrt(1 - E2 * sin * sin);
    lat = Math.atan2(ez + E2 * radius * sin, p);
  }
  return [Math.atan2(ey, ex) * 180 / Math.PI, lat * 180 / Math.PI];
}
export function worldToPhotoTile(x: number, y: number, z: number): [number, number] {
  const [lon, lat] = worldToLonLat(x, y, z);
  return lonLatToTile(lon, lat, DETAIL_ZOOM);
}
