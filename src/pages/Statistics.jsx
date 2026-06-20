import { useState, useMemo, useCallback, useEffect } from 'react';
import { useAppState } from '../hooks/useAppState.jsx';
import { performANOVA, performTukeyHSD, performDunnettTest, performDuncanMRT, performANCOVA, performMetaAnalysis, performTypeIIIANOVA, performKruskalWallis } from '../utils/statsUtils.js';
import { safeJsonParse } from '../utils/helpers.js';
import { 
  BarChart3, Calculator, ChevronDown, Download, 
  AlertCircle, CheckCircle, Info, Table2 
} from 'lucide-react';

export default function Statistics() {
  const { state } = useAppState();
  const activeCategory = state.activeCategory || 'herbicide';
  
  const projects = useMemo(() => {
    return (state.projects || []).filter(p => p.Category === activeCategory || (!p.Category && activeCategory === 'herbicide'));
  }, [state.projects, activeCategory]);
  
  const { trials } = state;
  
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedMetaProjects, setSelectedMetaProjects] = useState([]);
  const [metric, setMetric] = useState('controlPct');
  const [covariateMetric, setCovariateMetric] = useState('Temperature');
  const [test, setTest] = useState('anova'); // anova, typeIII, tukey, dunnett, ancova, meta
  const [alpha, setAlpha] = useState(0.05);
  const [daa, setDaa] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

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
    return (trials || []).filter(t => t.ProjectID === selectedProject);
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
        design: activeProject?.Design || 'RCBD'
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
        case 'anova':
        default:
          result = performANOVA(projectTrials, options);
          break;
      }
      
      setResults(result);
      setLoading(false);
    }, 100);
  }, [projectTrials, metric, alpha, test, daa, controlTreatment, covariateMetric, selectedMetaProjects, projects, trials, activeProject]);

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
              <option value="anova">ANOVA (F-test)</option>
              <option value="typeIII">Type III ANOVA (Unbalanced)</option>
              <option value="tukey">Tukey HSD (All Pairs)</option>
              <option value="duncan">Duncan's MRT (Step-wise Ranked)</option>
              <option value="dunnett">Dunnett's Test (vs Control)</option>
              <option value="ancova">ANCOVA (Covariate Adjustment)</option>
              <option value="kruskal">Kruskal-Wallis (Non-Parametric)</option>
              <option value="meta">Combined Meta-Analysis (Multi-Project)</option>
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
                <option value="SoilPH">Soil pH</option>
                <option value="SoilClay">Soil Clay %</option>
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

        {/* Alpha Level */}
        <div className="mt-4 flex items-center gap-4">
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
        </div>
      </div>

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
                    Recommendation: Switch the statistical test to <strong>Type III ANOVA (Unbalanced)</strong> to resolve statistical bias and control type I error rates.
                  </p>
                )}
              </div>
            </div>
          )}

          {results.assumptions && (
            <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-3">
              <h4 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                <CheckCircle className="w-4.5 h-4.5 text-emerald-600" /> Statistical Assumption Verification
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className={`p-3 rounded-lg border ${results.assumptions.normalityPassed ? 'bg-emerald-50/50 border-emerald-100' : 'bg-rose-50/50 border-rose-100'}`}>
                  <span className="font-semibold block mb-1">Residual Normality (Jarque-Bera)</span>
                  <p className="text-slate-600">Status: <strong className={results.assumptions.normalityPassed ? 'text-emerald-700' : 'text-rose-700'}>{results.assumptions.normalityPassed ? 'Passed' : 'Failed'}</strong> (p = {results.assumptions.normalityP?.toFixed(4)})</p>
                </div>
                <div className={`p-3 rounded-lg border ${results.assumptions.variancePassed ? 'bg-emerald-50/50 border-emerald-100' : 'bg-rose-50/50 border-rose-100'}`}>
                  <span className="font-semibold block mb-1">Variance Homogeneity (Levene's Test)</span>
                  <p className="text-slate-600">Status: <strong className={results.assumptions.variancePassed ? 'text-emerald-700' : 'text-rose-700'}>{results.assumptions.variancePassed ? 'Passed' : 'Failed'}</strong> (p = {results.assumptions.varianceP?.toFixed(4)})</p>
                </div>
              </div>
              {results.assumptions.recommendation && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-lg text-xs font-medium flex flex-wrap items-center justify-between gap-2">
                  <span>{results.assumptions.recommendation}</span>
                  <button 
                    onClick={() => { setTest('kruskal'); setResults(null); }}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-1 px-2.5 rounded transition text-[10px]"
                  >
                    Switch to Kruskal-Wallis
                  </button>
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
                  {Object.entries(results.treatmentMeans).map(([trt, mean]) => {
                    const unadj = results.unadjustedMeans?.[trt];
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
