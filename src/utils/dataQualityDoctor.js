/**
 * Trial Data Quality & Interactive Correction Doctor Engine
 * 
 * Automatically detects:
 * 1. Anomalies & Outliers on continuous variables (MAD, IQR, modified Z-scores, extreme values).
 * 2. Measurement scale inconsistencies on ordinal / growth-stage fields (mixed BBCH codes vs 0/1 ordinal scores).
 * 3. Unconfirmed zero measurements on growth parameters (differentiating dead seedlings vs typos vs unmeasured).
 * 4. Missing / incomplete observations across assessment dates and plots.
 * 
 * Provides atomic, audited correction tools to update trial observations in Dexie & Firebase in real-time.
 */

import { safeJsonParse } from './helpers.js';
import { normalizeReportDateKey, isOrdinalOrStageField } from '../services/advancedReportGenerator.js';

/**
 * Extract numeric value from an observation row for a given metric key.
 */
export function extractMetricValue(obs, metricKey) {
  if (!obs || typeof obs !== 'object') return null;
  const raw = obs[metricKey];
  if (raw !== undefined && raw !== null && raw !== '') {
    const parsed = parseFloat(raw);
    if (Number.isFinite(parsed)) return parsed;
    // Return string for stage/categorical
    return String(raw).trim();
  }
  if (String(metricKey).toLowerCase().replace(/\s/g, '') === 'plantheight' && Array.isArray(obs.potHeights)) {
    const valid = obs.potHeights.map(h => parseFloat(h)).filter(v => Number.isFinite(v));
    if (valid.length > 0) return valid.reduce((a, b) => a + b, 0) / valid.length;
  }
  return null;
}

/**
 * Scan all trials in a project for data health issues.
 * 
 * @param {Array} projectTrials - List of trial objects belonging to the project
 * @param {Object} project - Project metadata
 * @param {Object} catConfig - Category configuration object (e.g. from getCategoryConfig)
 * @returns {Object} Comprehensive Data Health Report
 */
export function scanProjectDataHealth(projectTrials = [], project = {}, catConfig = {}) {
  const trials = Array.isArray(projectTrials) ? projectTrials : [];
  const fields = (catConfig?.observationFields || []).filter(
    f => f && f.key && !['nue', 'audpc', 'rootToShootRatio', 'fruitHealthNote'].includes(f.key)
  );

  const allObservations = [];
  const trialMap = new Map();

  // Extract all observations from each trial
  trials.forEach(t => {
    trialMap.set(String(t.ID), t);
    const effList = safeJsonParse(t.EfficacyDataJSON, []);
    const trtName = t.FormulationName || (t.IsControl ? 'Untreated Control' : 'Treated');
    const plot = t.PlotNumber || t.Plot || 'N/A';
    const rep = t.Replication || t.Rep || 1;

    effList.forEach(obs => {
      if (!obs) return;
      const normDate = normalizeReportDateKey(obs.date);
      allObservations.push({
        ...obs,
        date: normDate || obs.date || 'N/A',
        rawDate: obs.date,
        daa: obs.daa !== undefined && obs.daa !== null ? Number(obs.daa) : null,
        trialId: String(t.ID),
        plot,
        rep,
        treatment: trtName,
        isControl: !!(t.IsControl === true || t.IsControl === 'true'),
        trial: t,
        auditTrail: Array.isArray(obs.auditTrail) ? obs.auditTrail : [],
        isConfirmedTrueZero: !!obs.isConfirmedTrueZero,
        mortalityNote: obs.mortalityNote || ''
      });
    });
  });

  const anomalies = [];
  const scaleInconsistencies = [];
  const missingObservations = [];
  const resolvedIssues = [];

  // Group observations by assessment date
  const obsByDate = new Map();
  allObservations.forEach(obs => {
    if (!obsByDate.has(obs.date)) obsByDate.set(obs.date, []);
    obsByDate.get(obs.date).push(obs);
  });

  const uniqueDates = Array.from(obsByDate.keys()).filter(d => d && d !== 'N/A');

  // 1. ANOMALY & OUTLIER DETECTION (on continuous numeric variables)
  fields.forEach(f => {
    if (isOrdinalOrStageField(f)) return; // Handled separately by scale validation

    uniqueDates.forEach(dateStr => {
      const dateObs = obsByDate.get(dateStr) || [];
      const entries = [];

      dateObs.forEach(obs => {
        const val = extractMetricValue(obs, f.key);
        if (typeof val === 'number' && Number.isFinite(val)) {
          entries.push({ val, obs });
        }
      });

      if (entries.length < 3) return;

      const vals = entries.map(e => e.val);
      const sorted = [...vals].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
      const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
      const variance = vals.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (vals.length - 1 || 1);
      const stdDev = Math.sqrt(variance);

      const absDevs = sorted.map(v => Math.abs(v - median)).sort((a, b) => a - b);
      const madMid = Math.floor(absDevs.length / 2);
      const mad = absDevs.length % 2 !== 0 ? absDevs[madMid] : (absDevs[madMid - 1] + absDevs[madMid]) / 2;

      const q1 = sorted[Math.floor(sorted.length * 0.25)];
      const q3 = sorted[Math.floor(sorted.length * 0.75)];
      const iqr = q3 - q1;

      const isBounded0to10 = /\(0-10\)/i.test(f.label || '') || (f.min === 0 && f.max === 10);
      const isPercentSymptom = /chlorosis|deficiency|necrosis|severity|incidence/i.test(f.key || f.label || '');

      entries.forEach(({ val, obs }) => {
        // Skip valid bounded symptom scores
        if (isBounded0to10 && val >= 0 && val <= 10) return;
        if (isPercentSymptom && val >= 0 && val <= 25 && median === 0) return;

        let isAnomaly = false;
        let reason = '';
        let severity = 'medium';

        // Check 1: Plant height = 0 cm (classic field anomaly / dead plant)
        if (f.key.toLowerCase().replace(/\s/g, '') === 'plantheight' && val === 0) {
          isAnomaly = true;
          severity = 'high';
          reason = `Zero reading on plant height (dataset median = ${median.toFixed(1)} cm)`;
        } else if (mad > 0) {
          const modZ = (0.6745 * Math.abs(val - median)) / mad;
          if (modZ > 3.5 && Math.abs(val - median) > Math.max(2 * iqr, 1)) {
            isAnomaly = true;
            severity = modZ > 5 ? 'high' : 'medium';
            reason = `Extreme outlier: Modified Z-score = ${modZ.toFixed(1)} (median = ${median.toFixed(1)})`;
          }
        } else if (stdDev > 0) {
          const z = Math.abs(val - mean) / stdDev;
          const gap = Math.abs(val - median);
          if ((z >= 3.0 && gap >= Math.max(10, 5 * Math.max(1, iqr))) || (gap >= 10 && val >= 10 * Math.max(1, Math.abs(median)))) {
            isAnomaly = true;
            severity = 'high';
            reason = `Extreme spike: Z-score = ${z.toFixed(1)} (mean = ${mean.toFixed(1)})`;
          }
        }

        if (isAnomaly) {
          const issueItem = {
            id: `anomaly_${obs.trialId}_${obs.date}_${f.key}`,
            type: 'anomaly',
            severity,
            trialId: obs.trialId,
            plot: obs.plot,
            rep: obs.rep,
            treatment: obs.treatment,
            isControl: obs.isControl,
            date: obs.date,
            daa: obs.daa,
            metricKey: f.key,
            metricLabel: f.label || f.key,
            unit: f.unit || '',
            currentValue: val,
            median: parseFloat(median.toFixed(2)),
            mean: parseFloat(mean.toFixed(2)),
            stdDev: parseFloat(stdDev.toFixed(2)),
            reason,
            isConfirmedTrueZero: obs.isConfirmedTrueZero,
            mortalityNote: obs.mortalityNote,
            hasAuditHistory: obs.auditTrail && obs.auditTrail.length > 0,
            auditTrail: obs.auditTrail,
            explanation: `Plot ${obs.plot} (${obs.treatment}, ${obs.date}) has ${f.label || f.key} = ${val} vs dataset median ${median.toFixed(1)} ${f.unit || ''}. ${reason}.`
          };

          if (obs.isConfirmedTrueZero) {
            resolvedIssues.push({
              ...issueItem,
              resolvedType: 'confirmed_zero',
              resolutionNote: obs.mortalityNote || 'Confirmed legitimate zero / mortality'
            });
          } else {
            anomalies.push(issueItem);
          }
        }
      });
    });
  });

  // 2. MEASUREMENT SCALE INCONSISTENCY (Ordinal / Stage fields)
  fields.forEach(f => {
    if (!isOrdinalOrStageField(f)) return;

    const entries = [];
    allObservations.forEach(obs => {
      const raw = obs[f.key];
      if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
        const str = String(raw).trim();
        const num = Number(str);
        entries.push({
          raw,
          str,
          num: Number.isFinite(num) ? num : null,
          obs
        });
      }
    });

    if (entries.length === 0) return;

    const smallOrdinal = entries.filter(e => e.num !== null && e.num >= 0 && e.num <= 5);
    const bbchLike = entries.filter(e => e.num !== null && e.num >= 10 && e.num <= 99);
    const textLike = entries.filter(e => e.num === null);

    // If there's a mixture of ordinal (0-5) and BBCH (10-99)
    if (smallOrdinal.length > 0 && bbchLike.length > 0) {
      // The minority is flagged for standardization
      const primaryIsOrdinal = smallOrdinal.length >= bbchLike.length;
      const flagged = primaryIsOrdinal ? bbchLike : smallOrdinal;

      flagged.forEach(({ raw, str, num, obs }) => {
        scaleInconsistencies.push({
          id: `scale_${obs.trialId}_${obs.date}_${f.key}`,
          type: 'scale_inconsistency',
          severity: 'high',
          trialId: obs.trialId,
          plot: obs.plot,
          rep: obs.rep,
          treatment: obs.treatment,
          isControl: obs.isControl,
          date: obs.date,
          daa: obs.daa,
          metricKey: f.key,
          metricLabel: f.label || f.key,
          currentValue: raw,
          detectedScale: primaryIsOrdinal ? 'BBCH 2-digit code in ordinal trial' : 'Ordinal score in BBCH trial',
          explanation: `Plot ${obs.plot} (${obs.treatment}, ${obs.date}) has ${f.label || f.key} = "${raw}". The trial primarily uses ${primaryIsOrdinal ? '0–5 ordinal scale' : '10–99 BBCH scale'}. Mixing BBCH codes with ordinal values creates artificial +2420% efficacy errors and invalidates ANOVA.`,
          suggestedValues: primaryIsOrdinal ? [
            { label: 'Stage 1 (Open Flowers / Flowering)', value: 1 },
            { label: 'Stage 0 (No Flowers / Vegetative)', value: 0 },
            { label: 'Stage 2 (Full Bloom)', value: 2 }
          ] : [
            { label: 'BBCH 61 (Beginning of flowering)', value: 61 },
            { label: 'BBCH 65 (Full flowering)', value: 65 }
          ]
        });
      });
    } else if (textLike.length > 0 && (smallOrdinal.length > 0 || bbchLike.length > 0)) {
      textLike.forEach(({ raw, obs }) => {
        scaleInconsistencies.push({
          id: `scale_${obs.trialId}_${obs.date}_${f.key}`,
          type: 'scale_inconsistency',
          severity: 'medium',
          trialId: obs.trialId,
          plot: obs.plot,
          rep: obs.rep,
          treatment: obs.treatment,
          isControl: obs.isControl,
          date: obs.date,
          daa: obs.daa,
          metricKey: f.key,
          metricLabel: f.label || f.key,
          currentValue: raw,
          detectedScale: 'Text description mixed with numeric scale',
          explanation: `Plot ${obs.plot} (${obs.treatment}, ${obs.date}) has ${f.label || f.key} = "${raw}". Consider standardizing to a consistent numeric score.`,
          suggestedValues: []
        });
      });
    }
  });

  // 3. MISSING OBSERVATIONS SCAN (by assessment date)
  // For each assessment date, find fields that were evaluated on that date.
  // If >50% of plots have this field evaluated, any plot without a reading is flagged as missing data.
  uniqueDates.forEach(dateStr => {
    const dateObs = obsByDate.get(dateStr) || [];
    const dateObsMap = new Map();
    dateObs.forEach(obs => dateObsMap.set(obs.trialId, obs));

    fields.forEach(f => {
      let evaluatedCount = 0;
      dateObs.forEach(obs => {
        const val = extractMetricValue(obs, f.key);
        if (val !== null && val !== '') evaluatedCount++;
      });

      // If more than 3 plots (and >= 30% of plots) have observations for this field on this date
      if (evaluatedCount >= 3 && evaluatedCount >= Math.floor(trials.length * 0.3)) {
        trials.forEach(trial => {
          const tId = String(trial.ID);
          const obs = dateObsMap.get(tId);
          const val = obs ? extractMetricValue(obs, f.key) : null;

          if (val === null || val === '') {
            const trtName = trial.FormulationName || (trial.IsControl ? 'Untreated Control' : 'Treated');
            const plot = trial.PlotNumber || trial.Plot || 'N/A';
            const rep = trial.Replication || trial.Rep || 1;

            missingObservations.push({
              id: `missing_${tId}_${dateStr}_${f.key}`,
              type: 'missing_data',
              severity: 'medium',
              trialId: tId,
              plot,
              rep,
              treatment: trtName,
              isControl: !!(trial.IsControl === true || trial.IsControl === 'true'),
              date: dateStr,
              daa: obs ? obs.daa : null,
              metricKey: f.key,
              metricLabel: f.label || f.key,
              unit: f.unit || '',
              currentValue: null,
              evaluatedCount,
              totalPlots: trials.length,
              explanation: `Plot ${plot} (${trtName}) has no reading for "${f.label || f.key}" on ${dateStr} (${evaluatedCount} of ${trials.length} other plots recorded).`
            });
          }
        });
      }
    });
  });

  // Compute Overall Health Score
  const totalIssuesCount = anomalies.length + scaleInconsistencies.length + missingObservations.length;
  const totalExpectedChecks = Math.max(1, (trials.length * fields.length * Math.max(1, uniqueDates.length)));
  const penalty = (anomalies.length * 10) + (scaleInconsistencies.length * 10) + (missingObservations.length * 3);
  const healthScore = Math.max(10, Math.min(100, Math.round(100 - (penalty / totalExpectedChecks) * 100)));

  return {
    projectName: project?.Name || 'Trial Project',
    totalPlots: trials.length,
    totalDates: uniqueDates.length,
    uniqueDates,
    fields,
    healthScore,
    totalIssuesCount,
    anomalies,
    scaleInconsistencies,
    missingObservations,
    resolvedIssues,
    isHealthy: totalIssuesCount === 0
  };
}

/**
 * Apply an atomic data correction to a specific trial observation.
 * 
 * @param {Object} params
 * @param {Array} params.projectTrials - Current list of trial objects
 * @param {string|number} params.trialId - Target trial ID
 * @param {string} params.date - Observation date (YYYY-MM-DD)
 * @param {string} params.metricKey - The parameter key (e.g. 'plantHeight', 'flowerStage')
 * @param {any} params.newValue - The new corrected value
 * @param {string} params.action - 'correct_value' | 'confirm_true_zero' | 'delete_value'
 * @param {string} params.auditReason - Agronomist reason for audit trail
 * @param {string} params.author - Name/email of user making the correction
 * @returns {Object} { updatedTrial, updatedTrialsList }
 */
export function applyDataCorrection({
  projectTrials = [],
  trialId,
  date,
  metricKey,
  newValue,
  action = 'correct_value',
  auditReason = '',
  author = 'Agronomist'
}) {
  const normTargetDate = normalizeReportDateKey(date);
  const targetTrial = projectTrials.find(t => String(t.ID) === String(trialId));

  if (!targetTrial) {
    throw new Error(`Trial #${trialId} not found in project trials.`);
  }

  const existingEff = safeJsonParse(targetTrial.EfficacyDataJSON, []);
  let foundObs = false;
  const originalPreviousValue = targetTrial[metricKey] ?? null;

  const updatedEff = existingEff.map(obs => {
    if (!obs) return obs;
    const obsNormDate = normalizeReportDateKey(obs.date);
    if (obsNormDate !== normTargetDate && obs.date !== date) return obs;

    foundObs = true;
    const cloned = { ...obs };
    const prevVal = cloned[metricKey] !== undefined ? cloned[metricKey] : null;

    if (!Array.isArray(cloned.auditTrail)) cloned.auditTrail = [];

    if (action === 'confirm_true_zero') {
      cloned.isConfirmedTrueZero = true;
      cloned.mortalityNote = auditReason || 'Confirmed genuine true zero / seedling mortality';
      cloned.auditTrail.push({
        timestamp: new Date().toISOString(),
        action: 'confirm_true_zero',
        metricKey,
        reason: cloned.mortalityNote,
        author
      });
    } else if (action === 'delete_value') {
      delete cloned[metricKey];
      if (metricKey === 'plantHeight') delete cloned.potHeights;
      cloned.auditTrail.push({
        timestamp: new Date().toISOString(),
        action: 'delete_value',
        metricKey,
        previousValue: prevVal,
        reason: auditReason || 'Removed erroneous entry',
        author
      });
    } else {
      // update / correct value
      const parsedNum = parseFloat(newValue);
      const isNum = !isNaN(parsedNum) && String(newValue).trim() !== '';
      const finalVal = isNum ? parsedNum : (newValue === '' ? null : newValue);

      cloned[metricKey] = finalVal;

      // Keep potHeights in sync for plant height
      if (metricKey === 'plantHeight') {
        cloned.potHeights = isNum ? [parsedNum] : [];
      }

      // If correcting away from zero, clear unconfirmed true zero flag
      if (finalVal !== 0) {
        cloned.isConfirmedTrueZero = false;
      }

      cloned.auditTrail.push({
        timestamp: new Date().toISOString(),
        action: 'update_value',
        metricKey,
        previousValue: prevVal,
        newValue: finalVal,
        reason: auditReason || 'Field value corrected / standardized',
        author
      });
    }

    return cloned;
  });

  // If observation record for this date didn't exist yet (e.g. adding missing data)
  if (!foundObs && action === 'correct_value') {
    const parsedNum = parseFloat(newValue);
    const isNum = !isNaN(parsedNum) && String(newValue).trim() !== '';
    const finalVal = isNum ? parsedNum : newValue;

    const newObs = {
      date: normTargetDate || date,
      daa: 0,
      [metricKey]: finalVal,
      auditTrail: [{
        timestamp: new Date().toISOString(),
        action: 'add_missing_value',
        metricKey,
        newValue: finalVal,
        reason: auditReason || 'Entered missing field observation',
        author
      }]
    };
    if (metricKey === 'plantHeight' && isNum) {
      newObs.potHeights = [parsedNum];
    }
    updatedEff.push(newObs);
  }

  const updatedTrial = {
    ...targetTrial,
    EfficacyDataJSON: JSON.stringify(updatedEff),
    UpdatedAt: new Date().toISOString()
  };

  const updatedTrialsList = projectTrials.map(t =>
    String(t.ID) === String(trialId) ? updatedTrial : t
  );

  return { updatedTrial, updatedTrialsList };
}
