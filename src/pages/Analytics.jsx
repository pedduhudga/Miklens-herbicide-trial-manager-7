import React, { useMemo, useState, memo } from 'react';
import { useAppState } from '../hooks/useAppState.jsx';
import TopBar from '../components/TopBar.jsx';
import ChartCard from '../components/ChartCard.jsx';
import { safeJsonParse } from '../utils/helpers.js';
import { BarChart3, TrendingUp, Leaf, Activity, ChevronDown, ChevronUp, Download, Sparkles, Award, CheckCircle, Filter, Thermometer, CloudRain, Droplets, Wind, ShieldCheck, Zap } from 'lucide-react';
import { getCategoryConfig, getPrimaryObservationField } from '../utils/categoryConfig.js';

const CHART_COLORS = ['#10b981','#3b82f6','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#84cc16'];

const StatTile = memo(function StatTile({ label, value, sub, color = 'emerald' }) {
  const map = { emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100', blue: 'bg-blue-50 text-blue-700 border-blue-100', amber: 'bg-amber-50 text-amber-700 border-amber-100', purple: 'bg-purple-50 text-purple-700 border-purple-100' };
  return (
    <div className={`rounded-xl p-4 border ${map[color]}`}>
      <p className="text-xs font-bold uppercase opacity-70 mb-1">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs opacity-60 mt-0.5">{sub}</p>}
    </div>
  );
});

export default function Analytics({ onMenuClick }) {
  const { state } = useAppState();
  const [expandedSection, setExpandedSection] = useState(null);
  const activeCategory = state.activeCategory || 'herbicide';
  const catConfig = getCategoryConfig(activeCategory);

  // 3.2 Recommendation state
  const [recTarget, setRecTarget] = useState('');
  const [recPriority, setRecPriority] = useState('efficacy'); // 'efficacy' | 'weather' | 'persistence' | 'consistency'

  // 3.3 Environmental correlation formulation filter
  const [envCorrFormulation, setEnvCorrFormulation] = useState('');

  const trials = useMemo(() => (state.trials || []).filter(t => t.Category === activeCategory || (!t.Category && activeCategory === 'herbicide')), [state.trials, activeCategory]);
  const projects = useMemo(() => (state.projects || []).filter(p => p.Category === activeCategory || (!p.Category && activeCategory === 'herbicide')), [state.projects, activeCategory]);
  const formulations = useMemo(() => (state.formulations || []).filter(f => f.Category === activeCategory || (!f.Category && activeCategory === 'herbicide')), [state.formulations, activeCategory]);

  // ── Summary stats ──────────────────────────────────────────────
  const summary = useMemo(() => {
    const totalObs = trials.reduce((a, t) => a + safeJsonParse(t.EfficacyDataJSON, []).length, 0);
    const rated = trials.filter(t => t.Result);
    const excellent = rated.filter(t => t.Result === 'Excellent' || t.Result === 'Good').length;
    const successRate = rated.length > 0 ? Math.round((excellent / rated.length) * 100) : 0;
    const withPhotos = trials.filter(t => safeJsonParse(t.PhotoURLs, []).length > 0).length;
    const controlTrials = trials.filter(t => t.IsControl === true || t.IsControl === 'true').length;
    return { totalObs, successRate, withPhotos, controlTrials, rated: rated.length };
  }, [trials]);

  // ── Trials by month (last 12) ──────────────────────────────────
  const trialsByMonth = useMemo(() => {
    const months = {};
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toLocaleString('default', { month: 'short', year: '2-digit' });
      months[key] = 0;
    }
    trials.forEach(t => {
      if (!t.Date) return;
      const d = new Date(t.Date);
      const key = d.toLocaleString('default', { month: 'short', year: '2-digit' });
      if (key in months) months[key]++;
    });
    return months;
  }, [trials]);

  // ── Efficacy by formulation (real avg of final obs controlPct) ──
  const efficacyByFormulation = useMemo(() => {
    const map = {};
    const primaryObsField = getPrimaryObservationField(activeCategory);
    trials.forEach(t => {
      if (!t.FormulationName) return;
      const eff = safeJsonParse(t.EfficacyDataJSON, []);
      if (!eff.length) return;
      const last = eff[eff.length - 1];
      let val = null;
      if (last.controlPct !== undefined && last.controlPct !== null) {
        val = Number(last.controlPct);
      } else if (last[primaryObsField] !== undefined && last[primaryObsField] !== null) {
        const baseline = eff[0] ? Number(eff[0][primaryObsField]) : 0;
        const current = Number(last[primaryObsField]);
        if (baseline > 0) {
          if (activeCategory === 'nutrition' || activeCategory === 'biostimulant') {
            val = ((current - baseline) / baseline) * 100;
          } else {
            val = ((baseline - current) / baseline) * 100;
          }
        }
      }
      if (val === null) return;
      if (!map[t.FormulationName]) map[t.FormulationName] = [];
      map[t.FormulationName].push(Number(val));
    });
    return Object.entries(map).map(([name, vals]) => ({
      name,
      avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
      count: vals.length,
    })).sort((a, b) => b.avg - a.avg).slice(0, 10);
  }, [trials, activeCategory]);

  // ── Weed species frequency ──────────────────────────────────────
  const weedSpeciesFreq = useMemo(() => {
    const map = {};
    const tField = catConfig.targetField || 'WeedSpecies';
    trials.forEach(t => {
      if (!t[tField]) return;
      t[tField].split(',').forEach(s => {
        const name = s.trim();
        if (name) map[name] = (map[name] || 0) + 1;
      });
      safeJsonParse(t.EfficacyDataJSON, []).forEach(obs => {
        (obs.weedDetails || []).forEach(wd => {
          if (wd.species && wd.species !== 'Total') map[wd.species] = (map[wd.species] || 0) + 1;
        });
      });
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [trials, catConfig.targetField]);

  // ── Available targets & formulations for filters ──────────────
  const allTargets = useMemo(() => {
    const s = new Set();
    const tField = catConfig.targetField || 'WeedSpecies';
    trials.forEach(t => {
      String(t[tField] || '').split(',').map(x => x.trim()).filter(Boolean).forEach(x => s.add(x));
    });
    return Array.from(s).sort();
  }, [trials, catConfig.targetField]);

  const allTrialFormulationNames = useMemo(() => {
    const s = new Set();
    trials.forEach(t => { if (t.FormulationName) s.add(t.FormulationName); });
    return Array.from(s).sort();
  }, [trials]);

  // ── 3.2: Best Formulation Recommendation Engine ─────────────────
  const formulationRecommendations = useMemo(() => {
    if (trials.length === 0) return [];
    const tField = catConfig.targetField || 'WeedSpecies';
    const primaryObsField = getPrimaryObservationField(activeCategory);

    const groups = {};
    trials.forEach(t => {
      const name = t.FormulationName;
      if (!name) return;
      if (recTarget && !String(t[tField] || '').toLowerCase().includes(recTarget.toLowerCase())) return;

      if (!groups[name]) {
        groups[name] = { name, trials: [], efficacies: [], tempVariations: [], controlDays: [] };
      }
      groups[name].trials.push(t);

      const eff = safeJsonParse(t.EfficacyDataJSON, []);
      if (eff.length > 0) {
        const last = eff[eff.length - 1];
        let val = null;
        if (last.controlPct !== undefined && last.controlPct !== null) val = Number(last.controlPct);
        else if (eff[0] && last[primaryObsField] !== undefined) {
          const b = Number(eff[0][primaryObsField]);
          const c = Number(last[primaryObsField]);
          if (b > 0) val = ((b - c) / b) * 100;
        }
        if (val !== null && isFinite(val)) groups[name].efficacies.push(val);
      } else if (t.Result) {
        const rVal = t.Result === 'Excellent' ? 95 : t.Result === 'Good' ? 80 : t.Result === 'Fair' ? 60 : 30;
        groups[name].efficacies.push(rVal);
      }

      if (t.Temperature && isFinite(parseFloat(t.Temperature))) {
        groups[name].tempVariations.push(parseFloat(t.Temperature));
      }
      if (t.FinalControlDuration && isFinite(parseInt(t.FinalControlDuration, 10))) {
        groups[name].controlDays.push(parseInt(t.FinalControlDuration, 10));
      }
    });

    const candidates = Object.values(groups)
      .filter(g => g.trials.length > 0 && g.efficacies.length > 0)
      .map(g => {
        const avgEff = Math.round(g.efficacies.reduce((a, b) => a + b, 0) / g.efficacies.length);
        const variance = g.efficacies.reduce((a, b) => a + Math.pow(b - avgEff, 2), 0) / g.efficacies.length;
        const stdDev = Math.round(Math.sqrt(variance));
        const consistencyScore = Math.max(0, 100 - stdDev * 2);

        const avgDays = g.controlDays.length > 0 ? Math.round(g.controlDays.reduce((a, b) => a + b, 0) / g.controlDays.length) : null;
        const persistenceScore = avgDays !== null ? Math.min(100, Math.round((avgDays / 30) * 100)) : 50;

        const hotTrials = g.trials.filter(t => parseFloat(t.Temperature) >= 30);
        const hotResilience = hotTrials.length > 0 ? 85 : 65;

        let compositeScore = avgEff;
        if (recPriority === 'consistency') compositeScore = Math.round(avgEff * 0.5 + consistencyScore * 0.5);
        else if (recPriority === 'persistence') compositeScore = Math.round(avgEff * 0.4 + persistenceScore * 0.6);
        else if (recPriority === 'weather') compositeScore = Math.round(avgEff * 0.5 + hotResilience * 0.5);

        const reasons = [];
        if (avgEff >= 85) reasons.push(`High average kill rate (${avgEff}%) across ${g.trials.length} trial${g.trials.length > 1 ? 's' : ''}`);
        if (stdDev <= 10) reasons.push(`Highly consistent field response (low variance, σ=${stdDev}%)`);
        if (avgDays && avgDays >= 14) reasons.push(`Sustained control longevity averaging ${avgDays} days`);
        if (hotTrials.length > 0) reasons.push(`Demonstrated thermal tolerance in temperatures up to ${Math.max(...g.tempVariations)}°C`);
        if (reasons.length === 0) reasons.push(`Proven performance across ${g.trials.length} field plot replicates`);

        return {
          name: g.name,
          trialsCount: g.trials.length,
          avgEff,
          stdDev,
          avgDays,
          consistencyScore,
          compositeScore,
          reasons,
          dosage: g.trials[0]?.Dosage || 'Standard label rate'
        };
      })
      .sort((a, b) => b.compositeScore - a.compositeScore || b.avgEff - a.avgEff);

    return candidates;
  }, [trials, recTarget, recPriority, catConfig.targetField, activeCategory]);

  // ── 3.3: Environmental correlation data with Pearson r & Trend ────
  const envCorrData = useMemo(() => {
    const configs = [
      { key: 'Temperature', label: 'Temperature (°C)', color: '#f59e0b' },
      { key: 'Humidity',    label: 'Humidity (%)',     color: '#3b82f6' },
      { key: 'Windspeed',   label: 'Wind (km/h)',      color: '#6366f1' },
      { key: 'Rain',        label: 'Rain (mm)',        color: '#06b6d4' },
      { key: 'SoilPH',      label: 'Soil pH',          color: '#8b5cf6' },
    ];
    const primaryObsField = getPrimaryObservationField(activeCategory);

    let filteredTrials = trials;
    if (envCorrFormulation) {
      filteredTrials = trials.filter(t => t.FormulationName === envCorrFormulation);
    }

    return configs.map(({ key, label, color }) => {
      const points = filteredTrials.map(t => {
        const envVal = parseFloat(t[key]);
        if (!isFinite(envVal) || envVal < 0) return null;
        if (key !== 'Rain' && envVal <= 0) return null;
        const eff = safeJsonParse(t.EfficacyDataJSON, []);
        let efficacy = null;
        if (eff.length > 0) {
          const last = eff[eff.length - 1];
          if (last.controlPct !== undefined && last.controlPct !== null) {
            efficacy = Number(last.controlPct);
          } else if (eff[0] && last[primaryObsField] !== undefined && last[primaryObsField] !== null) {
            const baseline = Number(eff[0][primaryObsField]);
            const current = Number(last[primaryObsField]);
            if (baseline > 0) {
              if (activeCategory === 'nutrition' || activeCategory === 'biostimulant') {
                efficacy = ((current - baseline) / baseline) * 100;
              } else {
                efficacy = ((baseline - current) / baseline) * 100;
              }
            }
          }
        }
        if (efficacy === null) {
          efficacy = t.Result === 'Excellent' ? 95 : t.Result === 'Good' ? 80 : t.Result === 'Fair' ? 60 : t.Result === 'Poor' ? 30 : null;
        }
        return efficacy !== null ? { x: envVal, y: efficacy } : null;
      }).filter(Boolean);

      // Calculate Pearson correlation coefficient r
      let pearsonR = null;
      let takeaway = 'Insufficient data points to calculate correlation';
      if (points.length >= 3) {
        const n = points.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
        points.forEach(p => {
          sumX += p.x; sumY += p.y;
          sumXY += p.x * p.y;
          sumX2 += p.x * p.x; sumY2 += p.y * p.y;
        });
        const num = n * sumXY - sumX * sumY;
        const den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
        if (den !== 0 && !isNaN(den)) {
          pearsonR = parseFloat((num / den).toFixed(2));
          if (key === 'Temperature') {
            takeaway = pearsonR < -0.25 ? `Efficacy declines in higher heat (r=${pearsonR}). Recommend early morning applications.` : pearsonR > 0.25 ? `Higher temperatures stimulate uptake (r=+${pearsonR}).` : `Consistent efficacy across tested temperature range (r=${pearsonR}).`;
          } else if (key === 'Humidity') {
            takeaway = pearsonR > 0.25 ? `High humidity improves droplet longevity & absorption (r=+${pearsonR}).` : `Stable performance across varying humidity (r=${pearsonR}).`;
          } else if (key === 'Windspeed') {
            takeaway = pearsonR < -0.2 ? `Elevated winds risk droplet drift, diminishing control (r=${pearsonR}).` : `Adequate spray deposition within recorded wind speeds (r=${pearsonR}).`;
          } else if (key === 'Rain') {
            takeaway = pearsonR < -0.25 ? `Post-spray rainfall washes active ingredient (r=${pearsonR}). Ensure rainfastness buffer.` : `Good rainfastness resilience observed in trial plots (r=${pearsonR}).`;
          } else {
            takeaway = `Observed correlation coefficient: r=${pearsonR}`;
          }
        }
      }

      return { key, label, color, points, pearsonR, takeaway };
    });
  }, [trials, activeCategory, envCorrFormulation]);

  // ── Performance radar (top 3 formulations) ──────────────────────
  const radarChartConfig = useMemo(() => {
    const formMap = {};
    trials.forEach(t => {
      if (!t.FormulationName) return;
      if (!formMap[t.FormulationName]) formMap[t.FormulationName] = [];
      formMap[t.FormulationName].push(t);
    });
    const top3 = Object.entries(formMap).sort((a, b) => b[1].length - a[1].length).slice(0, 3);
    if (top3.length === 0) return null;
    const scoreColors = ['rgba(16,185,129,0.2)', 'rgba(59,130,246,0.2)', 'rgba(245,158,11,0.2)'];
    const borderColors = ['#10b981', '#3b82f6', '#f59e0b'];
    const datasets = top3.map(([name, fTrials], i) => {
      const scored = fTrials.map(t => t.Result === 'Excellent' ? 95 : t.Result === 'Good' ? 80 : t.Result === 'Fair' ? 60 : t.Result === 'Poor' ? 30 : 0);
      const avgE = scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : 0;
      const avgW = fTrials.filter(t => t.Temperature).reduce((a, t) => a + (parseFloat(t.Windspeed || 0) < 20 ? 90 : 60), 0) / (fTrials.length || 1);
      const avgR = fTrials.filter(t => t.Rain).reduce((a, t) => a + (parseFloat(t.Rain || 0) < 10 ? 90 : 60), 0) / (fTrials.length || 1);
      const countScore = Math.min(100, fTrials.length * 20);
      return {
        label: name.length > 18 ? name.slice(0, 18) + '…' : name,
        data: [Math.round(avgE), Math.round(avgW), Math.round(avgR), countScore, 80],
        backgroundColor: scoreColors[i],
        borderColor: borderColors[i],
        pointBackgroundColor: borderColors[i],
      };
    });
    return {
      type: 'radar',
      data: {
        labels: ['Efficacy', 'Wind Tolerance', 'Rain Resilience', 'Trial Count', 'Persistence'],
        datasets,
      },
      options: { responsive: true, maintainAspectRatio: false, scales: { r: { beginAtZero: true, max: 100 } }, plugins: { legend: { position: 'bottom' } } },
    };
  }, [trials]);

  // ── Result distribution ────────────────────────────────────────
  const resultDist = useMemo(() => {
    const map = { Excellent: 0, Good: 0, Fair: 0, Poor: 0, Control: 0 };
    trials.forEach(t => { if (t.Result && map[t.Result] !== undefined) map[t.Result]++; });
    return map;
  }, [trials]);

  // ── Chart configs ──────────────────────────────────────────────
  const monthlyChartConfig = {
    type: 'bar',
    data: {
      labels: Object.keys(trialsByMonth),
      datasets: [{ label: 'Trials', data: Object.values(trialsByMonth), backgroundColor: '#10b981', borderRadius: 4 }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
  };

  const efficacyChartConfig = efficacyByFormulation.length > 0 ? {
    type: 'bar',
    data: {
      labels: efficacyByFormulation.map(e => e.name.length > 18 ? e.name.slice(0, 18) + '…' : e.name),
      datasets: [{ label: `Avg Final ${catConfig.primaryMetric.key} %`, data: efficacyByFormulation.map(e => e.avg), backgroundColor: CHART_COLORS, borderRadius: 4 }]
    },
    options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { max: 100 } } }
  } : null;

  const weedChartConfig = weedSpeciesFreq.length > 0 ? {
    type: 'doughnut',
    data: {
      labels: weedSpeciesFreq.map(([n]) => n),
      datasets: [{ data: weedSpeciesFreq.map(([, c]) => c), backgroundColor: CHART_COLORS }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }
  } : null;

  const speciesTimelineChartConfig = useMemo(() => {
    const speciesData = {}; // { speciesName: { daa: [values] } }
    const daaSorted = new Set();

    trials.forEach(t => {
      const eff = safeJsonParse(t.EfficacyDataJSON, []);
      eff.forEach(obs => {
        const daa = obs.daa ?? 0;
        daaSorted.add(daa);
        (obs.weedDetails || []).forEach(wd => {
          if (!wd.species || wd.species.toLowerCase() === 'total' || wd.species.toLowerCase() === 'unknown') return;
          const val = parseFloat(wd.cover ?? wd.value);
          if (isNaN(val)) return;

          if (!speciesData[wd.species]) speciesData[wd.species] = {};
          if (!speciesData[wd.species][daa]) speciesData[wd.species][daa] = [];
          speciesData[wd.species][daa].push(val);
        });
      });
    });

    const daaList = [...daaSorted].sort((a, b) => a - b);
    if (daaList.length === 0 || Object.keys(speciesData).length === 0) return null;

    // Keep top 5 most common species
    const topSpecies = Object.entries(speciesData)
      .map(([name, daaMap]) => {
        const count = Object.values(daaMap).reduce((sum, vals) => sum + vals.length, 0);
        return { name, count, daaMap };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const datasets = topSpecies.map((sp, idx) => {
      const data = daaList.map(daa => {
        const vals = sp.daaMap[daa];
        if (!vals || !vals.length) return null;
        return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length * 10) / 10;
      });

      const color = CHART_COLORS[idx % CHART_COLORS.length];
      return {
        label: sp.name,
        data,
        borderColor: color,
        backgroundColor: color + '20',
        tension: 0.15,
        fill: false,
        spanGaps: true
      };
    });

    return {
      type: 'line',
      data: {
        labels: daaList.map(daa => `DAA ${daa}`),
        datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' }
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            title: { display: true, text: 'Cover / Severity (%)' }
          },
          x: {
            title: { display: true, text: 'Days After Application' }
          }
        }
      }
    };
  }, [trials]);

  const resultChartConfig = Object.values(resultDist).some(v => v > 0) ? {
    type: 'doughnut',
    data: {
      labels: Object.keys(resultDist),
      datasets: [{ data: Object.values(resultDist), backgroundColor: ['#10b981','#3b82f6','#f59e0b','#ef4444','#8b5cf6'] }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }
  } : null;

  const toggle = (s) => setExpandedSection(prev => prev === s ? null : s);

  const handleExportPDF = () => {
    window.print();
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      <TopBar title="Analytics & Stats" onMenuClick={onMenuClick} />

      <div className="flex-1 overflow-y-auto p-4 max-w-7xl mx-auto w-full space-y-5">
        {/* Export button */}
        <div className="flex justify-end">
          <button onClick={handleExportPDF} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition">
            <Download className="w-4 h-4" /> Export Analytics PDF
          </button>
        </div>
        {/* Summary tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatTile label="Total Trials" value={trials.length} sub={`${projects.length} projects`} color="emerald" />
          <StatTile label="Total Observations" value={summary.totalObs} sub="across all trials" color="blue" />
          <StatTile label="Success Rate" value={summary.rated > 0 ? `${summary.successRate}%` : '—'} sub={`${summary.rated} rated trials`} color="amber" />
          <StatTile label="Trials w/ Photos" value={summary.withPhotos} sub={`${summary.controlTrials} control plots`} color="purple" />
        </div>

        {/* ══ 3.2 — AUTOMATIC BEST FORMULATION RECOMMENDATION ENGINE ══ */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-500" />
                Best Formulation Recommendation Engine
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Multi-factor agronomic ranking evaluating efficacy, variance, weather resilience, and control persistence.
              </p>
            </div>

            {/* Filter controls */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={recTarget}
                  onChange={(e) => setRecTarget(e.target.value)}
                  className="bg-transparent text-xs text-slate-700 font-medium focus:outline-none"
                >
                  <option value="">All {catConfig.targetLabel}s</option>
                  {allTargets.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">
                <Award className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={recPriority}
                  onChange={(e) => setRecPriority(e.target.value)}
                  className="bg-transparent text-xs text-slate-700 font-medium focus:outline-none"
                >
                  <option value="efficacy">Priority: Maximum Kill %</option>
                  <option value="consistency">Priority: High Consistency (Low σ)</option>
                  <option value="persistence">Priority: Sustained Persistence</option>
                  <option value="weather">Priority: Heat & Weather Resilience</option>
                </select>
              </div>
            </div>
          </div>

          {/* Recommendation Cards */}
          {formulationRecommendations.length > 0 ? (
            <div className="space-y-3">
              {/* #1 Winner Card */}
              {formulationRecommendations[0] && (
                <div className="rounded-xl border-2 border-emerald-500/40 bg-gradient-to-r from-emerald-50/60 to-white p-4 relative overflow-hidden">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="bg-emerald-600 text-white text-[11px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                        <Award className="w-3 h-3" /> #1 Recommended
                      </span>
                      <h3 className="text-base font-bold text-slate-900">{formulationRecommendations[0].name}</h3>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="text-xs text-slate-400 block">Performance Score</span>
                        <span className="text-lg font-black text-emerald-600">{formulationRecommendations[0].compositeScore}/100</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 my-3 text-xs">
                    <div className="bg-white/80 rounded-lg p-2 border border-slate-100">
                      <span className="text-slate-400 text-[10px] block font-semibold uppercase">Avg Efficacy</span>
                      <span className="font-bold text-slate-800 text-sm">{formulationRecommendations[0].avgEff}%</span>
                    </div>
                    <div className="bg-white/80 rounded-lg p-2 border border-slate-100">
                      <span className="text-slate-400 text-[10px] block font-semibold uppercase">Consistency</span>
                      <span className="font-bold text-slate-800 text-sm">{formulationRecommendations[0].consistencyScore}%</span>
                    </div>
                    <div className="bg-white/80 rounded-lg p-2 border border-slate-100">
                      <span className="text-slate-400 text-[10px] block font-semibold uppercase">Control Duration</span>
                      <span className="font-bold text-slate-800 text-sm">{formulationRecommendations[0].avgDays ? `${formulationRecommendations[0].avgDays}d` : '—'}</span>
                    </div>
                    <div className="bg-white/80 rounded-lg p-2 border border-slate-100">
                      <span className="text-slate-400 text-[10px] block font-semibold uppercase">Field Replicates</span>
                      <span className="font-bold text-slate-800 text-sm">{formulationRecommendations[0].trialsCount} trials</span>
                    </div>
                  </div>

                  {/* Agronomic Rationale */}
                  <div className="space-y-1 pt-1">
                    <p className="text-[11px] font-bold uppercase text-slate-500 tracking-wider">Agronomic Rationale:</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {formulationRecommendations[0].reasons.map((r, ri) => (
                        <div key={ri} className="flex items-center gap-1.5 text-xs text-slate-700">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>{r}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Runners up table if > 1 candidate */}
              {formulationRecommendations.length > 1 && (
                <div className="overflow-x-auto pt-1">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="text-slate-400 uppercase border-b border-slate-100">
                        <th className="py-2 px-3 font-semibold">Rank</th>
                        <th className="py-2 px-3 font-semibold">Formulation</th>
                        <th className="py-2 px-3 font-semibold text-center">Score</th>
                        <th className="py-2 px-3 font-semibold text-center">Avg Efficacy</th>
                        <th className="py-2 px-3 font-semibold text-center">Trials</th>
                        <th className="py-2 px-3 font-semibold">Dosage</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {formulationRecommendations.slice(1, 5).map((cand, ci) => (
                        <tr key={cand.name} className="hover:bg-slate-50 transition">
                          <td className="py-2 px-3 font-bold text-slate-400">#{ci + 2}</td>
                          <td className="py-2 px-3 font-semibold text-slate-700">{cand.name}</td>
                          <td className="py-2 px-3 text-center font-bold text-slate-800">{cand.compositeScore}</td>
                          <td className="py-2 px-3 text-center text-emerald-600 font-semibold">{cand.avgEff}%</td>
                          <td className="py-2 px-3 text-center text-slate-500">{cand.trialsCount}</td>
                          <td className="py-2 px-3 text-slate-500">{cand.dosage}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div className="py-8 text-center text-slate-400 text-xs bg-slate-50 rounded-xl border border-slate-100">
              No formulation data matches target filter "{recTarget}". Clear filter to view recommendations.
            </div>
          )}
        </div>

        {/* Monthly chart */}
        <ChartCard id="monthly-chart" title="Trial Volume (Last 12 Months)" description="Trials created per month"
          config={Object.values(trialsByMonth).some(v => v > 0) ? monthlyChartConfig : null} height="260px" />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <ChartCard id="efficacy-chart" title={`Avg Final Efficacy by Formulation`}
            description={`Average ${catConfig.primaryMetric.label} (%) at last observation`}
            config={efficacyChartConfig} height="300px" />
          <ChartCard id="result-dist-chart" title="Result Distribution"
            description="How trials are rated overall"
            config={resultChartConfig} height="300px" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
          <ChartCard id="weed-chart" title={`${catConfig.targetLabel} Frequency`}
            description={`Most commonly targeted ${catConfig.targetLabel.toLowerCase()} across all trials`}
            config={weedChartConfig} height="300px" />
          <ChartCard id="species-timeline-chart" title={`${catConfig.targetLabel} Severity Trend over DAA`}
            description={`Average cover/severity of top ${catConfig.targetLabel.toLowerCase()} species over time`}
            config={speciesTimelineChartConfig} height="300px" />
        </div>

        {/* Performance Radar */}
        {radarChartConfig && (
          <ChartCard id="radar-chart" title="Performance Radar (Top 3 Formulations)"
            description="Comparative radar across key performance dimensions"
            config={radarChartConfig} height="320px" />
        )}

        {/* ══ 3.3 — ENVIRONMENTAL CORRELATION PANEL ═══════════════════ */}
        {envCorrData.some(d => d.points.length > 0) && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-600" />
                  Environmental Correlation Panel (Efficacy vs Weather)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Scatter regressions with Pearson correlation coefficients (r) measuring meteorological impacts.
                </p>
              </div>

              {/* Formulation filter for correlations */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-semibold">Filter:</span>
                <select
                  value={envCorrFormulation}
                  onChange={(e) => setEnvCorrFormulation(e.target.value)}
                  className="text-xs border rounded-lg px-2.5 py-1.5 bg-slate-50 text-slate-700 font-medium focus:ring-1 focus:ring-emerald-400"
                >
                  <option value="">All Formulations Pooled</option>
                  {allTrialFormulationNames.map(fn => (
                    <option key={fn} value={fn}>{fn}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-5">
              {envCorrData.map(({ key, label, color, points, pearsonR, takeaway }) =>
                points.length > 0 ? (
                  <div key={key} className="bg-slate-50/70 border border-slate-200/80 rounded-xl p-3.5 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          {key === 'Temperature' && <Thermometer className="w-3.5 h-3.5 text-amber-500" />}
                          {key === 'Humidity' && <Droplets className="w-3.5 h-3.5 text-blue-500" />}
                          {key === 'Windspeed' && <Wind className="w-3.5 h-3.5 text-indigo-500" />}
                          {key === 'Rain' && <CloudRain className="w-3.5 h-3.5 text-cyan-500" />}
                          {label}
                        </span>
                        {pearsonR !== null && (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            pearsonR > 0.2 ? 'bg-emerald-100 text-emerald-800' :
                            pearsonR < -0.2 ? 'bg-red-100 text-red-800' :
                            'bg-slate-200 text-slate-700'
                          }`}>
                            r = {pearsonR > 0 ? `+${pearsonR}` : pearsonR}
                          </span>
                        )}
                      </div>

                      <div className="h-44 bg-white rounded-lg p-2 border border-slate-100">
                        <ChartCard
                          id={`corr-chart-${key}`}
                          title=""
                          description=""
                          config={{
                            type: 'scatter',
                            data: { datasets: [{ label: label, data: points, backgroundColor: color }] },
                            options: {
                              responsive: true,
                              maintainAspectRatio: false,
                              plugins: { legend: { display: false } },
                              scales: {
                                y: { beginAtZero: true, max: 100, title: { display: true, text: 'Efficacy %' } },
                                x: { title: { display: true, text: label } }
                              }
                            },
                          }}
                          height="160px"
                        />
                      </div>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-slate-200/60 text-[11px] text-slate-600 flex items-start gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                      <span>{takeaway}</span>
                    </div>
                  </div>
                ) : (
                  <div key={key} className="flex flex-col items-center justify-center h-48 text-slate-400 text-xs bg-slate-50/50 rounded-xl border border-slate-100 p-4 text-center">
                    <Activity className="w-6 h-6 mb-1 opacity-30" />
                    <span>No data for {label}</span>
                  </div>
                )
              )}
            </div>
          </div>
        )}

        {/* Efficacy table */}
        {efficacyByFormulation.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <button onClick={() => toggle('eff-table')} className="w-full flex justify-between items-center px-5 py-4 font-bold text-slate-800 hover:bg-slate-50 transition">
              <span className="flex items-center gap-2"><TrendingUp className="w-4 h-4 text-emerald-600" />Formulation Efficacy Table</span>
              {expandedSection === 'eff-table' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {expandedSection === 'eff-table' && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 border-y border-slate-100">
                    <tr>
                      <th className="px-5 py-3 font-semibold text-slate-600">Formulation</th>
                      <th className="px-5 py-3 font-semibold text-slate-600 text-center">Trials</th>
                      <th className="px-5 py-3 font-semibold text-slate-600 text-right">Avg Final {catConfig.primaryMetric.key}</th>
                      <th className="px-5 py-3 w-40">Bar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {efficacyByFormulation.map(({ name, avg, count }, i) => (
                      <tr key={name} className="hover:bg-slate-50 transition">
                        <td className="px-5 py-3 font-medium text-slate-700">{name}</td>
                        <td className="px-5 py-3 text-center text-slate-500">{count}</td>
                        <td className="px-5 py-3 text-right font-bold text-emerald-700">{avg}%</td>
                        <td className="px-5 py-3">
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${avg}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Weed species table */}
        {weedSpeciesFreq.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <button onClick={() => toggle('weed-table')} className="w-full flex justify-between items-center px-5 py-4 font-bold text-slate-800 hover:bg-slate-50 transition">
              <span className="flex items-center gap-2"><Leaf className="w-4 h-4" style={{ color: catConfig.color.hex }} />{catConfig.targetLabel} Summary</span>
              {expandedSection === 'weed-table' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {expandedSection === 'weed-table' && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 border-y border-slate-100">
                    <tr>
                      <th className="px-5 py-3 font-semibold text-slate-600">Species</th>
                      <th className="px-5 py-3 font-semibold text-slate-600 text-right">Occurrences</th>
                      <th className="px-5 py-3 w-40">Frequency</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {weedSpeciesFreq.map(([name, count], i) => (
                      <tr key={name} className="hover:bg-slate-50 transition">
                        <td className="px-5 py-3 font-medium text-slate-700 italic">{name}</td>
                        <td className="px-5 py-3 text-right font-bold text-slate-700">{count}</td>
                        <td className="px-5 py-3">
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${(count / (weedSpeciesFreq[0]?.[1] || 1)) * 100}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {trials.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="font-semibold">No data to analyse yet</p>
            <p className="text-sm mt-1">Create trials with observations to see analytics here</p>
          </div>
        )}
      </div>
    </div>
  );
}
