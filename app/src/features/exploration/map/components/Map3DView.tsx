import {RenderBudget} from '../renderBudget';
import {PlaceIntroduction} from '../../../scenery/PlaceIntroduction';
import React, { useEffect, useRef, useState } from 'react';
import { pilotPosition, NEAR_BUILDING_PILOT } from '../three/nearBuildingPilot';
import { cityHallPoint } from '../three/cityHall';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { NavigationHud } from './NavigationHud';
import { createNavigationHud } from '../three/navigationHud';
import { createWorldFish } from '../three/worldFish';
import type { HidingPlace, Position } from '../../domain';
import type { Locale } from '../../../../config/appConfig';
import { createPortSky } from '../three/portSky';
import { setupPortFlight } from '../flight/portFlight';
import { MapPin, PerformanceStats } from '../types';
import { buildNumazuPortScene, SceneBuildResult } from '../three/sceneBuilder';
import { createPinMarkers, updatePinAnimations, Pin3DObject } from '../three/pinMarkers';
import type { BuildingRecord } from '../three/buildingSelection';
import { makeSceneryPhoto } from '../../../scenery/photoCard';
import { PhotoPreview, type SceneryPhoto } from '../../../scenery/PhotoPreview';
import { viewUrl, type Viewpoint, type Vec3 } from '../../../scenery/viewpoint';



export interface Search3DBridge {
  start: Position;
  target: HidingPlace;
  fishId?:string;
  locale?:Locale;
  onPosition: (p: Position, visible: boolean) => void;
  onCaptureReady: (capture: (() => string) | null) => void;
  autoFly?: boolean;
  discovered?: boolean;
  onReady?: () => void;
}
interface Map3DViewProps {
  initialView?: Viewpoint;
  locale?: Locale;
  onReady?: () => void;
  search?: Search3DBridge;
  pins: MapPin[];
  selectedPinId: string | null;
  onSelectPin: (pinId: string | null) => void;
  onUpdateStats: (stats: PerformanceStats) => void;
  onWebGLError: (reason: string) => void;
}

/**
 * WebGL利用可能かどうかの判定
 */
function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    );
  } catch {
    return false;
  }
}

export const Map3DView: React.FC<Map3DViewProps> = ({
  initialView, locale, onReady,
  search,
  pins,
  selectedPinId,
  onSelectPin,
  onUpdateStats,
  onWebGLError,
}) => {
  const en=(locale??search?.locale)==='en';
  const readyRef=useRef(onReady);readyRef.current=onReady;
  const initialViewRef=useRef(initialView);
  const sharedFocusRef=useRef(initialView?.focus);
  const capturePhotoRef=useRef<(()=>{image:string;view:Viewpoint})|null>(null);
  const [photo,setPhoto]=useState<SceneryPhoto|null>(null);
  const [photoBusy,setPhotoBusy]=useState(false);
  const [photoNotice,setPhotoNotice]=useState('');
  const photoOpenRef=useRef(false);photoOpenRef.current=!!photo||photoBusy;
  const photoGeneration=useRef(0);
  useEffect(()=>()=>{photoGeneration.current++;},[]);
  useEffect(()=>()=>{if(photo)URL.revokeObjectURL(photo.url);},[photo]);
  const takePhoto=async()=>{
    if(photoOpenRef.current)return;
    const generation=++photoGeneration.current;
    setPhotoNotice('');setPhotoBusy(true);
    try{
      const snapshot=capturePhotoRef.current?.();if(!snapshot)throw Error('Not ready');
      const blob=await makeSceneryPhoto(snapshot.image,en);
      if(generation!==photoGeneration.current)return;
      const link=viewUrl(snapshot.view,location.href);
      setPhoto({blob,url:URL.createObjectURL(blob),link});
    }catch{if(generation===photoGeneration.current)setPhotoNotice(en?'Wait for the scenery to load and try again.':'景色の読み込みを待って、もう一度撮影してください。');}
    finally{if(generation===photoGeneration.current)setPhotoBusy(false);}
  };
  const searchRef = useRef(search);
  searchRef.current = search;
  const mountRef = useRef<HTMLDivElement>(null);
  const navigationRef=useRef<HTMLDivElement>(null);
  const [landmarks,setLandmarks]=useState(true);
  const [pilotView, setPilotView] = useState(false);
  const [pilotEnabled, setPilotEnabled] = useState(true);
  const pilotEnabledRef = useRef(true); pilotEnabledRef.current = pilotEnabled;
  const landmarksRef=useRef(true);landmarksRef.current=landmarks;
  const flightRef = useRef<ReturnType<typeof setupPortFlight> | null>(null);
  const [areaStatus, setAreaStatus] = useState('');
  const locationRef = useRef<'port' | 'station'>('port');
  const [flying, setFlying] = useState(false);
  const controlsRef = useRef<OrbitControls | null>(null);
  const pinObjectsRef = useRef<Pin3DObject[]>([]);
  const targetCamFocusRef = useRef<THREE.Vector3 | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadText, setLoadText] = useState<string>('PLATEAU実データを読み込み中…');
  const [selectionNotice, setSelectionNotice] = useState('');
  const [selectedBuilding, setSelectedBuilding] = useState<BuildingRecord | null>(null);

  const [copied, setCopied] = useState<boolean>(false);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const sceneResultRef = useRef<SceneBuildResult | null>(null);
  const highlightGroupRef = useRef<THREE.Object3D | null>(null);

  useEffect(() => {
    if (!isWebGLAvailable()) {
      onWebGLError('ブラウザまたは端末がWebGLに対応していないため、2Dマップへ切り替えました。');
      return;
    }

    const container = mountRef.current;
    if (!container) return;

    let alive = true;
    let dataReady = false;
    let entered = false;
    let contextIsLost = false;
    let loadingArea = true;
    let width = container.clientWidth || window.innerWidth;
    let height = container.clientHeight || window.innerHeight;

    // --- 1. Scene & Fog ---
    // 指示書: FogExp2 の濃度は 0.0008 程度に下げる
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    const scenery = createPortSky(scene);

    // --- 2. Camera ---
    // 指示書: 初期位置およそ (330, 300, 470)、注視点 (-30, 43, -140)（港と海が両方入る構図）
    const camera = new THREE.PerspectiveCamera(45, width / height, 1, 55000);
    camera.position.set(295, 265, 345);

    // --- 3. Renderer ---
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
      });
    } catch (err) {
      onWebGLError(`WebGL初期化に失敗しました: ${(err as Error).message}`);
      return;
    }

    const renderBudget = new RenderBudget(window.devicePixelRatio || 1);
    renderer.setPixelRatio(renderBudget.dpr);
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.appendChild(renderer.domElement);

    const renderFrame = (): boolean => {
      if (!alive || contextIsLost) return false;
      if (renderer.getContext().isContextLost()) {
        contextIsLost = true;
        onWebGLError('3Dの描画が中断されました。2Dで続けられます。');
        return false;
      }
      try { renderer.render(scene, camera); return true; }
      catch (error) {
        contextIsLost = true;
        console.warn('3D render failed; continuing in 2D', error);
        onWebGLError('3Dの描画を継続できませんでした。2Dで続けられます。');
        return false;
      }
    };

    // --- 4. Controls ---
    // 指示書: minDistance 40、maxDistance 1400、maxPolarAngle は従来どおり (Math.PI / 2 - 0.05)
    const navigation=navigationRef.current?createNavigationHud(navigationRef.current,camera,(locale??searchRef.current?.locale)==='en'):undefined;
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(-20, 43, -190); // 港と海が両方入る構図、yは地面41.7付近
    controls.maxPolarAngle = Math.PI / 2 - 0.05; // 地下に潜らないよう制限
    controls.minDistance = 40;
    controls.maxDistance = 4000;
    controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };
    if (searchRef.current) {
      const p = searchRef.current.start;
      controls.target.set(p.x, 70, p.z);
      camera.position.set(p.x + 180, 260, p.z + 250);
      controls.update();
    }
    if(initialViewRef.current){
      const view=initialViewRef.current;
      controls.minDistance=1;controls.maxPolarAngle=Math.PI-.001;
      camera.position.fromArray(view.camera);controls.target.fromArray(view.target);
      camera.fov=view.fov;camera.updateProjectionMatrix();controls.update();
    }
    controlsRef.current = controls;
    controls.addEventListener('start',()=>{sharedFocusRef.current=undefined;});

    const flight = setupPortFlight(container, scene, camera, controls, renderer.domElement, scenery.setUnderwater);
    let shared:ReturnType<typeof import('../../../multiplayer/sharedExploration').setupSharedExploration>|null=null;
    let sharedDisposed=false;
    const together=document.createElement('button');together.className='shared-exploration-launch';together.textContent='一緒に探索';container.append(together);
    together.onclick=async()=>{
      together.disabled=true;
      try {const {setupSharedExploration}=await import('../../../multiplayer/sharedExploration');
        if(sharedDisposed)return;
        shared=setupSharedExploration(container,scene,()=>flight.getNetworkPose());together.remove();
      }catch{together.disabled=false;together.textContent='接続画面を再読込';}
    };
    if(new URL(location.href).searchParams.has('room'))together.click();

    flightRef.current = flight;

    // --- 5. Lights ---
    // 850m四方の実都市空間を標本図鑑トーンで照らす環境光・太陽光
    const ambientLight = new THREE.AmbientLight(0xf5f0e6, 0.9);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xfff7ed, 1.4);
    sunLight.position.set(300, 500, 200);
    scene.add(sunLight);

    const fillLight = new THREE.DirectionalLight(0x406d8d, 0.6);
    fillLight.position.set(-250, 200, -250);
    scene.add(fillLight);

    // --- 6. Build Port Geometry with PLATEAU Real Data ---
    // Release version management (?release=v1 for base/rollback, ?release=v2 for active override)
    const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const releaseQuery = urlParams?.get('release');
    if (releaseQuery === 'v1' || releaseQuery === 'base') {
      scene.userData.releaseId = 'release-2026-11-v1';
    } else if (releaseQuery === 'v2') {
      scene.userData.releaseId = 'release-2026-11-v2';
    } else if (releaseQuery) {
      scene.userData.releaseId = releaseQuery;
    }
    scene.userData.adminMode = false;

    const sceneResult = buildNumazuPortScene(scene, (loaded, total) => {
      if (alive) setLoadText(`PLATEAU実データを読み込み中 (${loaded}/${total})…`);
    }, (group) => flight.addGeometry(group), text => { loadingArea = !!text; if (alive) setAreaStatus(text); });
    sceneResultRef.current = sceneResult;
    if (typeof window !== 'undefined') {
      (window as any).__buildingOverrideManager = sceneResult.overrideManager;
    }
    const { disposables, ready, updateWater, updateBuildings, isWaterAt, dispose: disposeScene } = sceneResult;

    flight.setWaterQuery(isWaterAt);

    ready
      .then(() => {
        if(!alive)return;
        dataReady = true;
        if (alive) setIsLoading(false);
      })
      .catch((err) => {
        if (!alive) return;
        console.error('Failed to load PLATEAU scene:', err);
        onWebGLError('街のデータを読み込めませんでした。2Dで続けられます。');
      });

    const fishWorld=searchRef.current?createWorldFish(scene,searchRef.current.fishId,searchRef.current.target,searchRef.current.locale??'ja'):undefined;
    const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    searchRef.current?.onCaptureReady(() => {
      if (contextIsLost || !dataReady || loadingArea) throw new Error('Scenery is still loading');
      scene.userData.forceReflectionUpdate=true;
      const rendered=renderFrame();
      scene.userData.forceReflectionUpdate=false;
      if (!rendered) throw new Error('3D render interrupted');
      const url = renderer.domElement.toDataURL('image/png');
      return url;
    });
    const contextLost = (e: Event) => { contextIsLost = true; e.preventDefault(); onWebGLError('3Dの描画が中断されました。2Dで続けられます。'); };
    renderer.domElement.addEventListener('webglcontextlost', contextLost);

    // --- 7. Build Pin Markers ---
    const pinObjs = createPinMarkers(pins);
    pinObjs.forEach((po) => scene.add(po.group));
    pinObjectsRef.current = pinObjs;
    capturePhotoRef.current=()=>{
      if(contextIsLost||!dataReady||loadingArea)throw Error('Scenery still loading');
      const direction=camera.getWorldDirection(new THREE.Vector3());
      const target=flight.isActive()?camera.position.clone().addScaledVector(direction,50):controls.target.clone();
      const focus=flight.isActive()?flight.getPosition():sharedFocusRef.current?new THREE.Vector3(sharedFocusRef.current[0],0,sharedFocusRef.current[1]):controls.target;
      const view:Viewpoint={camera:camera.position.toArray() as Vec3,target:target.toArray() as Vec3,
        focus:[Math.max(-1550,Math.min(1450,focus.x)),Math.max(-2580,Math.min(1800,focus.z))],fov:camera.fov};
      const hide=[fishWorld?.root,highlightGroupRef.current,...pinObjs.map(p=>p.group)].filter((o):o is NonNullable<typeof o>=>!!o);
      const visible=hide.map(o=>o.visible);hide.forEach(o=>{o.visible=false;});
      try{
        return flight.withoutCharacter(()=>{
          scene.userData.forceReflectionUpdate=true;
          if(!renderFrame())throw Error('Render interrupted');
          return {image:renderer.domElement.toDataURL('image/png'),view};
        });
      }finally{scene.userData.forceReflectionUpdate=false;hide.forEach((o,i)=>{o.visible=visible[i];});}
    };

    // --- 8. Raycasting & Tap Detection ---
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let press: {id:number;x:number;y:number;time:number;moved:boolean}|null=null;
    let selecting=false;
    const handlePointerDown=(e:PointerEvent)=>{
      if(!e.isPrimary||e.button!==0){press=null;return;}
      press={id:e.pointerId,x:e.clientX,y:e.clientY,time:performance.now(),moved:false};
    };
    const handlePointerMove=(e:PointerEvent)=>{
      if(press?.id===e.pointerId && Math.hypot(e.clientX-press.x,e.clientY-press.y)>8)press.moved=true;
    };
    const handlePointerUp=async(e:PointerEvent)=>{
      const start=press;press=null;
      if(!start||start.id!==e.pointerId||start.moved||e.type!=='pointerup'||selecting)return;
      const duration=performance.now()-start.time;
      if(duration<500){
        if(flight.isActive())return;
        const rect=renderer.domElement.getBoundingClientRect();
        mouse.set((e.clientX-rect.left)/rect.width*2-1,1-(e.clientY-rect.top)/rect.height*2);
        raycaster.setFromCamera(mouse,camera);
        const hit=raycaster.intersectObjects(pinObjs.map(p=>p.collider),false)[0];
        if(hit)onSelectPin(hit.object.userData.pinId);
        return;
      }
      const rect=renderer.domElement.getBoundingClientRect();
      mouse.set((e.clientX-rect.left)/rect.width*2-1,1-(e.clientY-rect.top)/rect.height*2);
      raycaster.setFromCamera(mouse,camera);
      const result=sceneResultRef.current;
      const hit=raycaster.intersectObjects(result?.getBuildingTargets?.()||[],true)[0];
      if(!hit){setSelectedBuilding(null);setSelectionNotice((locale??searchRef.current?.locale)==='en'?'No building found.':'建物が見つかりませんでした。建物の上で長押ししてください。');return;}
      const point=hit.point.clone();selecting=true;
      setSelectionNotice((locale??searchRef.current?.locale)==='en'?'Loading building information…':'建物情報を読み込み中…');
      try{
        await result?.loadSelectionForLoadedChunks?.();
        if(!alive)return;
        const record=result?.selectionManager?.findBuilding(point);
        setSelectedBuilding(record??null);setCopied(false);
        setSelectionNotice(record?'':((locale??searchRef.current?.locale)==='en'?'Could not identify the building.':'建物を特定できませんでした。もう一度長押ししてください。'));
      }catch{if(alive)setSelectionNotice('建物情報を読み込めませんでした。通信状態を確認してください。');}
      finally{selecting=false;}
    };
    const dom=renderer.domElement;
    dom.addEventListener('pointerdown',handlePointerDown);
    dom.addEventListener('pointermove',handlePointerMove);
    dom.addEventListener('pointerup',handlePointerUp);
    dom.addEventListener('pointercancel',handlePointerUp);

    // --- 9. Resize Handling ---
    const handleResize = () => {
      if (!container) return;
      width = container.clientWidth || window.innerWidth;
      height = container.clientHeight || window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener('resize', handleResize);

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserver.observe(container);

    // --- 10. Animation Loop & Stats ---
    let animationFrameId: number;
    let lastTime = performance.now();
    let prevFrameTime = performance.now();
    let frameCount = 0;
    let fps = 60;
    let lastStatsTime = performance.now();
    let lastSearchTime = 0;
    const frameTimes: number[] = [];
    const sessionStart = performance.now();
    renderBudget.reset(sessionStart);
    const sharedFocus = new THREE.Vector3();
    const previousCamera = camera.position.clone(), previousRotation = camera.quaternion.clone();
    let lastCameraMotion = sessionStart;
    let lastNavigationTime = -Infinity;
    let renderTarget: 30|60 = 60;
    const resumeRendering = () => {
      const now = performance.now();
      prevFrameTime = now; lastTime = now; frameCount = 0; frameTimes.length = 0;
      renderBudget.reset(now); lastCameraMotion = now;
    };
    document.addEventListener('visibilitychange', resumeRendering);

    const animate = (currentTime: number) => {
      if (!alive || contextIsLost) return;
      animationFrameId = requestAnimationFrame(animate);
      if(photoOpenRef.current || document.visibilityState === 'hidden'){
        prevFrameTime=currentTime;renderBudget.reset(currentTime);return;
      }
      renderTarget = !flight.isActive() && currentTime-lastCameraMotion>750 ? 30 : 60;
      if(!renderBudget.shouldRender(currentTime,renderTarget))return;

      if (document.visibilityState === 'visible') { frameTimes.push(currentTime - prevFrameTime); if(frameTimes.length>300)frameTimes.shift(); }
      const delta = Math.min((currentTime - prevFrameTime) * 0.001, 0.1);
      prevFrameTime = currentTime;

      // 水面アニメーション（海揺らぎ・川スクロール）
      if (updateWater) {
        updateWater(delta);
      }

      // FPS 計測
      frameCount++;
      if (currentTime - lastTime >= 500) {
        fps = Math.round((frameCount * 1000) / (currentTime - lastTime));
        frameCount = 0;
        lastTime = currentTime;
      }

      // 定期的な性能統計の通知 (1秒ごと)
      if (currentTime - lastStatsTime >= 1000) {
        lastStatsTime = currentTime;
        const sorted = [...frameTimes].sort((a,b)=>a-b);
        onUpdateStats({
          frameP50Ms: sorted[Math.floor(sorted.length*.5)],
          frameP95Ms: sorted[Math.floor(sorted.length*.95)],
          elapsedMs: currentTime-sessionStart,
          fps,
          drawCalls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles,
          dpr: renderBudget.dpr,
          renderTargetFps: renderTarget,
          cameraPosition: camera.position.toArray() as [number,number,number],
          flightActive: flight.isActive(),
          geometries: renderer.info.memory.geometries,
          textures: renderer.info.memory.textures,
        });
      }

      // ピンアニメーション
      updatePinAnimations(pinObjs, currentTime * 0.001, selectedPinId);

      // 選択中ピンへのスムーズカメラ注視
      if (targetCamFocusRef.current) {
        controls.target.lerp(targetCamFocusRef.current, 0.05);
        if (controls.target.distanceTo(targetCamFocusRef.current) < 0.2) {
          targetCamFocusRef.current = null;
        }
      }

      if (flight.isActive()) flight.update(delta, currentTime * 0.001);
      else controls.update();
      shared?.update(delta,currentTime*.001);
      if(!searchRef.current){
        if(currentTime-lastNavigationTime>=100){
          navigation?.update(camera.position,landmarksRef.current);lastNavigationTime=currentTime;
        }
        if(!flight.isActive())scenery.setUnderwater(camera.position.y<41.5&&isWaterAt(camera.position.x,camera.position.z));
      }
      if(previousCamera.distanceToSquared(camera.position)>.000001 || previousRotation.angleTo(camera.quaternion)>.00001){
        lastCameraMotion=currentTime;previousCamera.copy(camera.position);previousRotation.copy(camera.quaternion);
      }
      scene.userData.nearBuildingPilot = pilotEnabledRef.current;
      updateBuildings?.(flight.isActive() ? camera.position : sharedFocusRef.current ? sharedFocus.set(sharedFocusRef.current[0],0,sharedFocusRef.current[1]) : controls.target,camera.position);
      if (searchRef.current && currentTime - lastSearchTime > 150) {
        lastSearchTime = currentTime;
        const p = flight.isActive() ? flight.getPosition() : controls.target;
        const target=fishWorld?.targetPosition;
        let visible = dataReady && !loadingArea;
        if(target){
          const underwater=(searchRef.current.target.medium??'air')!=='air';
          visible=visible&&(!underwater||flight.isActive()&&flight.getStatus().state==='water');
          if(flight.isActive())visible=visible&&(underwater?Math.abs(p.y-target.y)<5:flight.getStatus().state==='ground'||Math.abs(p.y-target.y)<30);
          if(visible&&Math.hypot(p.x-target.x,p.z-target.z)<=25){
            const direction=target.clone().sub(camera.position),length=direction.length();
            raycaster.set(camera.position,direction.normalize());
            const hits=raycaster.intersectObjects(scene.children.filter(o=>o!==fishWorld?.root&&!o.userData.virtualWaterBed&&!o.userData.regionalLandscape&&!(underwater&&o.userData.waterTerrain)),true);
            visible=!hits.some(h=>h.distance<length-4&&h.object instanceof THREE.Mesh&&h.object.material instanceof THREE.MeshStandardMaterial&&!h.object.userData.worldFish);
          }
        }
        navigation?.update(flight.isActive()?p:camera.position,landmarksRef.current);
        searchRef.current.onPosition({ x:p.x, z:p.z,...(flight.isActive()?{y:p.y}:{}) }, visible);
      }
      fishWorld?.update(currentTime*.001,flight.isActive()?flight.getPosition():camera.position,!!searchRef.current?.discovered,reducedMotion);
      if(renderBudget.sample(currentTime,dataReady&&!loadingArea&&currentTime-sessionStart>5000)){
        renderer.setPixelRatio(renderBudget.dpr);
      }
      if (!renderFrame()) cancelAnimationFrame(animationFrameId);
      else if(dataReady&&!entered){
        entered=true;
        if(searchRef.current?.autoFly){
          flight.setMode(true,new THREE.Vector3(searchRef.current.start.x,searchRef.current.start.y??90,searchRef.current.start.z));
          setFlying(true);
        }
        searchRef.current?.onReady?.();
        readyRef.current?.();
      }
    };

    animationFrameId = requestAnimationFrame(animate);

    // --- Cleanup ---
    return () => {
      alive = false;
      capturePhotoRef.current=null;
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange',resumeRendering);
      resizeObserver.disconnect();

      dom.removeEventListener('pointerdown',handlePointerDown);
      dom.removeEventListener('pointermove',handlePointerMove);
      dom.removeEventListener('pointerup',handlePointerUp);
      dom.removeEventListener('pointercancel',handlePointerUp);

      searchRef.current?.onCaptureReady(null);
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      fishWorld?.dispose();
      flightRef.current = null;
      sharedDisposed=true;shared?.dispose();together.remove();
      flight.dispose();
      scenery.dispose();
      controls.dispose();
      renderer.dispose();
      if (container.contains(dom)) {
        container.removeChild(dom);
      }

      // シーン破棄（遅延ロードタイマー解除およびジオメトリ・マテリアル・テクスチャ破棄）
      if (disposeScene) {
        disposeScene();
      } else {
        disposables.forEach((item) => {
          if (item.geometry) item.geometry.dispose();
          if (item.material) item.material.dispose();
          if (item.texture) item.texture.dispose();
        });
      }
    };
  }, [pins, onSelectPin, onUpdateStats, onWebGLError]);

  // 選択ピン変更時のカメラフォーカス
  useEffect(() => {
    if (!selectedPinId) return;
    const target = pins.find((p) => p.id === selectedPinId);
    if (target) {
      targetCamFocusRef.current = new THREE.Vector3(
        target.position[0],
        target.position[1],
        target.position[2]
      );
    }
  }, [selectedPinId, pins]);

  // 選択された建物のハイライト更新
  useEffect(() => {
    const scene = sceneRef.current;
    const sm = sceneResultRef.current?.selectionManager;
    if (!scene) return;

    if (highlightGroupRef.current) {
      scene.remove(highlightGroupRef.current);
      highlightGroupRef.current.traverse(o => {
        if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
          o.geometry.dispose();
          if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
          else o.material.dispose();
        }
      });
      highlightGroupRef.current = null;
    }

    if (selectedBuilding && sm) {
      const h = sm.createHighlight(selectedBuilding);
      if (h) {
        scene.add(h);
        highlightGroupRef.current = h;
      }
    }
  }, [selectedBuilding]);

  const handleCopyBuildingInfo = async (b: BuildingRecord) => {
    const ovr = sceneResultRef.current?.overrideManager?.getOverrideForBuilding(b.id);
    const lines = [
      `建物ID: ${b.id}`,
      `緯度経度: ${b.lat.toFixed(6)}, ${b.lon.toFixed(6)}`,
      `ENU座標: x=${b.center[0]}, y=${b.center[1]}, z=${b.center[2]}`,
      `データ年度: ${b.year}年度${b.isCityHall ? '（市役所置換）' : ''}`,
    ];
    if (ovr) {
      lines.push(`修正台帳: ${ovr.operation} (rev.${ovr.revision}, ${ovr.verifiedAt})`);
    }
    const text = lines.join('\n');

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.warn('Clipboard copy failed:', e);
    }
  };

  return (
    <div className="search-world">
      <div className="search-world-toolbar">
      <button
        type="button"
        disabled={isLoading || (!flying && !!areaStatus)}
        onClick={() => {
          const flight = flightRef.current;
          if (!flight) return;
          const camera = controlsRef.current?.object as THREE.PerspectiveCamera | undefined;
          if (camera) { camera.fov = 45; camera.updateProjectionMatrix(); }
          const active = !flight.isActive();
          const target=controlsRef.current!.target;
          flight.setMode(active, searchRef.current ? new THREE.Vector3(target.x,90,target.z) : initialViewRef.current ? new THREE.Vector3(target.x,Math.max(50,Math.min(400,target.y+12)),target.z) : locationRef.current === 'station' ? new THREE.Vector3(210, 80, -2395) : undefined);
          setFlying(active);
        }}
        className="search-flight-button"
      >{isLoading || (!flying && !!areaStatus) ? '飛行準備中…' : flying ? 'マップに戻る' : '飛んでみる'}</button>
      <button type="button" aria-pressed={landmarks} onClick={()=>setLandmarks(!landmarks)}>{en?'Places':'目印'}</button>
      <div className="search-world-destinations">
        <select aria-label={en ? 'Go to' : '移動先'} disabled={isLoading} defaultValue=""
          onChange={event => {
            const location = event.target.value;
            if (!location) return;
            sharedFocusRef.current=undefined;
            flightRef.current?.setMode(false); setFlying(false);
            locationRef.current = location === 'station' ? 'station' : 'port';
            setPilotView(location === 'pilot');
            targetCamFocusRef.current = null;
            const controls = controlsRef.current;
            if (!controls) return;
            const camera = controls.object as THREE.PerspectiveCamera;
            camera.fov = 45; camera.updateProjectionMatrix();
            controls.minDistance = location === 'pilot' ? 6 : 40;
            if(location==='cityhall'){
              const target=cityHallPoint(-7,23,3);
              camera.fov=camera.aspect<.8?70:45;camera.updateProjectionMatrix();
              controls.minDistance=8;controls.target.copy(target);
              controls.object.position.copy(cityHallPoint(85,65,125));
              controls.update();event.target.value='';return;
            }
            if (location === 'pilot') {
              const target = pilotPosition().add(new THREE.Vector3(0, 2.9, 0));
              const [nx, nz] = NEAR_BUILDING_PILOT.normal;
              // Keep the camera in the gap in front of the facade. Moving it
              // backwards for a portrait screen puts it behind another roof.
              const distance = 16.5;
              camera.fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan(NEAR_BUILDING_PILOT.width * .65 / (distance * camera.aspect))), 45, 100);
              camera.updateProjectionMatrix();
              controls.target.copy(target);
              controls.object.position.copy(target).add(new THREE.Vector3(nx * distance, 1, nz * distance));
              controls.update(); event.target.value = ''; return;
            }
            const target = location === 'senbon' ? new THREE.Vector3(-738.6,48,-1220.4) : location === 'ganyudo' ? new THREE.Vector3(205.8,48,620.6) : location === 'station' ? new THREE.Vector3(210, 48, -2395) : new THREE.Vector3(-20, 43, -190);
            controls.target.copy(target);
            controls.object.position.copy(target).add(new THREE.Vector3(300, 310, 400));
            controls.update();
            event.target.value = '';
          }}>
          <option value="" disabled>{en ? 'Go to…' : '移動先…'}</option>
          <option value="port">沼津港</option><option value="station">沼津駅南口</option>
          <option value="senbon">千本浜公園周辺</option><option value="ganyudo">我入道周辺</option>
          <option value="cityhall">{en ? 'City Hall' : '市役所'}</option>
          <option value="pilot">{en ? 'Building preview' : '建物の試作を見る'}</option>
        </select>
      </div>
      </div>
      <div ref={mountRef} className="search-world-canvas"/>
      <NavigationHud rootRef={navigationRef} en={en}/>
      <button className="scenery-photo-trigger" disabled={isLoading||!!areaStatus||photoBusy} onClick={takePhoto}>{photoBusy?(en?'Creating…':'作成中…'):(en?'Take photo':'景色を撮る')}</button>
      {photoNotice&&<p className="scenery-photo-notice" role="status">{photoNotice}</p>}
      {photo&&<PhotoPreview photo={photo} en={en} onClose={()=>setPhoto(null)}/>}
      {pilotView && !flying && <div className="building-pilot-controls">
        <span>{en ? 'Illustrative facade, not a faithful reconstruction' : '外観の試作（実物の再現ではありません）'}</span>
        <button type="button" aria-pressed={pilotEnabled} onClick={() => setPilotEnabled(!pilotEnabled)}>
          {en ? 'Facade details' : '立体の細部'} {pilotEnabled ? 'ON' : 'OFF'}
        </button>
      </div>}
      {areaStatus && <div role="status" className="search-world-status">{areaStatus}</div>}
      {selectionNotice&&<div className="admin-selection-banner" role="status">{selectionNotice}</div>}
      {selectedBuilding && (
        <div
          className="building-selection-card"
          role="dialog"
          aria-label="建物情報"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="building-selection-card-header">
            <h4>{en ? 'About this place' : 'この場所について'}</h4>
            <button
              type="button"
              className="close-button"
              onClick={() => setSelectedBuilding(null)}
              aria-label="閉じる"
            >×</button>
          </div>
          <PlaceIntroduction key={selectedBuilding.id} buildingId={selectedBuilding.id} en={en}/>
          <details><summary>{en ? 'Building data'  : '建物データを見る'}</summary>
          <div className="building-selection-card-body">
            <div className="building-info-row">
              <span className="building-info-label">原本ID (gml_id)</span>
              <span className="building-info-value mono">{selectedBuilding.id}</span>
            </div>
            <div className="building-info-row">
              <span className="building-info-label">緯度・経度 (WGS84)</span>
              <span className="building-info-value">{selectedBuilding.lat.toFixed(6)}, {selectedBuilding.lon.toFixed(6)}</span>
            </div>
            <div className="building-info-row">
              <span className="building-info-label">ENU世界座標</span>
              <span className="building-info-value">x: {selectedBuilding.center[0]}, y: {selectedBuilding.center[1]}, z: {selectedBuilding.center[2]}</span>
            </div>
            <div className="building-info-row">
              <span className="building-info-label">データ年度</span>
              <span className="building-info-value">{selectedBuilding.year}年度（PLATEAU 3D都市モデル）{selectedBuilding.isCityHall ? ' 【市役所置換モデル】' : ''}</span>
            </div>
            {(() => {
              const ovr = sceneResultRef.current?.overrideManager?.getOverrideForBuilding(selectedBuilding.id);
              if (!ovr) return null;
              return (
                <div className="building-info-row building-override-row">
                  <span className="building-info-label">修正台帳</span>
                  <span className="building-info-value override-badge">
                    {ovr.operation === 'hide' ? '除去 (hide)' : ovr.operation === 'replace' ? '置換 (replace)' : ovr.operation}
                    {' '}(rev.{ovr.revision}, {ovr.verifiedAt})
                  </span>
                </div>
              );
            })()}
          </div>
          <div className="building-selection-card-actions">
            <button
              type="button"
              className={`copy-info-button ${copied ? 'copied' : ''}`}
              onClick={() => handleCopyBuildingInfo(selectedBuilding)}
            >
              {copied ? (en ? '✓ Copied!' : '✓ コピーしました！') : (en ? 'Copy Info' : '情報をコピー')}
            </button>
          </div>
          </details>
        </div>
      )}
      {/* 読み込み中インジケーター（小さな表示） */}
      {isLoading && (
        <div className="map-loading-indicator">
          <span className="map-loading-spinner" />
          <span className="map-loading-text">{loadText}</span>
        </div>
      )}
    </div>
  );
};
