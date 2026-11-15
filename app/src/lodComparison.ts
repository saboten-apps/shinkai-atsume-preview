import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js';
const host=document.querySelector<HTMLDivElement>('#view')!;
const status=document.querySelector<HTMLDivElement>('#status')!;
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));host.append(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#b7d8e7');
scene.add(new THREE.HemisphereLight(0xffffff,0x707060,2));const sun=new THREE.DirectionalLight(0xffffff,2);sun.position.set(200,300,100);scene.add(sun);
const camera=new THREE.PerspectiveCamera(50,1,.1,4000);const controls=new OrbitControls(camera,renderer.domElement);controls.maxPolarAngle=Math.PI*.49;
const floor=new THREE.Mesh(new THREE.PlaneGeometry(2400,2400),new THREE.MeshStandardMaterial({color:0xb5b1a1}));floor.rotation.x=-Math.PI/2;floor.position.y=40.5;scene.add(floor);
const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const models=new Map<number,THREE.Group>();const pending=new Map<number,Promise<void>>();let selected=2;
const metrics=new Map<number,string>();
function update(){for(const [n,g] of models)g.visible=n===selected;for(const n of [2,3])document.querySelector(`#lod${n}`)!.setAttribute('aria-pressed',String(selected===n));status.textContent=metrics.get(selected)??`LOD${selected}を読み込み中…`;}
async function load(n:number){if(models.has(n))return;if(pending.has(n))return pending.get(n);const promise=(async()=>{try{const start=performance.now();const response=await fetch(`${import.meta.env.BASE_URL}map/comparison/port-lod${n}.glb`);if(!response.ok)throw new Error(String(response.status));const bytes=await response.arrayBuffer();const gltf=await loader.parseAsync(bytes,'');let triangles=0,images=0;const textures=new Set<THREE.Texture>();gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh){triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;for(const m of Array.isArray(o.material)?o.material:[o.material]){if(m.map)textures.add(m.map);}}});images=textures.size;models.set(n,gltf.scene);scene.add(gltf.scene);metrics.set(n,`${(bytes.byteLength/1e6).toFixed(2)} MB・${triangles.toLocaleString()}三角形・${images}画像・読込${((performance.now()-start)/1000).toFixed(1)}秒`);update();}catch(e){metrics.set(n,`読込失敗。再度ボタンを押してください（${String(e)}）`);update();}finally{pending.delete(n);}})();pending.set(n,promise);return promise;}
for(const n of [2,3])document.querySelector(`#lod${n}`)!.addEventListener('click',()=>{selected=n;update();void load(n);});
function spot(){const value=document.querySelector<HTMLSelectElement>('#spot')!.value;const views:Record<string,number[]>={'0':[-15,56,-180,20,49,-220],'1':[0,56,-275,30,49,-320],'2':[650,500,750,0,45,-160]};const v=views[value];camera.position.set(v[0],v[1],v[2]);controls.target.set(v[3],v[4],v[5]);controls.update();}document.querySelector('#spot')!.addEventListener('change',spot);spot();
new ResizeObserver(()=>{renderer.setSize(host.clientWidth,host.clientHeight);camera.aspect=host.clientWidth/host.clientHeight;camera.updateProjectionMatrix();}).observe(host);
renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera);});void load(2);
