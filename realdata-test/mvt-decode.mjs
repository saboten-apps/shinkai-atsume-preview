// Minimal Mapbox Vector Tile (MVT/pbf) decoder — no external deps.
// Exports decodeTile(buf) -> [{ name, extent, version, features: [{ id, type, tags: {k:v}, geometry: [ [ [x,y],... ] rings ] }] }]
// Geometry is returned as a list of rings (each ring = array of [x,y] in tile
// coords); for points/lines the list holds the point/line sequences.
import { gunzipSync } from 'node:zlib';

function Reader(buf) { this.buf = buf; this.pos = 0; this.len = buf.length; }
Reader.prototype.varint = function () {
  let val = 0n, shift = 0n;
  for (;;) {
    const b = this.buf[this.pos++];
    val |= BigInt(b & 0x7f) << shift;
    if (!(b & 0x80)) break;
    shift += 7n;
  }
  return val;
};
Reader.prototype.bytes = function (n) { const b = this.buf.subarray(this.pos, this.pos + n); this.pos += n; return b; };
Reader.prototype.string = function () { const n = Number(this.varint()); return this.bytes(n).toString('utf8'); };
Reader.prototype.double = function () { const v = this.buf.readDoubleLE(this.pos); this.pos += 8; return v; };
Reader.prototype.float = function () { const v = this.buf.readFloatLE(this.pos); this.pos += 4; return v; };
Reader.prototype.skip = function (wire) {
  if (wire === 0) this.varint();
  else if (wire === 1) this.pos += 8;
  else if (wire === 2) this.pos += Number(this.varint());
  else if (wire === 5) this.pos += 4;
  else throw new Error(`bad wire type ${wire}`);
};
function zigzag(n) { return (n >> 1n) ^ (-(n & 1n)); }

function readValue(r, end) {
  let v = null;
  while (r.pos < end) {
    const tag = Number(r.varint());
    const field = tag >> 3, wire = tag & 7;
    if (field === 1) v = r.string();
    else if (field === 2) v = r.float();
    else if (field === 3) v = r.double();
    else if (field === 4) v = Number(r.varint());
    else if (field === 5) v = Number(r.varint());
    else if (field === 6) v = Number(zigzag(r.varint()));
    else if (field === 7) v = r.varint() !== 0n;
    else r.skip(wire);
  }
  return v;
}

// NOTE: PLATEAU (reearth) MVT files use the v1 Feature field numbering
// (id=1, tags=2, type=3, geometry=4) even though the layer version says 2.
// readFeature supports both layouts; readLayer tries v1 first and falls back.
const LAYOUTS = {
  v1: { id: 1, tags: 2, type: 3, geometry: 4 },
  v2: { tags: 1, type: 2, geometry: 3, id: 4 },
};
function readFeature(r, end, keys, values, layout) {
  const F = LAYOUTS[layout];
  let id = 0, type = 0, tagsRaw = [], geomRaw = [];
  while (r.pos < end) {
    const tag = Number(r.varint());
    const field = tag >> 3, wire = tag & 7;
    if (field === F.id) id = Number(r.varint());
    else if (field === F.tags) { // tags (packed)
      if (wire === 2) { const n = Number(r.varint()); const e2 = r.pos + n; while (r.pos < e2) tagsRaw.push(Number(r.varint())); }
      else tagsRaw.push(Number(r.varint()));
    } else if (field === F.type) type = Number(r.varint());
    else if (field === F.geometry) { // geometry (packed)
      if (wire === 2) { const n = Number(r.varint()); const e2 = r.pos + n; while (r.pos < e2) geomRaw.push(r.varint()); }
      else geomRaw.push(r.varint());
    } else r.skip(wire);
  }
  const tags = {};
  for (let i = 0; i + 1 < tagsRaw.length; i += 2) {
    if (keys[tagsRaw[i]] === undefined || values[tagsRaw[i + 1]] === undefined) throw new Error('tag index out of range');
    tags[keys[tagsRaw[i]]] = values[tagsRaw[i + 1]];
  }
  if (type < 0 || type > 3) throw new Error(`bad geom type ${type}`);
  // decode geometry commands
  const parts = [];
  let x = 0, y = 0, current = null, i = 0;
  while (i < geomRaw.length) {
    const cmdInt = Number(geomRaw[i++]);
    const cmd = cmdInt & 7, count = cmdInt >> 3;
    if (cmd === 1 || cmd === 2) { // MoveTo / LineTo
      if (cmd === 1) { current = []; parts.push(current); }
      for (let k = 0; k < count; k++) {
        if (i + 1 >= geomRaw.length + 1) throw new Error('geometry overrun');
        x += Number(zigzag(geomRaw[i++])); y += Number(zigzag(geomRaw[i++]));
        current.push([x, y]);
      }
    } else if (cmd === 7) { // ClosePath
      if (current && current.length) current.push([current[0][0], current[0][1]]);
    } else throw new Error(`unknown geom command ${cmd}`);
  }
  return { id, type, tags, parts };
}

function readLayer(r, end) {
  let name = '', extent = 4096, version = 1;
  const keys = [], values = [], features = [];
  const featureBlobs = [];
  while (r.pos < end) {
    const tag = Number(r.varint());
    const field = tag >> 3, wire = tag & 7;
    if (field === 15) version = Number(r.varint());
    else if (field === 1) name = r.string();
    else if (field === 3) keys.push(r.string());
    else if (field === 4) { const n = Number(r.varint()); const s = r.pos; values.push(readValue(r, s + n)); r.pos = s + n; }
    else if (field === 5) extent = Number(r.varint());
    else if (field === 2) { const n = Number(r.varint()); featureBlobs.push([r.pos, n]); r.pos += n; }
    else r.skip(wire);
  }
  // PLATEAU tiles carry v1-numbered features despite version=2; try v1, then v2.
  let layoutUsed = 'v1';
  try {
    for (const [s, n] of featureBlobs) features.push(readFeature(new Reader(r.buf.subarray(s, s + n)), n, keys, values, 'v1'));
  } catch {
    features.length = 0; layoutUsed = 'v2';
    for (const [s, n] of featureBlobs) features.push(readFeature(new Reader(r.buf.subarray(s, s + n)), n, keys, values, 'v2'));
  }
  return { name, extent, version, features, layoutUsed };
}

export function decodeTile(input) {
  let buf = input;
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = gunzipSync(buf);
  const r = new Reader(buf);
  const layers = [];
  while (r.pos < r.len) {
    const tag = Number(r.varint());
    const field = tag >> 3, wire = tag & 7;
    if (field === 3 && wire === 2) { const n = Number(r.varint()); layers.push(readLayer(r, r.pos + n)); }
    else r.skip(wire);
  }
  return layers;
}

// Tile math helpers (Web Mercator XYZ)
export function lon2tileX(lon, z) { return Math.floor((lon + 180) / 360 * 2 ** z); }
export function lat2tileY(lat, z) {
  const rad = lat * Math.PI / 180;
  return Math.floor((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * 2 ** z);
}
export function tileToLonLat(px, py, extent, tx, ty, z) {
  const n = 2 ** z;
  const lon = ((tx + px / extent) / n) * 360 - 180;
  const t = Math.PI - 2 * Math.PI * (ty + py / extent) / n;
  const lat = Math.atan(Math.sinh(t)) * 180 / Math.PI;
  return [lon, lat];
}
