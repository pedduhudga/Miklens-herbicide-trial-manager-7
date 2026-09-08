import { safeJsonParse } from './helpers.js';
import { getCategoryConfig, getObservationPrimaryValue, calculateEfficacy } from './categoryConfig.js';
import { validateEfficacyData } from './analysisUtils.js';

/**
 * Accurately extracts or calculates efficacy % for a trial in any category.
 * Grounded in EfficacyDataJSON (comparing latest to baseline via category rules) or trial.Result.
 *
 * @param {Object} trial - Trial record
 * @param {string} category - Active category (e.g. 'herbicide', 'fungicide')
 * @returns {number|null} Efficacy percentage (0 - 100) or null if insufficient data
 */
export function getTrialCalculatedEfficacy(trial, category = 'herbicide') {
  if (!trial) return null;

  // 1. Direct explicit numeric efficacy field if already populated
  if (trial.FinalEfficacy !== undefined && trial.FinalEfficacy !== null && !isNaN(Number(trial.FinalEfficacy)) && Number(trial.FinalEfficacy) > 0) {
    return Math.round(Number(trial.FinalEfficacy));
  }
  if (trial.Efficacy !== undefined && trial.Efficacy !== null && !isNaN(Number(trial.Efficacy)) && Number(trial.Efficacy) > 0) {
    return Math.round(Number(trial.Efficacy));
  }

  // 2. Derive dynamically from EfficacyDataJSON
  const rawEffData = safeJsonParse(trial.EfficacyDataJSON, []);
  if (Array.isArray(rawEffData) && rawEffData.length > 0) {
    const sorted = [...rawEffData].sort((a, b) => Number(a.daa ?? 0) - Number(b.daa ?? 0));
    const baseObs = sorted.find(o => o.isBaseline || Number(o.daa) === 0) || sorted[0];
    const latestObs = sorted[sorted.length - 1];

    if (baseObs && latestObs && latestObs !== baseObs) {
      const getVal = (obs) => {
        const v = getObservationPrimaryValue(category, obs);
        if (v !== null && v !== undefined && !isNaN(Number(v))) return Number(v);
        if (obs.weedCover !== undefined && !isNaN(Number(obs.weedCover))) return Number(obs.weedCover);
        if (obs.weedCoverage !== undefined && !isNaN(Number(obs.weedCoverage))) return Number(obs.weedCoverage);
        if (obs.diseaseSeverity !== undefined && !isNaN(Number(obs.diseaseSeverity))) return Number(obs.diseaseSeverity);
        if (obs.pestCount !== undefined && !isNaN(Number(obs.pestCount))) return Number(obs.pestCount);
        if (obs.visualVigor !== undefined && !isNaN(Number(obs.visualVigor))) return Number(obs.visualVigor);
        if (obs.overallVigor !== undefined && !isNaN(Number(obs.overallVigor))) return Number(obs.overallVigor);
        return null;
      };

      const baseVal = getVal(baseObs);
      const latestVal = getVal(latestObs);
      if (baseVal !== null && latestVal !== null && baseVal > 0) {
        const calculated = calculateEfficacy(category, latestVal, baseVal);
        if (calculated !== null && !isNaN(calculated)) {
          return Math.round(Math.min(100, Math.max(0, calculated)));
        }
      }
    }

    // Direct control/efficacy metric embedded in observation
    for (let i = sorted.length - 1; i >= 0; i--) {
      const o = sorted[i];
      if (o.controlPct !== undefined && o.controlPct !== null && !isNaN(Number(o.controlPct))) {
        return Math.round(Number(o.controlPct));
      }
      if (o.wce !== undefined && o.wce !== null && !isNaN(Number(o.wce))) {
        return Math.round(Number(o.wce));
      }
      if (o.efficacy !== undefined && o.efficacy !== null && !isNaN(Number(o.efficacy))) {
        return Math.round(Number(o.efficacy));
      }
    }
  }

  // 3. Fallback to qualitative Result assessment
  const res = (trial.Result || '').trim().toLowerCase();
  if (res === 'excellent') return 90;
  if (res === 'good') return 75;
  if (res === 'fair') return 55;
  if (res === 'poor') return 25;

  return null;
}

/**
 * Accurately extracts the target species (weed, disease, pest, crop) for any trial.
 *
 * @param {Object} trial - Trial record
 * @param {string} category - Active category
 * @returns {string} Clean target species name
 */
export function getTrialTargetSpecies(trial, category = 'herbicide') {
  if (!trial) return 'General';
  const cConf = getCategoryConfig(category);
  const targetKey = cConf?.targetField || 'WeedSpecies';

  const val = trial[targetKey] || trial.WeedSpecies || trial.TargetWeed || trial.TargetWeeds || trial.DiseaseTarget || trial.PestTarget || trial.CropTarget || trial.Crop;
  if (!val || typeof val !== 'string') return 'General';
  const clean = val.trim();
  return clean || 'General';
}

/**
 * Robustly matches whether a trial is associated with a formulation.
 * Handles ID match, Name match, and dosage-tagged names (e.g. "CL-5 @ 2.5 ml/L").
 *
 * @param {Object} trial - Trial record
 * @param {Object} formulation - Formulation object
 * @returns {boolean} True if linked
 */
export function isTrialLinkedToFormulation(trial, formulation) {
  if (!trial || !formulation) return false;

  const fId = String(formulation.ID || formulation.id || '').trim().toLowerCase();
  const fName = String(formulation.Name || formulation.name || '').trim().toLowerCase();
  const fCode = String(formulation.Code || formulation.code || '').trim().toLowerCase();

  const tFormId = String(trial.FormulationID || trial.formulationId || '').trim().toLowerCase();
  if (fId && tFormId && fId === tFormId) return true;

  const tFormName = String(trial.FormulationName || trial.formulationName || trial.Product || '').trim().toLowerCase();
  if (!tFormName) return false;

  if (fName && tFormName === fName) return true;
  if (fCode && tFormName === fCode) return true;

  // Handle dosage suffix like "CL-5 @ 2.5 ml/L" or "CL-5 (F-HER-123)"
  if (fName && (
    tFormName.startsWith(fName + ' ') ||
    tFormName.startsWith(fName + '@') ||
    tFormName.includes(` ${fName} `) ||
    tFormName.startsWith(`${fName}(`)
  )) {
    return true;
  }

  return false;
}

/**
 * Computes consolidated, highly accurate trial performance analytics for a formulation.
 *
 * @param {Object} formulation - Formulation record
 * @param {Array} allTrials - All trials in state
 * @param {Array} allProjects - All projects in state
 * @param {string} category - Active category
 * @returns {Object} Comprehensive stats object
 */
export function getFormulationTrialStats(formulation, allTrials = [], allProjects = [], category = 'herbicide') {
  if (!formulation) {
    return {
      linkedTrials: [],
      total: 0,
      microplotCount: 0,
      fieldCount: 0,
      finalizedCount: 0,
      activeCount: 0,
      winCount: 0,
      winRate: 0,
      avgEfficacy: null,
      peakEfficacy: null,
      avgCtrlDays: null,
      targetMap: {},
      dosageMap: {}
    };
  }

  // Filter linked trials matching category and formulation
  const linkedTrials = (allTrials || []).filter(t => {
    const trialCat = (t.Category || 'herbicide').toLowerCase();
    if (trialCat !== category.toLowerCase()) return false;
    return isTrialLinkedToFormulation(t, formulation);
  });

  const projectMap = new Map();
  (allProjects || []).forEach(p => projectMap.set(String(p.ID || p.id), p));

  let microplotCount = 0;
  let fieldCount = 0;
  let finalizedCount = 0;
  let winCount = 0;
  const efficacies = [];
  const ctrlDaysList = [];
  const targetMap = {};
  const dosageMap = {};

  linkedTrials.forEach(t => {
    const proj = projectMap.get(String(t.ProjectID));
    const isField = (proj && proj.Design === 'LargeScale') || t.Design === 'LargeScale' || t.ProjectDesign === 'LargeScale';

    if (isField) {
      fieldCount++;
    } else {
      microplotCount++;
    }

    const isFinalized = t.IsCompleted === true || t.IsCompleted === 'true' || t.ControlFinalized === true || t.Status === 'Finalized';
    if (isFinalized) finalizedCount++;

    // Rating & Win count
    const r = (t.Result || '').trim().toLowerCase();
    if (r === 'excellent' || r === 'good') {
      winCount++;
    }

    // Calculated Efficacy %
    const eff = getTrialCalculatedEfficacy(t, category);
    if (eff !== null && !isNaN(eff) && eff > 0) {
      efficacies.push(eff);
    }

    // Control Duration (Finalized only)
    if (isFinalized) {
      if (t.FinalControlDuration) {
        const days = parseInt(t.FinalControlDuration, 10);
        if (!isNaN(days) && days > 0) ctrlDaysList.push(days);
      } else if (t.Date && t.FinalizationDate) {
        const days = Math.max(0, Math.round((new Date(t.FinalizationDate) - new Date(t.Date)) / 86400000));
        if (days > 0) ctrlDaysList.push(days);
      }
    }

    // Target breakdown
    const tgt = getTrialTargetSpecies(t, category);
    if (!targetMap[tgt]) {
      targetMap[tgt] = { target: tgt, count: 0, wins: 0, effs: [] };
    }
    targetMap[tgt].count++;
    if (r === 'excellent' || r === 'good') targetMap[tgt].wins++;
    if (eff !== null && !isNaN(eff)) targetMap[tgt].effs.push(eff);

    // Dosage breakdown
    const dose = String(t.Dosage || t.DosageRate || 'Standard Rate').trim();
    if (!dosageMap[dose]) {
      dosageMap[dose] = { dosage: dose, count: 0, wins: 0, effs: [] };
    }
    dosageMap[dose].count++;
    if (r === 'excellent' || r === 'good') dosageMap[dose].wins++;
    if (eff !== null && !isNaN(eff)) dosageMap[dose].effs.push(eff);
  });

  const total = linkedTrials.length;
  const avgEff = efficacies.length > 0 ? Math.round(efficacies.reduce((a, b) => a + b, 0) / efficacies.length) : null;
  const peakEff = efficacies.length > 0 ? Math.max(...efficacies) : null;
  const avgCtrlDays = ctrlDaysList.length > 0 ? Math.round(ctrlDaysList.reduce((a, b) => a + b, 0) / ctrlDaysList.length) : null;
  const winRate = total > 0 ? Math.round((winCount / total) * 100) : 0;

  // Process target map with win rates and average efficacy
  Object.keys(targetMap).forEach(k => {
    const item = targetMap[k];
    item.winRate = Math.round((item.wins / item.count) * 100);
    item.avgEff = item.effs.length > 0 ? Math.round(item.effs.reduce((a, b) => a + b, 0) / item.effs.length) : null;
  });

  // Process dosage map with win rates and average efficacy
  Object.keys(dosageMap).forEach(k => {
    const item = dosageMap[k];
    item.winRate = Math.round((item.wins / item.count) * 100);
    item.avgEff = item.effs.length > 0 ? Math.round(item.effs.reduce((a, b) => a + b, 0) / item.effs.length) : null;
  });

  return {
    linkedTrials,
    total,
    microplotCount,
    fieldCount,
    finalizedCount,
    activeCount: total - finalizedCount,
    winCount,
    winRate,
    avgEfficacy: avgEff,
    peakEfficacy: peakEff,
    avgCtrlDays,
    targetMap,
    dosageMap
  };
}

/**
 * Formats a clean, professional rating badge object with label, text color, and background.
 *
 * @param {number|null} avgEff - Average efficacy percentage (0 - 100)
 * @param {string|null} fallbackResult - Qualitative result fallback ('Excellent', 'Good', etc.)
 * @returns {Object} { label: string, shortLabel: string, colorClass: string, dotColor: string, isUntested: boolean }
 */
export function getEfficacyRatingBadge(avgEff, fallbackResult = null) {
  if (avgEff !== null && avgEff !== undefined && !isNaN(avgEff)) {
    if (avgEff >= 80) {
      return {
        label: `${avgEff}% • Excellent`,
        shortLabel: `${avgEff}%`,
        colorClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        dotColor: 'bg-emerald-500',
        isUntested: false
      };
    }
    if (avgEff >= 65) {
      return {
        label: `${avgEff}% • Good`,
        shortLabel: `${avgEff}%`,
        colorClass: 'bg-blue-50 text-blue-700 border-blue-200',
        dotColor: 'bg-blue-500',
        isUntested: false
      };
    }
    if (avgEff >= 45) {
      return {
        label: `${avgEff}% • Fair`,
        shortLabel: `${avgEff}%`,
        colorClass: 'bg-amber-50 text-amber-700 border-amber-200',
        dotColor: 'bg-amber-500',
        isUntested: false
      };
    }
    return {
      label: `${avgEff}% • Poor`,
      shortLabel: `${avgEff}%`,
      colorClass: 'bg-rose-50 text-rose-700 border-rose-200',
      dotColor: 'bg-rose-500',
      isUntested: false
    };
  }

  if (fallbackResult) {
    const r = String(fallbackResult).trim().toLowerCase();
    if (r === 'excellent') {
      return { label: 'Excellent', shortLabel: 'Exc', colorClass: 'bg-emerald-50 text-emerald-700 border-emerald-200', dotColor: 'bg-emerald-500', isUntested: false };
    }
    if (r === 'good') {
      return { label: 'Good', shortLabel: 'Good', colorClass: 'bg-blue-50 text-blue-700 border-blue-200', dotColor: 'bg-blue-500', isUntested: false };
    }
    if (r === 'fair') {
      return { label: 'Fair', shortLabel: 'Fair', colorClass: 'bg-amber-50 text-amber-700 border-amber-200', dotColor: 'bg-amber-500', isUntested: false };
    }
    if (r === 'poor') {
      return { label: 'Poor', shortLabel: 'Poor', colorClass: 'bg-rose-50 text-rose-700 border-rose-200', dotColor: 'bg-rose-500', isUntested: false };
    }
  }

  return {
    label: 'Untested',
    shortLabel: 'Untested',
    colorClass: 'bg-slate-100 text-slate-500 border-slate-200',
    dotColor: 'bg-slate-400',
    isUntested: true
  };
}

