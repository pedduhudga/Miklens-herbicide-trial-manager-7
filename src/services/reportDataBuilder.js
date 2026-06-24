/**
 * reportDataBuilder.js
 *
 * Core data aggregation service for the advanced reporting pipeline.
 * Accepts project-level trial data, groups by treatment, computes
 * descriptive statistics via AnalysisEngine, and returns a single
 * well-shaped ReportData object consumed by all report renderers.
 */

import { validateEfficacyData, AnalysisEngine } from '../utils/analysisUtils.js';
import {
  getCategoryConfig,
  getPrimaryObservationField,
  calculateEfficacy,
} from '../utils/categoryConfig.js';
import { safeJsonParse } from '../utils/helpers.js';

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

      const row = { daa: targetObs ? (parseFloat(targetObs.daa) || null) : null };
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
  const buildAnovaShape = (ar) => {
    if (!ar || ar.error) return null;
    const a = ar.anova || {};
    const pVal = a.pVal ?? a.p ?? null;
    const fVal = a.fVal ?? a.f ?? null;
    const { symbol, text } = pVal !== null
      ? (pVal <= 0.01
          ? { symbol: '**', text: 'Highly Significant at 1% level' }
          : pVal <= 0.05
          ? { symbol: '*', text: 'Significant at 5% level' }
          : { symbol: 'NS', text: 'Non-Significant (NS)' })
      : { symbol: '?', text: 'Cannot compute' };

    return {
      source: ['Treatments', 'Blocks', 'Error', 'Total'],
      ss: [a.ssTreat ?? 0, a.ssBlock ?? 0, a.ssError ?? 0, a.ssTotal ?? 0],
      df: [a.dfTreat ?? 0, a.dfBlock ?? 0, a.dfError ?? 0, a.dfTotal ?? 0],
      ms: [a.msTreat ?? 0, a.msBlock ?? 0, a.msError ?? 0, null],
      f: [fVal, null, null, null],
      p: [pVal, null, null, null],
      grandMean: a.grandMean ?? null,
      cv: a.cv ?? null,
      sem: a.sem ?? a.semPlus ?? null,
      lsd5: a.lsd5 ?? a.lsd ?? null,
      lsd1: a.lsd1 ?? null,
      significant: pVal !== null && pVal <= 0.05,
      significance_label: text,
      significance_symbol: symbol,
    };
  };

  const buildParameterEntry = (paramKey) => {
    const fieldMeta = (categoryConfig.observationFields || []).find(f => f.key === paramKey) || {};
    const ar = analysisResults[paramKey];
    const letters = ar?.postHoc?.letters || {};
    const engineMeans = ar?.means || {};
    const engineEfficacy = ar?.efficacy || {};

    // Per-treatment means (computed independently from rawMatrix for accuracy)
    const rawMeans = computeTreatmentMeans(subTrials, paramKey, options.daa ?? null, category);

    const meansObj = {};
    for (const key of treatmentKeys) {
      const { name } = treatmentMap[key];
      const rm = rawMeans[name] || {};
      const utcMean = utcName ? (rawMeans[utcName]?.mean ?? null) : null;
      const treatMean = rm.mean ?? null;

      let efficacy_pct = null;
      if (engineEfficacy[name] !== undefined) {
        efficacy_pct = engineEfficacy[name];
      } else if (utcMean !== null && treatMean !== null && utcMean !== 0) {
        efficacy_pct = calculateEfficacy(category, treatMean, utcMean);
      }

      meansObj[name] = {
        mean: rm.mean ?? null,
        sd: rm.sd ?? null,
        se: rm.se ?? null,
        cv: rm.cv ?? null,
        n: rm.n ?? 0,
        cldLetter: letters[name] || '',
        efficacy_pct,
      };
    }

    return {
      key: paramKey,
      label: fieldMeta.label || paramKey,
      unit: fieldMeta.unit || '',
      means: meansObj,
      anova: buildAnovaShape(ar),
      postHocMethod: options.postHoc || 'lsd',
      transformation: options.transformation || 'none',
    };
  };

  const allParamEntries = paramsWithData.map(buildParameterEntry);

  // Find primary parameter entry
  const primaryParamEntry =
    allParamEntries.find(p => p.key === primaryField) ||
    (allParamEntries.length ? allParamEntries[0] : buildParameterEntry(primaryField));

  // Yield parameter (if category supports yield)
  const yieldEntry = (() => {
    const yieldParamKey = 'yieldKgPlot';
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
  })();

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
  const designLabels = {
    RCBD: 'Randomized Complete Block Design',
    CRD: 'Completely Randomized Design',
    PotTrial: 'Pot Trial',
    Factorial: 'Factorial Design',
    'Split-Plot': 'Split-Plot Design',
    LargeScale: 'Large-Scale Field Trial',
  };

  const meta = {
    projectName: project?.ProjectName || project?.Name || `Project ${projectId}`,
    crop: project?.Crop || subTrials[0]?.Crop || '',
    location: project?.Location || project?.Farm || subTrials[0]?.Location || '',
    investigator: project?.Investigator || project?.InvestigatorName || '',
    organisation: project?.Organisation || project?.Organization || '',
    gps: project?.GPS || project?.Coordinates || null,
    targetSpecies:
      project?.WeedSpecies ||
      project?.DiseaseTarget ||
      project?.PestTarget ||
      project?.NutrientType ||
      project?.TargetWeed ||
      '',
    applicationDates,
    reportDate: new Date().toISOString().split('T')[0],
    design,
    designLabel: designLabels[design] || design,
    replications: maxReps,
    treatments: treatmentKeys.length,
    category,
    categoryConfig,
  };

  // ── 13. Data completeness ───────────────────────────────────────────────────
  const dataCompleteness = {
    expected: totalExpected,
    actual: totalActual,
    pct: totalExpected > 0 ? Math.round((totalActual / totalExpected) * 100) : 0,
  };

  // ── 14. Assemble and return ─────────────────────────────────────────────────
  return {
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
  };
}
