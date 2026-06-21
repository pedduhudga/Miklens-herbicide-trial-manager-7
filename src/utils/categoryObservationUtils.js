import { getPrimaryObservationField, getObservationPrimaryValue } from './categoryConfig.js';
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
  const obs = { ...extra };
  // Herbicide: aiData may contain weedDetails or totalWeedCover
  if (categoryId === 'herbicide') {
    if (aiData.weedDetails) obs.weedDetails = aiData.weedDetails;
    if (typeof aiData.totalWeedCover === 'number') obs[primaryField] = aiData.totalWeedCover;
    else if (aiData.weedCoverEstimate && typeof aiData.weedCoverEstimate.cover === 'number') obs[primaryField] = aiData.weedCoverEstimate.cover;
    return normalizeObservation(obs, 'herbicide');
  }

  // Non-herbicide: prefer aiData.metrics.primaryField
  if (aiData.metrics && typeof aiData.metrics === 'object' && aiData.metrics[primaryField] !== undefined) {
    const val = toNum(aiData.metrics[primaryField]);
    if (val !== null) obs[primaryField] = val;
  }
  // Fallback to any numeric aiData.value
  if ((obs[primaryField] === undefined || obs[primaryField] === null) && typeof aiData.value === 'number') {
    obs[primaryField] = aiData.value;
  }

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
