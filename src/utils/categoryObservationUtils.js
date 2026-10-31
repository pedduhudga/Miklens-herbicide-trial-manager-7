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
  const isInvalid = aiData.isValidPlotPhoto === false || aiData.isPrecluded === true || 
    /precluded|packaging|commercial product|advertisement|not an experimental plot|flyer/i.test(`${aiData.notes || ''} ${aiData.overallAssessment || ''} ${aiData.efficacyAssessment || ''}`);

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
  return normalizeObservation(obs, categoryId);
}

export default { normalizeObservation, buildAiObservationPayload, getPrimaryValue, createObservationFromForm };
