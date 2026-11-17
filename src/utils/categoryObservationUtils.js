import { CATEGORIES, getPrimaryObservationField, getObservationPrimaryValue } from './categoryConfig.js';
import { computeObservationTotalCover } from './coverUtils.js';

function toNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return isFinite(n) ? n : null;
}

export function normalizeObservation(rawObs = {}, categoryId = 'herbicide') {
  if (!rawObs || typeof rawObs !== 'object') return rawObs;
  const obs = { ...rawObs };
  const primaryField = getPrimaryObservationField(categoryId);

  // For herbicide keep weedDetails/weedCover behavior (best-effort)
  if (categoryId === 'herbicide') {
    // ensure numeric daa
    if (obs.daa !== undefined) {
      const d = toNum(obs.daa);
      if (d !== null) obs.daa = d;
    }
    // If weedCover missing but weedDetails present, compute total
    if ((obs[primaryField] === undefined || obs[primaryField] === null || obs[primaryField] === '') && Array.isArray(obs.weedDetails) && obs.weedDetails.length > 0) {
      try {
        const v = computeObservationTotalCover(obs, null);
        if (v !== null && v !== undefined) obs[primaryField] = v;
      } catch (e) { }
    }
    return obs;
  }

  // Non-herbicide: prefer explicit primary field, then legacy cover fields
  if (obs[primaryField] === undefined || obs[primaryField] === null || obs[primaryField] === '') {
    const legacyCandidates = [obs[primaryField], obs.cover, obs.totalCover, obs.weedCover, obs.weedCoverTotal, obs.coverPct, obs.percentCover];
    const found = legacyCandidates.find(v => v !== undefined && v !== null && v !== '');
    const n = toNum(found);
    if (n !== null) obs[primaryField] = n;
  }

  // Remove herbicide-only fields to avoid accidental fallbacks
  if (categoryId !== 'herbicide') {
    if (obs.weedCover !== undefined) delete obs.weedCover;
    if (obs.weedCoverMode !== undefined) delete obs.weedCoverMode;
  }

  return obs;
}

export function buildAiObservationPayload(categoryId = 'herbicide', aiData = {}, extra = {}) {
  const primaryField = getPrimaryObservationField(categoryId);
  const obs = (typeof extra === 'object' && extra !== null) ? { ...extra } : { daa: extra };
  // Herbicide: aiData may contain weedDetails or totalWeedCover
  if (categoryId === 'herbicide') {
    if (aiData.weedDetails) obs.weedDetails = aiData.weedDetails;
    if (typeof aiData.totalWeedCover === 'number') obs[primaryField] = aiData.totalWeedCover;
    else if (aiData.weedCoverEstimate && typeof aiData.weedCoverEstimate.cover === 'number') obs[primaryField] = aiData.weedCoverEstimate.cover;
    return normalizeObservation(obs, 'herbicide');
  }

  // Non-herbicide: check invalid image preclusion
  // Only invalidate if explicitly rejected by AI AND has zero positive targets or canopy metrics.
  // Never trigger on generic words like "commercial product" or "packaging", because trials evaluate products named "Commercial Product" or "Commercial Zn c b", and pot trials use nursery pots.
  const explicitlyInvalid = aiData.isValidPlotPhoto === false || aiData.isPlotPhoto === false || aiData.isPrecluded === true;
  const explicitPreclusionPhrase = /(?:evaluation precluded: non-plot|rather than an experimental crop canopy|not an experimental (?:crop|plot|canopy))/i.test(
    `${aiData.notes || ''} ${aiData.overallAssessment || ''} ${aiData.efficacyAssessment || ''} ${aiData.invalidationReason || ''}`
  );
  const hasTargets = Array.isArray(aiData.targets) && aiData.targets.length > 0;
  const hasCanopyMetrics = aiData.metrics && typeof aiData.metrics === 'object' && Object.values(aiData.metrics).some(v => typeof v === 'number' && v > 0);

  const isInvalid = (explicitlyInvalid || explicitPreclusionPhrase) && (!hasTargets && !hasCanopyMetrics);

  if (isInvalid) {
    obs.isInvalid = true;
    obs.invalidReason = aiData.invalidationReason || aiData.preclusionReason || 'Non-plot asset or commercial packaging';
    obs.status = 'Invalid (Non-plot)';
    obs[primaryField] = null;
    const catCfg = CATEGORIES[categoryId];
    if (Array.isArray(catCfg?.observationFields)) {
      catCfg.observationFields.forEach(f => {
        const fieldKey = typeof f === 'string' ? f : f?.key;
        if (fieldKey) obs[fieldKey] = null;
      });
    }
    obs.aiConfidence = 'LOW';
    obs.weedDetails = [];
    obs.notes = `[NON-PLOT IMAGE REJECTED]: ${obs.invalidReason}. Observation precluded from trial efficacy datasets.`;
    return normalizeObservation(obs, categoryId);
  }

  obs.isInvalid = false;

  // Copy all rich secondary and category-specific metrics from aiData.metrics
  if (aiData.metrics && typeof aiData.metrics === 'object') {
    Object.entries(aiData.metrics).forEach(([k, v]) => {
      if (v !== null && v !== undefined && v !== '') {
        const n = toNum(v);
        obs[k] = n !== null ? n : v;
      }
    });
  }

  // Sanitize and clamp numeric metrics to declared category scale bounds
  const catCfg = CATEGORIES[categoryId];
  if (catCfg && Array.isArray(catCfg.observationFields)) {
    catCfg.observationFields.forEach(field => {
      if (field.type === 'number' && obs[field.key] !== undefined && obs[field.key] !== null && obs[field.key] !== '') {
        let n = toNum(obs[field.key]);
        if (n !== null) {
          // If field is on a 0-10 scale and model returned percentage (e.g. 35, 15, 20), convert to 0-10 scale
          if (field.max === 10 && n > 10 && n <= 100) {
            n = parseFloat((n / 10).toFixed(1));
          }
          if (field.min !== undefined && n < field.min) n = field.min;
          if (field.max !== undefined && n > field.max) n = field.max;
          obs[field.key] = n;
        }
      }
    });
  }

  // Ensure primary observation field is set
  if (obs[primaryField] === undefined || obs[primaryField] === null) {
    if (typeof aiData.value === 'number') {
      obs[primaryField] = aiData.value;
    } else if (typeof aiData.primaryEfficacyValue === 'number') {
      obs[primaryField] = aiData.primaryEfficacyValue;
    }
  }

  // Copy targets/details
  if (Array.isArray(aiData.targets)) {
    obs.targets = aiData.targets;
    obs.weedDetails = aiData.targets;
  }

  if (aiData.confidence) obs.aiConfidence = aiData.confidence;
  if (aiData.overallAssessment) obs.aiEfficacyAssessment = aiData.overallAssessment;
  if (aiData.bbchStage) obs.bbchStage = aiData.bbchStage;

  return normalizeObservation(obs, categoryId);
}

export function getPrimaryValue(obs, categoryId = 'herbicide') {
  return getObservationPrimaryValue(categoryId, obs);
}

export function createObservationFromForm(form = {}, categoryId = 'herbicide') {
  const obs = { ...form };
  // Ensure numeric fields where reasonably expected
  if (obs.daa !== undefined) obs.daa = toNum(obs.daa);
  const primaryField = getPrimaryObservationField(categoryId);
  if (obs[primaryField] !== undefined) obs[primaryField] = toNum(obs[primaryField]);

  const catCfg = CATEGORIES[categoryId];
  if (catCfg && Array.isArray(catCfg.observationFields)) {
    catCfg.observationFields.forEach(field => {
      if (field.type === 'number' && obs[field.key] !== undefined && obs[field.key] !== null && obs[field.key] !== '') {
        let n = toNum(obs[field.key]);
        if (n !== null) {
          if (field.max === 10 && n > 10 && n <= 100) {
            n = parseFloat((n / 10).toFixed(1));
          }
          if (field.min !== undefined && n < field.min) n = field.min;
          if (field.max !== undefined && n > field.max) n = field.max;
          obs[field.key] = n;
        }
      }
    });
  }

  return normalizeObservation(obs, categoryId);
}

export default { normalizeObservation, buildAiObservationPayload, getPrimaryValue, createObservationFromForm };
