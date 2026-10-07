import { useState, useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import { useNavigate } from 'react-router-dom';
import { 
  Rocket, Sliders, TrendingUp, BarChart2, Download, FlaskConical, Check, 
  Activity, AlertTriangle, CloudSun, Stethoscope, Mic, CheckCircle2, 
  ShieldAlert, Sparkles, ArrowRight, Thermometer, Wind, Droplets
} from 'lucide-react';

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
  const costPerLiter = data.costPerLiter || null;
  
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
              AI Colby Synergy & Spectrum Prediction
            </span>
            <h4 className="font-extrabold text-sm text-white flex items-center gap-2">
              {formulaName}
              {costPerLiter && (
                <span className="text-[11px] font-mono font-bold px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 rounded-md">
                  Cost: {costPerLiter}
                </span>
              )}
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

      {/* Antagonism Warning Badge */}
      {data.hasAntagonism && (
        <div className="mb-3 p-2.5 bg-rose-500/20 border border-rose-400/40 rounded-xl text-rose-200 flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="text-[11px] leading-tight">
            <strong className="text-rose-100">Biochemical Antagonism Alert: </strong>
            {data.antagonismReason || 'Components may inhibit mutual absorption.'}
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

        {/* Susceptible */}
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

        {/* Moderate */}
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

        {/* Tolerant */}
        {tolerant.length > 0 && (
          <div className="bg-rose-950/30 border border-rose-500/30 rounded-xl p-2.5">
            <div className="flex items-center gap-1.5 text-rose-400 font-bold text-[11px] mb-1">
              <span>🔴 Tolerant / Resistant (Requires Partner):</span>
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
 * Superpower Widget 1: Interactive ANOVA Statistical Analysis Card
 */
function InChatAnovaWidget({ data }) {
  const treatments = Array.isArray(data.treatments) ? data.treatments : [];
  const isSignificant = !!data.isSignificant;

  return (
    <div className="my-3 p-4 bg-white rounded-2xl border border-indigo-200/90 shadow-xs text-xs not-prose max-w-full">
      <div className="flex items-center justify-between gap-2 pb-2.5 mb-3 border-b border-indigo-100">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider block">
              Statistical Biometrics Engine
            </span>
            <h4 className="font-extrabold text-sm text-slate-900">
              One-Way ANOVA: {data.target || 'Efficacy Comparison'}
            </h4>
          </div>
        </div>
        <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full border ${
          isSignificant 
            ? 'bg-emerald-50 text-emerald-800 border-emerald-300' 
            : 'bg-amber-50 text-amber-800 border-amber-300'
        }`}>
          {isSignificant ? 'p < 0.05 (Significant Difference)' : 'p ≥ 0.05 (No Significant Diff)'}
        </span>
      </div>

      {/* Key Metric Strip */}
      <div className="grid grid-cols-3 gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-200/80 mb-3 text-center">
        <div>
          <span className="text-[10px] font-bold text-slate-400 block uppercase">F-Statistic</span>
          <span className="text-base font-black text-slate-800 font-mono">{data.fStatistic || '—'}</span>
        </div>
        <div>
          <span className="text-[10px] font-bold text-slate-400 block uppercase">P-Value</span>
          <span className={`text-base font-black font-mono ${isSignificant ? 'text-emerald-700' : 'text-slate-800'}`}>
            {data.pValue || '—'}
          </span>
        </div>
        <div>
          <span className="text-[10px] font-bold text-slate-400 block uppercase">Grand Mean</span>
          <span className="text-base font-black text-indigo-700 font-mono">{data.grandMean}%</span>
        </div>
      </div>

      {/* Treatment Ranking Bar List */}
      {treatments.length > 0 && (
        <div className="space-y-2 mb-3">
          <div className="text-[11px] font-bold text-slate-600 flex justify-between">
            <span>Treatment Means ({treatments.length} Formulations)</span>
            <span>Mean Control %</span>
          </div>
          <div className="space-y-1.5">
            {treatments.map((t, idx) => (
              <div key={idx} className="p-2 bg-white rounded-lg border border-slate-200/80 shadow-2xs">
                <div className="flex justify-between items-center text-xs mb-1">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-full bg-slate-100 text-slate-600 font-mono text-[10px] flex items-center justify-center font-bold">
                      {idx + 1}
                    </span>
                    {t.name}
                  </span>
                  <span className="font-mono font-extrabold text-slate-900 bg-slate-100 px-2 py-0.5 rounded text-xs">
                    {t.mean}%
                  </span>
                </div>
                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      idx === 0 ? 'bg-emerald-500' : idx === 1 ? 'bg-teal-500' : 'bg-slate-400'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, t.mean))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="text-[10px] text-slate-400 italic text-right">
        Computed across {data.trialCount || 0} plot trials via statsUtils.js ANOVA engine.
      </div>
    </div>
  );
}

/**
 * Superpower Widget 2: Interactive Spray Weather Window Heatmap Card
 */
function InChatSprayWindowWidget({ data }) {
  const topWindows = Array.isArray(data.topWindows) ? data.topWindows : [];
  const best = data.bestWindow || null;

  return (
    <div className="my-3 p-4 bg-gradient-to-br from-sky-50 to-emerald-50/40 rounded-2xl border border-sky-200/80 shadow-xs text-xs not-prose max-w-full">
      <div className="flex items-center justify-between gap-2 pb-2.5 mb-3 border-b border-sky-100">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-700">
            <CloudSun className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-sky-800 uppercase tracking-wider block">
              Biometeorology & Spray Window Advisor
            </span>
            <h4 className="font-extrabold text-sm text-slate-900">
              {data.location || 'Field Spray Readiness'}
            </h4>
          </div>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800">
          Live Open-Meteo
        </span>
      </div>

      {/* Best Window Highlight Strip */}
      {best && (
        <div className="p-3 bg-white rounded-xl border border-emerald-300 shadow-2xs mb-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div>
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-emerald-600 text-white rounded-full">
                Optimal Window: {best.hour}
              </span>
              <span className="text-xs font-bold text-emerald-800">Score {best.score}/100</span>
            </div>
            <div className="text-[11px] text-slate-600">
              Optimal droplet kinetics with minimal drift and rapid cuticular absorption.
            </div>
          </div>
          <div className="flex items-center gap-3 text-[11px] font-mono text-slate-700 shrink-0">
            <span className="flex items-center gap-1" title="Delta-T">
              <Droplets className="w-3.5 h-3.5 text-sky-600" /> ΔT {best.deltaT}
            </span>
            <span className="flex items-center gap-1" title="Temperature">
              <Thermometer className="w-3.5 h-3.5 text-amber-600" /> {best.temp}
            </span>
            <span className="flex items-center gap-1" title="Windspeed">
              <Wind className="w-3.5 h-3.5 text-teal-600" /> {best.wind}
            </span>
          </div>
        </div>
      )}

      {/* Hourly Strip */}
      {topWindows.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
            Upcoming Viable Application Hours
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {topWindows.slice(0, 3).map((w, i) => (
              <div key={i} className="p-2 bg-white/90 rounded-xl border border-sky-100 shadow-2xs flex flex-col justify-between">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-extrabold text-slate-800 text-xs">{w.hour}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                    w.score >= 80 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {w.score} pts
                  </span>
                </div>
                <div className="text-[10px] text-slate-600 flex justify-between font-mono">
                  <span>ΔT: {w.deltaT}</span>
                  <span>{w.wind}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Superpower Widget 3: Proactive "Trial Doctor" Diagnostic Audit Card
 */
function InChatTrialDoctorWidget({ data, onPromptClick }) {
  const issues = Array.isArray(data.issues) ? data.issues : [];
  const healthScore = Number(data.healthScore || 85);

  return (
    <div className="my-3 p-4 bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950 text-white rounded-2xl border border-indigo-500/30 shadow-xl text-xs not-prose max-w-full">
      <div className="flex items-center justify-between gap-2 pb-2.5 mb-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-rose-500/20 border border-rose-400/30 flex items-center justify-center text-rose-400">
            <Stethoscope className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider block">
              Autonomous Agronomic Auditor
            </span>
            <h4 className="font-extrabold text-sm text-white">
              Trial Doctor Diagnostic Audit
            </h4>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-300">Health Score:</span>
          <span className={`text-sm font-black px-2 py-0.5 rounded-lg font-mono ${
            healthScore >= 80 ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
            healthScore >= 60 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
            'bg-rose-500/20 text-rose-300 border border-rose-500/30'
          }`}>
            {healthScore}/100
          </span>
        </div>
      </div>

      {/* Summary Counters */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="p-2 bg-rose-950/40 border border-rose-500/30 rounded-xl text-center">
          <span className="text-[10px] text-rose-300 block font-bold uppercase">Critical Discrepancies</span>
          <span className="text-lg font-black text-rose-200 font-mono">{data.criticalCount || 0}</span>
        </div>
        <div className="p-2 bg-amber-950/40 border border-amber-500/30 rounded-xl text-center">
          <span className="text-[10px] text-amber-300 block font-bold uppercase">Warnings</span>
          <span className="text-lg font-black text-amber-200 font-mono">{data.warningCount || 0}</span>
        </div>
        <div className="p-2 bg-sky-950/40 border border-sky-500/30 rounded-xl text-center">
          <span className="text-[10px] text-sky-300 block font-bold uppercase">Weather Insights</span>
          <span className="text-lg font-black text-sky-200 font-mono">{data.insightCount || 0}</span>
        </div>
      </div>

      {/* Discovered Issues */}
      {issues.length > 0 && (
        <div className="space-y-2">
          {issues.map((iss, i) => (
            <div key={i} className="p-3 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition">
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex items-center gap-1.5 font-bold text-xs">
                  {iss.severity === 'critical' ? (
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  ) : iss.severity === 'warning' ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  )}
                  <span className={
                    iss.severity === 'critical' ? 'text-rose-300' :
                    iss.severity === 'warning' ? 'text-amber-300' : 'text-sky-300'
                  }>
                    {iss.title}
                  </span>
                </div>
                <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-white/10 text-slate-400 shrink-0">
                  {iss.severity}
                </span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed mb-2">
                {iss.description}
              </p>
              {iss.actionPrompt && onPromptClick && (
                <button
                  type="button"
                  onClick={() => onPromptClick(iss.actionPrompt)}
                  className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition"
                >
                  <span>Resolve with AI</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Superpower Widget 4: Hands-Free Voice Field Scout Observation Confirmation Card
 */
function InChatVoiceScoutWidget({ data, onSaveObservation }) {
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    if (onSaveObservation) {
      onSaveObservation(data);
    }
  };

  return (
    <div className="my-3 p-4 bg-gradient-to-br from-emerald-50 to-teal-50/40 rounded-2xl border border-emerald-300 shadow-xs text-xs not-prose max-w-full">
      <div className="flex items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-emerald-200/80">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
            <Mic className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">
              Field Walk Voice Scout
            </span>
            <h4 className="font-extrabold text-sm text-slate-900">
              Observation Logged for {data.plot || 'Plot'}
            </h4>
          </div>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
          DAA {data.daa ?? 7}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-2.5">
        <div className="p-2 bg-white rounded-lg border border-emerald-100">
          <span className="text-[10px] font-bold text-slate-400 block">Formulation</span>
          <span className="font-bold text-slate-800">{data.formulation || 'Candidate Formula'}</span>
        </div>
        <div className="p-2 bg-white rounded-lg border border-emerald-100">
          <span className="text-[10px] font-bold text-slate-400 block">Efficacy / Control</span>
          <span className="font-black text-emerald-700 font-mono text-sm">{data.efficacy}%</span>
        </div>
      </div>

      {data.notes && (
        <div className="p-2.5 bg-white/80 rounded-lg border border-emerald-100 text-slate-700 mb-3 text-[11px] italic">
          "{data.notes}"
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-slate-500 italic">
          Audible confirmation delivered via Web Speech.
        </span>
        <button
          type="button"
          onClick={handleSave}
          disabled={saved}
          className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition shadow-sm ${
            saved
              ? 'bg-emerald-700 text-white cursor-default'
              : 'bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95'
          }`}
        >
          {saved ? (
            <>
              <Check className="w-3.5 h-3.5" />
              <span>Saved to Plot</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Confirm & Save</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

/**
 * Main Artifact Dispatcher: Parses and renders specialized interactive in-chat widgets
 */
export default function ChatArtifactRenderer({ artifactType, data, onPromptClick, onSaveObservation }) {
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
    case 'anova':
      return <InChatAnovaWidget data={data} />;
    case 'spray_window':
      return <InChatSprayWindowWidget data={data} />;
    case 'trial_doctor':
      return <InChatTrialDoctorWidget data={data} onPromptClick={onPromptClick} />;
    case 'voice_scout':
      return <InChatVoiceScoutWidget data={data} onSaveObservation={onSaveObservation} />;
    default:
      return null;
  }
}
