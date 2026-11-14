import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { setupPortFlight } from '../flight/portFlight';
import { MapPin, PerformanceStats } from '../types';
import { buildNumazuPortScene } from '../three/sceneBuilder';
import { createPinMarkers, updatePinAnimations, Pin3DObject } from '../three/pinMarkers';

interface Map3DViewProps {
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
  pins,
  selectedPinId,
  onSelectPin,
  onUpdateStats,
  onWebGLError,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const flightRef = useRef<ReturnType<typeof setupPortFlight> | null>(null);
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

    let width = container.clientWidth || window.innerWidth;
    let height = container.clientHeight || window.innerHeight;

    // --- 1. Scene & Fog ---
    // 指示書: FogExp2 の濃度は 0.0008 程度に下げる
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1c2c); // 深海ネイビー
    scene.fog = new THREE.FogExp2(0x0b1c2c, 0.00035);

    // --- 2. Camera ---
    // 指示書: 初期位置およそ (330, 300, 470)、注視点 (-30, 43, -140)（港と海が両方入る構図）
    const camera = new THREE.PerspectiveCamera(45, width / height, 1, 5000);
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

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.appendChild(renderer.domElement);

    // --- 4. Controls ---
    // 指示書: minDistance 40、maxDistance 1400、maxPolarAngle は従来どおり (Math.PI / 2 - 0.05)
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(-20, 43, -190); // 港と海が両方入る構図、yは地面41.7付近
    controls.maxPolarAngle = Math.PI / 2 - 0.05; // 地下に潜らないよう制限
    controls.minDistance = 40;
    controls.maxDistance = 1400;
    controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };
    controlsRef.current = controls;

    const flight = setupPortFlight(container, scene, camera, controls, renderer.domElement);
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
    const { disposables, ready, updateWater, dispose: disposeScene } = buildNumazuPortScene(scene, (loaded, total) => {
      setLoadText(`PLATEAU実データを読み込み中 (${loaded}/${total})…`);
    }, (group) => flight.addGeometry(group));

    ready
      .then(() => {
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load PLATEAU scene:', err);
        setIsLoading(false);
      });

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

    const animate = (currentTime: number) => {
      animationFrameId = requestAnimationFrame(animate);

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
        onUpdateStats({
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
      renderer.render(scene, camera);
    };

    animationFrameId = requestAnimationFrame(animate);

    // --- Cleanup ---
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();

      dom.removeEventListener('mousedown', handlePointerDown);
      dom.removeEventListener('mouseup', handlePointerUp);
      dom.removeEventListener('touchstart', handlePointerDown);
      dom.removeEventListener('touchend', handlePointerUp);

      flightRef.current = null;
      flight.dispose();
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
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'absolute',
        top: 0,
        left: 0,
        touchAction: 'none',
      }}
    >
      <div ref={mountRef} style={{position:'absolute', inset:0}} />
      <button
        type="button"
        disabled={isLoading}
        onClick={() => {
          const flight = flightRef.current;
          if (!flight) return;
          const active = !flight.isActive();
          flight.setMode(active);
          setFlying(active);
        }}
        style={{position:'absolute', right:12, top:12, zIndex:30, minHeight:48,
          padding:'12px 18px', border:'2px solid white', borderRadius:16,
          background:'#e97940', color:'white', fontWeight:700, pointerEvents:'auto'}}
      >{isLoading ? '飛行準備中…' : flying ? 'マップに戻る' : '飛んでみる'}<small style={{display:'block'}}>飛行テスト v3</small></button>
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
