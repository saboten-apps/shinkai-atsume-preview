import React from 'react';
import {
  DEPTH_SCALE_TICKS,
  depthToScalePercent,
  formatDepthText,
  parseDepthRangeMeters,
} from '../lib/i18n';

interface DepthScaleBarProps {
  depthText: string;
  label?: string;
}

/**
 * 標本ラベル用の水深目盛りバー（0m / 200m / 500m / 1000m / 2500m）
 * 駿河湾の深度帯（0m〜最深部2,500m）の目盛り上に、該当種の生息水深帯を細いバーで示す。
 */
export const DepthScaleBar: React.FC<DepthScaleBarProps> = ({ depthText, label }) => {
  const formatted = formatDepthText(depthText);
  const range = parseDepthRangeMeters(depthText);

  const startPct = range ? depthToScalePercent(range.min) : 0;
  const endPct = range ? Math.max(startPct + 3, depthToScalePercent(range.max)) : 0;
  const widthPct = Math.max(0, Math.min(100 - startPct, endPct - startPct));

  return (
    <div className="depth-scale-block">
      <div className="depth-scale-header">
        {label && <span className="depth-scale-label">{label}</span>}
        <span className="depth-scale-value">{formatted}</span>
      </div>

      <div
        className={`depth-scale-track-wrap ${range ? 'has-range' : 'is-pending'}`}
        aria-hidden="true"
      >
        <div className="depth-scale-track">
          {DEPTH_SCALE_TICKS.map((tick, idx) => {
            const leftPct = (idx / (DEPTH_SCALE_TICKS.length - 1)) * 100;
            return (
              <span
                key={tick}
                className="depth-scale-tick"
                style={{ left: `${leftPct}%` }}
              />
            );
          })}

          {range && (
            <div
              className="depth-scale-bar-active"
              style={{
                left: `${startPct}%`,
                width: `${widthPct}%`,
              }}
            />
          )}
        </div>

        <div className="depth-scale-labels">
          {DEPTH_SCALE_TICKS.map((tick, idx) => {
            const leftPct = (idx / (DEPTH_SCALE_TICKS.length - 1)) * 100;
            return (
              <span
                key={tick}
                className="depth-scale-tick-label"
                style={{ left: `${leftPct}%` }}
              >
                {tick}m
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
};
