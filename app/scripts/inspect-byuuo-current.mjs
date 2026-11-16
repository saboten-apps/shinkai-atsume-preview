import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const req = createRequire(import.meta.url);
const { chromium } = req('playwright');
const executablePath = process.env.CHROMIUM_PATH || '/usr/bin/chromium';

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});

try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await page.goto(process.env.APP_URL || 'http://127.0.0.1:5189/');

  const report = await page.evaluate(async () => {
    const THREE = await import('/node_modules/.vite/deps/three.js');
    const { GLTFLoader } = await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
    const { MeshoptDecoder } = await import('/node_modules/three/examples/jsm/libs/meshopt_decoder.module.js');

    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);

    const gltf = await loader.loadAsync('/map/data/2023-lod3-port-packed.glb');
    const sidecarRes = await fetch('/map/data/buildings-port.json');
    const sidecar = await sidecarRes.json();

    const targetBldg = sidecar.buildings.find(b => b.id === 'bldg_7380cb7d-8b33-48d5-b9d1-6324ae3d6526');
    const neighborBldg = sidecar.buildings.find(b => b.id === 'bldg_a74878d3-e3ec-4e66-9ca6-d8f47ca75d88');

    function analyzeBbox(bounds) {
      let triCount = 0;
      let meshCount = 0;
      const minX = bounds.min[0] - 0.5, maxX = bounds.max[0] + 0.5;
      const minZ = bounds.min[2] - 0.5, maxZ = bounds.max[2] + 0.5;
      const minY = bounds.baseY - 1.0, maxY = bounds.topY + 2.5;

      const matchedVertices = [];

      gltf.scene.traverse(o => {
        if (o instanceof THREE.Mesh && o.geometry) {
          const pos = o.geometry.getAttribute('position');
          const index = o.geometry.index;
          let foundInMesh = 0;
          const count = index ? index.count : pos.count;
          for (let i = 0; i < count; i += 3) {
            const i0 = index ? index.getX(i) : i;
            const i1 = index ? index.getX(i+1) : i+1;
            const i2 = index ? index.getX(i+2) : i+2;
            const v0 = new THREE.Vector3().fromBufferAttribute(pos, i0);
            const v1 = new THREE.Vector3().fromBufferAttribute(pos, i1);
            const v2 = new THREE.Vector3().fromBufferAttribute(pos, i2);
            const cx = (v0.x + v1.x + v2.x) / 3;
            const cy = (v0.y + v1.y + v2.y) / 3;
            const cz = (v0.z + v1.z + v2.z) / 3;
            if (cx >= minX && cx <= maxX && cz >= minZ && cz <= maxZ && cy >= minY && cy <= maxY) {
              triCount++;
              foundInMesh++;
              if (matchedVertices.length < 30) {
                matchedVertices.push([cx, cy, cz]);
              }
            }
          }
          if (foundInMesh > 0) meshCount++;
        }
      });
      return { triCount, meshCount, sampleCenters: matchedVertices.slice(0, 5) };
    }

    return {
      targetBldg,
      targetAnalysis: analyzeBbox(targetBldg),
      neighborBldg,
      neighborAnalysis: analyzeBbox(neighborBldg),
      totalBuildingsInSidecar: sidecar.buildings.length
    };
  });

  console.log('Inspection Report:\n', JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
