import React, { useState, useCallback, useEffect } from 'react';
import { PINS } from './data/pins';
import { PerformanceStats } from './types';
import { Map3DView } from './components/Map3DView';
import { Map2DView } from './components/Map2DView';
import { InfoPanel } from './components/InfoPanel';
import { PerformanceHUD } from './components/PerformanceHUD';
import { Header, Footer } from './components/HeaderFooter';
import './styles/index.css';

const STAMP_STORAGE_KEY = 'shinkai_spike_stamps_v1';

export const App: React.FC = () => {
  const [viewMode, setViewMode] = useState<'3d' | '2d'>('3d');
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [webGLErrorReason, setWebGLErrorReason] = useState<string | null>(null);
  const [webGLAvailable, setWebGLAvailable] = useState<boolean>(true);

  // スタンプ状態（localStorageから読み出し）
  const [stamps, setStamps] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(STAMP_STORAGE_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // パフォーマンス統計
  const [stats, setStats] = useState<PerformanceStats>({
    fps: 60,
    drawCalls: 0,
    triangles: 0,
    dpr: Math.min(window.devicePixelRatio || 1, 2),
    geometries: 0,
    textures: 0,
  });

  const handleUpdateStats = useCallback((newStats: PerformanceStats) => {
    setStats(newStats);
  }, []);

  const handleWebGLError = useCallback((reason: string) => {
    console.warn('WebGL fallback triggered:', reason);
    setWebGLErrorReason(reason);
    setWebGLAvailable(false);
    setViewMode('2d');
  }, []);

  const handleToggleStamp = useCallback((pinId: string) => {
    setStamps((prev) => {
      const next = { ...prev, [pinId]: !prev[pinId] };
      try {
        localStorage.setItem(STAMP_STORAGE_KEY, JSON.stringify(next));
      } catch (err) {
        console.warn('Failed to save stamps to localStorage', err);
      }
      return next;
    });
  }, []);

  const selectedPin = PINS.find((p) => p.id === selectedPinId) || null;

  // ESCキーでパネルを閉じる
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedPinId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="spike-app-root">
      {/* 画面上部ヘッダー */}
      <Header
        viewMode={viewMode}
        onToggleViewMode={setViewMode}
        webGLAvailable={webGLAvailable}
      />

      {/* 性能HUD表示 */}
      <PerformanceHUD stats={stats} is3D={viewMode === '3d'} />

      {/* マップメイン表示領域 */}
      <main className="map-viewport-container">
        {viewMode === '3d' && (
          <Map3DView
            pins={PINS}
            selectedPinId={selectedPinId}
            onSelectPin={setSelectedPinId}
            onUpdateStats={handleUpdateStats}
            onWebGLError={handleWebGLError}
          />
        )}

        {viewMode === '2d' && (
          <Map2DView
            pins={PINS}
            selectedPinId={selectedPinId}
            onSelectPin={setSelectedPinId}
            webGLErrorReason={webGLErrorReason}
          />
        )}

        {/* 3D操作ガイドヒント（3D時のみ下部に薄く表示） */}
        {viewMode === '3d' && !selectedPin && (
          <div className="map-gesture-hint">
            <span>回転: ドラッグ / 拡大縮小: ピンチ・ホイール / 平行移動: 2本指</span>
          </div>
        )}
      </main>

      {/* 下部情報パネル */}
      {selectedPin && (
        <InfoPanel
          pin={selectedPin}
          onClose={() => setSelectedPinId(null)}
          isStamped={!!stamps[selectedPin.id]}
          onToggleStamp={() => handleToggleStamp(selectedPin.id)}
        />
      )}

      {/* 画面最下部フッター（出典・免責表記） */}
      <Footer />
    </div>
  );
};

export default App;
