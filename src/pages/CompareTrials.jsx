import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useAppState } from '../hooks/useAppState.jsx';
import TopBar from '../components/TopBar.jsx';
import { safeJsonParse } from '../utils/helpers.js';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Loader2, Activity, ArrowLeft, CheckCircle, X, Download, FileText, Table, LineChart, Cpu, DollarSign, Cloud, Compass } from 'lucide-react';
import { exportComparisonCsv, exportComparisonHtml, exportComparisonPdf } from '../services/compareReports.js';
import { generateTextWithAI } from '../services/multiProviderAI.js';
import { useAuth } from '../hooks/useAuth.js';
import { getCategoryConfig, getPrimaryObservationField } from '../utils/categoryConfig.js';
import { updateTrial } from '../services/dataLayer.js';

const RESULT_BADGE = {
  Excellent: 'bg-emerald-100 text-emerald-700',
  Good: 'bg-blue-100 text-blue-700',
  Fair: 'bg-amber-100 text-amber-700',
  Poor: 'bg-red-100 text-red-700',
};

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316'];

export default function CompareTrials({ onMenuClick }) {
  const { state, updateState, getAppState } = useAppState();
  const { isViewer, user } = useAuth();
  const navigate = useNavigate();
  const [aiSummary, setAiSummary] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const canvasRef = useRef(null);

  const activeCategory = state.activeCategory || 'herbicide';
  const config = getCategoryConfig(activeCategory);
  const primaryObsField = getPrimaryObservationField(activeCategory);

  const selectedTrials = state.selectedTrials || [];
  const formulations = state.formulations || [];
  const ingredientsList = state.ingredients || [];

  // Automatically fetch missing weather parameters dynamically when mounting
  useEffect(() => {
    if (isViewer) return;
    selectedTrials.forEach(async (t) => {
      const weatherData = safeJsonParse(t.WeatherJSON, null);
      const hasAvgWeather = t.Temperature || t.Humidity || t.Windspeed || t.Rain || (weatherData && Object.keys(weatherData).length > 0);
      if (!hasAvgWeather && t.Lat && t.Lon && t.Date) {
        try {
          const formattedDate = new Date(t.Date).toISOString().split('T')[0];
          const wUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${t.Lat}&longitude=${t.Lon}&start_date=${formattedDate}&end_date=${formattedDate}&daily=temperature_2m_max,relative_humidity_2m_mean,wind_speed_10m_max,rain_sum&timezone=auto`;
          const wr = await fetch(wUrl);
          const wd = await wr.json();
          if (wd && wd.daily && wd.daily.time && wd.daily.time.length > 0) {
            const wObj = {
              temp: wd.daily.temperature_2m_max[0],
              humidity: wd.daily.relative_humidity_2m_mean[0],
              wind: wd.daily.wind_speed_10m_max[0],
              rain: wd.daily.rain_sum[0],
              provider: 'Open-Meteo'
            };
            const updated = { 
              ...t, 
              Temperature: wObj.temp,
              Humidity: wObj.humidity,
              Windspeed: wObj.wind,
              Rain: wObj.rain,
              WeatherJSON: JSON.stringify(wObj) 
            };
            // Sync to global app state to re-trigger calculations
            updateState({ trials: (state.trials || []).map(trial => trial.ID === t.ID ? updated : trial) });
            // Save to server
            await updateTrial({ 
              ID: updated.ID, 
              Temperature: updated.Temperature,
              Humidity: updated.Humidity,
              Windspeed: updated.Windspeed,
              Rain: updated.Rain,
              WeatherJSON: updated.WeatherJSON 
            }, getAppState);
          }
        } catch (e) {
          console.error("Failed auto-weather fetch for trial compare", t.ID, e);
        }
      }
    });
  }, [selectedTrials, state.trials, updateState, getAppState]);

  const removeFromComparison = (id) => {
    updateState({ selectedTrials: selectedTrials.filter(t => t.ID !== id) });
  };

  // Build per-trial efficacy series and calculate parameters
  const trialSeries = useMemo(() => selectedTrials.map(t => {
    const eff = safeJsonParse(t.EfficacyDataJSON, []).sort((a, b) => (a.daa ?? 0) - (b.daa ?? 0));
    const baselineValue = eff.length > 0 ? (Number(eff[0][primaryObsField]) || 0) : null;
    
    // Find Formulation details
    const form = formulations.find(f => f.ID === t.FormulationID) || {};
    
    // Find ingredients
    const activeIngs = [];
    if (form.IngredientsJSON) {
      const ingMap = safeJsonParse(form.IngredientsJSON, {});
      Object.entries(ingMap).forEach(([ingId, conc]) => {
        const found = ingredientsList.find(ing => ing.ID === ingId);
        if (found) {
          activeIngs.push(`${found.Name} (${conc}%)`);
        }
      });
    }

    // Cost calculations
    let costPerHa = '—';
    if (form.EstimatedCost && t.Dosage) {
      const costNum = Number(form.EstimatedCost);
      const doseNum = parseFloat(t.Dosage);
      if (!isNaN(costNum) && !isNaN(doseNum)) {
        costPerHa = `₹${((costNum / 1000) * doseNum).toFixed(2)}`;
      }
    }

    // Average Weather
    const weatherData = safeJsonParse(t.WeatherJSON, null);
    const avgTemp = weatherData?.temp ?? t.Temperature ?? '—';
    const avgHumid = weatherData?.humidity ?? t.Humidity ?? '—';
    const avgWind = weatherData?.windspeed ?? t.Windspeed ?? '—';
    const avgRain = weatherData?.rain ?? t.Rain ?? '—';

    // Soil Data
    const soil = safeJsonParse(t.SoilDataJSON, null) || {};
    const pH = t.SoilPH || soil.ph || '—';
    const clay = t.SoilClay || soil.clay || '—';
    const sand = t.SoilSand || soil.sand || '—';
    const oc = t.SoilOC || soil.organicCarbon || '—';
    const texture = t.SoilTexture || soil.texture || '—';

    // Final Metric calculations (either controlPct, or reduction/improvement from baseline)
    let finalEfficacy = null;
    if (eff.length > 0) {
      const lastObs = eff[eff.length - 1];
      if (lastObs.controlPct !== undefined && lastObs.controlPct !== null) {
        finalEfficacy = Number(lastObs.controlPct);
      } else if (baselineValue > 0) {
        const lastVal = Number(lastObs[primaryObsField]);
        if (activeCategory === 'nutrition' || activeCategory === 'biostimulant') {
          // Improvement: ((lastVal - baselineValue) / baselineValue) * 100
          finalEfficacy = Math.round(((lastVal - baselineValue) / baselineValue) * 100);
        } else {
          // Reduction: ((baselineValue - lastVal) / baselineValue) * 100
          finalEfficacy = Math.round(((baselineValue - lastVal) / baselineValue) * 100);
        }
      }
    }

    return {
      trial: {
        ...t,
        activeIngredients: activeIngs.length > 0 ? activeIngs.join(', ') : '—',
        costPerHa,
        avgTemp: avgTemp !== '—' ? `${avgTemp}°C` : '—',
        avgHumid: avgHumid !== '—' ? `${avgHumid}%` : '—',
        avgWind: avgWind !== '—' ? `${avgWind} km/h` : '—',
        avgRain: avgRain !== '—' ? `${avgRain} mm` : '—',
        pH,
        clay: clay !== '—' ? `${clay}%` : '—',
        sand: sand !== '—' ? `${sand}%` : '—',
        oc: oc !== '—' ? `${oc}%` : '—',
        texture
      },
      eff,
      baselineCover: baselineValue,
      finalWce: finalEfficacy,
    };
  }), [selectedTrials, formulations, ingredientsList, primaryObsField, activeCategory]);

  // Collect all unique DAA points across all trials
  const allDaa = useMemo(() => {
    const set = new Set();
    trialSeries.forEach(({ eff }) => eff.forEach(o => set.add(Number(o.daa ?? 0))));
    return [...set].sort((a, b) => a - b);
  }, [trialSeries]);

  // Redraw Canvas Multi-line Chart
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || allDaa.length === 0) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const PAD = { top: 30, right: 30, bottom: 40, left: 50 };

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    const minDaa = Math.min(...allDaa);
    const maxDaa = Math.max(...allDaa);
    const daaRange = maxDaa - minDaa || 1;

    const xScale = d => PAD.left + ((d - minDaa) / daaRange) * (W - PAD.left - PAD.right);
    const yScale = pct => PAD.top + (1 - pct / 100) * (H - PAD.top - PAD.bottom);

    // Draw Grid Lines
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 1;
    [0, 20, 40, 60, 80, 100].forEach(y => {
      const py = yScale(y);
      ctx.beginPath();
      ctx.moveTo(PAD.left, py);
      ctx.lineTo(W - PAD.right, py);
      ctx.stroke();

      ctx.fillStyle = '#64748b';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`${y}%`, PAD.left - 8, py + 3);
    });

    // Draw DAA vertical grid lines
    allDaa.forEach(d => {
      const px = xScale(d);
      ctx.beginPath();
      ctx.moveTo(px, PAD.top);
      ctx.lineTo(px, H - PAD.bottom);
      ctx.stroke();

      ctx.fillStyle = '#64748b';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`DAA ${d}`, px, H - PAD.bottom + 14);
    });

    // Axis Lines
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(PAD.left, PAD.top);
    ctx.lineTo(PAD.left, H - PAD.bottom);
    ctx.lineTo(W - PAD.right, H - PAD.bottom);
    ctx.stroke();

    // Draw Lines for Each Trial Series
    trialSeries.forEach((series, i) => {
      if (series.eff.length === 0) return;
      const color = COLORS[i % COLORS.length];
      
      const getPoints = () => {
        return series.eff.map(pt => {
          let val = 0;
          if (pt.controlPct !== undefined && pt.controlPct !== null) {
            val = Number(pt.controlPct);
          } else if (series.baselineCover > 0) {
            const currentVal = Number(pt[primaryObsField]);
            if (activeCategory === 'nutrition' || activeCategory === 'biostimulant') {
              val = Math.round(((currentVal - series.baselineCover) / series.baselineCover) * 100);
            } else {
              val = Math.round(((series.baselineCover - currentVal) / series.baselineCover) * 100);
            }
          }
          return { daa: Number(pt.daa ?? 0), val };
        });
      };

      const pts = getPoints();
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      pts.forEach((pt, idx) => {
        const px = xScale(pt.daa);
        const py = yScale(pt.val);
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();

      // Draw point markers
      pts.forEach(pt => {
        const px = xScale(pt.daa);
        const py = yScale(pt.val);
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, 2 * Math.PI);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.stroke();
      });
    });
  }, [trialSeries, allDaa, primaryObsField, activeCategory]);

  const handleGenerateSummary = async () => {
    if (isViewer) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Viewer role cannot generate AI reports.', type: 'error' } }));
      return;
    }
    if (selectedTrials.length < 2) return;
    setIsGenerating(true);
    setAiSummary(null);

    // Gather comprehensive metrics for the AI
    const trialPerformances = trialSeries.map(({ trial, finalWce, eff, baselineCover }) => {
      // Species/Target efficacy breakdown
      const targetMetrics = {};
      eff.forEach(obs => {
        const daa = obs.daa ?? 0;
        const details = obs.weedDetails || []; // specific to weed/species details
        
        if (details.length > 0) {
          details.forEach(w => {
            if (w.species) {
              if (!targetMetrics[w.species]) targetMetrics[w.species] = [];
              targetMetrics[w.species].push({ daa, cover: w.cover });
            }
          });
        }
      });

      const targetBreakdown = Object.entries(targetMetrics).map(([spName, points]) => {
        const sortedPts = points.sort((a, b) => a.daa - b.daa);
        const start = sortedPts[0]?.cover ?? 0;
        const end = sortedPts[sortedPts.length - 1]?.cover ?? 0;
        let calcVal = 0;
        if (start > 0) {
          if (activeCategory === 'nutrition' || activeCategory === 'biostimulant') {
            calcVal = Math.round(((end - start) / start) * 100);
          } else {
            calcVal = Math.round(((start - end) / start) * 100);
          }
        }
        const unit = config.primaryMetric.unit || '%';
        return `${spName}: initial ${start}${unit}, final ${end}${unit}, Efficacy ${calcVal}%`;
      }).join('; ') || 'No specific target breakdowns recorded';

      const maxObsDaa = eff.length > 0 ? Math.max(...eff.map(o => Number(o.daa ?? 0))) : 0;
      const duration = trial.FinalControlDuration 
        ? `${trial.FinalControlDuration} days (finalized)` 
        : `${maxObsDaa} days (active)`;

      return {
        name: trial.FormulationName,
        primaryVal: finalWce ?? 0,
        ingredients: trial.activeIngredients,
        dosage: trial.Dosage,
        duration,
        targetBreakdown,
        soil: `pH=${trial.pH}, Clay=${trial.clay}, Texture=${trial.texture}`,
        weather: `Temp=${trial.avgTemp}, Humid=${trial.avgHumid}, Rain=${trial.avgRain}`
      };
    });

    const contextData = trialPerformances.map(p =>
      `Formulation: ${p.name}
Active Ingredients: ${p.ingredients}
Dosage: ${p.dosage}
Control Duration: ${p.duration}
Final Overall ${config.primaryMetric.label}: ${p.primaryVal}%
Target Breakdowns: ${p.targetBreakdown}
Soil Profile: ${p.soil}
Weather Profile: ${p.weather}`
    ).join('\n\n');

    const prompt = `You are a professional senior agronomist and trial specialist. Conduct a thorough, scientifically rigorous comparison report of the following ${config.name} trials. Identify which formulation performed best, detail control/growth durations, and specific outcomes.

Provide your analysis in 3 distinct sections using clean Markdown styling (no raw text diagrams or code blocks):

### 1. Executive Summary
- State clearly which formulation performed best overall based on the comparative metrics, final ${config.primaryMetric.key} %, and duration of control/performance.
- Outline the key differences in durations and overall outcomes between the tested treatments.

### 2. Timeline & Efficacy/Growth Analysis
- Compare the progression of ${config.primaryMetric.label} chronologically over the observed Days After Application (DAA) intervals.
- Detail the performance on specific targets (which formulation worked best on which particular target, with initial and final values).
- Contrast the uptake profiles, physiological response curves, and control/growth levels observed.
- Do NOT draw text-based diagrams or flowcharts using dashes and arrows (like \\\`--->\\\` or ascii charts); use standard descriptive paragraphs.

### 3. Chemistry & Environmental Analysis
- Detail active ingredients, dosage rates, and physiological factors influencing absorption.
- Evaluate the influence of microclimatic conditions (Temperature, Relative Humidity, rainfall) and soil properties (pH, Clay %, Sand %, OC %, Texture).
- Present key environmental parameters in a clean Markdown table comparing formulations, temperature, relative humidity, and final ${config.primaryMetric.key}.

CRITICAL RULES & CONSTRAINT COMPLIANCE:
- Never mention, reference, or evaluate financial costs, chemical prices, cost-benefit analysis, premium pricing, or any dollar ($) figures.
- Never write recommendations, future advice, dosing adjustments, or suggestions for future trials.
- Never use terms such as "systemic failure", "widespread failure", "anomaly", "underdosage", "flawed design", or imply that the trials were faulty. Focus entirely on explaining the physiological responses, environmental/meteorological parameters, and droplet dynamics in a standard agronomist assessment.

Use highly professional, academic, and scientific terminology. Here is the trial data:
${contextData}`;

    try {
      const text = await generateTextWithAI(prompt, 'You are an agricultural researcher writing official trial narrative reports.');
      setAiSummary(text || 'No response from AI.');
    } catch (e) {
      setAiSummary('Error contacting AI: ' + e.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const canDownload = !isViewer && user?.tabPermissions?.['Allow Downloads'] !== false;

  const handleExportCsv = () => {
    if (!canDownload) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Download permission is disabled for your account.', type: 'error' } }));
      return;
    }
    exportComparisonCsv(trialSeries, allDaa, activeCategory);
  };

  const handleExportHtml = () => {
    if (!canDownload) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Download permission is disabled for your account.', type: 'error' } }));
      return;
    }
    exportComparisonHtml(trialSeries, allDaa, aiSummary, activeCategory);
  };

  const handleExportPdf = () => {
    if (!canDownload) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Download permission is disabled for your account.', type: 'error' } }));
      return;
    }
    exportComparisonPdf(trialSeries, allDaa, aiSummary, activeCategory);
  };

  if (selectedTrials.length === 0) {
    return (
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
        <TopBar title="Compare Trials" onMenuClick={onMenuClick} />
        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8 text-center">
          <Activity className="w-12 h-12 mb-4 opacity-30" />
          <p className="font-semibold text-lg">No trials selected</p>
          <p className="text-sm mt-2 max-w-sm">Go to the Trials page, select 2+ trials using the bulk selection bar, then click Compare.</p>
          <button onClick={() => navigate('/trials')} className="mt-5 flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-white transition" style={{ backgroundColor: config.color.hex }}>
            <ArrowLeft className="w-4 h-4" />Go to Trials
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      <TopBar title="Compare Trials" onMenuClick={onMenuClick} />

      <div className="flex-1 overflow-y-auto p-4 max-w-7xl mx-auto w-full space-y-5">

        {/* Header Action Bar */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm font-semibold text-slate-500">Comparing:</span>
            {selectedTrials.map((t, i) => (
              <span key={t.ID} className="flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold text-white" style={{ backgroundColor: COLORS[i % COLORS.length] }}>
                {t.FormulationName}
                <button onClick={() => removeFromComparison(t.ID)} className="opacity-70 hover:opacity-100"><X className="w-3.5 h-3.5" /></button>
              </span>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            <button onClick={handleExportCsv} className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-600 transition">
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
            <button onClick={handleExportHtml} className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-600 transition">
              <FileText className="w-3.5 h-3.5" /> HTML
            </button>
            <button onClick={handleExportPdf} className="flex items-center gap-1.5 px-3 py-1.5 text-white rounded-lg text-xs font-semibold transition" style={{ backgroundColor: config.color.hex }}>
              <Download className="w-3.5 h-3.5" /> PDF Report
            </button>
          </div>
        </div>

        {/* Efficacy Timeline Line Chart */}
        {allDaa.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
              <LineChart className="w-4 h-4" style={{ color: config.color.hex }} />
              Performance Timeline ({config.primaryMetric.label} vs Days After Application)
            </h3>
            <div className="relative overflow-hidden w-full h-64 border rounded-lg bg-slate-50/50">
              <canvas ref={canvasRef} width={800} height={256} className="w-full h-full" />
            </div>
            <div className="flex flex-wrap gap-4 mt-3 justify-center text-xs">
              {trialSeries.map((s, idx) => (
                <div key={s.trial.ID} className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                  <span className="font-semibold text-slate-600">{s.trial.FormulationName}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {trialSeries.map(({ trial, eff, finalWce, baselineCover }, i) => {
            const isCompleted = trial.IsCompleted === true || trial.IsCompleted === 'true';
            return (
              <div key={trial.ID} className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <div className="h-1.5" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                <div className="p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-bold text-slate-800 text-sm">{trial.FormulationName}</h3>
                      <p className="text-xs text-slate-400">{trial.Location || '—'} · {trial.Date ? new Date(trial.Date).toLocaleDateString() : '—'}</p>
                    </div>
                    {isCompleted && <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-slate-50 rounded-lg p-2"><p className="text-slate-400 font-semibold">Dosage</p><p className="font-bold text-slate-700 truncate">{trial.Dosage || '—'}</p></div>
                    <div className="bg-slate-50 rounded-lg p-2"><p className="text-slate-400 font-semibold">{config.targetLabel}</p><p className="font-bold text-slate-700 truncate">{trial[config.targetField] || '—'}</p></div>
                    <div className="rounded-lg p-2 col-span-2 flex items-center justify-between" style={{ backgroundColor: config.color.hexLight }}>
                      <p className="font-semibold" style={{ color: config.color.hex }}>Final {config.primaryMetric.key}</p>
                      <p className="text-2xl font-bold" style={{ color: config.color.hex }}>{finalWce !== null ? `${finalWce}${config.primaryMetric.unit || ''}` : '—'}</p>
                    </div>
                  </div>
                  {trial.Result && (
                    <span className={`mt-2 inline-block text-xs font-bold px-2 py-0.5 rounded-full ${RESULT_BADGE[trial.Result] || 'bg-slate-100 text-slate-600'}`}>{trial.Result}</span>
                  )}
                  {eff.length > 0 && (
                    <p className="text-xs text-slate-400 mt-2">{eff.length} observation{eff.length !== 1 ? 's' : ''} · Baseline value: {baselineCover !== null ? `${baselineCover}${config.primaryMetric.unit}` : '—'}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* AI Summary */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-bold text-slate-800 flex items-center gap-2"><Sparkles className="w-4 h-4 text-indigo-500" />AI Comparative Agronomist Report</h3>
            <button onClick={handleGenerateSummary} disabled={isGenerating}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition disabled:opacity-50">
              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {isGenerating ? 'Analyzing Trials...' : 'Generate AI Report'}
            </button>
          </div>
          {aiSummary ? (
            <div className="bg-indigo-50 rounded-xl p-4 text-sm text-indigo-900 whitespace-pre-wrap leading-relaxed"
              dangerouslySetInnerHTML={{ __html: String(aiSummary)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\n/g, '<br/>')
              }} />
          ) : (
            <p className="text-sm text-slate-400">Click "Generate AI Report" to perform an end-to-end scientific comparison analysis across the selected trials.</p>
          )}
        </div>

        {/* DAA Timeline Table */}
        {allDaa.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 border-b">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Table className="w-4 h-4 text-slate-500" />
                {config.name} Metrics Timeline ({config.primaryMetric.unit || 'Value'} per DAA)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">Comparing {config.primaryMetric.label} and control/performance % at each Days After Application point</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="px-5 py-3 font-semibold text-slate-600 sticky left-0 bg-slate-50">DAA</th>
                    {trialSeries.map(({ trial }, i) => (
                      <th key={trial.ID} className="px-5 py-3 font-semibold whitespace-nowrap" style={{ color: COLORS[i % COLORS.length] }}>
                        {trial.FormulationName}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {allDaa.map(daa => (
                    <tr key={daa} className="hover:bg-slate-50">
                      <td className="px-5 py-3 font-bold text-slate-700 sticky left-0 bg-white">DAA {daa}</td>
                      {trialSeries.map(({ trial, eff }, i) => {
                        const obs = eff.find(o => Number(o.daa ?? 0) === daa);
                        return (
                          <td key={trial.ID} className="px-5 py-3">
                            {obs ? (
                              <span className="font-semibold text-slate-800">{obs[primaryObsField]}{config.primaryMetric.unit}
                                {obs.controlPct !== undefined && <span className="text-xs text-emerald-600 ml-1">({obs.controlPct}% ctrl)</span>}
                              </span>
                            ) : <span className="text-slate-300">—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Side-by-side detail */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Table className="w-4 h-4 text-slate-500" />
              Full Comparative Specification Details
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-5 py-3 font-semibold text-slate-600">Field / Parameter</th>
                  {trialSeries.map(({ trial }, i) => (
                    <th key={trial.ID} className="px-5 py-3 font-semibold" style={{ color: COLORS[i % COLORS.length] }}>{trial.FormulationName}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {[
                  // Chemistry
                  ['Active Ingredients', t => t.activeIngredients, Cpu],
                  ['Cost / Hectare', t => t.costPerHa, DollarSign],
                  ['Dosage Rate', t => t.Dosage || '—', Cpu],
                  [config.targetLabel, t => t[config.targetField] || '—', Cpu],

                  // Soil Profile
                  ['Soil Texture', t => t.texture || '—', Compass],
                  ['Soil pH', t => t.pH, Compass],
                  ['Soil Clay %', t => t.clay, Compass],
                  ['Soil Sand %', t => t.sand, Compass],
                  ['Soil Organic Carbon %', t => t.oc, Compass],

                  // Weather Conditions
                  ['Avg Temperature', t => t.avgTemp, Cloud],
                  ['Avg Humidity', t => t.avgHumid, Cloud],
                  ['Avg Wind Speed', t => t.avgWind, Cloud],
                  ['Avg Rainfall', t => t.avgRain, Cloud],

                  // Metadata & Conclusion
                  ['Location', t => t.Location || '—', Table],
                  ['Application Date', t => t.Date ? new Date(t.Date).toLocaleDateString() : '—', Table],
                  ['Investigator', t => t.InvestigatorName || '—', Table],
                  ['Overall Assessment', t => t.Result || '—', Table],
                  ['Final Status', t => (t.IsCompleted === true || t.IsCompleted === 'true') ? 'Finalized' : 'Active', Table],
                ].map(([label, getter, Icon]) => (
                  <tr key={label} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-semibold text-slate-600 flex items-center gap-2">
                      {Icon && <Icon className="w-4 h-4 opacity-50" />}
                      {label}
                    </td>
                    {trialSeries.map(({ trial }) => (
                      <td key={trial.ID} className="px-5 py-3 text-slate-700 font-medium">{getter(trial)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
