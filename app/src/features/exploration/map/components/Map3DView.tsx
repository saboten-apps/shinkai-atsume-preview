import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createPortSky } from '../three/portSky';
import { setupPortFlight } from '../flight/portFlight';
import { MapPin, PerformanceStats } from '../types';
import { buildNumazuPortScene } from '../three/sceneBuilder';
import { createPinMarkers, updatePinAnimations, Pin3DObject } from '../three/pinMarkers';

export interface Search3DBridge {
  start: { x: number; z: number };
  target: { x: number; z: number };
  onPosition: (p: { x: number; z: number }, visible: boolean) => void;
  onCaptureReady: (capture: (() => string) | null) => void;
}
interface Map3DViewProps {
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
  search,
  pins,
  selectedPinId,
  onSelectPin,
  onUpdateStats,
  onWebGLError,
}) => {
  const searchRef = useRef(search);
  searchRef.current = search;
  const mountRef = useRef<HTMLDivElement>(null);
  const flightRef = useRef<ReturnType<typeof setupPortFlight> | null>(null);
  const [areaStatus, setAreaStatus] = useState('');
  const locationRef = useRef<'port' | 'station'>('port');
  const [flying, setFlying] = useState(false);
  const controlsRef = useRef<OrbitControls | null>(null);
  const pinObjectsRef = useRef<Pin3DObject[]>([]);
  const targetCamFocusRef = useRef<THREE.Vector3 | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadText, setLoadText] = useState<string>('PLATEAU実データを読み込み中…');

  useEffect(() => {
    if (!isWebGLAvailable()) {
      onWebGLError('ブラウザまたは端末がWebGLに対応していないため、2Dマップへ切り替えました。');
      return;
    }

    const container = mountRef.current;
    if (!container) return;

    let alive = true;
    let dataReady = false;
    let contextIsLost = false;
    let loadingArea = true;
    let width = container.clientWidth || window.innerWidth;
    let height = container.clientHeight || window.innerHeight;

    // --- 1. Scene & Fog ---
    // 指示書: FogExp2 の濃度は 0.0008 程度に下げる
    const scene = new THREE.Scene();
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

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    renderer.setPixelRatio(dpr);
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
    controlsRef.current = controls;

    const flight = setupPortFlight(container, scene, camera, controls, renderer.domElement, scenery.setUnderwater);
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
    const { disposables, ready, updateWater, updateBuildings, dispose: disposeScene } = buildNumazuPortScene(scene, (loaded, total) => {
      if (alive) setLoadText(`PLATEAU実データを読み込み中 (${loaded}/${total})…`);
    }, (group) => flight.addGeometry(group), text => { loadingArea = !!text; if (alive) setAreaStatus(text); });

    ready
      .then(() => {
        dataReady = true;
        if (alive) setIsLoading(false);
      })
      .catch((err) => {
        if (!alive) return;
        console.error('Failed to load PLATEAU scene:', err);
        onWebGLError('街のデータを読み込めませんでした。2Dで続けられます。');
      });

    const beacon = new THREE.Mesh(new THREE.IcosahedronGeometry(5, 1), new THREE.MeshBasicMaterial({color:0xffac70}));
    if (searchRef.current) {
      const t = searchRef.current.target;
      beacon.position.set(t.x, 85, t.z);
      scene.add(beacon);
    }
    searchRef.current?.onCaptureReady(() => {
      if (contextIsLost || !dataReady || loadingArea) throw new Error('Scenery is still loading');
      const wasVisible = beacon.visible;
      beacon.visible = false;
      scene.userData.forceReflectionUpdate=true;
      const rendered=renderFrame();
      scene.userData.forceReflectionUpdate=false;
      if (!rendered) throw new Error('3D render interrupted');
      const url = renderer.domElement.toDataURL('image/png');
      beacon.visible = wasVisible;
      return url;
    });
    const contextLost = (e: Event) => { contextIsLost = true; e.preventDefault(); onWebGLError('3Dの描画が中断されました。2Dで続けられます。'); };
    renderer.domElement.addEventListener('webglcontextlost', contextLost);

    // --- 7. Build Pin Markers ---
    const pinObjs = createPinMarkers(pins);
    pinObjs.forEach((po) => scene.add(po.group));
    pinObjectsRef.current = pinObjs;

    // --- 8. Raycasting & Tap Detection ---
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let touchStartTime = 0;
    let touchStartX = 0;
    let touchStartY = 0;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      touchStartTime = performance.now();
      if ('touches' in e && e.touches.length > 0) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      } else if ('clientX' in e) {
        touchStartX = e.clientX;
        touchStartY = e.clientY;
      }
    };

    const handlePointerUp = (e: MouseEvent | TouchEvent) => {
      if (flight.isActive()) return;
      const duration = performance.now() - touchStartTime;
      let clientX = touchStartX;
      let clientY = touchStartY;
      if ('changedTouches' in e && e.changedTouches.length > 0) {
        clientX = e.changedTouches[0].clientX;
        clientY = e.changedTouches[0].clientY;
      } else if ('clientX' in e) {
        clientX = e.clientX;
        clientY = e.clientY;
      }

      const dist = Math.hypot(clientX - touchStartX, clientY - touchStartY);
      // ドラッグ操作ではなくタップ（移動距離 < 12px、時間 < 500ms）のみ判定
      if (dist > 12 || duration > 500) return;

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);

      const colliders = pinObjs.map((p) => p.collider);
      const intersects = raycaster.intersectObjects(colliders, false);

      if (intersects.length > 0) {
        const hitPinId = intersects[0].object.userData.pinId;
        onSelectPin(hitPinId);
      }
    };

    const dom = renderer.domElement;
    dom.addEventListener('mousedown', handlePointerDown);
    dom.addEventListener('mouseup', handlePointerUp);
    dom.addEventListener('touchstart', handlePointerDown, { passive: true });
    dom.addEventListener('touchend', handlePointerUp, { passive: true });

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

    const animate = (currentTime: number) => {
      if (!alive || contextIsLost) return;
      animationFrameId = requestAnimationFrame(animate);

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

      // 定期的な性能統計の通知 (200msごと)
      if (currentTime - lastStatsTime >= 200) {
        lastStatsTime = currentTime;
        const sorted = [...frameTimes].sort((a,b)=>a-b);
        onUpdateStats({
          frameP50Ms: sorted[Math.floor(sorted.length*.5)],
          frameP95Ms: sorted[Math.floor(sorted.length*.95)],
          elapsedMs: currentTime-sessionStart,
          fps,
          drawCalls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles,
          dpr,
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
      updateBuildings?.(flight.isActive() ? camera.position : controls.target);
      if (searchRef.current && currentTime - lastSearchTime > 150) {
        lastSearchTime = currentTime;
        const p = flight.isActive() ? flight.getPosition() : controls.target;
        const dist = Math.hypot(p.x - beacon.position.x, p.z - beacon.position.z);
        beacon.visible = dist < 100;
        let visible = dataReady;
        if (flight.isActive()) {
          const direction = beacon.position.clone().sub(camera.position);
          const length = direction.length();
          raycaster.set(camera.position, direction.normalize());
          const hits = raycaster.intersectObjects(scene.children, true);
          visible = visible && !loadingArea && Math.abs(p.y - beacon.position.y) < 30 && !hits.some(h => h.object !== beacon && h.distance < length - 7 && h.object instanceof THREE.Mesh && h.object.material instanceof THREE.MeshStandardMaterial);
        }
        searchRef.current.onPosition({ x:p.x, z:p.z }, visible);
      }
      beacon.rotation.y += delta;
      if (!renderFrame()) cancelAnimationFrame(animationFrameId);
    };

    animationFrameId = requestAnimationFrame(animate);

    // --- Cleanup ---
    return () => {
      alive = false;
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();

      dom.removeEventListener('mousedown', handlePointerDown);
      dom.removeEventListener('mouseup', handlePointerUp);
      dom.removeEventListener('touchstart', handlePointerDown);
      dom.removeEventListener('touchend', handlePointerUp);

      searchRef.current?.onCaptureReady(null);
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      beacon.geometry.dispose(); (beacon.material as THREE.Material).dispose();
      flightRef.current = null;
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

  return (
    <div className="search-world">
      <div className="search-world-toolbar">
      <button
        type="button"
        disabled={isLoading || (!flying && !!areaStatus)}
        onClick={() => {
          const flight = flightRef.current;
          if (!flight) return;
          const active = !flight.isActive();
          flight.setMode(active, searchRef.current ? new THREE.Vector3(controlsRef.current!.target.x, 90, controlsRef.current!.target.z) : locationRef.current === 'station' ? new THREE.Vector3(210, 80, -2395) : undefined);
          setFlying(active);
        }}
        className="search-flight-button"
      >{isLoading || (!flying && !!areaStatus) ? '飛行準備中…' : flying ? 'マップに戻る' : '飛んでみる'}</button>
      <div className="search-world-destinations">
        {(['port', 'station'] as const).map(location => <button key={location} type="button" disabled={isLoading}
          onClick={() => {
            flightRef.current?.setMode(false); setFlying(false);
            locationRef.current = location;
            targetCamFocusRef.current = null;
            const controls = controlsRef.current;
            if (!controls) return;
            const target = location === 'station' ? new THREE.Vector3(210, 48, -2395) : new THREE.Vector3(-20, 43, -190);
            controls.target.copy(target);
            controls.object.position.copy(target).add(new THREE.Vector3(300, 310, 400));
            controls.update();
          }}>{location === 'port' ? '沼津港' : '沼津駅南口'}</button>)}
      </div>
      </div>
      <div ref={mountRef} className="search-world-canvas" />
      {areaStatus && <div role="status" className="search-world-status">{areaStatus}</div>}
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
