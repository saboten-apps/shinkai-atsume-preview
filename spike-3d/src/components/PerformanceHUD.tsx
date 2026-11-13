import React from 'react';
import { PerformanceStats } from '../types';

interface PerformanceHUDProps {
  stats: PerformanceStats;
  is3D: boolean;
}

export const PerformanceHUD: React.FC<PerformanceHUDProps> = ({ stats, is3D }) => {
  return (
    <div className="perf-hud-container" aria-label="3D描画性能指標（技術検証用）">
      <div className="perf-hud-header">
        <span className="perf-hud-label">PERF HUD</span>
        <span className="perf-hud-mode">{is3D ? '3D WebGL' : '2D SVG'}</span>
      </div>
      <div className="perf-hud-grid">
        <div className="perf-item">
          <span className="perf-title">FPS:</span>
          <span className={`perf-value ${stats.fps < 30 ? 'warn' : 'good'}`}>
            {stats.fps}
          </span>
        </div>
        <div className="perf-item">
          <span className="perf-title">Calls:</span>
          <span className="perf-value">{stats.drawCalls}</span>
        </div>
        <div className="perf-item">
          <span className="perf-title">Tris:</span>
          <span className="perf-value">
            {stats.triangles > 1000 ? `${(stats.triangles / 1000).toFixed(1)}k` : stats.triangles}
          </span>
        </div>
        <div className="perf-item">
          <span className="perf-title">DPR:</span>
          <span className="perf-value">{stats.dpr.toFixed(1)}</span>
        </div>
      </div>
    </div>
  );
};
