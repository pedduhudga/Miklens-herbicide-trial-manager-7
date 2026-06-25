import React, { useState, useMemo } from 'react';
import { FileText, Table2, FileBox, AlertTriangle, CheckCircle, Download } from 'lucide-react';
import { getParametersWithData } from '../services/reportDataBuilder.js';
import { getCategoryConfig } from '../utils/categoryConfig.js';
import { safeJsonParse } from '../utils/helpers.js';

// ─── helpers ──────────────────────────────────────────────────────────────────

function isControlTreatment(name) {
  if (!name) return false;
  const n = name.toLowerCase();
  return n.includes('control') || n.includes('untreated') || n.includes('check');
}

// ─── Main Component ───────────────────────────────────────────────────────────

/**
 * ReportConfigPanel — pre-flight UI panel for project report configuration.
 *
 * @param {object}   project         — the project object
 * @param {Array}    subTrials       — trials belonging to this project
 * @param {string}   activeCategory  — e.g. 'herbicide'
 * @param {function} onGenerate      — called with options object when user clicks Generate
 * @param {boolean}  canDownload     — whether the user has download permission
 */
export default function ReportConfigPanel({ project, subTrials = [], activeCategory, onGenerate, canDownload }) {
  // ── report options state ───────────────────────────────────────────────────
  const [format, setFormat]               = useState('pdf');
  const [template, setTemplate]           = useState('standard');
  const [postHoc, setPostHoc]             = useState('lsd');
  const [alpha, setAlpha]                 = useState(0.05);
  const [daa, setDaa]                     = useState(null);   // null = final observation
  const [transformation, setTransformation] = useState('none');
  const [includePhotos, setIncludePhotos]   = useState(true);
  const [photoMode, setPhotoMode]           = useState('thumbnail');
  const [includeWeather, setIncludeWeather] = useState(true);
  const [ancovaCovariate, setAncovaCovariate] = useState('Temperature');
  const [includeResiduals, setIncludeResiduals]     = useState(true);
  const [includeDoseResponse, setIncludeDoseResponse] = useState(false);
  const [includeSectorMap, setIncludeSectorMap]     = useState(false);
  const [dunnettAlpha, setDunnettAlpha]     = useState(0.05);

  // ── category config ────────────────────────────────────────────────────────
  const categoryConfig = useMemo(() => getCategoryConfig(activeCategory), [activeCategory]);

  // ── available DAA values (derived from subTrials' EfficacyDataJSON) ────────
  const availableDaas = useMemo(() => {
    const daaSet = new Set();
    for (const trial of subTrials) {
      const efficacy = safeJsonParse(trial.EfficacyDataJSON, []);
      if (Array.isArray(efficacy)) {
        for (const obs of efficacy) {
          const d = parseFloat(obs.daa);
          if (Number.isFinite(d)) daaSet.add(d);
        }
      }
    }
    return Array.from(daaSet).sort((a, b) => a - b);
  }, [subTrials]);

  // ── pre-flight summary (computed via useMemo) ──────────────────────────────
  const preflight = useMemo(() => {
    if (!subTrials || subTrials.length === 0) {
      return {
        treatments: 0,
        repMin: 0,
        repMax: 0,
        parameters: [],
        warnings: [],
        hasControl: false,
        unbalanced: false,
        lowRepTreatments: [],
      };
    }

    // Count distinct treatment groups by FormulationName + Dosage
    const treatmentMap = {};
    for (const trial of subTrials) {
      const name   = trial.FormulationName || 'Unknown';
      const dosage = String(trial.Dosage || '');
      const key    = `${name}|${dosage}`;
      if (!treatmentMap[key]) treatmentMap[key] = { name, trials: [] };
      treatmentMap[key].trials.push(trial);
    }

    const treatmentKeys = Object.keys(treatmentMap);
    const repCounts     = treatmentKeys.map(k => treatmentMap[k].trials.length);
    const repMin        = repCounts.length ? Math.min(...repCounts) : 0;
    const repMax        = repCounts.length ? Math.max(...repCounts) : 0;
    const unbalanced    = repMin !== repMax;

    // Check for control/UTC
    const hasControl = treatmentKeys.some(k => isControlTreatment(treatmentMap[k].name));

    // Treatments with < 2 reps
    const lowRepTreatments = treatmentKeys
      .filter(k => treatmentMap[k].trials.length < 2)
      .map(k => `"${treatmentMap[k].name}" (${treatmentMap[k].trials.length} rep)`);

    // Parameters that have data
    let parameters = [];
    try {
      parameters = getParametersWithData(subTrials, activeCategory);
    } catch (_e) {
      parameters = [];
    }

    // Build warnings
    const warnings = [];

    if (!hasControl) {
      warnings.push('No untreated control (UTC) detected. Efficacy % cannot be computed.');
    }

    if (unbalanced) {
      const detail = treatmentKeys
        .map(k => `"${treatmentMap[k].name}": ${treatmentMap[k].trials.length} rep(s)`)
        .join(', ');
      warnings.push(`Unbalanced design detected (${detail}). ANOVA results should be interpreted with caution.`);
    }

    if (lowRepTreatments.length > 0) {
      warnings.push(`Insufficient replications: ${lowRepTreatments.join(', ')}. ANOVA requires ≥ 2 reps per treatment.`);
    }

    if (treatmentKeys.length < 2) {
      warnings.push(`Only ${treatmentKeys.length} treatment group(s) found. At least 2 are required for statistical analysis.`);
    }

    if (parameters.length === 0) {
      warnings.push('No observation data found for any parameter in this project.');
    }

    // Photo count across all subTrials
    const photoCount = subTrials.reduce((sum, t) => {
      const photos = safeJsonParse(t.PhotoURLs, []);
      return sum + (Array.isArray(photos) ? photos.length : 0);
    }, 0);

    // Dose-response availability: ≥3 distinct numeric dosage levels > 0
    const hasDoseResponseData =
      subTrials.some(t => { const d = parseFloat(t.Dosage); return Number.isFinite(d) && d > 0; }) &&
      new Set(subTrials.map(t => parseFloat(t.Dosage))).size >= 3;

    // Large-scale / sector map availability
    const hasLargeScaleTrials = subTrials.some(
      t => t.TrialDesign === 'LargeScale' || t.SectorID
    );

    return {
      treatments: treatmentKeys.length,
      repMin,
      repMax,
      parameters,
      warnings,
      hasControl,
      unbalanced,
      lowRepTreatments,
      photoCount,
      hasDoseResponseData,
      hasLargeScaleTrials,
    };
  }, [subTrials, activeCategory]);

  // ── soil covariate availability (for ANCOVA selector) ─────────────────────
  const hasSoilData = useMemo(
    () => (subTrials || []).some(t => t.SoilPH || t.SoilClay || t.SoilOC),
    [subTrials]
  );

  // ── generate button state ──────────────────────────────────────────────────
  const canGenerate = canDownload && preflight.treatments >= 2 && subTrials.length > 0;

  const formatLabel = { pdf: 'PDF', excel: 'Excel', docx: 'DOCX', pptx: 'PPTX' }[format] || format.toUpperCase();

  const generateButtonLabel = !canDownload
    ? 'Download Disabled'
    : preflight.treatments < 2
    ? 'Insufficient Data'
    : `Generate ${formatLabel} Report`;

  // ── handler ────────────────────────────────────────────────────────────────
  function handleGenerate() {
    if (!canGenerate) return;
    onGenerate?.({
      format, postHoc, alpha, daa, transformation,
      includePhotos, photoMode,
      includeWeather, template, ancovaCovariate,
      includeResiduals, includeDoseResponse, includeSectorMap,
      dunnettAlpha,
    });
  }

  // ── summary description ────────────────────────────────────────────────────
  const repDisplay = preflight.repMin === preflight.repMax
    ? preflight.repMax
    : `${preflight.repMin}–${preflight.repMax}`;

  return (
    <div className="flex flex-col gap-5">

      {/* ── Template selector ────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Report Template</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { value: 'standard',           label: 'Standard',          desc: 'Full report' },
            { value: 'scientific-journal', label: 'Scientific Journal', desc: '2-column compact' },
            { value: 'field-summary',      label: 'Field Summary',      desc: 'Single page' },
            { value: 'regulatory',         label: 'Regulatory',         desc: 'GLP/GEP format' },
          ].map(({ value, label, desc }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTemplate(value)}
              className={`flex flex-col items-center justify-center py-2.5 px-2 rounded-xl border-2 font-semibold text-xs transition-all
                ${template === value
                  ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}
            >
              <span className="font-bold">{label}</span>
              <span className={`text-[9px] mt-0.5 ${template === value ? 'text-purple-100' : 'text-slate-400'}`}>{desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── 1. Format selector ───────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Report Format</h3>
        <div className="flex gap-2">
          {[
            { value: 'pdf',   Icon: FileText, label: 'PDF'   },
            { value: 'excel', Icon: Table2,   label: 'Excel' },
            { value: 'docx',  Icon: FileBox,  label: 'DOCX'  },
            { value: 'pptx',  Icon: FileText, label: 'PPTX'  },
          ].map(({ value, Icon, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setFormat(value)}
              className={`flex items-center justify-center gap-2 flex-1 py-2.5 px-3 rounded-xl border-2 font-semibold text-sm transition-all
                ${format === value
                  ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 2. Options row (grid-cols-3) ─────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Statistical Options</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

          {/* Post-hoc test */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Post-hoc Test</label>
            <div className="relative">
              <select
                value={postHoc}
                onChange={e => setPostHoc(e.target.value)}
                className="w-full px-3 py-2 pr-8 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm outline-none focus:border-purple-500 appearance-none"
              >
                <option value="lsd">LSD</option>
                <option value="tukey">Tukey HSD</option>
                <option value="duncan">Duncan's MRT</option>
                <option value="snk">SNK</option>
                <option value="bonferroni">Bonferroni</option>
                <option value="dunnett">Dunnett</option>
              </select>
              <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-slate-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </span>
            </div>
            {postHoc === 'dunnett' && (
              <div className="mt-2">
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Dunnett α</label>
                <div className="flex gap-2">
                  {[{ value: 0.05, label: '5%' }, { value: 0.10, label: '10%' }].map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setDunnettAlpha(value)}
                      className={`flex-1 py-2 px-3 rounded-xl border-2 text-sm font-semibold transition-all
                        ${dunnettAlpha === value
                          ? 'bg-purple-600 text-white border-purple-600'
                          : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Significance level */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Significance Level (α)</label>
            <div className="flex gap-2">
              {[{ value: 0.05, label: '5%' }, { value: 0.01, label: '1%' }].map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setAlpha(value)}
                  className={`flex-1 py-2 px-3 rounded-xl border-2 text-sm font-semibold transition-all
                    ${alpha === value
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Observation timing (DAA) */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Observation Timing</label>
            <div className="relative">
              <select
                value={daa === null ? '' : String(daa)}
                onChange={e => setDaa(e.target.value === '' ? null : Number(e.target.value))}
                className="w-full px-3 py-2 pr-8 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm outline-none focus:border-purple-500 appearance-none"
              >
                <option value="">Final Observation</option>
                {availableDaas.map(d => (
                  <option key={d} value={String(d)}>{d} DAA</option>
                ))}
              </select>
              <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-slate-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </span>
            </div>
          </div>

          {/* ANCOVA covariate selector */}
          <div className="sm:col-span-3">
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">ANCOVA Covariate</label>
            {!hasSoilData ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 border border-slate-200">
                <select
                  disabled
                  className="flex-1 bg-transparent text-slate-400 text-sm outline-none cursor-not-allowed appearance-none"
                >
                  <option>Soil covariate data not available for this project</option>
                </select>
                <AlertTriangle className="w-4 h-4 text-slate-400 flex-shrink-0" />
              </div>
            ) : (
              <div className="relative w-full sm:w-72">
                <select
                  value={ancovaCovariate}
                  onChange={e => setAncovaCovariate(e.target.value)}
                  className="w-full px-3 py-2 pr-8 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm outline-none focus:border-purple-500 appearance-none"
                >
                  <option value="Temperature">Temperature (°C)</option>
                  <option value="Humidity">Humidity (%)</option>
                  <option value="Windspeed">Wind Speed (km/h)</option>
                  <option value="Rain">Rainfall (mm)</option>
                  <option value="SoilPH">Soil pH</option>
                  <option value="SoilClay">Soil Clay %</option>
                  <option value="SoilOC">Soil Organic Carbon %</option>
                </select>
                <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-slate-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </span>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── 3. Data transformation ───────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Data Transformation</h3>
        <div className="relative w-full sm:w-72">
          <select
            value={transformation}
            onChange={e => setTransformation(e.target.value)}
            className="w-full px-3 py-2 pr-8 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm outline-none focus:border-purple-500 appearance-none"
          >
            <option value="none">None</option>
            <option value="arcsine">Arcsine (√)</option>
            <option value="log">Log (log₁₀)</option>
            <option value="sqrt">Square Root (√)</option>
          </select>
          <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-slate-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </div>
      </div>

      {/* ── 4. Checkboxes ────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Include in Report</h3>
        <div className="flex flex-wrap gap-6">
          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includePhotos}
                onChange={e => setIncludePhotos(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
              />
              <span className="text-sm font-medium text-slate-700">Include Photos</span>
            </label>
            {includePhotos && (
              <div className="ml-6">
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Photo Mode</label>
                <div className="relative w-full sm:w-64">
                  <select
                    value={photoMode}
                    onChange={e => setPhotoMode(e.target.value)}
                    className="w-full px-3 py-2 pr-8 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 text-sm outline-none focus:border-purple-500 appearance-none"
                  >
                    <option value="thumbnail">Thumbnail Grid (4×4, ≤400px)</option>
                    <option value="fullpage">Full Page (1 photo/page, ≤1200px)</option>
                  </select>
                  <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-slate-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </span>
                </div>
              </div>
            )}
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeWeather}
              onChange={e => setIncludeWeather(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
            />
            <span className="text-sm font-medium text-slate-700">Include Weather Data</span>
          </label>

          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeResiduals}
              onChange={e => setIncludeResiduals(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
            />
            <span className="text-sm font-medium text-slate-700">Residual Diagnostics</span>
          </label>

          {preflight.hasDoseResponseData && (
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeDoseResponse}
                onChange={e => setIncludeDoseResponse(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
              />
              <span className="text-sm font-medium text-slate-700">Dose-Response Analysis</span>
            </label>
          )}

          {preflight.hasLargeScaleTrials && (
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeSectorMap}
                onChange={e => setIncludeSectorMap(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
              />
              <span className="text-sm font-medium text-slate-700">Sector Map</span>
            </label>
          )}
        </div>
      </div>

      {/* ── 5. Pre-flight summary card ───────────────────────────────────────── */}
      <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Data Summary</h3>

        {subTrials.length === 0 ? (
          <p className="text-sm text-slate-400">No trials found for this project.</p>
        ) : (
          <>
            {/* Summary line */}
            <p className="text-sm font-semibold text-slate-700 mb-3">
              {preflight.treatments} treatment{preflight.treatments !== 1 ? 's' : ''}
              {' · '}
              {repDisplay} max replication{preflight.repMax !== 1 ? 's' : ''}
              {' · '}
              {preflight.parameters.length} parameter{preflight.parameters.length !== 1 ? 's' : ''} with data
            </p>

            {/* Task 20.3 — Photo count warning */}
            {preflight.photoCount > 50 && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs mb-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-500" />
                <span>This project has {preflight.photoCount} photos — thumbnail mode recommended</span>
              </div>
            )}

            {/* Warnings (amber) */}
            {preflight.warnings.length > 0 && (
              <div className="flex flex-col gap-2 mb-2">
                {preflight.warnings.map((msg, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs"
                  >
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-500" />
                    <span>{msg}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Green info rows for sufficient data */}
            {preflight.warnings.length === 0 && (
              <div className="flex items-center gap-2 text-emerald-700 text-xs font-semibold bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                <CheckCircle className="w-4 h-4 text-emerald-500" />
                All checks passed — ready to generate report.
              </div>
            )}
          </>
        )}
      </div>

      {/* ── 6. Generate Report button (full-width, purple-600) ───────────────── */}
      <button
        type="button"
        disabled={!canGenerate}
        onClick={handleGenerate}
        title={!canDownload ? 'Download permission is disabled for your account' : undefined}
        className={`w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all
          ${canGenerate
            ? 'bg-purple-600 text-white hover:bg-purple-700 shadow-sm hover:shadow-md'
            : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
      >
        {canGenerate && <Download className="w-4 h-4" />}
        {!canGenerate && <AlertTriangle className="w-4 h-4" />}
        {generateButtonLabel}
      </button>

    </div>
  );
}
