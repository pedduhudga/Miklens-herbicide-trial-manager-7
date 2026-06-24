import { useMemo } from 'react';
import { Activity } from 'lucide-react';

/**
 * PowerAnalysisPanel
 * Renders a simple SVG power-vs-n curve chart for the power analysis results.
 *
 * Props:
 *   powerCurve   - array of { n, power } from calculatePower
 *   targetPower  - number (0-1), drawn as a horizontal reference line
 *   minNForTarget - number, the minimum n that meets targetPower
 */
export default function PowerAnalysisPanel({ powerCurve = [], targetPower = 0.80, minNForTarget }) {
  const width = 320;
  const height = 160;
  const padL = 36;
  const padR = 12;
  const padT = 12;
  const padB = 32;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;

  const points = useMemo(() => {
    if (!powerCurve || powerCurve.length === 0) return '';
    return powerCurve
      .map(({ n, power }) => {
        const x = padL + ((n - 2) / (30 - 2)) * chartW;
        const y = padT + (1 - power) * chartH;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [powerCurve, chartW, chartH]);

  const targetY = padT + (1 - targetPower) * chartH;
  const minNX = minNForTarget != null
    ? padL + ((minNForTarget - 2) / (30 - 2)) * chartW
    : null;

  // Y-axis labels: 0%, 50%, 100%
  const yLabels = [
    { pct: 0,   y: padT + chartH },
    { pct: 50,  y: padT + chartH * 0.5 },
    { pct: 80,  y: padT + chartH * 0.2 },
    { pct: 100, y: padT },
  ];

  // X-axis labels: 2, 10, 20, 30
  const xLabels = [2, 10, 20, 30].map(n => ({
    n,
    x: padL + ((n - 2) / 28) * chartW,
  }));

  return (
    <div className="mt-3">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Activity className="w-3.5 h-3.5 text-purple-600" />
        <span className="text-xs font-semibold text-slate-700">Power Curve (n per group)</span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full rounded border border-slate-100 bg-slate-50"
        aria-label="Power analysis curve chart"
        role="img"
      >
        {/* Grid lines */}
        {yLabels.map(({ pct, y }) => (
          <line
            key={pct}
            x1={padL} y1={y} x2={padL + chartW} y2={y}
            stroke="#e2e8f0" strokeWidth="0.8"
          />
        ))}

        {/* Y-axis labels */}
        {yLabels.map(({ pct, y }) => (
          <text key={pct} x={padL - 4} y={y + 3.5} textAnchor="end"
            fontSize="8" fill="#64748b">
            {pct}%
          </text>
        ))}

        {/* X-axis labels */}
        {xLabels.map(({ n, x }) => (
          <text key={n} x={x} y={height - 8} textAnchor="middle"
            fontSize="8" fill="#64748b">
            {n}
          </text>
        ))}

        {/* Target power reference line */}
        <line
          x1={padL} y1={targetY} x2={padL + chartW} y2={targetY}
          stroke="#f59e0b" strokeWidth="1" strokeDasharray="4 2"
        />
        <text x={padL + chartW - 2} y={targetY - 3} textAnchor="end"
          fontSize="7.5" fill="#d97706" fontWeight="600">
          Target {Math.round(targetPower * 100)}%
        </text>

        {/* MinN vertical guide */}
        {minNX != null && (
          <>
            <line
              x1={minNX} y1={padT} x2={minNX} y2={padT + chartH}
              stroke="#10b981" strokeWidth="1" strokeDasharray="3 2"
            />
            <text x={minNX + 2} y={padT + 10} textAnchor="start"
              fontSize="7.5" fill="#059669" fontWeight="600">
              n={minNForTarget}
            </text>
          </>
        )}

        {/* Power curve polyline */}
        {points && (
          <polyline
            points={points}
            fill="none"
            stroke="#8b5cf6"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Axes */}
        <line x1={padL} y1={padT} x2={padL} y2={padT + chartH}
          stroke="#94a3b8" strokeWidth="1" />
        <line x1={padL} y1={padT + chartH} x2={padL + chartW} y2={padT + chartH}
          stroke="#94a3b8" strokeWidth="1" />
      </svg>
    </div>
  );
}
