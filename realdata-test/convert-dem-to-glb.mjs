// Convert PLATEAU CityGML DEM (TIN) for the Numazu Port bbox into ONE merged,
// local-frame binary glTF (.glb), port-terrain.glb.
//
// Source: CityGML (v2) ZIP (CKAN plateau-22203-numazu-shi-2021), entries
//   udx/dem/523846_dem_6697_op.gml        (comp 32.2MB / uncomp 718MB)
//   udx/dem/523856_dem_6697_05_op.gml     (comp 25.1MB / uncomp 573MB; quadrant
//                                          lat 35.0833..35.125, lon 138.8125..138.875)
// Access is HTTP Range only: the compressed entry bytes are fetched in 4MB
// chunks and stream-inflated; GML triangles (<gml:posList> inside
// gml:TriangulatedSurface) are scanned incrementally and filtered by bbox, so
// the ~1.3GB of XML is never materialised.
//
// CRS: EPSG:6697 (lat, lon, h). The DEM's vertical values are ORTHOMETRIC
// heights (metres above T.P.): coastal/sea triangles read 0.0005 and the port
// apron a few metres, which is inconsistent with ellipsoidal heights (geoid
// ~+39 m here). To register the terrain with the b3dm-derived ENU frame of the
// earlier products (where flat port ground measured y ~= 41.7 m), the geoid
// separation N is calibrated empirically: N = 41.75 - median(orthometric
// height of DEM triangles in a flat inland reference patch south of the port).
// Vertices are then converted with h_ellip = h_ortho + N.
//
// Frame: same as buildings/roads — ECEF -> ENU at origin lat 35.0815,
// lon 138.8576, h=0 (WGS84 constants); output x=east, y=up, z=-north.
import { readFileSync, writeFileSync } from 'node:fs';
import { createInflateRaw } from 'node:zlib';
import { StringDecoder } from 'node:string_decoder';

const index = JSON.parse(readFileSync(new URL('./citygml-zip-index.json', import.meta.url), 'utf8'));
const byName = new Map(index.entries.map(e => [e.name, e]));
const PREFIX = '22203_numazu-shi_2021_citygml_4_op/udx/dem/';
const FILES = ['523846_dem_6697_op.gml', '523856_dem_6697_05_op.gml'];

// keep triangles whose vertex bbox intersects this (slightly expanded) box
const KEEP = process.env.STATION_CORRIDOR ? { s: 35.0780, n: 35.1060, w: 138.8500, e: 138.8690 } : { s: 35.0780, n: 35.0865, w: 138.8530, e: 138.8640 };
const outputPrefix = process.env.STATION_CORRIDOR ? 'corridor' : 'port';
// flat inland reference patch (town area south of the port apron) — reported
// for reference; its median (ortho 1.46 m) proved ~0.6 m lower than the port
// apron surface, so it is NOT used for calibration.
const PATCH = { s: 35.0795, n: 35.0812, w: 138.8570, e: 138.8595 };
// Calibration anchor: DEM triangles whose centroid falls in the LOD2 building
// cluster (ENU x -100..100, z -300..-50 -> lat/lon below). Their orthometric
// median is registered to the measured building-base median y=41.8 m of the
// b3dm products (RESULT.md §8.4: 525 buildings, bases min 40.7/median 41.8).
const CLUSTER = { s: 35.08195, n: 35.08420, w: 138.85650, e: 138.85870 };
const GROUND_TARGET = 41.8; // measured building-base median in the b3dm frame

async function rangeBuf(start, end) {
  const res = await fetch(index.zipUrl, {
    headers: { Range: `bytes=${start}-${end}`, 'User-Agent': 'Mozilla/5.0' },
  });
  if (res.status !== 206) throw new Error(`range ${start}-${end}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function entryDataStart(entry) {
  const lh = await rangeBuf(entry.offset, entry.offset + 29);
  if (lh.readUInt32LE(0) !== 0x04034b50) throw new Error(`bad local header for ${entry.name}`);
  return entry.offset + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
}

// Stream one entry, calling onText(string) for decoded chunks. Resolves at end.
function streamEntry(entry, dataStart, onText) {
  return new Promise(async (resolve, reject) => {
    const inf = createInflateRaw();
    const dec = new StringDecoder('utf8');
    inf.on('data', (c) => onText(dec.write(c)));
    inf.on('error', reject);
    inf.on('end', () => { onText(dec.end()); resolve(); });
    const CH = 4 * 1024 * 1024;
    try {
      for (let s = 0; s < entry.compSize; s += CH) {
        const e = Math.min(s + CH, entry.compSize) - 1;
        const buf = await rangeBuf(dataStart + s, dataStart + e);
        const ok = inf.write(buf);
        if (!ok) await new Promise(r => inf.once('drain', r));
      }
      inf.end();
    } catch (err) { reject(err); }
  });
}

// ---------- scan + collect ----------
const keptChunks = [];      // Float64Array chunks of (lat,lon,h) x 3 per kept triangle
let keptArr = new Float64Array(3 * 3 * 8192), keptN = 0; // vertices count
const patchHeights = [];
const clusterHeights = [];
let scanned = 0, anomalies = 0;

function pushVertex(lat, lon, h) {
  if (keptN * 3 + 3 > keptArr.length) {
    keptChunks.push(keptArr.subarray(0, keptN * 3));
    keptArr = new Float64Array(3 * 3 * 8192); keptN = 0;
  }
  keptArr[keptN * 3] = lat; keptArr[keptN * 3 + 1] = lon; keptArr[keptN * 3 + 2] = h;
  keptN++;
}

function handlePosList(text) {
  const parts = text.trim().split(/\s+/);
  if (parts.length !== 12) { anomalies++; return; }
  const v = parts.map(Number);
  // ring: p0 p1 p2 p0 (lat lon h)*
  const lats = [v[0], v[3], v[6]], lons = [v[1], v[4], v[7]], hs = [v[2], v[5], v[8]];
  const s = Math.min(...lats), n = Math.max(...lats), w = Math.min(...lons), e = Math.max(...lons);
  if (!(w <= KEEP.e && e >= KEEP.w && s <= KEEP.n && n >= KEEP.s)) return;
  for (let i = 0; i < 3; i++) pushVertex(lats[i], lons[i], hs[i]);
  const cla = (lats[0] + lats[1] + lats[2]) / 3, clo = (lons[0] + lons[1] + lons[2]) / 3;
  if (cla >= PATCH.s && cla <= PATCH.n && clo >= PATCH.w && clo <= PATCH.e) {
    patchHeights.push(hs[0], hs[1], hs[2]);
  }
  if (cla >= CLUSTER.s && cla <= CLUSTER.n && clo >= CLUSTER.w && clo <= CLUSTER.e) {
    clusterHeights.push(hs[0], hs[1], hs[2]);
  }
}

for (const fname of FILES) {
  const entry = byName.get(PREFIX + fname);
  if (!entry) throw new Error(`entry not found: ${fname}`);
  const dataStart = await entryDataStart(entry);
  let buf = '';
  const t0 = Date.now();
  await streamEntry(entry, dataStart, (text) => {
    buf += text;
    let idx = 0;
    for (;;) {
      const open = buf.indexOf('<gml:posList', idx);
      if (open < 0) break;
      const gt = buf.indexOf('>', open);
      if (gt < 0) break;
      const close = buf.indexOf('</gml:posList>', gt);
      if (close < 0) break;
      scanned++;
      handlePosList(buf.slice(gt + 1, close));
      idx = close + 14;
    }
    // drop consumed prefix, keep a tail in case a tag straddles chunks
    if (idx > 0) buf = buf.slice(Math.max(0, idx - 32));
    else if (buf.length > 1 << 20) buf = buf.slice(buf.length - (1 << 15));
  });
  console.log(`${fname}: scanned so far=${scanned}, kept verts so far=${keptChunks.reduce((a, c) => a + c.length / 3, 0) + keptN}, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
keptChunks.push(keptArr.subarray(0, keptN * 3));
const totalVerts = keptChunks.reduce((a, c) => a + c.length / 3, 0);
console.log(`posLists scanned=${scanned} anomalies=${anomalies} kept triangles=${totalVerts / 3}`);

// ---------- geoid calibration ----------
patchHeights.sort((a, b) => a - b);
clusterHeights.sort((a, b) => a - b);
if (clusterHeights.length < 30) throw new Error(`building-cluster sample too small: ${clusterHeights.length} heights`);
const medPatch = patchHeights.length ? patchHeights[Math.floor(patchHeights.length / 2)] : NaN;
const med = clusterHeights[Math.floor(clusterHeights.length / 2)];
const N = GROUND_TARGET - med;
console.log(`building cluster: n=${clusterHeights.length} median ortho h=${med.toFixed(3)} m -> geoid N=${N.toFixed(3)} m (target = building-base median y=${GROUND_TARGET})`);
console.log(`reference patch (not used): n=${patchHeights.length} median ortho h=${medPatch.toFixed(3)} m`);

// ---------- geodetic -> ENU (constants identical to b3dm converters) ----------
const A = 6378137.0, F = 1 / 298.257223563, E2 = F * (2 - F);
const LAT0 = 35.0815 * Math.PI / 180, LON0 = 138.8576 * Math.PI / 180;
function geodeticToEcef(lat, lon, h) {
  const s = Math.sin(lat), Np = A / Math.sqrt(1 - E2 * s * s);
  return [(Np + h) * Math.cos(lat) * Math.cos(lon),
          (Np + h) * Math.cos(lat) * Math.sin(lon),
          (Np * (1 - E2) + h) * s];
}
const P0 = geodeticToEcef(LAT0, LON0, 0);
const [sP, cP, sL, cL] = [Math.sin(LAT0), Math.cos(LAT0), Math.sin(LON0), Math.cos(LON0)];

const positions = new Float32Array(totalVerts * 3);
const normals = new Float32Array(totalVerts * 3);
{
  let vo = 0;
  const tmp = [0, 0, 0];
  for (const chunk of keptChunks) {
    for (let i = 0; i < chunk.length; i += 3) {
      const lat = chunk[i] * Math.PI / 180, lon = chunk[i + 1] * Math.PI / 180, h = chunk[i + 2] + N;
      const [ex, ey, ez] = geodeticToEcef(lat, lon, h);
      const dx = ex - P0[0], dy = ey - P0[1], dz = ez - P0[2];
      positions[vo]     = -sL * dx + cL * dy;
      positions[vo + 1] = cP * cL * dx + cP * sL * dy + sP * dz;
      positions[vo + 2] = sP * cL * dx + sP * sL * dy - cP * dz;
      vo += 3;
    }
  }
  // face normals
  for (let t = 0; t < totalVerts; t += 3) {
    const ax = positions[t * 3], ay = positions[t * 3 + 1], az = positions[t * 3 + 2];
    const bx = positions[t * 3 + 3], by = positions[t * 3 + 4], bz = positions[t * 3 + 5];
    const cx = positions[t * 3 + 6], cy = positions[t * 3 + 7], cz = positions[t * 3 + 8];
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1; nx /= len; ny /= len; nz /= len;
    for (let k = 0; k < 3; k++) { normals[(t + k) * 3] = nx; normals[(t + k) * 3 + 1] = ny; normals[(t + k) * 3 + 2] = nz; }
    tmp[0] = tmp[0]; // noop
  }
}
const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < totalVerts; i++) for (let k = 0; k < 3; k++) {
  const v = positions[i * 3 + k]; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v;
}

// ---------- GLB assembly (same style as convert-tran-to-glb.mjs) ----------
const indices = new Uint32Array(totalVerts);
for (let i = 0; i < totalVerts; i++) indices[i] = i;
const binChunks = [];
const views = [], accessors = [];
const push = (arr, type, compType, count) => {
  let bytes = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
  while (bytes.length % 4) bytes = Buffer.concat([bytes, Buffer.alloc(1)]);
  const off = binChunks.reduce((s, b) => s + b.length, 0);
  binChunks.push(bytes);
  views.push({ buffer: 0, byteOffset: off, byteLength: bytes.length });
  const acc = { bufferView: views.length - 1, componentType: compType, count, type };
  accessors.push(acc); return acc;
};
const posAcc = push(positions, 'VEC3', 5126, totalVerts); posAcc.min = min; posAcc.max = max;
push(normals, 'VEC3', 5126, totalVerts);
push(indices, 'SCALAR', 5125, totalVerts);
const binBuf = Buffer.concat(binChunks);
const gltfJson = {
  asset: { version: '2.0', generator: 'plateau-citygml-dem-to-glb (shinkai-atsume realdata-test)', extras: { source: 'PLATEAU CityGML (v2) Numazu City 2021, dem TIN (G-Spatial Center CKAN plateau-22203-numazu-shi-2021), files 523846_dem_6697_op.gml + 523856_dem_6697_05_op.gml', frame: `local ENU, origin lat 35.0815 lon 138.8576 h 0 (WGS84); x=east, y=up, z=-north; DEM orthometric heights converted with calibrated geoid separation N=${N.toFixed(3)} m so the DEM surface under the LOD2 building cluster sits at the measured building-base median y=41.8 m of the b3dm products` } },
  scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: 'numazu-port-terrain-dem' }],
  meshes: [{ name: 'terrain_dem_tin', primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0, mode: 4 }] }],
  materials: [{ name: 'terrain-flat', pbrMetallicRoughness: { baseColorFactor: [0.76, 0.73, 0.66, 1.0], metallicFactor: 0.0, roughnessFactor: 1.0 } }],
  accessors, bufferViews: views, buffers: [{ byteLength: binBuf.length }],
};
const jsonBuf = Buffer.from(JSON.stringify(gltfJson), 'utf8');
const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
const total = 12 + 8 + jsonBuf.length + jsonPad + 8 + binBuf.length;
const head = Buffer.alloc(12); head.write('glTF', 0, 'ascii'); head.writeUInt32LE(2, 4); head.writeUInt32LE(total, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonBuf.length + jsonPad, 0); jh.write('JSON', 4, 'ascii');
const bh = Buffer.alloc(8); bh.writeUInt32LE(binBuf.length, 0); bh.write('BIN\0', 4, 'ascii');
const glb = Buffer.concat([head, jh, jsonBuf, Buffer.alloc(jsonPad, 0x20), bh, binBuf]);
writeFileSync(new URL(`./${outputPrefix}-terrain.glb`, import.meta.url), glb);
console.log(`== dem: kept tris=${totalVerts / 3} verts=${totalVerts} glb=${glb.length}`);
console.log(`   ENU range: x ${min[0].toFixed(1)}..${max[0].toFixed(1)}, y ${min[1].toFixed(1)}..${max[1].toFixed(1)}, z ${min[2].toFixed(1)}..${max[2].toFixed(1)}`);
writeFileSync(new URL(`./${outputPrefix}-dem-stats.json`, import.meta.url),
  JSON.stringify({ theme: 'dem (CityGML TIN)', files: FILES, posListsScanned: scanned, anomalies, keptTriangles: totalVerts / 3, vertices: totalVerts, referencePatch: { n: patchHeights.length, medianOrthoH: medPatch }, buildingCluster: { n: clusterHeights.length, medianOrthoH: med, geoidN: N, groundTarget: GROUND_TARGET }, min, max, glbBytes: glb.length }, null, 1));
console.log('done');
