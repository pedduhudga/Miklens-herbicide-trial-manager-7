import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Chart, BarController, BarElement, ScatterController, LineController,
  PointElement, LineElement, CategoryScale, LinearScale, Tooltip, Legend,
} from 'chart.js';

Chart.register(
  BarController, BarElement, ScatterController, LineController,
  PointElement, LineElement, CategoryScale, LinearScale, Tooltip, Legend,
);

function downloadCanvas(canvas, filename) {
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

// ── Histogram with normal-curve overlay ───────────────────────────────────
function ResidualHistogram({ residuals }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !residuals?.length) return;
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }

    const n = residuals.length;
    const min = Math.min(...residuals);
    const max = Math.max(...residuals);
    const bins = Math.max(5, Math.ceil(Math.sqrt(n)));
    const width = (max - min) / bins || 1;
    const counts = Array(bins).fill(0);
    residuals.forEach(r => {
      const i = Math.min(bins - 1, Math.floor((r - min) / width));
      counts[i]++;
    });
    const binLabels = counts.map((_, i) => (min + (i + 0.5) * width).toFixed(2));

    // Normal curve points at bin centres
    const mean = residuals.reduce((a, b) => a + b, 0) / n;
    const sd   = Math.sqrt(residuals.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) || 1;
    const normalCurve = binLabels.map(x => {
      const v = parseFloat(x);
      return n * width * (1 / (sd * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((v - mean) / sd) ** 2);
    });

    chartRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels: binLabels,
        datasets: [
          { label: 'Frequency', data: counts, backgroundColor: 'rgba(99,102,241,0.55)', borderColor: 'rgba(99,102,241,1)', borderWidth: 1 },
          { label: 'Normal', type: 'line', data: normalCurve, borderColor: 'rgba(239,68,68,0.9)', borderWidth: 2, pointRadius: 0, fill: false, tension: 0.4, yAxisID: 'y' },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: true, position: 'top' } },
        scales: {
          x: { title: { display: true, text: 'Residual' } },
          y: { title: { display: true, text: 'Count' }, beginAtZero: true },
        },
      },
    });
    return () => { chartRef.current?.destroy(); chartRef.current = null; };
  }, [residuals]);

  const handleDownload = useCallback(() => {
    if (canvasRef.current) downloadCanvas(canvasRef.current, 'residuals_histogram.png');
  }, []);

  return (
    <div>
      <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Residuals Histogram</p>
      <div className="relative" style={{ height: 200 }}><canvas ref={canvasRef} /></div>
      <button onClick={handleDownload}
        className="mt-1 text-xs px-3 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200">
        Download PNG
      </button>
    </div>
  );
}

// ── Normal Q-Q Plot ────────────────────────────────────────────────────────
function QQPlot({ qqData, normAnnotation }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !qqData?.length) return;
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }

    const sorted  = [...qqData].sort((a, b) => a.theoretical - b.theoretical);
    const scatter = sorted.map(p => ({ x: p.theoretical, y: p.sample }));
    const minT    = sorted[0]?.theoretical ?? -3;
    const maxT    = sorted[sorted.length - 1]?.theoretical ?? 3;
    const refLine = [{ x: minT, y: minT }, { x: maxT, y: maxT }];

    chartRef.current = new Chart(canvasRef.current, {
      type: 'scatter',
      data: {
        datasets: [
          { label: 'Sample quantiles', data: scatter, backgroundColor: 'rgba(99,102,241,0.7)', pointRadius: 4 },
          { label: '45° reference', type: 'line', data: refLine, borderColor: 'rgba(239,68,68,0.8)', borderWidth: 1.5, pointRadius: 0, fill: false, borderDash: [5, 3] },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: true, position: 'top' } },
        scales: {
          x: { title: { display: true, text: 'Theoretical quantiles' } },
          y: { title: { display: true, text: 'Sample quantiles' } },
        },
      },
    });
    return () => { chartRef.current?.destroy(); chartRef.current = null; };
  }, [qqData]);

  const handleDownload = useCallback(() => {
    if (canvasRef.current) downloadCanvas(canvasRef.current, 'qq_plot.png');
  }, []);

  return (
    <div>
      <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Normal Q-Q Plot</p>
      <div className="relative" style={{ height: 200 }}><canvas ref={canvasRef} /></div>
      {normAnnotation && (
        <p className="mt-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
          {normAnnotation}
        </p>
      )}
      <button onClick={handleDownload}
        className="mt-1 text-xs px-3 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200">
        Download PNG
      </button>
    </div>
  );
}

// ── Fitted vs Residuals scatter ────────────────────────────────────────────
function FittedVsResiduals({ fittedValues, residuals }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !fittedValues?.length) return;
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }

    const scatter  = fittedValues.map((x, i) => ({ x, y: residuals[i] ?? 0 }));
    const minF     = Math.min(...fittedValues);
    const maxF     = Math.max(...fittedValues);
    const refLine  = [{ x: minF, y: 0 }, { x: maxF, y: 0 }];

    chartRef.current = new Chart(canvasRef.current, {
      type: 'scatter',
      data: {
        datasets: [
          { label: 'Residuals', data: scatter, backgroundColor: 'rgba(16,185,129,0.65)', pointRadius: 4 },
          { label: 'y = 0', type: 'line', data: refLine, borderColor: 'rgba(100,116,139,0.7)', borderWidth: 1.5, pointRadius: 0, fill: false, borderDash: [5, 3] },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: true, position: 'top' } },
        scales: {
          x: { title: { display: true, text: 'Fitted values' } },
          y: { title: { display: true, text: 'Residuals' } },
        },
      },
    });
    return () => { chartRef.current?.destroy(); chartRef.current = null; };
  }, [fittedValues, residuals]);

  const handleDownload = useCallback(() => {
    if (canvasRef.current) downloadCanvas(canvasRef.current, 'fitted_vs_residuals.png');
  }, []);

  return (
    <div>
      <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Fitted Values vs Residuals</p>
      <div className="relative" style={{ height: 200 }}><canvas ref={canvasRef} /></div>
      <button onClick={handleDownload}
        className="mt-1 text-xs px-3 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200">
        Download PNG
      </button>
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────
export default function ResidualDiagnosticsPanel({ results }) {
  const [open, setOpen] = useState(false);

  const diag = results?.residualDiagnostics;
  const n    = diag?.n ?? 0;

  // Build normality annotation string
  let normAnnotation = null;
  const assumptions = results?.assumptions;
  if (assumptions?.normalityPassed === false) {
    const p = assumptions?.jbPValue;
    normAnnotation = `⚠ Normality test failed${p != null ? ` (JB p = ${p.toFixed(4)})` : ''} — consider non-parametric alternatives`;
  }
  if (!normAnnotation && assumptions?.shapiroWilk?.passed === false) {
    const sw = assumptions.shapiroWilk;
    normAnnotation = `⚠ Shapiro-Wilk: W = ${sw.W?.toFixed(4) ?? 'N/A'}, p = ${sw.pValue?.toFixed(4) ?? 'N/A'}`;
  }

  return (
    <div className="mt-4 border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 text-sm font-semibold text-slate-700 transition-colors"
        aria-expanded={open}
      >
        <span>Residual Diagnostics</span>
        <span className="text-slate-400">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-4 py-4 bg-white space-y-6">
          {n < 6 ? (
            <p className="text-sm text-slate-500 italic">
              Insufficient data for residual diagnostics (n = {n})
            </p>
          ) : (
            <>
              <ResidualHistogram residuals={diag?.residuals} />
              <QQPlot qqData={diag?.qqData} normAnnotation={normAnnotation} />
              <FittedVsResiduals fittedValues={diag?.fittedValues} residuals={diag?.residuals} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
