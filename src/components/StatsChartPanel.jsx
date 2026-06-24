import { useRef, useEffect, useCallback } from 'react';
import {
  Chart, BarController, BarElement, ScatterController,
  PointElement, LineController, LineElement,
  CategoryScale, LinearScale, LogarithmicScale,
  Tooltip, Legend,
} from 'chart.js';

Chart.register(
  BarController, BarElement, ScatterController,
  PointElement, LineController, LineElement,
  CategoryScale, LinearScale, LogarithmicScale,
  Tooltip, Legend,
);

function downloadCanvas(canvas, filename) {
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

// ── Horizontal bar chart (means + CLD labels) ──────────────────────────────
function MeansBarChart({ results, metric }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }

    const groups = results?.groups ?? results?.means ?? {};
    const labels = Object.keys(groups);
    if (labels.length < 2) return;

    const means  = labels.map(l => groups[l]?.mean ?? 0);
    const ses    = labels.map(l => groups[l]?.se   ?? 0);
    const cld    = labels.map(l => groups[l]?.cldLetter ?? '');

    chartRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: metric,
          data: means,
          backgroundColor: 'rgba(99,102,241,0.65)',
          borderColor:     'rgba(99,102,241,1)',
          borderWidth: 1,
          borderSkipped: false,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const i = ctx.dataIndex;
                return ` ${means[i].toFixed(2)} ± ${ses[i].toFixed(2)} SE  [${cld[i]}]`;
              },
            },
          },
        },
        scales: {
          x: { title: { display: true, text: metric } },
          y: { ticks: { font: { size: 11 } } },
        },
      },
    });
    return () => { chartRef.current?.destroy(); chartRef.current = null; };
  }, [results, metric]);

  const handleDownload = useCallback(() => {
    if (canvasRef.current) downloadCanvas(canvasRef.current, `means_${metric}.png`);
  }, [metric]);

  return (
    <div className="mb-4">
      <div className="relative" style={{ height: 260 }}>
        <canvas ref={canvasRef} />
      </div>
      <button onClick={handleDownload}
        className="mt-2 text-xs px-3 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200">
        Download PNG
      </button>
    </div>
  );
}

// ── Dose-response scatter + fitted curve ───────────────────────────────────
function DoseRespChart({ results, metric }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }

    const rawPoints  = results?.rawData  ?? [];
    const curvePoints = results?.curvePoints ?? [];
    if (rawPoints.length === 0) return;

    const scatterData = rawPoints.map(p => ({ x: Math.log10(Math.max(p.dose, 1e-10)), y: p.response }));
    const lineData    = curvePoints.map(p => ({ x: Math.log10(Math.max(p.dose, 1e-10)), y: p.response }));

    const ed50x = results?.ed50 != null ? Math.log10(results.ed50) : null;
    const ed90x = results?.ed90 != null ? Math.log10(results.ed90) : null;

    chartRef.current = new Chart(canvasRef.current, {
      type: 'scatter',
      data: {
        datasets: [
          { label: 'Observed', data: scatterData, backgroundColor: 'rgba(239,68,68,0.7)', pointRadius: 4 },
          ...(lineData.length > 1 ? [{
            label: '4PL Fit', type: 'line', data: lineData,
            borderColor: 'rgba(99,102,241,1)', borderWidth: 2,
            pointRadius: 0, fill: false, tension: 0.4,
          }] : []),
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: 'top' },
          tooltip: { callbacks: { label: (c) => ` (log dose=${c.parsed.x.toFixed(2)}, ${c.parsed.y.toFixed(2)})` } },
        },
        scales: {
          x: { type: 'linear', title: { display: true, text: 'log₁₀(Dose)' } },
          y: { title: { display: true, text: metric } },
        },
        annotation: ed50x != null ? {
          annotations: {
            ed50: { type: 'line', xMin: ed50x, xMax: ed50x, borderColor: 'rgba(245,158,11,0.8)', borderWidth: 1.5, borderDash: [4,3], label: { content: 'ED50', enabled: true, position: 'start', font: { size: 10 } } },
            ed90: ed90x != null ? { type: 'line', xMin: ed90x, xMax: ed90x, borderColor: 'rgba(16,185,129,0.8)', borderWidth: 1.5, borderDash: [4,3], label: { content: 'ED90', enabled: true, position: 'start', font: { size: 10 } } } : undefined,
          },
        } : undefined,
      },
    });
    return () => { chartRef.current?.destroy(); chartRef.current = null; };
  }, [results, metric]);

  const handleDownload = useCallback(() => {
    if (canvasRef.current) downloadCanvas(canvasRef.current, `doseresp_${metric}.png`);
  }, [metric]);

  return (
    <div className="mb-4">
      <div className="relative" style={{ height: 260 }}>
        <canvas ref={canvasRef} />
      </div>
      {results?.r2 != null && (
        <p className="text-xs text-slate-500 mt-1">R² = {results.r2.toFixed(3)}{results.r2 < 0.7 ? ' ⚠ Poor fit' : ''}</p>
      )}
      <button onClick={handleDownload}
        className="mt-1 text-xs px-3 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200">
        Download PNG
      </button>
    </div>
  );
}

// ── Simplified box-plot approximation using floating bars ──────────────────
function BoxPlotChart({ results, metric }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }

    const groups = results?.groups ?? results?.means ?? {};
    const labels = Object.keys(groups);
    if (labels.length < 3) return;

    // Approximate quartiles from mean ± se when raw not available
    const q1   = labels.map(l => (groups[l]?.mean ?? 0) - (groups[l]?.se ?? 0) * 1.5);
    const q3   = labels.map(l => (groups[l]?.mean ?? 0) + (groups[l]?.se ?? 0) * 1.5);
    const mins = labels.map(l => (groups[l]?.mean ?? 0) - (groups[l]?.se ?? 0) * 2.5);
    const maxs = labels.map(l => (groups[l]?.mean ?? 0) + (groups[l]?.se ?? 0) * 2.5);

    chartRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'IQR (approx)', data: q1.map((v, i) => [v, q3[i]]), backgroundColor: 'rgba(99,102,241,0.5)', borderColor: 'rgba(99,102,241,1)', borderWidth: 1, borderSkipped: false },
          { label: 'Range (approx)', data: mins.map((v, i) => [v, maxs[i]]), backgroundColor: 'rgba(99,102,241,0.15)', borderColor: 'rgba(99,102,241,0.5)', borderWidth: 1, borderSkipped: false },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: true, position: 'top' }, tooltip: { mode: 'index' } },
        scales: {
          x: { title: { display: true, text: metric } },
          y: { ticks: { font: { size: 11 } } },
        },
      },
    });
    return () => { chartRef.current?.destroy(); chartRef.current = null; };
  }, [results, metric]);

  const handleDownload = useCallback(() => {
    if (canvasRef.current) downloadCanvas(canvasRef.current, `boxplot_${metric}.png`);
  }, [metric]);

  return (
    <div className="mb-4">
      <div className="relative" style={{ height: 260 }}>
        <canvas ref={canvasRef} />
      </div>
      <p className="text-xs text-slate-400 mt-1 italic">Distribution approximated from treatment SE (no raw per-plot data available)</p>
      <button onClick={handleDownload}
        className="mt-1 text-xs px-3 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200">
        Download PNG
      </button>
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────
const MEANS_TESTS = ['anova', 'tukey', 'duncan', 'snk', 'bonferroni', 'dunnett', 'kruskal', 'ancova', 'typeIII'];

export default function StatsChartPanel({ results, test, metric }) {
  if (!results || results.error) return null;

  const groups = results?.groups ?? results?.means ?? {};
  const groupCount = Object.keys(groups).length;

  if (groupCount < 2) {
    return (
      <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700 flex items-start gap-2">
        <span className="mt-0.5">ℹ</span>
        <span>Fewer than 2 treatment groups with sufficient data — chart not available.</span>
      </div>
    );
  }

  if (test === 'doseresp') {
    return (
      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Dose-Response Curve</p>
        <DoseRespChart results={results} metric={metric} />
      </div>
    );
  }

  if (MEANS_TESTS.includes(test)) {
    return (
      <div className="space-y-4">
        <div>
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Treatment Means (± SE)</p>
          <MeansBarChart results={results} metric={metric} />
        </div>
        {groupCount >= 3 && (
          <div>
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Distribution (approx.)</p>
            <BoxPlotChart results={results} metric={metric} />
          </div>
        )}
      </div>
    );
  }

  return null;
}
