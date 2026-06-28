import { useState, useMemo, useCallback, useEffect } from 'react';
import { useAppState } from '../hooks/useAppState.jsx';
import { 
  performANOVA, performTukeyHSD, performDunnettTest, performDuncanMRT, 
  performANCOVA, performMetaAnalysis, performTypeIIIANOVA, performKruskalWallis,
  calculateEffectSizes, calculateConfidenceIntervals, calculatePower,
  performSplitPlotANOVA, performRepeatedMeasuresANOVA, performMixedModel,
  performSNKTest, performBonferroniTest,
  performShapiroWilk, performBartlettsTest
} from '../utils/statsUtils.js';
import { performDoseResponseAnalysis } from '../utils/doseResponseUtils.js';
import { safeJsonParse } from '../utils/helpers.js';
import { exportStatsPDF, exportStatsExcel } from '../services/statsExporter.js';
import { computeTreatmentMeans, computeCorrelationMatrix } from '../services/reportDataBuilder.js';
import PowerAnalysisPanel from '../components/PowerAnalysisPanel.jsx';
import { 
  BarChart3, Calculator, ChevronDown, Download, 
  AlertCircle, CheckCircle, Info, Table2, TrendingUp, 
  Activity, GitBranch, Clock, Zap
} from 'lucide-react';

export default function Statistics() {
  const { state } = useAppState();
  const activeCategory = state.activeCategory || 'herbicide';
  
  const projects = useMemo(() => {
    return (state.projects || []).filter(p => p.Category === activeCategory || (!p.Category && activeCategory === 'herbicide'));
  }, [state.projects, activeCategory]);
  
  const trials = useMemo(() => {
    return (state.trials || []).filter(t => t.Category === activeCategory || (!t.Category && activeCategory === 'herbicide'));
  }, [state.trials, activeCategory]);
  
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedMetaProjects, setSelectedMetaProjects] = useState([]);
  const [metric, setMetric] = useState('controlPct');
  const [covariateMetric, setCovariateMetric] = useState('Temperature');
  const [test, setTest] = useState('anova'); // anova, typeIII, tukey, dunnett, ancova, meta
  const [alpha, setAlpha] = useState(0.05);
  const [daa, setDaa] = useState('');
  const [excludeOutliers, setExcludeOutliers] = useState(false);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);

  // Power analysis local state
  const [powerK, setPowerK] = useState(4);
  const [powerN, setPowerN] = useState(4);
  const [powerEffectSize, setPowerEffectSize] = useState(0.4);
  const [powerTargetPower, setPowerTargetPower] = useState(0.80);

  // Sync metric default when activeCategory changes
  useEffect(() => {
    setSelectedProject('');
    setSelectedMetaProjects([]);
    setResults(null);
    if (activeCategory === 'herbicide' || activeCategory === 'fungicide' || activeCategory === 'pesticide') {
      setMetric('controlPct');
    } else if (activeCategory === 'nutrition') {
      setMetric('yield');
    } else {
      setMetric('plantHeight');
    }
  }, [activeCategory]);

  // Get active project
  const activeProject = useMemo(() => {
    return projects.find(p => p.ID === selectedProject);
  }, [projects, selectedProject]);

  // Get project trials
  const projectTrials = useMemo(() => {
    if (test === 'meta') {
      return (trials || []).filter(t => selectedMetaProjects.includes(t.ProjectID));
    }
    if (!selectedProject) return [];
    return (trials || [])
      .filter(t => t.ProjectID === selectedProject)
      .sort((a, b) => {
        const pnA = parseInt(a.PlotNumber || 0);
        const pnB = parseInt(b.PlotNumber || 0);
        return pnA - pnB;
      });
  }, [trials, selectedProject, selectedMetaProjects, test]);

  // Available DAA values
  const availableDAAs = useMemo(() => {
    const daas = new Set();
    projectTrials.forEach(t => {
      const efficacy = safeJsonParse(t.EfficacyDataJSON, []);
      efficacy.forEach(e => {
        const d = e.daa || e.daysAfterApplication;
        if (d) daas.add(d);
      });
    });
    return [...daas].sort((a, b) => a - b);
  }, [projectTrials]);

  // Identify control treatment
  const controlTreatment = useMemo(() => {
    const formulations = [...new Set(projectTrials.map(t => t.FormulationName))];
    return formulations.find(f => 
      f?.toLowerCase().includes('control') || 
      f?.toLowerCase().includes('untreated') ||
      f?.toLowerCase().includes('check')
    ) || formulations[0];
  }, [projectTrials]);

  // Run analysis
  const runAnalysis = useCallback(() => {
    if (projectTrials.length === 0) return;
    
    setLoading(true);
    
    setTimeout(() => {
      const options = { 
        metric, 
        alpha,
        daa: daa ? parseInt(daa) : null,
        design: activeProject?.Design || 'RCBD',
        excludeOutliers,
        activeCategory
      };
      
      let result;
      switch (test) {
        case 'typeIII':
          result = performTypeIIIANOVA(projectTrials, options);
          break;
        case 'tukey':
          result = performTukeyHSD(projectTrials, options);
          break;
        case 'duncan':
          result = performDuncanMRT(projectTrials, options);
          break;
        case 'dunnett':
          result = performDunnettTest(projectTrials, controlTreatment, options);
          break;
        case 'ancova':
          result = performANCOVA(projectTrials, covariateMetric, options);
          break;
        case 'meta':
          const metaProjects = projects.filter(p => selectedMetaProjects.includes(p.ID));
          result = performMetaAnalysis(metaProjects, trials, options);
          break;
        case 'kruskal':
          result = performKruskalWallis(projectTrials, options);
          break;
        case 'snk':
          result = performSNKTest(projectTrials, options);
          break;
        case 'bonferroni':
          result = performBonferroniTest(projectTrials, options);
          break;
        // NEW: Advanced tests
        case 'splitplot':
          result = performSplitPlotANOVA(projectTrials, { ...options, mainFactor: 'FormulationName', subFactor: 'BlockID' });
          break;
        case 'repeated':
          result = performRepeatedMeasuresANOVA(projectTrials, { ...options, metric });
          break;
        case 'mixed':
          result = performMixedModel(projectTrials, { ...options, fixedEffect: 'FormulationName', randomEffect: 'BlockID' });
          break;
        case 'doseresp':
          result = performDoseResponseAnalysis(projectTrials, { ...options, metric, doseField: 'Dosage' });
          break;
        case 'power':
          // Power analysis doesn't need trial data
          result = calculatePower({ alpha, kGroups: options.kGroups || 4, nPerGroup: options.nPerGroup || 4 });
          break;
        case 'anova':
        default:
          result = performANOVA(projectTrials, options);
          break;
      }
      
      // Add effect sizes and confidence intervals for applicable tests
      if (result && !result.error && ['anova', 'typeIII', 'tukey', 'dunnett', 'snk', 'bonferroni', 'splitplot', 'repeated', 'mixed'].includes(test)) {
        result.effectSizes = calculateEffectSizes(result);
        result.confidenceIntervals = calculateConfidenceIntervals(result, alpha);
      }

      // Task 19: attach Shapiro-Wilk and Bartlett's for ANOVA-based tests
      if (result && !result.error && result.assumptions && ['anova', 'typeIII', 'tukey', 'dunnett', 'snk', 'bonferroni', 'splitplot', 'repeated', 'mixed'].includes(test)) {
        // Shapiro-Wilk on residuals
        if (result.residuals && result.residuals.length >= 3) {
          result.assumptions.shapiroWilkResult = performShapiroWilk(result.residuals, alpha);
        }
        // Bartlett's on treatment groups
        if (result.treatmentMeans) {
          const groups = {};
          const treatmentNames = Object.keys(result.treatmentMeans);
          treatmentNames.forEach(trt => { groups[trt] = []; });
          projectTrials.forEach(trial => {
            const trtName = trial.FormulationName;
            if (!groups[trtName]) return;
            const efficacy = safeJsonParse(trial.EfficacyDataJSON, []);
            const filtered = daa ? efficacy.filter(e => (e.daa || e.daysAfterApplication) === parseInt(daa)) : efficacy;
            filtered.forEach(obs => {
              const val = obs[metric] ?? obs.controlPct;
              if (val != null && !isNaN(val)) groups[trtName].push(Number(val));
            });
          });
          const nonEmpty = Object.fromEntries(Object.entries(groups).filter(([, v]) => v.length >= 2));
          if (Object.keys(nonEmpty).length >= 2) {
            result.assumptions.bartlettsResult = performBartlettsTest(nonEmpty, alpha);
          }
        }
      }
      
      setResults(result);
      setLoading(false);
    }, 100);
  }, [projectTrials, metric, alpha, test, daa, controlTreatment, covariateMetric, selectedMetaProjects, projects, trials, activeProject, excludeOutliers]);

  // Export results as CSV
  const exportResults = useCallback(() => {
    if (!results) return;
    
    let csv = 'Statistical Analysis Results\n';
    csv += `Project: ${test === 'meta' ? 'Multi-Project Combined Meta-Analysis' : (activeProject?.Name || 'Unknown')}\n`;
    csv += `Test: ${test.toUpperCase()}, Metric: ${metric}, Alpha: ${alpha}\n\n`;
    
    if (results.anovaTable) {
      csv += 'ANOVA/ANCOVA Table\n';
      csv += 'Source,SS,df,MS,F,p-value\n';
      results.anovaTable.source.forEach((src, i) => {
        csv += `${src},${results.anovaTable.ss[i]?.toFixed(4) || ''},${results.anovaTable.df[i] || ''},${results.anovaTable.ms[i]?.toFixed(4) || ''},${results.anovaTable.f[i]?.toFixed(4) || ''},${results.anovaTable.p[i]?.toFixed(6) || ''}\n`;
      });
    }
    
    if (results.comparisons) {
      csv += '\nPairwise Comparisons\n';
      if (test === 'tukey' || test === 'duncan') {
        csv += 'Treatment A,Treatment B,Mean A,Mean B,Difference,Significant,Critical Value\n';
        results.comparisons.forEach(c => {
          csv += `${c.treatmentA},${c.treatmentB},${c.meanA?.toFixed(2)},${c.meanB?.toFixed(2)},${c.difference?.toFixed(2)},${c.significant ? 'Yes' : 'No'},${(c.hsd || c.range)?.toFixed(2)}\n`;
        });
      } else if (test === 'dunnett') {
        csv += 'Treatment,Control,Mean Diff,% Change,Significant,DSD\n';
        results.comparisons.forEach(c => {
          csv += `${c.treatment},${c.control},${c.difference?.toFixed(2)},${c.percentChange},${c.significant ? 'Yes' : 'No'},${c.dsd?.toFixed(2)}\n`;
        });
      }
    }
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stats_analysis_${test === 'meta' ? 'meta' : (activeProject?.Name || 'project')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [results, test, metric, alpha, activeProject]);

  // Task 17: Export PDF handler
  const handleExportPDF = useCallback(async () => {
    if (!results || results.error) return;
    setExportingPDF(true);
    try {
      await exportStatsPDF(results, {
        category: activeCategory,
        projectName: activeProject?.Name || 'Project',
        metric,
        alpha,
        daa,
        test,
      });
    } finally {
      setExportingPDF(false);
    }
  }, [results, activeProject, metric, alpha, daa, test]);

  // Task 17: Export Excel handler
  const handleExportExcel = useCallback(async () => {
    if (!results || results.error) return;
    setExportingExcel(true);
    try {
      await exportStatsExcel(results, {
        category: activeCategory,
        projectName: activeProject?.Name || 'Project',
        metric,
        alpha,
        daa,
        test,
      });
    } finally {
      setExportingExcel(false);
    }
  }, [results, activeProject, metric, alpha, daa, test]);

  // Task 21: Tier classification helper
  function getTier(mean, metricKey) {
    const pctMetrics = ['controlPct', 'weedCover', 'diseaseSeverity', 'pestCount'];
    if (!pctMetrics.some(m => metricKey?.toLowerCase().includes(m.toLowerCase()))) return null;
    if (mean >= 80) return { label: 'Excellent', color: 'bg-emerald-100 text-emerald-700' };
    if (mean >= 60) return { label: 'Good',      color: 'bg-yellow-100 text-yellow-700' };
    if (mean >= 40) return { label: 'Fair',       color: 'bg-orange-100 text-orange-700' };
    return { label: 'Poor', color: 'bg-red-100 text-red-700' };
  }

  // Task 22: Pearson correlation helper
  function pearsonR(xs, ys) {
    const n = xs.length;
    if (n < 3) return { r: null, p: null };
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    const num = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
    const dx = Math.sqrt(xs.reduce((s, x) => s + (x - mx) ** 2, 0));
    const dy = Math.sqrt(ys.reduce((s, y) => s + (y - my) ** 2, 0));
    if (dx === 0 || dy === 0) return { r: null, p: null };
    const r = num / (dx * dy);
    // t-statistic for significance
    const t = r * Math.sqrt((n - 2) / Math.max(1e-12, 1 - r * r));
    // two-tailed p via normal approximation for large n
    const z = Math.abs(t) / Math.sqrt(1 + t * t / (n - 2));
    const p = 2 * (1 - (0.5 * (1 + Math.erf ? Math.erf(z / Math.SQRT2) : (1 - Math.exp(-0.717 * z - 0.416 * z * z)))));
    return { r: Math.max(-1, Math.min(1, r)), p: Math.max(0, Math.min(1, p)) };
  }

  const handleMetaProjectToggle = (id) => {
    setSelectedMetaProjects(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
    setResults(null);
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-slate-800 flex items-center gap-3">
          <Calculator className="w-8 h-8 text-emerald-600" />
          Statistical Analysis
        </h1>
        <p className="text-slate-600 mt-1">
          Advanced ANOVA, Tukey HSD, and Dunnett's tests for RCBD trials
        </p>
      </div>

      {/* Configuration Panel */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 md:p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Project Selection / Meta Selection */}
          {test === 'meta' ? (
            <div className="col-span-1 md:col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                Select Projects for Meta-Analysis (Min 2)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-32 overflow-y-auto border border-slate-200 rounded-lg p-2 bg-slate-50">
                {projects.map(p => (
                  <label key={p.ID} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer hover:bg-slate-100 p-1 rounded">
                    <input 
                      type="checkbox" 
                      checked={selectedMetaProjects.includes(p.ID)}
                      onChange={() => handleMetaProjectToggle(p.ID)}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="truncate">{p.Name}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                Select Project
              </label>
              <select
                value={selectedProject}
                onChange={(e) => { setSelectedProject(e.target.value); setResults(null); }}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
              >
                <option value="">-- Choose Project --</option>
                {projects.map(p => (
                  <option key={p.ID} value={p.ID}>{p.Name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Statistical Test */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              Statistical Test
            </label>
            <select
              value={test}
              onChange={(e) => { setTest(e.target.value); setResults(null); }}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
            >
              <optgroup label="Basic Tests">
                <option value="anova">ANOVA (F-test)</option>
                <option value="typeIII">Approximate Type III ANOVA (Unbalanced)</option>
                <option value="kruskal">Kruskal-Wallis (Non-Parametric)</option>
              </optgroup>
              <optgroup label="Post-Hoc Comparisons">
                <option value="tukey">Tukey HSD (All Pairs)</option>
                <option value="duncan">Duncan's MRT (Step-wise Ranked)</option>
                <option value="dunnett">Dunnett's Test (vs Control)</option>
                <option value="snk">Student-Newman-Keuls (SNK)</option>
                <option value="bonferroni">Bonferroni Correction</option>
              </optgroup>
              <optgroup label="Advanced Designs">
                <option value="splitplot">Split-Plot ANOVA (Factorial)</option>
                <option value="repeated">Repeated Measures (Time-Series)</option>
                <option value="mixed">Mixed Effects Model (REML)</option>
              </optgroup>
              <optgroup label="Specialized">
                <option value="ancova">ANCOVA (Covariate Adjustment)</option>
                <option value="doseresp">Dose-Response (ED50/IC50)</option>
                <option value="meta">Combined Meta-Analysis (Multi-Project)</option>
                <option value="power">Power Analysis (Sample Size)</option>
              </optgroup>
            </select>
          </div>

          {/* Metric */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              Metric
            </label>
            <select
              value={metric}
              onChange={(e) => { setMetric(e.target.value); setResults(null); }}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
            >
              {activeCategory === 'herbicide' && (
                <>
                  <option value="controlPct">Weed Control % (WCE)</option>
                  <option value="weedCover">Weed Cover %</option>
                  <option value="yield">Yield</option>
                </>
              )}
              {activeCategory === 'fungicide' && (
                <>
                  <option value="controlPct">Disease Control % (DCE)</option>
                  <option value="diseaseSeverity">Disease Severity %</option>
                  <option value="yield">Yield</option>
                </>
              )}
              {activeCategory === 'pesticide' && (
                <>
                  <option value="controlPct">Pest Reduction % (PRE)</option>
                  <option value="pestCount">Pest Count</option>
                  <option value="yield">Yield</option>
                </>
              )}
              {activeCategory === 'nutrition' && (
                <>
                  <option value="yield">Yield Improvement %</option>
                  <option value="chlorophyllIndex">Chlorophyll Index (SPAD)</option>
                  <option value="plantHeight">Plant Height (cm)</option>
                </>
              )}
              {activeCategory === 'biostimulant' && (
                <>
                  <option value="plantHeight">Plant Height (cm)</option>
                  <option value="rootBiomass">Root Biomass (g)</option>
                  <option value="shootBiomass">Shoot Biomass (g)</option>
                  <option value="chlorophyllIndex">Chlorophyll Index (SPAD)</option>
                </>
              )}
            </select>
          </div>

          {/* Covariate Selection (ANCOVA only) or DAA Timing Selection */}
          {test === 'ancova' ? (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                Covariate Factor (X)
              </label>
              <select
                value={covariateMetric}
                onChange={(e) => { setCovariateMetric(e.target.value); setResults(null); }}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
              >
                <option value="Temperature">Temperature (°C)</option>
                <option value="Humidity">Humidity (%)</option>
                <option value="Windspeed">Wind Speed (km/h)</option>
                <option value="Rain">Rainfall (mm)</option>
                {/* Task 59: Show SoilPH / SoilClay only when data exists in project trials */}
                {projectTrials.some(t => t.SoilPH != null && t.SoilPH !== '') && (
                  <option value="SoilPH">Soil pH</option>
                )}
                {projectTrials.some(t => t.SoilClay != null && t.SoilClay !== '') && (
                  <option value="SoilClay">Soil Clay %</option>
                )}
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                Observation Timing (DAA)
              </label>
              <select
                value={daa}
                onChange={(e) => { setDaa(e.target.value); setResults(null); }}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
              >
                <option value="">All Observations</option>
                {availableDAAs.map(d => (
                  <option key={d} value={d}>{d} DAA</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Alpha Level & Outliers */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <label className="text-sm font-semibold text-slate-700">Significance Level (α):</label>
            <div className="flex gap-2">
              {[0.01, 0.05, 0.10].map(a => (
                <button
                  key={a}
                  onClick={() => { setAlpha(a); setResults(null); }}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition ${
                    alpha === a 
                      ? 'bg-emerald-100 text-emerald-700 border-2 border-emerald-500' 
                      : 'bg-slate-100 text-slate-600 border-2 border-transparent hover:bg-slate-200'
                  }`}
                >
                  {a === 0.01 ? '1%' : a === 0.05 ? '5%' : '10%'}
                </button>
              ))}
            </div>
          </div>
          
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 cursor-pointer">
            <input 
              type="checkbox"
              checked={excludeOutliers}
              onChange={(e) => { setExcludeOutliers(e.target.checked); setResults(null); }}
              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4"
            />
            <span>Exclude Outliers (Z &gt; 2.5)</span>
          </label>
        </div>

        {/* Run Button */}
        <div className="mt-4 flex gap-3">
          <button
            onClick={runAnalysis}
            disabled={((!selectedProject && test !== 'meta') || (test === 'meta' && selectedMetaProjects.length < 2)) || projectTrials.length === 0 || loading}
            className="bg-emerald-600 text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-emerald-700 transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Calculator className="w-4 h-4" />
            {loading ? 'Calculating...' : 'Run Analysis'}
          </button>
          
          {results && (
            <button
              onClick={exportResults}
              className="bg-slate-100 text-slate-700 px-4 py-2.5 rounded-lg font-medium hover:bg-slate-200 transition flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          )}
          {results && !results.error && (
            <button
              onClick={handleExportPDF}
              disabled={exportingPDF}
              className="bg-rose-50 text-rose-700 px-4 py-2.5 rounded-lg font-medium hover:bg-rose-100 transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              {exportingPDF ? 'Exporting...' : 'Export PDF'}
            </button>
          )}
          {results && !results.error && (
            <button
              onClick={handleExportExcel}
              disabled={exportingExcel}
              className="bg-emerald-50 text-emerald-700 px-4 py-2.5 rounded-lg font-medium hover:bg-emerald-100 transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              {exportingExcel ? 'Exporting...' : 'Export Excel'}
            </button>
          )}
        </div>
      </div>

      {/* Task 20: Power Analysis Panel — shown when test === 'power' */}
      {test === 'power' && (() => {
        // Pre-populate k from projectTrials treatment count
        const treatmentCount = projectTrials.length > 0
          ? new Set(projectTrials.map(t => t.FormulationName)).size
          : powerK;

        // Live-compute power result
        const powerResult = calculatePower({
          alpha,
          effectSize: powerEffectSize,
          nPerGroup: powerN,
          kGroups: treatmentCount || powerK,
          targetPower: powerTargetPower,
        });

        const powerBadgeColor =
          powerResult.achievedPower >= 0.90 ? 'bg-emerald-100 text-emerald-700' :
          powerResult.achievedPower >= 0.80 ? 'bg-blue-100 text-blue-700' :
          powerResult.achievedPower >= 0.70 ? 'bg-amber-100 text-amber-700' :
                                               'bg-rose-100 text-rose-700';

        const interpBadgeColor =
          powerResult.interpretation === 'Excellent' ? 'bg-emerald-100 text-emerald-700' :
          powerResult.interpretation === 'Good'      ? 'bg-blue-100 text-blue-700' :
          powerResult.interpretation === 'Acceptable'? 'bg-amber-100 text-amber-700' :
                                                        'bg-rose-100 text-rose-700';

        return (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 md:p-6 space-y-4">
            <h3 className="font-bold text-slate-800 flex items-center gap-2 text-base border-b border-slate-100 pb-2">
              <Zap className="w-5 h-5 text-purple-600" /> Power Analysis — Sample Size Calculator
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
              {/* k */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Treatments (k)
                </label>
                <input
                  type="number"
                  min={2}
                  value={treatmentCount || powerK}
                  onChange={(e) => setPowerK(Math.max(2, parseInt(e.target.value) || 2))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-400"
                  readOnly={treatmentCount > 0}
                />
                {treatmentCount > 0 && (
                  <p className="text-[10px] text-slate-400 mt-0.5">Auto-detected from project</p>
                )}
              </div>
              {/* n */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Reps per Treatment (n)
                </label>
                <input
                  type="number"
                  min={2}
                  value={powerN}
                  onChange={(e) => setPowerN(Math.max(2, parseInt(e.target.value) || 2))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-400"
                />
              </div>
              {/* Effect size */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Effect Size (Cohen's f)
                </label>
                <input
                  type="number"
                  min={0.01}
                  max={2}
                  step={0.05}
                  value={powerEffectSize}
                  onChange={(e) => setPowerEffectSize(Math.max(0.01, parseFloat(e.target.value) || 0.1))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-400"
                />
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {powerResult.effectSizeLabel?.label} ({powerResult.effectSizeLabel?.convention})
                </p>
              </div>
              {/* Target power */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Target Power
                </label>
                <div className="flex gap-2 flex-wrap">
                  {[0.70, 0.80, 0.90].map(tp => (
                    <label key={tp} className="flex items-center gap-1 text-xs cursor-pointer">
                      <input
                        type="radio"
                        name="targetPower"
                        value={tp}
                        checked={powerTargetPower === tp}
                        onChange={() => setPowerTargetPower(tp)}
                        className="text-purple-600"
                      />
                      {Math.round(tp * 100)}%
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Results row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                <span className="text-[10px] font-semibold text-slate-500 uppercase block">Achieved Power</span>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-2xl font-bold text-slate-800">
                    {(powerResult.achievedPower * 100).toFixed(1)}%
                  </span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${powerBadgeColor}`}>
                    {powerResult.interpretation}
                  </span>
                </div>
              </div>
              <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                <span className="text-[10px] font-semibold text-slate-500 uppercase block">
                  Min n for {Math.round(powerTargetPower * 100)}% Power
                </span>
                <span className="text-2xl font-bold text-slate-800 block mt-1">
                  {powerResult.minNForTarget} per group
                </span>
                <span className="text-[10px] text-slate-400">
                  ({powerResult.minNForTarget * (treatmentCount || powerK)} total plots)
                </span>
              </div>
              <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                <span className="text-[10px] font-semibold text-slate-500 uppercase block">Interpretation</span>
                <span className={`inline-block text-xs font-semibold px-2 py-1 rounded-full mt-1 ${interpBadgeColor}`}>
                  {powerResult.interpretation}
                </span>
                <p className="text-[10px] text-slate-500 mt-1">
                  F-critical: {powerResult.fCritical?.toFixed(3)} | λ = {powerResult.lambda?.toFixed(2)}
                </p>
              </div>
            </div>

            {/* Power curve chart */}
            <PowerAnalysisPanel
              powerCurve={powerResult.powerCurve}
              targetPower={powerTargetPower}
              minNForTarget={powerResult.minNForTarget}
            />
          </div>
        );
      })()}

      {/* Results Display */}
      {results && (
        <div className="space-y-6">
          {results.balanceWarning && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Unbalanced Design Alert:</span>
                <p className="text-sm mt-1">{results.balanceWarning}</p>
                {test !== 'typeIII' && (
                  <p className="text-xs text-amber-700 mt-2 font-medium">
                    Recommendation: Switch the statistical test to <strong>Approximate Type III ANOVA</strong> to resolve statistical bias and control type I error rates.
                  </p>
                )}
              </div>
            </div>
          )}

          {results.detectedOutliers && results.detectedOutliers.length > 0 && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-semibold text-sm">⚠ Potential Outliers Detected ({results.detectedOutliers.length})</span>
                <p className="text-xs text-rose-700 mt-1">
                  The following observations deviate significantly from their treatment averages (|Z| &gt; 2.5). They are currently {excludeOutliers ? 'excluded from' : 'included in'} the calculation. Toggle "Exclude Outliers" above to {excludeOutliers ? 'include' : 'exclude'} them.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 mt-3 max-h-32 overflow-y-auto">
                  {results.detectedOutliers.map((o, idx) => (
                    <div key={idx} className="bg-white/85 p-2 rounded border border-rose-100 text-[10px] space-y-0.5">
                      <p className="font-bold text-slate-700 truncate">{o.treatment}</p>
                      <p className="text-slate-500">Rep/Block: <span className="font-medium text-slate-700">{o.block}</span></p>
                      <p className="text-slate-500">Value: <span className="font-bold text-rose-700">{o.value}</span> | Z-Score: <span className="font-bold text-rose-700">{o.zScore.toFixed(2)}</span></p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Experimental Precision & Assumptions Report */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Precision card */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 lg:col-span-2 space-y-3 shadow-sm">
              <h4 className="font-bold text-slate-800 flex items-center gap-2 text-sm border-b border-slate-100 pb-2">
                <CheckCircle className="w-4 h-4 text-emerald-600" /> Experimental Precision & Quality Report
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 relative group">
                  <span className="text-slate-500 text-[9px] font-semibold block uppercase cursor-help flex items-center gap-1">
                    CV% (Coeff. Var)
                    <Info className="w-2.5 h-2.5 text-slate-400" />
                  </span>
                  <span className="text-md font-bold text-slate-800 block mt-0.5">
                    {results.cv !== undefined ? `${results.cv.toFixed(2)}%` : 'N/A'}
                  </span>
                  {results.cv !== undefined && (
                    <span className={`text-[10px] font-semibold block mt-0.5 ${
                      results.cv < 10 ? 'text-emerald-600' :
                      results.cv <= 20 ? 'text-blue-600' :
                      results.cv <= 30 ? 'text-amber-600' : 'text-rose-600'
                    }`}>
                      {results.cv < 10 ? 'Excellent' :
                       results.cv <= 20 ? 'Good' :
                       results.cv <= 30 ? 'Fair' : 'Poor'}
                    </span>
                  )}
                  {/* Tooltip */}
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-48 bg-slate-800 text-white text-[9px] rounded p-2 opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-200 shadow-md z-10 leading-normal">
                    <p className="font-bold border-b border-slate-700 pb-1 mb-1">Experimental Precision:</p>
                    <p>• &lt; 10%: Excellent precision</p>
                    <p>• 10–20%: Good precision</p>
                    <p>• 20–30%: Fair precision</p>
                    <p>• &gt; 30%: Poor precision</p>
                  </div>
                </div>

                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  <span className="text-slate-500 text-[9px] font-semibold block uppercase">SEm± (Std Error)</span>
                  <span className="text-md font-bold text-slate-800 block mt-0.5">
                    {results.semGlobal !== undefined ? `±${results.semGlobal.toFixed(3)}` : 'N/A'}
                  </span>
                </div>

                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  <span className="text-slate-500 text-[9px] font-semibold block uppercase">CD / LSD (5%)</span>
                  <span className="text-md font-bold text-slate-800 block mt-0.5">
                    {results.cd5 !== undefined ? `${results.cd5.toFixed(2)}` : 'N/A'}
                  </span>
                </div>

                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  <span className="text-slate-500 text-[9px] font-semibold block uppercase">CD / LSD (1%)</span>
                  <span className="text-md font-bold text-slate-800 block mt-0.5">
                    {results.cd1 !== undefined ? `${results.cd1.toFixed(2)}` : 'N/A'}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                <div>
                  <span className="text-slate-500 text-[9px] font-semibold block uppercase">Design Balance</span>
                  <span className="text-[11px] font-bold text-slate-700 block mt-0.5">
                    {results.balanceWarning ? 'Unbalanced' : 'Balanced'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 text-[9px] font-semibold block uppercase">Layout (Trts × Reps)</span>
                  <span className="text-[11px] font-bold text-slate-700 block mt-0.5">
                    {results.treatments ? `${results.treatments.length} Treatments` : 'N/A'} × {results.blocks ? `${results.blocks.length} Replications` : 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 text-[9px] font-semibold block uppercase">Total Plots</span>
                  <span className="text-[11px] font-bold text-slate-700 block mt-0.5">
                    {results.trtRepCounts ? `${Object.values(results.trtRepCounts).reduce((a, b) => a + b, 0)} Plots` : '0 Plots'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 text-[9px] font-semibold block uppercase">Outliers (Flagged / Excl)</span>
                  <span className="text-[11px] font-bold text-slate-700 block mt-0.5">
                    {results.detectedOutliers && results.detectedOutliers.length > 0
                      ? `${results.detectedOutliers.length} Flagged / ${excludeOutliers ? 'Yes' : 'No'}`
                      : 'None / No'}
                  </span>
                </div>
              </div>
            </div>

            {/* Assumptions verification card */}
            {results.assumptions ? (
              <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2.5 shadow-sm">
                <h4 className="font-bold text-slate-800 flex items-center gap-2 text-sm border-b border-slate-100 pb-2">
                  <Info className="w-4 h-4 text-blue-600" /> Assumptions Validation
                </h4>
                {/* 4-test compact table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-[10px]">
                    <thead>
                      <tr className="text-slate-500 font-semibold uppercase border-b border-slate-100">
                        <th className="text-left pb-1 pr-2">Test</th>
                        <th className="text-center pb-1 px-1">Result</th>
                        <th className="text-right pb-1">p</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {/* Jarque-Bera */}
                      <tr className="py-1">
                        <td className="py-1 pr-2 font-medium text-slate-700">Jarque-Bera</td>
                        <td className="py-1 px-1 text-center">
                          {results.assumptions.normalityPassed
                            ? <span className="text-emerald-600 font-bold">✓</span>
                            : <span className="text-rose-600 font-bold">✗</span>}
                        </td>
                        <td className="py-1 text-right text-slate-500">{results.assumptions.normalityP?.toFixed(4) ?? '—'}</td>
                      </tr>
                      {/* Shapiro-Wilk */}
                      <tr>
                        <td className="py-1 pr-2 font-medium text-slate-700">Shapiro-Wilk</td>
                        <td className="py-1 px-1 text-center">
                          {results.assumptions.shapiroWilkResult
                            ? results.assumptions.shapiroWilkResult.passed
                              ? <span className="text-emerald-600 font-bold">✓</span>
                              : <span className="text-rose-600 font-bold">✗</span>
                            : <span className="text-slate-400">—</span>}
                        </td>
                        <td className="py-1 text-right text-slate-500">
                          {results.assumptions.shapiroWilkResult?.pValue?.toFixed(4) ?? '—'}
                        </td>
                      </tr>
                      {/* Levene's */}
                      <tr>
                        <td className="py-1 pr-2 font-medium text-slate-700">Levene's</td>
                        <td className="py-1 px-1 text-center">
                          {results.assumptions.variancePassed
                            ? <span className="text-emerald-600 font-bold">✓</span>
                            : <span className="text-rose-600 font-bold">✗</span>}
                        </td>
                        <td className="py-1 text-right text-slate-500">{results.assumptions.varianceP?.toFixed(4) ?? '—'}</td>
                      </tr>
                      {/* Bartlett's */}
                      <tr>
                        <td className="py-1 pr-2 font-medium text-slate-700">Bartlett's</td>
                        <td className="py-1 px-1 text-center">
                          {results.assumptions.bartlettsResult
                            ? results.assumptions.bartlettsResult.passed
                              ? <span className="text-emerald-600 font-bold">✓</span>
                              : <span className="text-rose-600 font-bold">✗</span>
                            : <span className="text-slate-400">—</span>}
                        </td>
                        <td className="py-1 text-right text-slate-500">
                          {results.assumptions.bartlettsResult?.pValue?.toFixed(4) ?? '—'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                {/* Advisories */}
                {(() => {
                  const jbPassed = results.assumptions.normalityPassed;
                  const swResult = results.assumptions.shapiroWilkResult;
                  const swPassed = swResult ? swResult.passed : null;
                  const levPassed = results.assumptions.variancePassed;
                  const bartResult = results.assumptions.bartlettsResult;
                  const bartPassed = bartResult ? bartResult.passed : null;
                  const advisories = [];
                  // Normality tests disagree
                  if (swPassed != null && jbPassed !== swPassed) {
                    advisories.push('Normality tests disagree — consider Kruskal-Wallis');
                  }
                  // Both variance tests fail
                  if (!levPassed && bartPassed === false) {
                    advisories.push('Both variance tests indicate heteroscedasticity — consider Welch correction or data transformation');
                  }
                  if (advisories.length === 0) return null;
                  return (
                    <div className="mt-2 space-y-1.5">
                      {advisories.map((msg, i) => (
                        <div key={i} className="flex items-start gap-1.5 bg-amber-50 border border-amber-200 rounded p-1.5 text-[10px] text-amber-800">
                          <AlertCircle className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                          <span>{msg}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="bg-white p-4 rounded-xl border border-slate-200 flex items-center justify-center text-slate-400 text-xs shadow-sm">
                No assumption validation available for this test type.
              </div>
            )}
          </div>

          {/* Task 22: Correlation Panel */}
          {results?.assumptions && projectTrials.length > 0 && (() => {
            // Available numeric metrics from project trials
            const allMetrics = ['controlPct', 'weedCover', 'diseaseSeverity', 'pestCount', 'yield', 'plantHeight', 'chlorophyllIndex', 'rootBiomass', 'shootBiomass'];
            // Gather primary metric values across all trials (flattened)
            const collectValues = (m) => {
              const vals = [];
              projectTrials.forEach(trial => {
                const efficacy = safeJsonParse(trial.EfficacyDataJSON, []);
                const filtered = daa ? efficacy.filter(e => (e.daa || e.daysAfterApplication) === parseInt(daa)) : efficacy;
                filtered.forEach(obs => {
                  const v = obs[m] ?? obs.controlPct;
                  if (v != null && !isNaN(v)) vals.push(Number(v));
                });
              });
              return vals;
            };
            const primaryVals = collectValues(metric);
            if (primaryVals.length < 3) return null;

            const correlations = allMetrics
              .filter(m => m !== metric)
              .map(m => {
                const otherVals = collectValues(m);
                if (otherVals.length < 3) return null;
                const n = Math.min(primaryVals.length, otherVals.length);
                const { r, p } = pearsonR(primaryVals.slice(0, n), otherVals.slice(0, n));
                if (r == null) return null;
                const stars = p < 0.01 ? '**' : p < 0.05 ? '*' : '';
                return { metricA: metric, metricB: m, r, p, stars, n };
              })
              .filter(Boolean);

            if (correlations.length === 0) return null;

            return (
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <h4 className="font-bold text-slate-800 flex items-center gap-2 text-sm border-b border-slate-100 pb-2 mb-3">
                  <Activity className="w-4 h-4 text-indigo-600" /> Metric Correlations
                  <span className="text-[10px] font-normal text-slate-400 ml-1">(Pearson r · ** p&lt;0.01, * p&lt;0.05)</span>
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-slate-500 font-semibold uppercase text-[9px] border-b border-slate-100">
                        <th className="text-left pb-1.5 pr-3">Metric Pair</th>
                        <th className="text-right pb-1.5 px-3">r</th>
                        <th className="text-right pb-1.5 px-3">p</th>
                        <th className="text-right pb-1.5">Sig.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {correlations.map(({ metricA, metricB, r, p, stars }, i) => (
                        <tr key={i}>
                          <td className="py-1.5 pr-3 font-medium text-slate-700">
                            {metricA} × {metricB}
                          </td>
                          <td className={`py-1.5 px-3 text-right font-bold ${Math.abs(r) >= 0.7 ? 'text-purple-600' : Math.abs(r) >= 0.4 ? 'text-blue-600' : 'text-slate-500'}`}>
                            {r.toFixed(3)}
                          </td>
                          <td className="py-1.5 px-3 text-right text-slate-500">{p.toFixed(4)}</td>
                          <td className="py-1.5 text-right font-bold text-amber-600">{stars || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

          {/* Effect Sizes Card */}
          {results.effectSizes && (            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <h4 className="font-bold text-slate-800 flex items-center gap-2 text-sm border-b border-slate-100 pb-2 mb-3">
                <TrendingUp className="w-4 h-4 text-purple-600" /> Effect Sizes & Confidence Intervals
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div className="bg-purple-50 p-2.5 rounded-lg border border-purple-100">
                  <span className="text-purple-600 font-semibold block text-[10px]">Eta-squared (η²)</span>
                  <span className="text-lg font-bold text-slate-800">{results.effectSizes.etaSquared?.toFixed(4)}</span>
                  <span className={`text-[10px] font-medium block ${results.effectSizes.interpretation?.etaSquared === 'Large' ? 'text-purple-600' : 'text-slate-500'}`}>
                    {results.effectSizes.interpretation?.etaSquared}
                  </span>
                </div>
                <div className="bg-purple-50 p-2.5 rounded-lg border border-purple-100">
                  <span className="text-purple-600 font-semibold block text-[10px]">Omega-squared (ω²)</span>
                  <span className="text-lg font-bold text-slate-800">{results.effectSizes.omegaSquared?.toFixed(4)}</span>
                  <span className={`text-[10px] font-medium block ${results.effectSizes.interpretation?.omegaSquared === 'Large' ? 'text-purple-600' : 'text-slate-500'}`}>
                    {results.effectSizes.interpretation?.omegaSquared}
                  </span>
                </div>
                <div className="bg-purple-50 p-2.5 rounded-lg border border-purple-100">
                  <span className="text-purple-600 font-semibold block text-[10px]">Cohen's f</span>
                  <span className="text-lg font-bold text-slate-800">{results.effectSizes.cohensF?.toFixed(4)}</span>
                  <span className="text-[10px] font-medium text-slate-500">
                    {results.effectSizes.cohensConvention}
                  </span>
                </div>
                <div className="bg-purple-50 p-2.5 rounded-lg border border-purple-100">
                  <span className="text-purple-600 font-semibold block text-[10px]">Partial η²</span>
                  <span className="text-lg font-bold text-slate-800">{results.effectSizes.partialEtaSquared?.toFixed(4)}</span>
                  <span className="text-[10px] font-medium text-slate-500">
                    Variance explained
                  </span>
                </div>
              </div>
              
              {/* Confidence Intervals */}
              {results.confidenceIntervals && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <span className="text-xs font-semibold text-slate-600 block mb-2">95% Confidence Intervals (Treatment Means)</span>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {Object.entries(results.confidenceIntervals).slice(0, 8).map(([trt, data]) => (
                      <div key={trt} className="flex justify-between text-xs items-center">
                        <span className="font-medium text-slate-700 truncate max-w-[120px]" title={trt}>{trt}</span>
                        <span className="text-slate-600">
                          {data.mean?.toFixed(2)} [{data.ci95?.lower?.toFixed(1)} - {data.ci95?.upper?.toFixed(1)}]
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className={`p-4 rounded-xl border-2 ${results.significant ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
              <div className="flex items-center gap-2 mb-2">
                {results.significant ? (
                  <CheckCircle className="w-5 h-5 text-emerald-600" />
                ) : (
                  <Info className="w-5 h-5 text-slate-500" />
                )}
                <span className="font-semibold text-slate-700">Result</span>
              </div>
              <p className="text-2xl font-bold text-slate-800">
                {results.significant ? 'Significant' : 'Not Significant'}
              </p>
              <p className="text-sm text-slate-500 mt-1">
                {test === 'kruskal' ? `H = ${results.statistic?.toFixed(3)}` : `F = ${results.fStatistic?.toFixed(3)}`}, p = {results.pValue?.toFixed(4)}
              </p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <div className="flex items-center gap-2 mb-2">
                <Table2 className="w-5 h-5 text-blue-500" />
                <span className="font-semibold text-slate-700">Treatments</span>
              </div>
              <p className="text-2xl font-bold text-slate-800">
                {results.treatmentMeans ? Object.keys(results.treatmentMeans).length : 0}
              </p>
              <p className="text-sm text-slate-500 mt-1">
                {test === 'meta' ? 'Multi-location analysis' : test === 'kruskal' ? `Sample sizes: ${results.counts ? Object.entries(results.counts).map(([k,v])=>`${k}:${v}`).join(', ') : 'N/A'}` : `${results.blocks?.length || 0} replications per treatment`}
              </p>
            </div>

            {results.hsd && (
              <div className="bg-white p-4 rounded-xl border border-slate-200">
                <div className="flex items-center gap-2 mb-2">
                  <BarChart3 className="w-5 h-5 text-purple-500" />
                  <span className="font-semibold text-slate-700">Tukey HSD</span>
                </div>
                <p className="text-2xl font-bold text-slate-800">
                  ±{results.hsd?.toFixed(2)}
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  q = {results.qCritical?.toFixed(3)}, α = {alpha}
                </p>
              </div>
            )}

            {test === 'duncan' && (
              <div className="bg-white p-4 rounded-xl border border-slate-200">
                <div className="flex items-center gap-2 mb-2">
                  <BarChart3 className="w-5 h-5 text-purple-500" />
                  <span className="font-semibold text-slate-700">Duncan's MRT</span>
                </div>
                <p className="text-md font-bold text-slate-800">
                  Step Ranges: {Object.entries(results.criticalRanges || {}).map(([p, r]) => `p=${p}: ±${r.toFixed(1)}`).join(', ')}
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  α = {alpha}
                </p>
              </div>
            )}

            {results.dsd && (
              <div className="bg-white p-4 rounded-xl border border-slate-200">
                <div className="flex items-center gap-2 mb-2">
                  <BarChart3 className="w-5 h-5 text-orange-500" />
                  <span className="font-semibold text-slate-700">Dunnett DSD</span>
                </div>
                <p className="text-2xl font-bold text-slate-800">
                  ±{results.dsd?.toFixed(2)}
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  Control: {controlTreatment}
                </p>
              </div>
            )}

            {test === 'ancova' && (
              <div className="bg-white p-4 rounded-xl border border-slate-200">
                <div className="flex items-center gap-2 mb-2">
                  <BarChart3 className="w-5 h-5 text-indigo-500" />
                  <span className="font-semibold text-slate-700">Covariate Control</span>
                </div>
                <p className="text-2xl font-bold text-slate-800">
                  β = {results.beta?.toFixed(3)}
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  Covariate Mean: {results.covariateMean?.toFixed(2)}
                </p>
              </div>
            )}

            {test === 'meta' && (
              <div className="bg-white p-4 rounded-xl border border-slate-200">
                <div className="flex items-center gap-2 mb-2">
                  <BarChart3 className="w-5 h-5 text-teal-500" />
                  <span className="font-semibold text-slate-700">Meta-Analysis</span>
                </div>
                <p className="text-2xl font-bold text-slate-800">
                  {selectedMetaProjects.length} Projects
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  Combined Location Analysis
                </p>
              </div>
            )}
          </div>

          {/* ANOVA Table */}
          {results.anovaTable && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                  <Table2 className="w-5 h-5 text-emerald-600" />
                  {test === 'ancova' ? 'ANCOVA Table' : 'ANOVA Table'}
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Source</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-700">SS</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-700">df</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-700">MS</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-700">F</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-700">p-value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.anovaTable.source.map((src, i) => (
                      <tr key={src} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                        <td className="px-4 py-3 font-medium text-slate-800">{src}</td>
                        <td className="px-4 py-3 text-right text-slate-600">
                          {results.anovaTable.ss[i]?.toFixed(3) || '-'}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600">
                          {results.anovaTable.df[i] || '-'}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600">
                          {results.anovaTable.ms[i]?.toFixed(3) || '-'}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600">
                          {results.anovaTable.f[i]?.toFixed(3) || '-'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {results.anovaTable.p[i] !== null && results.anovaTable.p[i] !== undefined ? (
                            <span className={`font-semibold ${results.anovaTable.p[i] < alpha ? 'text-emerald-600' : 'text-slate-600'}`}>
                              {results.anovaTable.p[i].toFixed(4)}
                              {results.anovaTable.p[i] < alpha && ' *'}
                            </span>
                          ) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Treatment Means */}
          {results.treatmentMeans && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                <h3 className="font-semibold text-slate-800">
                  Treatment Means {test === 'ancova' ? '(Adjusted for Covariate)' : `(${results.test || test})`}
                </h3>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {Object.entries(results.treatmentMeans).map(([trt, mean], rankIdx) => {
                    const unadj = results.unadjustedMeans?.[trt];
                    // Task 21: Tier badge
                    const tier = getTier(mean, metric);
                    const sortedMeans = Object.entries(results.treatmentMeans).sort((a, b) => b[1] - a[1]);
                    const rank = sortedMeans.findIndex(([t]) => t === trt) + 1;
                    return (
                      <div key={trt} className="bg-slate-50 p-3 rounded-lg flex flex-col justify-between">
                        <p className="text-xs text-slate-500 truncate mb-1" title={trt}>{trt}</p>
                        <div className="flex flex-col gap-1">
                          <div className="flex items-baseline justify-between">
                            <span className="text-lg font-bold text-slate-800">
                              {mean.toFixed(2)}
                              {test === 'ancova' && <span className="text-xs font-normal text-slate-500 ml-1">(Adj)</span>}
                            </span>
                            {results.groups?.[trt] && (
                              <span className="text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded" title={`Significance Group: ${results.groups[trt]}`}>
                                {results.groups[trt]}
                              </span>
                            )}
                          </div>
                          {/* Tier badge (Task 21) */}
                          <div className="flex items-center gap-1 mt-0.5">
                            {tier ? (
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${tier.color}`}>
                                {tier.label}
                              </span>
                            ) : (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
                                #{rank}
                              </span>
                            )}
                          </div>
                          {test === 'ancova' && unadj && (
                            <div className="text-2xs text-slate-500 flex flex-col mt-1 pt-1 border-t border-slate-200/60">
                              <span>Unadj Mean: {unadj.meanY?.toFixed(2)}</span>
                              <span>Covariate Mean: {unadj.meanX?.toFixed(2)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Mean Separation Table */}
          {results.treatmentMeans && results.groups && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                  <Table2 className="w-5 h-5 text-emerald-600" />
                  Mean Separation Table (Tukey HSD)
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-2 text-left font-semibold text-slate-700">Treatment</th>
                      <th className="px-4 py-2 text-right font-semibold text-slate-700">Mean</th>
                      <th className="px-4 py-2 text-center font-semibold text-slate-700">Significance Letters</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(results.treatmentMeans)
                      .sort((a, b) => b[1] - a[1])
                      .map(([trt, mean], i) => (
                        <tr key={trt} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50 border-t border-slate-100'}>
                          <td className="px-4 py-2.5 font-medium text-slate-800">{trt}</td>
                          <td className="px-4 py-2.5 text-right font-bold text-slate-700">{mean.toFixed(2)}</td>
                          <td className="px-4 py-2.5 text-center">
                            <span className="inline-block text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded">
                              {results.groups[trt] || 'a'}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Pairwise Comparisons */}
          {results.comparisons && results.comparisons.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                <h3 className="font-semibold text-slate-800">
                  {test === 'tukey' ? 'Tukey HSD Pairwise Comparisons' : test === 'duncan' ? "Duncan's MRT Comparisons" : "Dunnett's Test Comparisons vs Control"}
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      {test === 'tukey' || test === 'duncan' ? (
                        <>
                          <th className="px-4 py-3 text-left font-semibold text-slate-700">Treatment A</th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-700">Treatment B</th>
                          <th className="px-4 py-3 text-right font-semibold text-slate-700">Mean A</th>
                          <th className="px-4 py-3 text-right font-semibold text-slate-700">Mean B</th>
                          <th className="px-4 py-3 text-right font-semibold text-slate-700">Difference</th>
                        </>
                      ) : (
                        <>
                          <th className="px-4 py-3 text-left font-semibold text-slate-700">Treatment</th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-700">vs Control</th>
                          <th className="px-4 py-3 text-right font-semibold text-slate-700">Mean Diff</th>
                          <th className="px-4 py-3 text-right font-semibold text-slate-700">% Change</th>
                        </>
                      )}
                      <th className="px-4 py-3 text-center font-semibold text-slate-700">Significant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.comparisons.map((comp, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                        {test === 'tukey' || test === 'duncan' ? (
                          <>
                            <td className="px-4 py-3 font-medium text-slate-800">{comp.treatmentA}</td>
                            <td className="px-4 py-3 font-medium text-slate-800">{comp.treatmentB}</td>
                            <td className="px-4 py-3 text-right text-slate-600">{comp.meanA?.toFixed(2)}</td>
                            <td className="px-4 py-3 text-right text-slate-600">{comp.meanB?.toFixed(2)}</td>
                            <td className="px-4 py-3 text-right text-slate-600">{comp.difference?.toFixed(2)}</td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-3 font-medium text-slate-800">{comp.treatment}</td>
                            <td className="px-4 py-3 text-slate-600">{comp.control}</td>
                            <td className="px-4 py-3 text-right text-slate-600">{comp.difference?.toFixed(2)}</td>
                            <td className="px-4 py-3 text-right text-slate-600">{comp.percentChange}%</td>
                          </>
                        )}
                        <td className="px-4 py-3 text-center">
                          {comp.significant ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold">
                              <CheckCircle className="w-4 h-4" /> Yes
                            </span>
                          ) : (
                            <span className="text-slate-400">No</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Legend */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-semibold mb-1">Interpretation Guide:</p>
              <ul className="space-y-1 list-disc list-inside">
                <li><strong>Significant (p &lt; α):</strong> At least one treatment differs significantly from others</li>
                <li><strong>Tukey HSD:</strong> Compares all pairs; differences &gt; HSD are significant</li>
                <li><strong>Dunnett's:</strong> Compares each treatment to control only (more powerful than Tukey for this case)</li>
                <li><strong>ANCOVA:</strong> Adjusts treatment means for the effect of the selected covariate (e.g. soil pH, temp) to reduce error variance.</li>
                <li><strong>Combined Meta-Analysis:</strong> Evaluates consistent treatment efficacy across multiple trial locations/projects and tests for Treatment x Location interactions.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!results && !loading && (
        <div className="bg-slate-50 rounded-xl border-2 border-dashed border-slate-200 p-12 text-center">
          <Calculator className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-700 mb-2">Ready to Analyze</h3>
          <p className="text-slate-500 max-w-md mx-auto">
            Select a project and configure your analysis parameters above, then click "Run Analysis" to perform statistical tests.
          </p>
        </div>
      )}
    </div>
  );
}
