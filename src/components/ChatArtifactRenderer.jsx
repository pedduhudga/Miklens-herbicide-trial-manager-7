import React, { useState, useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import { useNavigate } from 'react-router-dom';
import { Rocket, Sliders, TrendingUp, BarChart2, Download, FlaskConical, Check } from 'lucide-react';

/**
 * Renders an interactive Chart.js visualization directly inside a chat bubble.
 */
function InChatChartWidget({ data }) {
  const canvasRef = useRef(null);
  const chartInstance = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !data) return;

    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    const type = data.chartType || data.type || 'bar';
    const labels = data.labels || [];
    const datasets = (data.datasets || []).map((ds, idx) => ({
      label: ds.label || `Dataset ${idx + 1}`,
      data: ds.data || [],
      backgroundColor: ds.backgroundColor || (idx === 0 ? 'rgba(16, 185, 129, 0.7)' : 'rgba(99, 102, 241, 0.7)'),
      borderColor: ds.borderColor || (idx === 0 ? '#10b981' : '#6366f1'),
      borderWidth: 1.5,
      borderRadius: 6
    }));

    try {
      chartInstance.current = new Chart(canvasRef.current, {
        type,
        data: { labels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: datasets.length > 1,
              position: 'top',
              labels: { boxWidth: 12, font: { size: 10, weight: 'bold' } }
            },
            tooltip: {
              backgroundColor: 'rgba(15, 23, 42, 0.9)',
              padding: 8,
              cornerRadius: 8
            }
          },
          scales: type !== 'radar' ? {
            y: {
              beginAtZero: true,
              max: data.yMax || 100,
              ticks: { font: { size: 10 } },
              grid: { color: 'rgba(226, 232, 240, 0.6)' }
            },
            x: {
              ticks: { font: { size: 10, weight: '600' } },
              grid: { display: false }
            }
          } : undefined
        }
      });
    } catch (err) {
      console.warn('[InChatChartWidget] Failed to render chat chart:', err);
    }

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [data]);

  const handleDownload = () => {
    if (chartInstance.current) {
      const url = chartInstance.current.toBase64Image();
      const a = document.createElement('a');
      a.download = `${(data.title || 'ai_trial_chart').toLowerCase().replace(/\s+/g, '_')}.png`;
      a.href = url;
      a.click();
    }
  };

  return (
    <div className="my-3 p-3.5 bg-white rounded-2xl border border-slate-200/90 shadow-2xs hover:shadow-xs transition max-w-full overflow-hidden">
      <div className="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-slate-100">
        <div className="flex items-center gap-1.5 min-w-0">
          <BarChart2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <h5 className="font-extrabold text-slate-800 text-xs truncate">
            {data.title || 'Agronomic Performance Comparison'}
          </h5>
        </div>
        <button
          type="button"
          onClick={handleDownload}
          title="Download Chart Image"
          className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="h-52 w-full relative">
        <canvas ref={canvasRef} />
      </div>

      {data.caption && (
        <p className="text-[11px] text-slate-500 mt-2 italic text-center">
          {data.caption}
        </p>
      )}
    </div>
  );
}

/**
 * Interactive Dose-Response Simulator Widget with live dosage slider
 */
function InChatDoseResponseWidget({ data }) {
  const formula = data.formula || 'Herbicide Formula';
  const target = data.target || 'Target Weed';
  const ed50 = Number(data.ed50) || 15;
  const slope = Number(data.slope) || 2.2;
  const initialDose = Number(data.currentDosage) || ed50;
  const unit = data.unit || 'ml/L';

  const [currentDose, setCurrentDose] = useState(initialDose);

  // 4-Parameter Log-Logistic Sigmoid Model (0% base to 100% max)
  // Efficacy(x) = 100 / (1 + (x / ED50)^(-slope))
  const predictedEff = Math.min(
    Math.max(Math.round(100 / (1 + Math.pow(currentDose / ed50, -slope))), 0),
    100
  );

  return (
    <div className="my-3 p-4 bg-gradient-to-br from-slate-50 to-indigo-50/30 rounded-2xl border border-indigo-200/80 shadow-xs max-w-full text-xs">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-1.5">
          <TrendingUp className="w-4 h-4 text-indigo-600" />
          <h5 className="font-extrabold text-slate-800 text-xs">
            Interactive Dose-Response Simulator
          </h5>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded-full">
          ED50 = {ed50} {unit}
        </span>
      </div>

      <div className="flex items-center justify-between text-slate-600 mb-1">
        <span>Formula: <strong className="text-slate-900">{formula}</strong></span>
        <span>Target: <strong className="text-slate-900">{target}</strong></span>
      </div>

      {/* Slider Control */}
      <div className="my-3 space-y-1.5 bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
        <div className="flex justify-between items-center text-xs">
          <span className="text-slate-500 font-semibold flex items-center gap-1">
            <Sliders className="w-3 h-3 text-slate-400" /> Test Dosage Rate:
          </span>
          <span className="font-mono font-extrabold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 text-xs">
            {currentDose} {unit}
          </span>
        </div>

        <input
          type="range"
          min={Math.max(Math.round(ed50 * 0.2), 1)}
          max={Math.round(ed50 * 3)}
          step={1}
          value={currentDose}
          onChange={(e) => setCurrentDose(Number(e.target.value))}
          className="w-full accent-indigo-600 cursor-pointer"
        />

        <div className="flex justify-between text-[10px] text-slate-400 font-mono">
          <span>Low Rate ({Math.max(Math.round(ed50 * 0.2), 1)} {unit})</span>
          <span>Target ED50 ({ed50} {unit})</span>
          <span>Heavy Rate ({Math.round(ed50 * 3)} {unit})</span>
        </div>
      </div>

      {/* Dynamic Efficacy Outcome */}
      <div className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-slate-200/80">
        <div>
          <div className="text-[10px] uppercase font-bold text-slate-400">Predicted Weed Kill %</div>
          <div className="text-base font-black text-slate-900 flex items-center gap-1.5">
            <span className={predictedEff >= 90 ? 'text-emerald-600' : predictedEff >= 70 ? 'text-teal-600' : 'text-amber-600'}>
              {predictedEff}% Control
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
              {predictedEff >= 90 ? 'Top Knockdown' : predictedEff >= 70 ? 'Field Standard' : 'Sub-lethal / Risk'}
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-slate-400">Biological Response</div>
          <div className="text-xs font-bold text-indigo-700">
            {predictedEff >= 90 ? 'Complete Desiccation' : predictedEff >= 70 ? 'Effective Suppression' : 'Regrowth Probable'}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 1-Click Launch New Trial Action Card inside AI Chat
 */
function InChatLaunchTrialWidget({ data }) {
  const navigate = useNavigate();
  const formula = data.formula || data.formulation || 'Candidate Formula';
  const dosage = data.dosage || data.rate || 'Standard Rate';
  const target = data.target || 'Target Weed';
  const notes = data.notes || 'Recommended by AI Agronomic Engine';

  const handleLaunch = () => {
    navigate('/trials', {
      state: {
        newTrialWithFormulation: {
          name: formula,
          dosage,
          targetWeed: target,
          notes
        }
      }
    });
  };

  return (
    <div className="my-3 p-4 bg-gradient-to-r from-emerald-50 via-teal-50/40 to-slate-50 rounded-2xl border border-emerald-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-600 text-white rounded-full uppercase tracking-wider">
            Ready to Field Test
          </span>
          <span className="font-bold text-slate-800 text-xs">AI Suggested Field Trial</span>
        </div>
        <div className="text-xs text-slate-700 font-semibold">
          {formula} <span className="text-emerald-800 font-mono">@{dosage}</span> on <strong>{target}</strong>
        </div>
        {notes && (
          <p className="text-[11px] text-slate-500 italic max-w-md">
            "{notes}"
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={handleLaunch}
        className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md shadow-emerald-600/20 active:scale-95 transition flex items-center gap-1.5 shrink-0"
      >
        <Rocket className="w-4 h-4" />
        <span>Launch Trial</span>
      </button>
    </div>
  );
}

/**
 * Interactive New Formula Feasibility & Weed Spectrum Predictor Widget
 */
function InChatFeasibilityWidget({ data }) {
  const navigate = useNavigate();
  const formulaName = data.formulaName || data.name || 'Candidate Formulation';
  const predictedAvg = Number(data.predictedEfficacyAvg || data.efficacy || 85);
  const predictedMin = Number(data.predictedEfficacyMin || Math.max(30, predictedAvg - 6));
  const predictedMax = Number(data.predictedEfficacyMax || Math.min(99, predictedAvg + 5));
  const confidence = data.confidence || 'Moderate';
  const rating = data.overallRating || (predictedAvg >= 88 ? 'Superior Efficacy Expected' : predictedAvg >= 75 ? 'Standard Commercial Efficacy' : 'Sub-lethal / High Risk');
  const isDuplicate = !!data.isDuplicate;
  const duplicateName = data.duplicateOf || '';
  const duplicateId = data.duplicateId || '';
  
  const susceptible = Array.isArray(data.susceptibleWeeds) ? data.susceptibleWeeds : [];
  const moderate = Array.isArray(data.moderateWeeds) ? data.moderateWeeds : [];
  const tolerant = Array.isArray(data.tolerantWeeds) ? data.tolerantWeeds : [];

  const handleLaunchTrial = () => {
    navigate('/trials', {
      state: {
        newTrialWithFormulation: {
          name: formulaName,
          dosage: data.dosage || 'Standard Rate',
          targetWeed: susceptible[0] ? susceptible[0].split('(')[0].trim() : 'Bermuda Grass',
          notes: `Predicted Efficacy: ${predictedMin}–${predictedMax}% (${rating}). Grounded by AI Feasibility Engine.`
        }
      }
    });
  };

  return (
    <div className="my-3 p-4 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl border border-indigo-500/30 shadow-xl max-w-full text-xs">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-3 pb-2.5 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-400">
            <FlaskConical className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">
              AI Efficacy & Weed Spectrum Prediction
            </span>
            <h4 className="font-extrabold text-sm text-white flex items-center gap-2">
              {formulaName}
            </h4>
          </div>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-indigo-200 border border-white/10">
          Confidence: {confidence}
        </span>
      </div>

      {/* Duplicate Warning Badge if recipe exists */}
      {isDuplicate && (
        <div className="mb-3 p-2.5 bg-amber-500/20 border border-amber-400/40 rounded-xl text-amber-200 flex items-start gap-2">
          <span className="text-base leading-none">⚠️</span>
          <div className="text-[11px] leading-tight">
            <strong className="text-amber-100">Duplicate Formula Detected:</strong> This exact recipe matches existing formula{' '}
            <button
              type="button"
              onClick={() => navigate(`/formulations?focus=${encodeURIComponent(duplicateId || duplicateName)}`)}
              className="font-bold underline text-amber-300 hover:text-white"
            >
              "{duplicateName}"
            </button>. Avoid redundant field plots!
          </div>
        </div>
      )}

      {/* Efficacy Gauge Strip */}
      <div className="p-3 bg-white/5 rounded-xl border border-white/10 mb-3 space-y-2">
        <div className="flex justify-between items-end">
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase">Predicted Weed Kill Rate</span>
            <div className="text-2xl font-black tracking-tight text-white flex items-baseline gap-1.5">
              <span className={predictedAvg >= 88 ? 'text-emerald-400' : predictedAvg >= 75 ? 'text-teal-300' : 'text-amber-400'}>
                {predictedMin}–{predictedMax}%
              </span>
              <span className="text-xs font-semibold text-slate-400">(Avg: {predictedAvg}%)</span>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-slate-400 block font-semibold">Agronomic Verdict</span>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
              predictedAvg >= 88 ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
              predictedAvg >= 75 ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30' :
              'bg-amber-500/20 text-amber-300 border border-amber-500/30'
            }`}>
              {rating}
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              predictedAvg >= 88 ? 'bg-gradient-to-r from-teal-400 to-emerald-400' :
              predictedAvg >= 75 ? 'bg-gradient-to-r from-cyan-400 to-teal-400' :
              'bg-gradient-to-r from-amber-500 to-rose-400'
            }`}
            style={{ width: `${Math.min(100, Math.max(5, predictedAvg))}%` }}
          />
        </div>
      </div>

      {/* Weed Sensitivity Spectrum */}
      <div className="space-y-2 mb-3">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
          Target Weed Spectrum Breakdown
        </span>

        {/* Susceptible (High Control >85%) */}
        {susceptible.length > 0 && (
          <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-xl p-2.5">
            <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-[11px] mb-1">
              <span>🟢 High Knockdown / Susceptible (85–100% Control):</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {susceptible.map((w, i) => (
                <span key={i} className="text-[10px] bg-emerald-900/60 text-emerald-200 border border-emerald-700/50 px-2 py-0.5 rounded-md font-medium">
                  {w}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Moderate / Suppression */}
        {moderate.length > 0 && (
          <div className="bg-amber-950/30 border border-amber-500/30 rounded-xl p-2.5">
            <div className="flex items-center gap-1.5 text-amber-400 font-bold text-[11px] mb-1">
              <span>🟡 Moderate / Suppression (60–84% Control):</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {moderate.map((w, i) => (
                <span key={i} className="text-[10px] bg-amber-900/50 text-amber-200 border border-amber-700/40 px-2 py-0.5 rounded-md font-medium">
                  {w}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Tolerant / Requires Partner */}
        {tolerant.length > 0 && (
          <div className="bg-rose-950/30 border border-rose-500/30 rounded-xl p-2.5">
            <div className="flex items-center gap-1.5 text-rose-400 font-bold text-[11px] mb-1">
              <span>🔴 Tolerant / Resistant (Requires Tank-Mix Partner):</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {tolerant.map((w, i) => (
                <span key={i} className="text-[10px] bg-rose-900/40 text-rose-200 border border-rose-700/40 px-2 py-0.5 rounded-md font-medium">
                  {w}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Action Footer */}
      <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-3">
        <span className="text-[10px] text-slate-400 italic">
          {data.groundingTrialsCount ? `Grounded in ${data.groundingTrialsCount} historical plot trials` : 'Calculated via Colby synergy & HRAC mode-of-action models'}
        </span>
        <button
          type="button"
          onClick={handleLaunchTrial}
          className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-slate-950 font-extrabold rounded-lg shadow transition flex items-center gap-1.5 shrink-0"
        >
          <Rocket className="w-3.5 h-3.5" />
          <span>Launch Field Plot</span>
        </button>
      </div>
    </div>
  );
}

/**
 * Main Artifact Dispatcher: Parses and renders specialized interactive in-chat widgets
 */
export default function ChatArtifactRenderer({ artifactType, data }) {
  if (!artifactType || !data) return null;

  switch (artifactType.toLowerCase()) {
    case 'chart':
      return <InChatChartWidget data={data} />;
    case 'doseresponse':
    case 'dose_response':
      return <InChatDoseResponseWidget data={data} />;
    case 'launch_trial':
    case 'launchtrial':
      return <InChatLaunchTrialWidget data={data} />;
    case 'feasibility':
    case 'formula_feasibility':
      return <InChatFeasibilityWidget data={data} />;
    default:
      return null;
  }
}

