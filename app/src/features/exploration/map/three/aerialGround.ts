import * as THREE from 'three';
import { DETAIL_ZOOM, OVERVIEW_ZOOM, TILE_ORIGIN, worldToPhotoTile } from './groundProjection';

const DETAIL_LIMIT = 32;
const DETAIL_RADIUS_TILES = 3.2; // About 400m at Numazu; 256px textures stay small.
const CONCURRENCY = 3;
const SOURCE = 'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto';

type Part = { source: THREE.Mesh; uv: THREE.BufferAttribute; maskUv: THREE.BufferAttribute; indices: number[]; geometry?: THREE.BufferGeometry };
type Tile = { key: string; zoom: number; x: number; y: number; parts: Part[]; meshes: THREE.Mesh[]; texture?: THREE.Texture; state: 'idle'|'loading'|'loaded'; retryAt: number; distance: number };

/**
 * Drape GSI photographs over the existing DEM, in its actual ENU frame.
 * Triangle index subsets share the DEM attributes and projected UV buffer.
 * Coarse tiles cover the DEM; only the nearest 32 detail textures are retained.
 */
export function createAerialGround(scene: THREE.Scene, terrain: THREE.Group, waters: THREE.Group[]) {
  const bounds = new THREE.Box3().setFromObject(terrain);
  const span = bounds.getSize(new THREE.Vector3());
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 2048;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle = '#000';
  const corner = new THREE.Vector3();
  for(const water of waters) {
    water.updateMatrixWorld(true);
    water.traverse(object => {
      if(!(object instanceof THREE.Mesh))return;
      const positions=object.geometry.getAttribute('position'), index=object.geometry.getIndex();
      ctx.beginPath();
      for(let i=0;i<(index?.count??positions.count);i+=3) {
        for(let j=0;j<3;j++) {
          corner.fromBufferAttribute(positions,index?index.getX(i+j):i+j).applyMatrix4(object.matrixWorld);
          const x=(corner.x-bounds.min.x)/span.x*canvas.width, y=(corner.z-bounds.min.z)/span.z*canvas.height;
          if(j===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
        }
        ctx.closePath();
      }
      ctx.fill();
    });
  }
  const waterMask=new THREE.CanvasTexture(canvas);
  waterMask.channel=1;waterMask.generateMipmaps=false;
  waterMask.minFilter=THREE.LinearFilter;waterMask.magFilter=THREE.LinearFilter;
  const tiles = new Map<string, Tile>();
  const origin = new THREE.Vector3(-20, 42, -190);
  let disposed = false, initialized = false, active = 0, nextUpdate = 0;
  const waiters = new Set<() => void>();
  const loader = new THREE.TextureLoader().setCrossOrigin('anonymous');
  terrain.updateMatrixWorld(true);

  function release(tile: Tile) {
    tile.meshes.forEach(mesh => { scene.remove(mesh); (mesh.material as THREE.Material).dispose(); });
    tile.meshes = [];
    tile.texture?.dispose(); tile.texture = undefined;
    tile.state = 'idle';
  }
  function wanted(): Tile[] {
    const [tx, ty] = worldToPhotoTile(origin.x, origin.y, origin.z);
    const details: Tile[] = [];
    const overview: Tile[] = [];
    for (const tile of tiles.values()) {
      const factor = 2 ** (DETAIL_ZOOM - tile.zoom);
      tile.distance = Math.hypot((tile.x + .5) * factor - tx, (tile.y + .5) * factor - ty);
      if (tile.zoom === OVERVIEW_ZOOM) overview.push(tile);
      else if (tile.distance < DETAIL_RADIUS_TILES) details.push(tile);
    }
    details.sort((a,b) => a.distance - b.distance);
    return [...overview.sort((a,b)=>a.distance-b.distance), ...details.slice(0, DETAIL_LIMIT)];
  }
  function notifyIdle() {
    if (active || wanted().some(t => t.state === 'idle' && t.retryAt <= performance.now())) return;
    for (const done of waiters) done();
    waiters.clear();
  }
  function install(tile: Tile, texture: THREE.Texture) {
    const factor = 2 ** (DETAIL_ZOOM - tile.zoom);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.repeat.set(1/factor, 1/factor);
    texture.offset.set(TILE_ORIGIN[0]/factor - tile.x, tile.y + 1 - TILE_ORIGIN[1]/factor);
    texture.anisotropy = 4;
    tile.texture = texture;
    const material = new THREE.MeshBasicMaterial({map:texture, color:0xffffff, toneMapped:false, alphaMap:waterMask, alphaTest:.5, polygonOffset:true, polygonOffsetFactor:tile.zoom===DETAIL_ZOOM?-3:-2, polygonOffsetUnits:tile.zoom===DETAIL_ZOOM?-3:-2});
    // Clip in the shader, keeping shared vertices instead of duplicating the DEM.
    material.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>',
        'if (any(lessThan(vMapUv, vec2(0.0))) || any(greaterThan(vMapUv, vec2(1.0)))) discard;\n#include <map_fragment>');
    };
    material.customProgramCacheKey = () => 'gsi-ground-clip-v1';
    for (const part of tile.parts) {
      if (!part.geometry) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', part.source.geometry.getAttribute('position'));
        geometry.setAttribute('uv', part.uv);
        geometry.setAttribute('uv1', part.maskUv);
        geometry.setIndex(part.indices);
        part.geometry = geometry;
      }
      const mesh = new THREE.Mesh(part.geometry, material);
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(part.source.matrixWorld);
      mesh.matrix.elements[13] += tile.zoom===DETAIL_ZOOM ? .035 : .02;
      mesh.frustumCulled = false;
      mesh.renderOrder = tile.zoom===DETAIL_ZOOM ? 2 : 1;
      mesh.name = `gsi-photo-${tile.key}`;
      mesh.userData.aerialGround = true;
      scene.add(mesh); tile.meshes.push(mesh);
    }
    tile.state = 'loaded';
  }
  function pump() {
    if (disposed || !initialized) return;
    const desired = wanted();
    const keep = new Set(desired.map(t=>t.key));
    for (const tile of tiles.values()) {
      if (tile.zoom === DETAIL_ZOOM && tile.state === 'loaded' && !keep.has(tile.key)) release(tile);
    }
    for (const tile of desired) {
      if (active >= CONCURRENCY) break;
      if (tile.state !== 'idle' || tile.retryAt > performance.now()) continue;
      tile.state='loading'; active++;
      loader.load(`${SOURCE}/${tile.zoom}/${tile.x}/${tile.y}.jpg`, texture => {
        active--;
        if (disposed || !new Set(wanted().map(t=>t.key)).has(tile.key)) {
          texture.dispose();tile.state='idle';
        } else install(tile,texture);
        pump(); notifyIdle();
      }, undefined, () => {
        active--;tile.state='idle';tile.retryAt=performance.now()+60000;
        // Preserve the neutral terrain when the photo service is unavailable.
        pump();notifyIdle();
      });
    }
    notifyIdle();
  }

  const ready = (async () => {
    const meshes: THREE.Mesh[] = [];
    terrain.traverse(object => { if (object instanceof THREE.Mesh) meshes.push(object); });
    for (const mesh of meshes) {
      if (disposed) return;
      const position = mesh.geometry.getAttribute('position');
      const index = mesh.geometry.getIndex();
      const uv = new Float32Array(position.count*2);
      const maskUv = new Float32Array(position.count*2);
      const point = new THREE.Vector3();
      for (let i=0;i<position.count;i++) {
        point.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld);
        maskUv[i*2]=(point.x-bounds.min.x)/span.x;maskUv[i*2+1]=1-(point.z-bounds.min.z)/span.z;
        const [x,y]=worldToPhotoTile(point.x,point.y,point.z);
        uv[i*2]=x-TILE_ORIGIN[0];uv[i*2+1]=TILE_ORIGIN[1]-y;
        if (i%8192===8191) { await new Promise(r=>setTimeout(r,0)); if(disposed)return; }
      }
      const attribute = new THREE.BufferAttribute(uv,2);
      const maskAttribute = new THREE.BufferAttribute(maskUv,2);
      mesh.geometry.setAttribute('uv1',maskAttribute);
      for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]) {
        if(material instanceof THREE.MeshStandardMaterial) {material.alphaMap=waterMask;material.alphaTest=.5;material.needsUpdate=true;}
      }
      const parts = new Map<string, Part>();
      for (let i=0;i<(index?.count??position.count);i+=3) {
        const a=index?index.getX(i):i,b=index?index.getX(i+1):i+1,c=index?index.getX(i+2):i+2;
        for (const zoom of [OVERVIEW_ZOOM,DETAIL_ZOOM]) {
          const factor=2**(DETAIL_ZOOM-zoom);
          const xs=[a,b,c].map(v=>(uv[v*2]+TILE_ORIGIN[0])/factor);
          const ys=[a,b,c].map(v=>(TILE_ORIGIN[1]-uv[v*2+1])/factor);
          for(let x=Math.floor(Math.min(...xs));x<=Math.floor(Math.max(...xs));x++)for(let y=Math.floor(Math.min(...ys));y<=Math.floor(Math.max(...ys));y++) {
            const key=`${zoom}/${x}/${y}`;
            let tile=tiles.get(key);
            if(!tile){tile={key,zoom,x,y,parts:[],meshes:[],state:'idle',retryAt:0,distance:0};tiles.set(key,tile);}
            let part=parts.get(key);
            if(!part){part={source:mesh,uv:attribute,maskUv:maskAttribute,indices:[]};parts.set(key,part);tile.parts.push(part);}
            part.indices.push(a,b,c);
          }
        }
        if(i%12288===0){await new Promise(r=>setTimeout(r,0));if(disposed)return;}
      }
    }
    if(disposed)return;
    initialized=true;pump();
  })();
  return {
    ready,
    waterMask,
    maskBounds: new THREE.Vector4(bounds.min.x,bounds.min.z,1/span.x,1/span.z),
    update(position: THREE.Vector3) {
      origin.copy(position);
      if(performance.now()<nextUpdate)return;
      nextUpdate=performance.now()+500;pump();
    },
    /** Used only by the offline postcard renderer, with a bounded wait. */
    async settled(timeout=10000) {
      await ready;
      if(disposed)return;
      pump();
      await new Promise<void>(resolve=>{
        const finish=()=>{clearTimeout(timer);waiters.delete(finish);resolve();};
        const timer=setTimeout(finish,timeout);waiters.add(finish);notifyIdle();
      });
    },
    dispose() {
      disposed=true;
      for(const tile of tiles.values()) { release(tile);tile.parts.forEach(part=>part.geometry?.dispose()); }
      tiles.clear();waterMask.dispose();for(const done of waiters)done();waiters.clear();
    },
  };
}
