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

const outDir = resolve(__dirname, '../docs/byuuo-stage3');
mkdirSync(outDir, { recursive: true });

try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  await page.goto(process.env.APP_URL || 'http://127.0.0.1:5189/');

  const views = [
    {
      id: 'baseline-01-east-promenade',
      title: '東側遊歩道からの斜め全景（byuuo-01相当）',
      camPos: [-235, 45.2, 40],
      target: [-278, 62, 10],
      fov: 52
    },
    {
      id: 'baseline-02-east-closeup',
      title: '東側・基部からの近景（byuuo-02相当）',
      camPos: [-252, 44.2, 38],
      target: [-276, 68, 18],
      fov: 58
    },
    {
      id: 'baseline-03-front-harbor',
      title: '港内側からの正面全景（byuuo-03相当）',
      camPos: [-160, 48, -7],
      target: [-276.05, 66, 22.3],
      fov: 34
    },
    {
      id: 'baseline-04-sea-side',
      title: '海側水路からの正面（byuuo-04相当）',
      camPos: [-375, 48, 50],
      target: [-276.05, 66, 22.3],
      fov: 34
    }
  ];

  for (const view of views) {
    const pngBase64 = await page.evaluate(async (v) => {
      const THREE = await import('/node_modules/.vite/deps/three.js');
      const { buildNumazuPortScene } = await import('/src/features/exploration/map/three/sceneBuilder.ts');
      const { createPortSky } = await import('/src/features/exploration/map/three/portSky.ts');

      const scene = new THREE.Scene();
      scene.userData.releaseId = 'release-2026-11-v1'; // baseline
      const sky = createPortSky(scene);
      const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      renderer.setSize(1024, 768);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;

      document.body.replaceChildren(renderer.domElement);
      document.body.style.margin = '0';

      const camera = new THREE.PerspectiveCamera(v.fov, 1024 / 768, 0.1, 55000);
      camera.position.set(...v.camPos);
      const targetVec = new THREE.Vector3(...v.target);
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

      // Stream chunks near watergate (-276, 22)
      for (let i = 0; i < 40; i++) {
        model.updateBuildings(targetVec, camera.position);
        await new Promise(r => setTimeout(r, 80));
      }
      await model.groundReady();
      model.updateBuildings(targetVec, camera.position);
      scene.updateMatrixWorld(true);

      renderer.render(scene, camera);
      return renderer.domElement.toDataURL('image/png').split(',')[1];
    }, view);

    const filePath = resolve(outDir, `${view.id}.png`);
    writeFileSync(filePath, Buffer.from(pngBase64, 'base64'));
    console.log(`Saved screenshot: ${filePath} (${view.title})`);
  }

} finally {
  await browser.close();
}
