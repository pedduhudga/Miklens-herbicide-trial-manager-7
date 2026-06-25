/**
 * reportDataBuilder.js
 *
 * Core data aggregation service for the advanced reporting pipeline.
 * Accepts project-level trial data, groups by treatment, computes
 * descriptive statistics via AnalysisEngine, and returns a single
 * well-shaped ReportData object consumed by all report renderers.
 *
 * Stabilization fixes applied (2026-06-24):
 *  PI-1 – ANOVA key-name mismatch between performANOVA() and buildAnovaShape()
 *  PI-2 – Hardcoded 4-row ANOVA source table (now design-aware)
 *  PI-3 – Pot Trial reporting consistency (CRD-style label, no spurious Blocks row)
 *  PI-4 – phytotoxicity excluded from efficacy% calculation
 *  PI-5 – LargeScale data path: sector/GPS/spatial CV% enrichment
 */

import { validateEfficacyData, AnalysisEngine } from '../utils/analysisUtils.js';
import {
  getCategoryConfig,
  getPrimaryObservationField,
  calculateEfficacy,
} from '../utils/categoryConfig.js';
import { safeJsonParse } from '../utils/helpers.js';
import { fbGetLargeScaleData } from './largeScaleService.js';
import { performDoseResponseAnalysis } from '../utils/doseResponseUtils.js';
import { calculateResidualsDiagnostics } from '../utils/statsUtils.js';

// ─── Parameters that must NOT be reported as "efficacy %" ────────────────────
// These are adverse/side-effect parameters — lower value is better for the
// CROP but the reduction logic would produce a misleadingly positive number.
const EXCLUDED_FROM_EFFICACY = new Set(['phytotoxicity', 'cropPhytotoxicity']);

// ─── small math helpers ────────────────────────────────────────────────────────

function toNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function mean(arr) {
  if (!arr || arr.length === 0) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function sd(arr) {
  if (!arr || arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

function se(arr) {
  if (!arr || arr.length === 0) return 0;
  return sd(arr) / Math.sqrt(arr.length);
}

function cv(arr) {
  if (!arr || arr.length === 0) return null;
  const m = mean(arr);
  if (!m || m === 0) return null;
  return (sd(arr) / Math.abs(m)) * 100;
}

function descStats(arr) {
  const valid = arr.filter(v => v !== null && Number.isFinite(v));
  if (valid.length === 0) return { mean: null, sd: null, se: null, cv: null, n: 0 };
  const m = mean(valid);
  const s = sd(valid);
  const e = se(valid);
  const c = m !== 0 ? (s / Math.abs(m)) * 100 : null;
  return { mean: m, sd: s, se: e, cv: c, n: valid.length };
}

// ─── Control identification ────────────────────────────────────────────────────

function isControlTreatment(name) {
  if (!name) return false;
  const n = name.toLowerCase();
  return n.includes('control') || n.includes('untreated') || n.includes('check');
}

// ─── Exported helper: parameters with any non-null data ───────────────────────

/**
 * Returns observation field keys that have at least one non-null value across
 * all sub-trials for the given category.
 *
 * @param {Array} subTrials
 * @param {string} categoryId
 * @returns {string[]} array of field keys
 */
export function getParametersWithData(subTrials, categoryId) {
  const config = getCategoryConfig(categoryId);
  const fields = (config.observationFields || []).filter(f => f.type === 'number');
  const result = [];

  for (const field of fields) {
    let found = false;
    for (const trial of subTrials) {
      const efficacy = validateEfficacyData(
        safeJsonParse(trial.EfficacyDataJSON, []),
        categoryId
      );
      if (efficacy.some(obs => toNum(obs[field.key]) !== null)) {
        found = true;
        break;
      }
    }
    if (found) result.push(field.key);
  }

  return result;
}

// ─── Exported helper: treatment means for a param/DAA combo ───────────────────

/**
 * Computes per-treatment means for a given observation parameter at a specific
 * DAA (or the final observation when daa is null).
 *
 * @param {Array}  subTrials
 * @param {string} paramKey      - observation field key (e.g. 'weedCover')
 * @param {number|null} daa      - target DAA; null → use final observation
 * @param {string} categoryId
 * @returns {{ [treatmentName]: { mean, sd, se, n } }}
 */
export function computeTreatmentMeans(subTrials, paramKey, daa, categoryId) {
  const treatmentValues = {};

  for (const trial of subTrials) {
    const trt = trial.FormulationName || 'Unknown';
    const efficacy = validateEfficacyData(
      safeJsonParse(trial.EfficacyDataJSON, []),
      categoryId
    );
    if (!efficacy.length) continue;

    let obs;
    if (daa !== null && daa !== undefined) {
      obs = efficacy.find(e => Number(e.daa) === Number(daa));
      if (!obs) obs = efficacy[efficacy.length - 1]; // fallback to last
    } else {
      obs = efficacy.reduce(
        (prev, cur) => (parseFloat(cur.daa) || 0) > (parseFloat(prev.daa) || 0) ? cur : prev,
        efficacy[0]
      );
    }

    const val = toNum(obs?.[paramKey]);
    if (val === null) continue;

    if (!treatmentValues[trt]) treatmentValues[trt] = [];
    treatmentValues[trt].push(val);
  }

  const result = {};
  for (const [trt, vals] of Object.entries(treatmentValues)) {
    result[trt] = descStats(vals);
  }
  return result;
}

// ─── Task 9: Correlation matrix ───────────────────────────────────────────────

/**
 * Computes a Pearson correlation matrix across treatment-level means for each
 * pair of parameters in `paramsWithData`.
 *
 * @param {Array}    subTrials       - raw trial rows
 * @param {string[]} paramsWithData  - parameter keys to correlate
 * @param {string}   categoryId
 * @returns {{ matrix: Object, params: string[] }}
 */
export function computeCorrelationMatrix(subTrials, paramsWithData, categoryId) {
  const params = paramsWithData || [];
  const matrix = {};

  if (params.length < 2) return { matrix, params };

  // Build treatment-level means per param
  // keys: paramKey → { [treatmentName]: mean }
  const paramMeans = {};
  for (const p of params) {
    const trtMeans = computeTreatmentMeans(subTrials, p, null, categoryId);
    paramMeans[p] = trtMeans;
  }

  // Collect the universe of treatment names that appear in at least one param
  const treatmentNamesSet = new Set();
  for (const p of params) {
    for (const trt of Object.keys(paramMeans[p])) treatmentNamesSet.add(trt);
  }
  const allTreatments = Array.from(treatmentNamesSet);

  // Helper: Pearson r + p-value for two arrays of treatment means
  const pearson = (xs, ys) => {
    // xs and ys are parallel arrays (treatment means for param A and param B)
    const n = xs.length;
    if (n < 4) return { r: null, p: null, stars: 'N/A' };

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
    for (let i = 0; i < n; i++) {
      sumX  += xs[i];
      sumY  += ys[i];
      sumXY += xs[i] * ys[i];
      sumX2 += xs[i] * xs[i];
      sumY2 += ys[i] * ys[i];
    }

    const num = n * sumXY - sumX * sumY;
    const den = Math.sqrt((n * sumX2 - sumX ** 2) * (n * sumY2 - sumY ** 2));
    if (den === 0) return { r: 0, p: null, stars: '' };

    const r = Math.max(-1, Math.min(1, num / den));

    // Two-tailed t-test: t = r * sqrt((k-2)/(1-r²)), df = k-2
    const df = n - 2;
    const r2 = r * r;
    const tStat = r2 >= 1 ? Infinity : r * Math.sqrt(df / (1 - r2));

    // Approximate p-value via Student-t CDF using iterative method
    // (avoids external dependency — sufficient precision for stars)
    const pValue = tDistPValue(Math.abs(tStat), df);

    const stars = pValue < 0.01 ? '**' : pValue < 0.05 ? '*' : '';
    return { r: parseFloat(r.toFixed(4)), p: parseFloat(pValue.toFixed(4)), stars };
  };

  // Compute pairwise correlations using matched treatment means
  for (const pA of params) {
    matrix[pA] = {};
    for (const pB of params) {
      if (pA === pB) {
        matrix[pA][pB] = { r: 1, p: 0, stars: '' };
        continue;
      }
      // Collect treatments that have data for BOTH params
      const xs = [], ys = [];
      for (const trt of allTreatments) {
        const mA = paramMeans[pA][trt]?.mean;
        const mB = paramMeans[pB][trt]?.mean;
        if (mA !== null && mA !== undefined && mB !== null && mB !== undefined) {
          xs.push(mA);
          ys.push(mB);
        }
      }
      matrix[pA][pB] = pearson(xs, ys);
    }
  }

  return { matrix, params };
}

/**
 * Approximate two-tailed p-value from Student-t distribution.
 * Uses a regularised incomplete beta function approximation.
 * Accurate to ~3 decimal places for df >= 2.
 */
function tDistPValue(t, df) {
  if (!Number.isFinite(t) || t === 0) return 1;
  // Use the Wilson–Hilferty approximation for large df
  if (df >= 30) {
    // Normal approximation: z ≈ t for large df
    const z = Math.abs(t);
    const p1 = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
    // Two-tailed
    return Math.min(1, 2 * normalCdfUpper(z));
  }
  // For small df use a recursive regularised incomplete beta function
  const x = df / (df + t * t);
  const p = incompleteBeta(x, df / 2, 0.5);
  return Math.min(1, Math.max(0, p));
}

function normalCdfUpper(z) {
  // Complementary CDF for standard normal (upper tail)
  const t = 1 / (1 + 0.2316419 * z);
  const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI) * poly;
}

function incompleteBeta(x, a, b) {
  // Continued fraction approximation via Lentz algorithm
  if (x < 0 || x > 1) return 0;
  if (x === 0) return 0;
  if (x === 1) return 1;
  const lbeta = logGamma(a) + logGamma(b) - logGamma(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lbeta) / a;
  // Lentz continued fraction
  const maxIter = 200;
  const eps = 3e-7;
  let c = 1, d = 1 - (a + b) * x / (a + 1);
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= maxIter; m++) {
    // Even step
    let aa = m * (b - m) * x / ((a + 2 * m - 1) * (a + 2 * m));
    d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30; d = 1 / d;
    c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30;
    h *= d * c;
    // Odd step
    aa = -(a + m) * (a + b + m) * x / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30; d = 1 / d;
    c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < eps) break;
  }
  return front * h;
}

function logGamma(x) {
  // Stirling approximation good for x > 0
  const cof = [76.18009172947146,-86.50532032941677,24.01409824083091,
    -1.231739572450155,0.1208650973866179e-2,-0.5395239384953e-5];
  let y = x, tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (const c of cof) { y += 1; ser += c / y; }
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

// ─── Task 10: Executive summary ───────────────────────────────────────────────

/**
 * Builds a plain-text executive summary (<= 250 words) from reportData.
 * Pure string template — no AI call.
 *
 * @param {object} reportData  - the object built by buildReportData
 * @returns {string}
 */
export function buildExecutiveSummary(reportData) {
  if (!reportData) return '';

  const meta      = reportData.meta || {};
  const primary   = reportData.primaryParameter || {};
  const anova     = primary.anova || null;
  const alpha     = 0.05; // default; reportData doesn't carry alpha through meta yet
  const weather   = reportData.weather || [];

  const projectName = meta.projectName || 'This project';
  const category    = meta.category    || '';
  const designLabel = meta.designLabel || meta.design || 'field trial';
  const nTreatments = meta.treatments  || 0;
  const nReps       = meta.replications || 0;
  const location    = meta.location    || '';

  // Top treatment: first entry whose CLD letter includes 'a'
  const means     = primary.means || {};
  const topTrt    = Object.entries(means).find(
    ([, v]) => v.cldLetter && v.cldLetter.toLowerCase().startsWith('a')
  );
  const topName   = topTrt ? topTrt[0] : null;

  // ANOVA significance sentence
  let anovaSentence = '';
  if (anova) {
    const pVal = anova.p?.[0] ?? null;
    if (pVal !== null) {
      anovaSentence = pVal < alpha
        ? `ANOVA revealed significant treatment differences (p = ${pVal.toFixed(3)}).`
        : `ANOVA showed no significant differences among treatments (p = ${pVal.toFixed(3)}).`;
    }
  }

  // CV quality sentence
  let cvSentence = '';
  if (anova?.cv != null) {
    const cvVal = anova.cv;
    const quality = cvVal < 10 ? 'excellent' : cvVal <= 20 ? 'good' : 'fair/poor';
    cvSentence = `Experimental precision was ${quality} (CV = ${cvVal.toFixed(1)}%).`;
  }

  // Weather sentence (if any weather data)
  let weatherSentence = '';
  if (weather.length > 0) {
    const temps    = weather.map(w => w.temp).filter(v => v !== null);
    const avgTemp  = temps.length ? (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1) : null;
    weatherSentence = avgTemp
      ? `Mean air temperature during the trial period was ${avgTemp} °C.`
      : 'Weather conditions were recorded during the trial.';
  }

  // Assemble summary
  const parts = [
    `${projectName} was a ${designLabel} conducted at ${location || 'the trial site'}, ` +
      `evaluating ${nTreatments} treatment${nTreatments !== 1 ? 's' : ''} with ${nReps} replication${nReps !== 1 ? 's' : ''} ` +
      `in the ${category} category.`,
    anovaSentence,
    topName
      ? `The top-performing treatment was "${topName}" (CLD group 'a'), indicating superior efficacy relative to the other treatments.`
      : '',
    cvSentence,
    weatherSentence,
  ].filter(Boolean).join(' ');

  // Enforce 250-word limit
  const words = parts.split(/\s+/);
  if (words.length <= 250) return parts;
  return words.slice(0, 250).join(' ') + '...';
}

// ─── Task 14: Tidy CSV export ─────────────────────────────────────────────────

/**
 * Builds a tidy (long-format) CSV and triggers a browser download.
 *
 * Columns: ProjectID, ProjectName, TrialID, PlotNumber, BlockID,
 *          TreatmentName, DosageValue, DosageUnit, BBCH,
 *          GPSLatitude, GPSLongitude, SoilPH, SoilClay,
 *          DAA, ObservationDate, [observation number fields…]
 *
 * One row per trial × DAA observation.
 *
 * @param {string} projectId
 * @param {Array}  subTrials
 * @param {object} state       - full app state (activeCategory, projects)
 */
export function exportTidyCSV(projectId, subTrials, state = {}) {
  const category = state.activeCategory || 'herbicide';
  const config   = getCategoryConfig(category);
  const obsFields = (config.observationFields || [])
    .filter(f => f.type === 'number')
    .map(f => f.key);

  const projects     = state.projects || [];
  const project      = projects.find(p => String(p.ID) === String(projectId)) || null;
  const projectName  = project?.ProjectName || project?.Name || `Project ${projectId}`;

  // CSV header
  const fixedCols = [
    'ProjectID', 'ProjectName', 'TrialID', 'PlotNumber', 'BlockID',
    'TreatmentName', 'DosageValue', 'DosageUnit', 'BBCH',
    'Crop', 'Variety', 'PreviousCrop', 'IrrigationMethod', 'PlantPopulation',
    'GPSLatitude', 'GPSLongitude', 'SoilPH', 'SoilClay',
    'DAA', 'ObservationDate',
  ];
  const header = [...fixedCols, ...obsFields];

  const rows = [header];

  for (const trial of subTrials) {
    const observations = validateEfficacyData(
      safeJsonParse(trial.EfficacyDataJSON, []),
      category
    );

    if (!observations.length) {
      // Still emit one row so the trial is represented, with empty obs columns
      const row = [
        projectId,
        csvEscape(projectName),
        trial.ID || '',
        trial.PlotNumber || '',
        trial.BlockID || '',
        csvEscape(trial.FormulationName || ''),
        trial.Dosage || '',
        trial.DosageUnit || trial.Unit || '',
        trial.BBCH || '',
        trial.Crop || '',
        trial.Variety || '',
        trial.PreviousCrop || '',
        trial.IrrigationMethod || '',
        trial.PlantPopulation || '',
        trial.GPSLatitude  || trial.Latitude  || '',
        trial.GPSLongitude || trial.Longitude || '',
        trial.SoilPH  || trial.soilPH  || '',
        trial.SoilClay || trial.soilClay || '',
        '',
        '',
        ...obsFields.map(() => ''),
      ];
      rows.push(row);
      continue;
    }

    for (const obs of observations) {
      const row = [
        projectId,
        csvEscape(projectName),
        trial.ID || '',
        trial.PlotNumber || '',
        trial.BlockID || '',
        csvEscape(trial.FormulationName || ''),
        trial.Dosage || '',
        trial.DosageUnit || trial.Unit || '',
        trial.BBCH || obs.bbch || '',
        trial.Crop || '',
        trial.Variety || '',
        trial.PreviousCrop || '',
        trial.IrrigationMethod || '',
        trial.PlantPopulation || '',
        trial.GPSLatitude  || trial.Latitude  || '',
        trial.GPSLongitude || trial.Longitude || '',
        trial.SoilPH  || trial.soilPH  || '',
        trial.SoilClay || trial.soilClay || '',
        obs.daa ?? '',
        obs.date || trial.ObservationDate || '',
        ...obsFields.map(k => {
          const v = obs[k];
          return (v === null || v === undefined) ? '' : v;
        }),
      ];
      rows.push(row);
    }
  }

  const csvContent = rows.map(r => r.join(',')).join('\r\n');
  const today = new Date().toISOString().split('T')[0];
  const filename = `${(projectName).replace(/[^a-zA-Z0-9_-]/g, '_')}_tidy_data_${today}.csv`;

  // Trigger browser download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Wrap a string value for CSV — quotes it if it contains commas/quotes/newlines. */
function csvEscape(val) {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// ─── Main builder ──────────────────────────────────────────────────────────────

/**
 * Build a complete ReportData object for a project.
 *
 * @param {string} projectId
 * @param {Array}  subTrials  - trials array filtered by ProjectID
 * @param {object} options    - { daa, postHoc, alpha, transformation, includePhotos, includeWeather, category, project }
 * @param {object} state      - full app state (trials, blocks, projects, activeCategory)
 * @returns {Promise<ReportData>}  — never throws; returns partial data with warnings on errors
 */
export async function buildReportData(projectId, subTrials, options = {}, state = {}) {
  const warnings = [];

  // ── 0. Resolve project and category ─────────────────────────────────────────
  const stateProjects = state.projects || [];
  const project =
    options.project ||
    stateProjects.find(p => String(p.ID) === String(projectId)) ||
    null;

  const category =
    options.category ||
    project?.Category ||
    state.activeCategory ||
    'herbicide';

  const categoryConfig = getCategoryConfig(category);
  const primaryField = getPrimaryObservationField(category);

  // ── 1. Group trials into treatment groups ───────────────────────────────────
  //    Key: FormulationName + ' | ' + Dosage (to handle same name, diff dosage)
  const treatmentMap = {}; // { [groupKey]: { name, dosage, trials[] } }

  for (const trial of subTrials) {
    const name = trial.FormulationName || 'Unknown';
    const dosage = String(trial.Dosage || '');
    const key = `${name}|${dosage}`;

    if (!treatmentMap[key]) {
      treatmentMap[key] = { name, dosage, trials: [] };
    }
    treatmentMap[key].trials.push(trial);
  }

  const treatmentKeys = Object.keys(treatmentMap);
  const treatmentNames = treatmentKeys.map(k => treatmentMap[k].name);

  // Identify UTC/control
  const utcKey = treatmentKeys.find(k => isControlTreatment(treatmentMap[k].name));
  const utcName = utcKey ? treatmentMap[utcKey].name : null;

  if (!utcName) {
    warnings.push({
      type: 'missing_control',
      message: 'No untreated control (UTC) detected. Efficacy % will not be computed.',
    });
  }

  // ── 2. Validation warnings ──────────────────────────────────────────────────
  if (treatmentKeys.length < 2) {
    warnings.push({
      type: 'insufficient_treatments',
      message: `Only ${treatmentKeys.length} treatment group(s) found. At least 2 are required for statistical analysis.`,
    });
  }

  // Build replication counts per treatment
  const repCounts = {};
  for (const key of treatmentKeys) {
    repCounts[key] = treatmentMap[key].trials.length;
  }

  const repValues = Object.values(repCounts);
  const minReps = repValues.length ? Math.min(...repValues) : 0;
  const maxReps = repValues.length ? Math.max(...repValues) : 0;

  if (minReps < 2) {
    const lowRepTreatments = treatmentKeys
      .filter(k => repCounts[k] < 2)
      .map(k => `"${treatmentMap[k].name}" (${repCounts[k]} rep)`);
    warnings.push({
      type: 'insufficient_reps',
      message: `Insufficient replications: ${lowRepTreatments.join(', ')}. ANOVA requires ≥ 2 reps per treatment.`,
    });
  }

  const isUnbalanced = minReps !== maxReps;
  if (isUnbalanced) {
    warnings.push({
      type: 'unbalanced_design',
      message: `Unbalanced design detected. Rep counts vary: min=${minReps}, max=${maxReps}. ANOVA results should be interpreted with caution.`,
    });
  }

  // ── 3. Build treatmentList ──────────────────────────────────────────────────
  const treatmentList = treatmentKeys.map((key, idx) => {
    const { name, dosage, trials: tTrials } = treatmentMap[key];
    const sample = tTrials[0] || {};
    return {
      name,
      dosage,
      unit: sample.DosageUnit || sample.Unit || 'g/ha',
      timing: sample.ApplicationTiming || sample.Timing || '',
      isControl: isControlTreatment(name),
      isStandard:
        String(sample.IsStandard || '').toLowerCase() === 'true' ||
        String(sample.Role || '').toLowerCase().includes('standard'),
      replicationCount: tTrials.length,
      plotNumbers: tTrials
        .map(t => t.PlotNumber || t.plotNumber || t.BlockID || '')
        .filter(Boolean),
    };
  });

  // ── 4. Build raw data matrix ────────────────────────────────────────────────
  // rawMatrix[treatmentName][repId][paramKey] = value
  const rawMatrix = {};
  let totalExpected = 0;
  let totalActual = 0;
  const allDaas = new Set();

  for (const key of treatmentKeys) {
    const { name, trials: tTrials } = treatmentMap[key];
    rawMatrix[name] = {};

    tTrials.forEach((trial, repIdx) => {
      const repId =
        trial.BlockID ||
        trial.Replication ||
        trial.PlotNumber ||
        `Rep${repIdx + 1}`;

      const parsedEfficacy = validateEfficacyData(
        safeJsonParse(trial.EfficacyDataJSON, []),
        category
      );

      const numFields = (categoryConfig.observationFields || []).filter(
        f => f.type === 'number'
      );
      totalExpected += numFields.length;

      // Pick the target observation (final or specific DAA)
      let targetObs = null;
      if (options.daa !== null && options.daa !== undefined) {
        targetObs = parsedEfficacy.find(e => Number(e.daa) === Number(options.daa));
        if (!targetObs && parsedEfficacy.length) {
          targetObs = parsedEfficacy[parsedEfficacy.length - 1];
        }
      } else if (parsedEfficacy.length) {
        targetObs = parsedEfficacy.reduce(
          (prev, cur) => (parseFloat(cur.daa) || 0) > (parseFloat(prev.daa) || 0) ? cur : prev,
          parsedEfficacy[0]
        );
      }

      // Collect all DAA points
      parsedEfficacy.forEach(obs => {
        const d = parseFloat(obs.daa);
        if (Number.isFinite(d)) allDaas.add(d);
      });

      const row = {
        daa: targetObs ? (parseFloat(targetObs.daa) || null) : null,
        trialID: trial.ID || '',
        plotNumber: trial.PlotNumber || '',
        dosage: trial.Dosage || '',
        unit: trial.DosageUnit || trial.YieldUnit || '',
        bbch: trial.BBCHCode || '',
        lat: trial.GPSLatitude || trial.Lat || '',
        lon: trial.GPSLongitude || trial.Lon || '',
        soilPH: trial.SoilPH || '',
        soilClay: trial.SoilClay || '',
        crop: trial.Crop || '',
        variety: trial.Variety || '',
        previousCrop: trial.PreviousCrop || '',
        irrigationMethod: trial.IrrigationMethod || '',
        plantPopulation: trial.PlantPopulation || '',
      };
      for (const field of numFields) {
        const val = toNum(targetObs?.[field.key]);
        row[field.key] = val;
        if (val !== null) totalActual++;
      }
      rawMatrix[name][repId] = row;
    });
  }

  // ── 5. Build time-series table ──────────────────────────────────────────────
  const sortedDaas = Array.from(allDaas).sort((a, b) => a - b);
  const timeSeries = { daas: sortedDaas };

  for (const key of treatmentKeys) {
    const { name, trials: tTrials } = treatmentMap[key];
    timeSeries[name] = {};

    for (const daaPoint of sortedDaas) {
      const vals = [];
      for (const trial of tTrials) {
        const parsedEfficacy = validateEfficacyData(
          safeJsonParse(trial.EfficacyDataJSON, []),
          category
        );
        const obs = parsedEfficacy.find(e => Number(e.daa) === Number(daaPoint));
        const val = toNum(obs?.[primaryField]);
        if (val !== null) vals.push(val);
      }
      if (vals.length) {
        timeSeries[name][daaPoint] = descStats(vals);
      }
    }
  }

  // ── 6. Identify parameters with data ───────────────────────────────────────
  const paramsWithData = getParametersWithData(subTrials, category);

  // Warn if primary field has no data
  if (!paramsWithData.includes(primaryField) && subTrials.length > 0) {
    warnings.push({
      type: 'no_primary_data',
      message: `Primary parameter "${primaryField}" has no data in any trial.`,
    });
  }

  // ── 7. Run AnalysisEngine for all parameters ────────────────────────────────
  const mockState = {
    trials: subTrials,
    blocks: state.blocks
      ? state.blocks.filter(b => String(b.ProjectID) === String(projectId))
      : [],
    projects: project ? [project] : stateProjects,
    activeCategory: category,
  };

  let engine;
  let analysisResults = {};

  try {
    engine = new AnalysisEngine(projectId, mockState, null);

    const analyzeOptions = {
      postHoc: options.postHoc || 'lsd',
      alpha: options.alpha || 0.05,
      daa: options.daa !== undefined ? options.daa : null,
      transformation: options.transformation || 'none',
      persist: false, // don't write to backend from reporting flow
    };

    // Run for each parameter that has data
    const paramsToAnalyze = paramsWithData.length ? paramsWithData : [primaryField];

    for (const paramKey of paramsToAnalyze) {
      try {
        analysisResults[paramKey] = await engine.analyze(
          paramKey,
          null,
          analyzeOptions.daa,
          analyzeOptions
        );
      } catch (err) {
        console.warn(`[ReportDataBuilder] Analysis failed for param "${paramKey}":`, err?.message || err);
        analysisResults[paramKey] = { error: err?.message || String(err) };
        warnings.push({
          type: 'analysis_error',
          message: `Statistical analysis failed for parameter "${paramKey}": ${err?.message || err}`,
        });
      }
    }
  } catch (engineErr) {
    console.warn('[ReportDataBuilder] AnalysisEngine instantiation failed:', engineErr?.message || engineErr);
    warnings.push({
      type: 'engine_error',
      message: `Could not initialize statistical engine: ${engineErr?.message || engineErr}`,
    });
  }

  // ── 8. Build parameters array ───────────────────────────────────────────────

  /**
   * PI-1 FIX: Map the actual key names returned by performANOVA() / AnalysisEngine.analyze()
   *   performANOVA() returns: ssTreatments, ssBlocks, dfTreatments, dfBlocks,
   *                           msTreatments, msBlocks, fStatistic, pValue,
   *                           cd5, cd1, semGlobal, cv, grandMean, ssError,
   *                           ssTotal, dfError, dfTotal, msError
   *   AnalysisEngine wraps these in ar.anova (same keys from performANOVA).
   *   The old code used wrong keys (ssTreat, fVal, pVal, lsd5…) which all
   *   resolved to null/0.  This version reads both key variants so it works
   *   whether the value comes from performANOVA or calculateANOVA.
   *
   * PI-2 / PI-3 FIX: Build a design-aware ANOVA source table.
   *   CRD and Pot Trial (stripe) use 3 rows: Treatments | Error | Total
   *   RCBD and Pot Trial (rcbd-pot) use 4 rows: Treatments | Blocks | Error | Total
   */
  const buildAnovaShape = (ar) => {
    if (!ar || ar.error) return null;

    // ar.anova can be from performANOVA() (uses anovaTable sub-object + top-level keys)
    // OR from calculateANOVA() (uses ssTreat / dfTreat / fVal / pVal flat keys).
    // We need to handle both.
    const a   = ar.anova || {};       // AnalysisEngine stores performANOVA result here
    const tbl = a.anovaTable || {};  // performANOVA sub-object

    // ── Sum of Squares ─────────────────────────────────────────────────────
    // performANOVA   → a.ssTreatments / a.ssBlocks / a.ssError / a.ssTotal
    // calculateANOVA → a.ssTreat / a.ssBlock / a.ssError / a.ssTotal
    // anovaTable     → tbl.ss[]
    const ssTrt   = a.ssTreatments  ?? a.ssTreat  ?? (tbl.ss?.[0]) ?? 0;
    const ssBlk   = a.ssBlocks      ?? a.ssBlock  ?? (tbl.ss?.[1]) ?? 0;
    const ssErr   = a.ssError       ?? (tbl.ss?.[tbl.source?.indexOf('Error')] ?? 0);
    const ssTot   = a.ssTotal       ?? (tbl.ss?.[tbl.source?.indexOf('Total')] ?? 0);

    // ── Degrees of Freedom ─────────────────────────────────────────────────
    const dfTrt   = a.dfTreatments  ?? a.dfTreat  ?? (tbl.df?.[0]) ?? 0;
    const dfBlk   = a.dfBlocks      ?? a.dfBlock  ?? (tbl.df?.[1]) ?? 0;
    const dfErr   = a.dfError       ?? (tbl.df?.[tbl.source?.indexOf('Error')] ?? 0);
    const dfTot   = a.dfTotal       ?? (tbl.df?.[tbl.source?.indexOf('Total')] ?? 0);

    // ── Mean Squares ───────────────────────────────────────────────────────
    const msTrt   = a.msTreatments  ?? a.msTreat  ?? (tbl.ms?.[0]) ?? 0;
    const msBlk   = a.msBlocks      ?? a.msBlock  ?? (tbl.ms?.[1]) ?? 0;
    const msErr   = a.msError       ?? (tbl.ms?.[tbl.source?.indexOf('Error')] ?? 0);

    // ── F-statistic & p-value ──────────────────────────────────────────────
    // performANOVA   → a.fStatistic / a.pValue
    // calculateANOVA → a.fVal / a.pVal
    const fVal    = a.fStatistic    ?? a.fVal     ?? (tbl.f?.[0])  ?? null;
    const pVal    = a.pValue        ?? a.pVal     ?? (tbl.p?.[0])  ?? null;

    // ── Precision statistics ───────────────────────────────────────────────
    // performANOVA   → a.semGlobal / a.cd5 / a.cd1 / a.cv / a.grandMean
    // calculateANOVA → a.sem (if present) / a.cv / a.grandMean
    const sem     = a.semGlobal     ?? a.sem      ?? null;
    const lsd5    = a.cd5           ?? a.lsd5     ?? a.lsd  ?? null;
    const lsd1    = a.cd1           ?? a.lsd1     ?? null;
    const cvPct   = a.cv            ?? null;
    const gMean   = a.grandMean     ?? null;

    // ── Significance labels ────────────────────────────────────────────────
    const { symbol, text } = pVal !== null
      ? (pVal <= 0.01
          ? { symbol: '**', text: 'Highly Significant at 1% level' }
          : pVal <= 0.05
          ? { symbol: '*', text: 'Significant at 5% level' }
          : { symbol: 'NS', text: 'Non-Significant (NS)' })
      : { symbol: '?', text: 'Cannot compute' };

    // ── Design-aware ANOVA source table (PI-2 / PI-3) ─────────────────────
    // If anovaTable already has a source array (from performANOVA), use it
    // directly as it is already design-aware (CRD = 3 rows, RCBD = 4 rows).
    // Fall back to detecting design from the analysisEngine result or project.
    let useCrdStyle = false;
    if (tbl.source && Array.isArray(tbl.source)) {
      useCrdStyle = !tbl.source.includes('Blocks');
    } else {
      // Fallback: CRD-style when dfBlk === 0 (no block term)
      useCrdStyle = dfBlk === 0;
    }

    let sourceArr, ssArr, dfArr, msArr, fArr, pArr;
    if (useCrdStyle) {
      sourceArr = ['Treatments', 'Error', 'Total'];
      ssArr     = [ssTrt,  ssErr, ssTot];
      dfArr     = [dfTrt,  dfErr, dfTot];
      msArr     = [msTrt,  msErr, null];
      fArr      = [fVal,   null,  null];
      pArr      = [pVal,   null,  null];
    } else {
      sourceArr = ['Treatments', 'Blocks', 'Error', 'Total'];
      ssArr     = [ssTrt,  ssBlk, ssErr, ssTot];
      dfArr     = [dfTrt,  dfBlk, dfErr, dfTot];
      msArr     = [msTrt,  msBlk, msErr, null];
      fArr      = [fVal,   null,  null,  null];
      pArr      = [pVal,   null,  null,  null];
    }

    return {
      source: sourceArr,
      ss:     ssArr,
      df:     dfArr,
      ms:     msArr,
      f:      fArr,
      p:      pArr,
      grandMean: gMean,
      cv:    cvPct,
      sem:   sem,
      lsd5:  lsd5,
      lsd1:  lsd1,
      significant: pVal !== null && pVal <= 0.05,
      significance_label:  text,
      significance_symbol: symbol,
      usedCrdModel: useCrdStyle,
    };
  };

  const buildParameterEntry = (paramKey) => {
    const fieldMeta = (categoryConfig.observationFields || []).find(f => f.key === paramKey) || {};
    const ar = analysisResults[paramKey];
    const letters = ar?.postHoc?.letters || {};
    const engineEfficacy = ar?.efficacy || {};

    // Per-treatment means (computed independently from raw trial data)
    const rawMeans = computeTreatmentMeans(subTrials, paramKey, options.daa ?? null, category);

    // PI-4 FIX: phytotoxicity and similar adverse-effect parameters must not
    // be presented as "efficacy %" because the reduction formula would
    // misleadingly suggest the treatment is highly effective at causing crop
    // damage.  We set efficacy_pct = null and flag the column header instead.
    const isExcludedFromEfficacy = EXCLUDED_FROM_EFFICACY.has(paramKey);

    const meansObj = {};
    for (const key of treatmentKeys) {
      const { name } = treatmentMap[key];
      const rm = rawMeans[name] || {};
      const utcMean = utcName ? (rawMeans[utcName]?.mean ?? null) : null;
      const treatMean = rm.mean ?? null;

      let efficacy_pct = null;
      if (!isExcludedFromEfficacy) {
        if (engineEfficacy[name] !== undefined) {
          efficacy_pct = engineEfficacy[name];
        } else if (utcMean !== null && treatMean !== null && utcMean !== 0) {
          efficacy_pct = calculateEfficacy(category, treatMean, utcMean);
        }
      }

      meansObj[name] = {
        mean:       rm.mean ?? null,
        sd:         rm.sd   ?? null,
        se:         rm.se   ?? null,
        cv:         rm.cv   ?? null,
        n:          rm.n    ?? 0,
        cldLetter:  letters[name] || '',
        efficacy_pct,
        // Flag so renderers can display "N/A (adverse effect)" instead of "—"
        efficacyExcluded: isExcludedFromEfficacy,
      };
    }

    return {
      key:            paramKey,
      label:          fieldMeta.label || paramKey,
      unit:           fieldMeta.unit  || '',
      means:          meansObj,
      anova:          buildAnovaShape(ar),
      postHocMethod:  options.postHoc || 'lsd',
      transformation: options.transformation || 'none',
      efficacyExcluded: isExcludedFromEfficacy,
    };
  };

  const allParamEntries = paramsWithData.map(buildParameterEntry);

  // Find primary parameter entry
  const primaryParamEntry =
    allParamEntries.find(p => p.key === primaryField) ||
    (allParamEntries.length ? allParamEntries[0] : buildParameterEntry(primaryField));

  // Yield parameter (if category supports yield)
  const buildYieldEntry = async () => {
    // Check if any trial has yield data
    const hasYield = subTrials.some(t => {
      const yVal = toNum(t.Yield || t.YieldValue || t.yieldKgPlot);
      return yVal !== null;
    });
    if (!hasYield) return null;

    const yieldMeans = {};
    for (const key of treatmentKeys) {
      const { name, trials: tTrials } = treatmentMap[key];
      const vals = tTrials
        .map(t => toNum(t.Yield || t.YieldValue || t.yieldKgPlot))
        .filter(v => v !== null);
      if (vals.length) yieldMeans[name] = descStats(vals);
    }

    let yieldAnova = null;
    try {
      if (engine) {
        const yAr = await engine.analyze('yield', null, null, {
          postHoc: options.postHoc || 'lsd',
          alpha: options.alpha || 0.05,
          persist: false,
        });
        yieldAnova = buildAnovaShape(yAr);
      }
    } catch (_e) { /* yield ANOVA optional */ }

    return { means: yieldMeans, anova: yieldAnova };
  };
  const yieldEntry = await buildYieldEntry();

  // ── 9. Check params with partial data ──────────────────────────────────────
  for (const field of categoryConfig.observationFields || []) {
    if (field.type !== 'number') continue;
    if (!paramsWithData.includes(field.key)) continue;

    let hasData = 0;
    let totalTrials = subTrials.length;
    for (const trial of subTrials) {
      const efficacy = validateEfficacyData(
        safeJsonParse(trial.EfficacyDataJSON, []),
        category
      );
      if (efficacy.some(obs => toNum(obs[field.key]) !== null)) hasData++;
    }

    if (hasData > 0 && hasData < totalTrials) {
      warnings.push({
        type: 'partial_data',
        message: `Parameter "${field.label || field.key}" has data in only ${hasData} of ${totalTrials} trials.`,
      });
    }
  }

  // ── 10. Weather data ────────────────────────────────────────────────────────
  const weather = [];
  if (options.includeWeather !== false) {
    for (const trial of subTrials) {
      const temp = toNum(trial.Temperature);
      const humidity = toNum(trial.Humidity);
      const wind = toNum(trial.Windspeed || trial.WindSpeed);
      const rain = toNum(trial.Rain || trial.Rainfall);
      const date = trial.ObservationDate || trial.Date || trial.ApplicationDate || null;
      const daaVal = toNum(trial.DAA || trial.Daa);

      if (temp !== null || humidity !== null || wind !== null || rain !== null) {
        weather.push({ date, daa: daaVal, temp, humidity, wind, rain });
      }
    }
  }

  // ── 11. Photo entries ───────────────────────────────────────────────────────
  const photos = [];
  if (options.includePhotos !== false) {
    for (const trial of subTrials) {
      const urls = safeJsonParse(trial.PhotoURLs, []);
      if (!Array.isArray(urls)) continue;
      for (const entry of urls) {
        const url = typeof entry === 'string' ? entry : entry?.url;
        if (!url) continue;
        photos.push({
          url,
          treatment: trial.FormulationName || 'Unknown',
          daa: toNum(entry?.daa || trial.DAA || null),
          date: entry?.date || trial.Date || null,
          label: entry?.label || entry?.caption || '',
        });
      }
    }
  }

  // ── 12. Meta ────────────────────────────────────────────────────────────────
  const applicationDates = [
    ...new Set(
      subTrials
        .map(t => t.ApplicationDate || t.SprayDate || t.Date)
        .filter(Boolean)
    ),
  ];

  const design = project?.Design || project?.TrialDesign || 'RCBD';

  // PI-3 FIX: Determine the actual statistical model used for Pot Trials so
  // renderers can display the correct ANOVA model in the report header.
  const potLayout = project?.PotLayout || subTrials[0]?.PotLayout || 'stripe';
  const isPotTrial = design === 'PotTrial';
  // Pot Trial with stripe/randomized-row layout → CRD model
  // Pot Trial with rcbd-pot layout → RCBD model
  const analysisModel = isPotTrial
    ? (potLayout === 'rcbd-pot' ? 'RCBD' : 'CRD')
    : /CRD/i.test(design)
    ? 'CRD'
    : /FACTORIAL|TWO[- ]?WAY|2WAY/i.test(design)
    ? 'Two-Way Factorial'
    : /SPLIT[- ]?PLOT/i.test(design)
    ? 'Split-Plot'
    : 'RCBD';

  const designLabels = {
    RCBD:          'Randomized Complete Block Design',
    CRD:           'Completely Randomized Design',
    PotTrial:      'Pot Trial',
    Factorial:     'Factorial Design',
    'Split-Plot':  'Split-Plot Design',
    LargeScale:    'Large-Scale Field Trial',
  };

  // PI-5 FIX: For LargeScale projects, enrich meta with spatial sector data
  // if it has been loaded via fbGetLargeScaleData (passed through options).
  // Also compute per-treatment spatial CV% from sector values.
  const isLargeScale = design === 'LargeScale';
  let largescaleSectors  = [];
  let spatialSummary     = {};   // { [treatmentName]: { sectorCount, spatialCV } }

  if (isLargeScale && options.largeScaleData) {
    // options.largeScaleData = { sectors, quadrantsMap, observations }
    largescaleSectors = options.largeScaleData.sectors || [];

    // Build per-treatment spatial CV using final observation values per sector
    const sectorValuesByTreatment = {};
    largescaleSectors.forEach(sector => {
      const trtKey = sector.Dosage
        ? `${sector.Name || sector.Code}|${sector.Dosage}`
        : sector.Name || sector.Code;

      const quads = options.largeScaleData.quadrantsMap?.[sector.ID] || [];
      quads.forEach(quad => {
        const visits = quad.visits || [];
        if (!visits.length) return;
        const lastVisit = visits[visits.length - 1];
        const val = toNum(
          lastVisit.weedObservations?.[0]?.cover ??
          lastVisit.cropPhytotoxicity ??
          null
        );
        if (val !== null) {
          const tName = sector.Name || sector.Code || trtKey;
          if (!sectorValuesByTreatment[tName]) sectorValuesByTreatment[tName] = [];
          sectorValuesByTreatment[tName].push(val);
        }
      });
    });

    Object.entries(sectorValuesByTreatment).forEach(([tName, vals]) => {
      const stats = descStats(vals);
      spatialSummary[tName] = {
        sectorCount: vals.length,
        spatialCV: stats.cv !== null ? stats.cv : null,
        spatialMean: stats.mean,
        spatialSD: stats.sd,
      };
    });
  }

  const meta = {
    projectName:  project?.ProjectName || project?.Name || `Project ${projectId}`,
    crop:         project?.Crop    || subTrials[0]?.Crop || '',
    variety:      project?.Variety || subTrials[0]?.Variety || '',
    previousCrop: project?.PreviousCrop || subTrials[0]?.PreviousCrop || '',
    irrigationMethod: project?.IrrigationMethod || subTrials[0]?.IrrigationMethod || '',
    plantPopulation: project?.PlantPopulation || subTrials[0]?.PlantPopulation || '',
    location:     project?.Location || project?.Farm    || subTrials[0]?.Location || '',
    investigator: project?.Investigator || project?.InvestigatorName || '',
    organisation: project?.Organisation || project?.Organization    || '',
    gps:          project?.GPS || project?.Coordinates || null,
    targetSpecies:
      project?.WeedSpecies  ||
      project?.DiseaseTarget ||
      project?.PestTarget   ||
      project?.NutrientType ||
      project?.TargetWeed   ||
      '',
    applicationDates,
    reportDate:    new Date().toISOString().split('T')[0],
    design,
    designLabel:   designLabels[design] || design,
    // PI-3: expose the actual statistical model for renderers
    analysisModel,
    // PI-5: LargeScale spatial fields
    isLargeScale,
    largescaleSectors,
    spatialSummary,
    replications: maxReps,
    treatments:   treatmentKeys.length,
    category,
    categoryConfig,
  };

  // ── 13. Data completeness ───────────────────────────────────────────────────
  const dataCompleteness = {
    expected: totalExpected,
    actual:   totalActual,
    pct:      totalExpected > 0 ? Math.round((totalActual / totalExpected) * 100) : 0,
  };

  // ── 14. Assemble and return ─────────────────────────────────────────────────

  const reportData = {
    meta,
    treatmentList,
    rawMatrix,
    timeSeries,
    parameters: allParamEntries,
    primaryParameter: primaryParamEntry,
    yield: yieldEntry,
    weather,
    photos,
    warnings,
    dataCompleteness,
    // Application log — adjuvant and tankMix per application
    applicationLog: subTrials.flatMap(trial => {
      const apps = safeJsonParse(trial.ApplicationLogJSON, []);
      return apps.map(app => ({
        trialID: trial.ID,
        treatmentName: trial.FormulationName || '',
        code: app.code || '',
        date: app.date || '',
        dosage: app.dosage || '',
        method: app.method || '',
        cropStage: app.cropStage || '',
        adjuvant: app.adjuvant || '',
        tankMix: app.tankMix || '',
        temp: app.temp || '',
        humidity: app.humidity || '',
        windspeed: app.windspeed || '',
        rain: app.rain || '',
        notes: app.notes || '',
      }));
    }),
  };

  // ── Task 13: Residual diagnostics ──────────────────────────────────────────
  // Attach to the primary param ANOVA result if n >= 6
  {
    const primaryAr = analysisResults[primaryField];
    const nTotal = subTrials.length;
    if (primaryAr && !primaryAr.error && nTotal >= 6) {
      try {
        reportData.residualDiagnostics = calculateResidualsDiagnostics(primaryAr) || null;
      } catch (_e) {
        reportData.residualDiagnostics = null;
      }
    } else {
      reportData.residualDiagnostics = null;
    }
  }

  // ── Task 11: Dose-response integration ─────────────────────────────────────
  {
    const distinctDosages = [
      ...new Set(subTrials.map(t => parseFloat(t.Dosage || 0)).filter(v => v > 0)),
    ];
    if (distinctDosages.length >= 3) {
      try {
        const drResult = performDoseResponseAnalysis(subTrials, {
          metric: primaryField,
          doseField: 'Dosage',
        });
        reportData.doseResponse = drResult || null;
      } catch (_e) {
        reportData.doseResponse = null;
      }
    } else {
      reportData.doseResponse = null;
    }
  }

  // ── Task 12: Phytotoxicity section ─────────────────────────────────────────
  {
    const phytoKey = 'phytotoxicityPct';
    let hasPhytoData = false;
    const phytoValuesByTreatment = {};

    for (const trial of subTrials) {
      const trtName = trial.FormulationName || 'Unknown';
      const efficacy = validateEfficacyData(
        safeJsonParse(trial.EfficacyDataJSON, []),
        category
      );
      for (const obs of efficacy) {
        const val = toNum(obs[phytoKey]);
        if (val !== null && val > 0) hasPhytoData = true;
        if (val !== null) {
          if (!phytoValuesByTreatment[trtName]) phytoValuesByTreatment[trtName] = [];
          phytoValuesByTreatment[trtName].push(val);
        }
      }
    }

    const phytoMeans = {};
    let allZero = true;
    for (const [trtName, vals] of Object.entries(phytoValuesByTreatment)) {
      const stats = descStats(vals);
      const trtMean = stats.mean ?? 0;
      if (trtMean > 0) allZero = false;

      let safetyClass = 'Safe';
      if (trtMean >= 5 && trtMean < 10)  safetyClass = 'Minor';
      else if (trtMean >= 10 && trtMean <= 25) safetyClass = 'Moderate';
      else if (trtMean > 25)              safetyClass = 'Severe';

      phytoMeans[trtName] = { ...stats, safetyClass };
    }

    // If no trials had phyto field at all, set allZero = true
    if (Object.keys(phytoValuesByTreatment).length === 0) allZero = true;

    reportData.phytotoxicity = {
      hasData:  hasPhytoData,
      allZero,
      means:    phytoMeans,
      anova:    null,
    };
  }

  // ── Task 10 + 9: Executive summary and correlation matrix ──────────────────
  reportData.executiveSummary  = buildExecutiveSummary(reportData);
  reportData.correlationMatrix = computeCorrelationMatrix(subTrials, paramsWithData, category);

  return reportData;
}
