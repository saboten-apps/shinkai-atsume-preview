#!/usr/bin/env node
/**
 * Generate All Building Selection Sidecars Script
 *
 * Extracts building metadata (gml_id, WGS84 lat/lon, ENU center/bounds/heights, 2D footprint convex hull)
 * from PLATEAU 2023 LOD3 b3dm source tiles for all 56 chunks.
 *
 * Output: public/map/data/buildings-${chunkId}.json
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const require = createRequire(import.meta.url);
let draco3d;
try {
  draco3d = require(resolve(__dirname, '../../shinkai-atsume-preview/realdata-test/node_modules/draco3d'));
} catch {
  draco3d = require('draco3d');
}

import { parseB3dm, parseGlb } from '../../shinkai-atsume-preview/realdata-test/inspect-b3dm.mjs';

const manifestPath = resolve(__dirname, '../public/map/data/station-manifest.json');
const outDir = resolve(__dirname, '../public/map/data');
const cacheDir = '/tmp/plateau-scratch/source-bldg2023';

mkdirSync(outDir, { recursive: true });
mkdirSync(cacheDir, { recursive: true });

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const baseUrl = manifest.source.replace(/tileset\.json$/, '');

// WGS84 ECEF <-> ENU
const A = 6378137.0, F = 1 / 298.257223563, E2 = F * (2 - F);
const LAT0 = 35.0815 * Math.PI / 180, LON0 = 138.8576 * Math.PI / 180;
function geodeticToEcef(lat, lon, h) {
  const s = Math.sin(lat), N = A / Math.sqrt(1 - E2 * s * s);
  return [(N + h) * Math.cos(lat) * Math.cos(lon),
          (N + h) * Math.cos(lat) * Math.sin(lon),
          (N * (1 - E2) + h) * s];
}
const P0 = geodeticToEcef(LAT0, LON0, 0);
const [sP, cP, sL, cL] = [Math.sin(LAT0), Math.cos(LAT0), Math.sin(LON0), Math.cos(LON0)];
function ecefToEnu(dx, dy, dz) {
  return [
    -sL * dx + cL * dy,
    cP * cL * dx + cP * sL * dy + sP * dz,
    sP * cL * dx + sP * sL * dy - cP * dz
  ];
}
function enuToGeodetic(x, y, z) {
  const dx = -sL * x + cP * cL * y + sP * cL * z;
  const dy =  cL * x + cP * sL * y + sP * sL * z;
  const dz =           sP * y      - cP * z;
  const X = P0[0] + dx, Y = P0[1] + dy, Z = P0[2] + dz;
  const p = Math.hypot(X, Y);
  let lat = Math.atan2(Z, p * (1 - E2));
  for (let i = 0; i < 5; i++) {
    const s = Math.sin(lat), N = A / Math.sqrt(1 - E2 * s * s);
    lat = Math.atan2(Z + E2 * N * s, p);
  }
  const lon = Math.atan2(Y, X);
  const s = Math.sin(lat), N = A / Math.sqrt(1 - E2 * s * s);
  const h = p / Math.cos(lat) - N;
  return { lat: lat * 180 / Math.PI, lon: lon * 180 / Math.PI, h };
}

function convexHull2D(pts) {
  if (pts.length <= 2) return pts.map(p => [Number(p[0].toFixed(2)), Number(p[2].toFixed(2))]);
  const points = pts.map(p => ({ x: p[0], z: p[2] }));
  points.sort((a, b) => a.x === b.x ? a.z - b.z : a.x - b.x);
  const cross = (o, a, b) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
  const lower = [];
  for (const p of points) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop(); lower.pop();
  return lower.concat(upper).map(p => [Number(p.x.toFixed(2)), Number(p.z.toFixed(2))]);
}

async function ensureTile(tilePath) {
  const localName = tilePath.replace(/\//g, '_');
  const localFile = resolve(cacheDir, localName);
  if (!existsSync(localFile)) {
    const res = await fetch(baseUrl + tilePath);
    if (!res.ok) throw new Error(`Fetch ${tilePath}: ${res.status}`);
    writeFileSync(localFile, Buffer.from(await res.arrayBuffer()));
  }
  return localFile;
}

export async function generateAllSidecars() {
  console.log('=== Starting All-Chunk Sidecar Generation ===');
  console.log(`Processing ${manifest.chunks.length} chunks...`);

  const Draco = await draco3d.createDecoderModule({});
  const summary = [];
  let totalBuildingsGenerated = 0;
  let totalRawBytes = 0;
  let totalGzipBytes = 0;

  for (let idx = 0; idx < manifest.chunks.length; idx++) {
    const chunk = manifest.chunks[idx];
    const chunkId = chunk.id;
    const buildingMap = new Map(); // gml_id -> { id, vertices, min, max }

    let chunkSourceStatus = 'ローカル原本（公式取得キャッシュ）';

    for (const tilePath of chunk.tiles) {
      let localFile;
      try {
        localFile = await ensureTile(tilePath);
      } catch (err) {
        console.error(`Failed to obtain tile ${tilePath} for chunk ${chunkId}:`, err.message);
        chunkSourceStatus = `取得失敗 (${err.message})`;
        continue;
      }

      const b3dmBuf = readFileSync(localFile);
      const { gltf } = parseB3dm(b3dmBuf);
      const { json, bin } = parseGlb(gltf);

      const ftJsonLen = b3dmBuf.readUInt32LE(12);
      const ftBinLen = b3dmBuf.readUInt32LE(16);
      const btJsonLen = b3dmBuf.readUInt32LE(20);
      const btJson = JSON.parse(
        b3dmBuf.toString('utf8', 28 + ftJsonLen + ftBinLen, 28 + ftJsonLen + ftBinLen + btJsonLen)
          .replace(/\0+$/, '').trim()
      );

      const center = json.extensions?.CESIUM_RTC?.center;
      if (!center) continue;

      const tileBuildings = new Map();
      for (let i = 0; i < btJson.gml_id.length; i++) {
        const gmlId = btJson.gml_id[i];
        if (!buildingMap.has(gmlId)) {
          buildingMap.set(gmlId, {
            id: gmlId,
            vertices: [],
            min: [Infinity, Infinity, Infinity],
            max: [-Infinity, -Infinity, -Infinity]
          });
        }
        tileBuildings.set(i, buildingMap.get(gmlId));
      }

      for (const mesh of json.meshes) {
        for (const prim of mesh.primitives) {
          const ext = prim.extensions?.KHR_draco_mesh_compression;
          if (!ext) continue;
          const bv = json.bufferViews[ext.bufferView];
          const bytes = bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
          const decoder = new Draco.Decoder();
          const buffer = new Draco.DecoderBuffer();
          buffer.Init(new Int8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength), bytes.byteLength);
          const dMesh = new Draco.Mesh();
          decoder.DecodeBufferToMesh(buffer, dMesh);

          const posAttr = decoder.GetAttributeByUniqueId(dMesh, ext.attributes.POSITION);
          const batchAttr = decoder.GetAttributeByUniqueId(dMesh, ext.attributes._BATCHID);
          const nPoints = dMesh.num_points();

          const posArr = new Draco.DracoFloat32Array();
          decoder.GetAttributeFloatForAllPoints(dMesh, posAttr, posArr);

          const batchArr = new Draco.DracoFloat32Array();
          decoder.GetAttributeFloatForAllPoints(dMesh, batchAttr, batchArr);

          for (let i = 0; i < nPoints; i++) {
            const lx = posArr.GetValue(i * 3);
            const ly = posArr.GetValue(i * 3 + 1);
            const lz = posArr.GetValue(i * 3 + 2);
            const batchId = Math.round(batchArr.GetValue(i));

            const ox = lx, oy = -lz, oz = ly;
            const enu = ecefToEnu(center[0] + ox - P0[0], center[1] + oy - P0[1], center[2] + oz - P0[2]);

            const b = tileBuildings.get(batchId);
            if (b) {
              b.vertices.push(enu);
              for (let k = 0; k < 3; k++) {
                if (enu[k] < b.min[k]) b.min[k] = enu[k];
                if (enu[k] > b.max[k]) b.max[k] = enu[k];
              }
            }
          }

          Draco.destroy(posArr);
          Draco.destroy(batchArr);
          Draco.destroy(dMesh);
          Draco.destroy(buffer);
          Draco.destroy(decoder);
        }
      }
    }

    const records = [];
    for (const [id, b] of buildingMap) {
      if (b.vertices.length === 0) continue;
      const hull = convexHull2D(b.vertices);
      const centerX = (b.min[0] + b.max[0]) / 2;
      const centerY = (b.min[1] + b.max[1]) / 2;
      const centerZ = (b.min[2] + b.max[2]) / 2;
      const geo = enuToGeodetic(centerX, centerY, centerZ);
      const baseY = b.min[1];
      const originalTopY = b.max[1];
      const scaledTopY = baseY + (originalTopY - baseY) * 1.3;

      let isCityHall = false;
      if (chunkId === 'station-5-2') {
        const distToCityHall = Math.hypot(centerX - 548.5, centerZ - (-1567));
        isCityHall = distToCityHall < 60 && Math.abs(b.min[0] - 548) < 50;
      }

      records.push({
        id: b.id,
        year: 2023,
        lat: Number(geo.lat.toFixed(6)),
        lon: Number(geo.lon.toFixed(6)),
        center: [Number(centerX.toFixed(2)), Number(centerY.toFixed(2)), Number(centerZ.toFixed(2))],
        min: [Number(b.min[0].toFixed(2)), Number(baseY.toFixed(2)), Number(b.min[2].toFixed(2))],
        max: [Number(b.max[0].toFixed(2)), Number(scaledTopY.toFixed(2)), Number(b.max[2].toFixed(2))],
        baseY: Number(baseY.toFixed(2)),
        topY: Number(scaledTopY.toFixed(2)),
        footprint: hull,
        ...(isCityHall ? { isCityHall: true } : {})
      });
    }

    const sidecar = {
      chunk: chunkId,
      year: 2023,
      count: records.length,
      buildings: records
    };

    const sidecarStr = JSON.stringify(sidecar, null, 1);
    const sidecarBuf = Buffer.from(sidecarStr, 'utf8');
    const gzipBuf = gzipSync(sidecarBuf);

    const outPath = resolve(outDir, `buildings-${chunkId}.json`);
    writeFileSync(outPath, sidecarStr);

    totalBuildingsGenerated += records.length;
    totalRawBytes += sidecarBuf.length;
    totalGzipBytes += gzipBuf.length;

    summary.push({
      chunkId,
      manifestBuildings: chunk.buildings,
      generatedBuildings: records.length,
      match: chunk.buildings === records.length,
      tilesCount: chunk.tiles.length,
      rawBytes: sidecarBuf.length,
      gzipBytes: gzipBuf.length,
      source: chunkSourceStatus
    });

    if ((idx + 1) % 10 === 0 || idx + 1 === manifest.chunks.length) {
      console.log(`[${idx + 1}/${manifest.chunks.length}] Generated sidecar for ${chunkId}: ${records.length} buildings (manifest: ${chunk.buildings})`);
    }
  }

  const resultStats = {
    totalChunks: manifest.chunks.length,
    totalManifestBuildings: manifest.chunks.reduce((s, c) => s + c.buildings, 0),
    totalGeneratedBuildings: totalBuildingsGenerated,
    totalRawBytes,
    totalGzipBytes,
    summary
  };

  writeFileSync(resolve(__dirname, 'sidecar-rollout-summary.json'), JSON.stringify(resultStats, null, 2));
  console.log('=== All Sidecars Generation Completed ===');
  console.log(`Total Chunks: ${resultStats.totalChunks}`);
  console.log(`Total Manifest Buildings: ${resultStats.totalManifestBuildings}`);
  console.log(`Total Generated Buildings: ${resultStats.totalGeneratedBuildings}`);
  console.log(`Total Raw Size: ${(totalRawBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Total Gzip Size: ${(totalGzipBytes / 1024 / 1024).toFixed(2)} MB`);

  return resultStats;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  generateAllSidecars().catch(err => {
    console.error('Fatal error in generateAllSidecars:', err);
    process.exit(1);
  });
}
