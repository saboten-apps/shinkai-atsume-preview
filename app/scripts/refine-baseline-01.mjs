import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';

const req = createRequire(import.meta.url);
const { chromium } = req('playwright');
const executablePath = process.env.CHROMIUM_PATH || '/usr/bin/chromium';

const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await page.goto('http://127.0.0.1:5189/');

const views = [
  {
    id: 'baseline-01-east-promenade',
    camPos: [-235, 43.2, 25],
    target: [-276, 62, 16],
    fov: 52
  },
  {
    id: 'baseline-02-east-closeup',
    camPos: [-252, 43.0, 28],
    target: [-276, 66, 16],
    fov: 60
  }
];

for (const v of views) {
  const pngBase64 = await page.evaluate(async (view) => {
    const THREE = await import('/node_modules/.vite/deps/three.js');
    const { buildNumazuPortScene } = await import('/src/features/exploration/map/three/sceneBuilder.ts');
    const { createPortSky } = await import('/src/features/exploration/map/three/portSky.ts');

    const scene = new THREE.Scene();
    scene.userData.releaseId = 'release-2026-11-v1';
    createPortSky(scene);
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(1024, 768);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    document.body.replaceChildren(renderer.domElement);
    const camera = new THREE.PerspectiveCamera(view.fov, 1024 / 768, 0.1, 55000);
    camera.position.set(...view.camPos);
    const targetVec = new THREE.Vector3(...view.target);
    camera.lookAt(targetVec);

    scene.add(new THREE.AmbientLight(0xf5f0e6, 0.9));
    const sun = new THREE.DirectionalLight(0xfff7ed, 1.4);
    sun.position.set(300, 500, 200);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x406d8d, 0.6);
    fill.position.set(-250, 200, -250);
    scene.add(fill);

    const model = buildNumazuPortScene(scene);
    await model.ready;
    for (let i = 0; i < 40; i++) {
      model.updateBuildings(targetVec, camera.position);
      await new Promise(r => setTimeout(r, 80));
    }
    await model.groundReady();
    model.updateBuildings(targetVec, camera.position);
    scene.updateMatrixWorld(true);

    renderer.render(scene, camera);
    return renderer.domElement.toDataURL('image/png').split(',')[1];
  }, v);

  const outPath = `/home/hatch/workspace/shinkai-git/shinkai-atsume/docs/byuuo-stage3/${v.id}.png`;
  writeFileSync(outPath, Buffer.from(pngBase64, 'base64'));
  console.log('Saved:', outPath);
}

await browser.close();
