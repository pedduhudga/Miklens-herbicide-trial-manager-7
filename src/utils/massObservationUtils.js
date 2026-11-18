import { safeJsonParse } from './helpers.js';

/**
 * Normalize various date representations (YYYY-MM-DD, DD-MM-YYYY, ISO timestamp)
 * into a canonical YYYY-MM-DD string for reliable equality and sorting.
 */
export function normalizeObsDate(dateVal) {
  if (!dateVal) return '';
  const str = String(dateVal).trim();
  if (!str) return '';

  // Already YYYY-MM-DD (or ISO starting with YYYY-MM-DD)
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  // DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = str.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (dmyMatch) {
    return `${dmyMatch[3]}-${dmyMatch[2]}-${dmyMatch[1]}`;
  }

  // Fallback Date parse
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return '';
}

/**
 * Format YYYY-MM-DD into DD-MM-YYYY for display.
 */
export function formatDisplayDate(dateStr) {
  const norm = normalizeObsDate(dateStr);
  if (!norm) return dateStr || '—';
  const [y, m, d] = norm.split('-');
  return `${d}-${m}-${y}`;
}

/**
 * Extract numeric plant height from an observation object across all supported field keys.
 */
export function extractHeightFromObs(obs) {
  if (!obs || typeof obs !== 'object') return null;
  const raw = obs.plantHeight ?? obs['Plant Height'] ?? obs.plant_height;
  if (raw !== undefined && raw !== null && raw !== '') {
    const num = parseFloat(raw);
    if (!isNaN(num)) return num;
  }
  if (Array.isArray(obs.potHeights) && obs.potHeights.length > 0) {
    const nums = obs.potHeights.map(v => parseFloat(v)).filter(v => !isNaN(v));
    if (nums.length > 0) {
      return parseFloat((nums.reduce((s, v) => s + v, 0) / nums.length).toFixed(2));
    }
  }
  return null;
}

/**
 * Strictly find an observation matching the target date.
 * - Priority 1: Exact normalized date match (obs.date === targetDate)
 * - Priority 2: ONLY if an existing observation has NO date field at all, match by DAA.
 * Never returns an observation whose date is a different day.
 */
export function findObservationForDate(efficacyData, targetDate, targetDaa = null) {
  if (!Array.isArray(efficacyData) || efficacyData.length === 0) return null;
  const normTarget = normalizeObsDate(targetDate);

  if (normTarget) {
    const exactMatch = efficacyData.find(o => o && normalizeObsDate(o.date) === normTarget);
    if (exactMatch) return exactMatch;
  }

  // Fallback ONLY for legacy dateless observations
  if (targetDaa !== null && targetDaa !== undefined && targetDaa !== '') {
    const targetDaaNum = Number(targetDaa);
    if (!isNaN(targetDaaNum)) {
      return efficacyData.find(o => {
        if (!o) return false;
        const obsNormDate = normalizeObsDate(o.date);
        return !obsNormDate && Number(o.daa) === targetDaaNum;
      }) || null;
    }
  }

  return null;
}

/**
 * Get the most recent recorded plant height STRICTLY BEFORE currentDate.
 * Never compares a date against itself.
 */
export function getPreviousHeightBeforeDate(efficacyData, currentDate, currentDaa = null) {
  if (!Array.isArray(efficacyData) || efficacyData.length === 0) return null;
  const normCurrent = normalizeObsDate(currentDate);
  const currentDaaNum = currentDaa !== null && currentDaa !== undefined && currentDaa !== '' ? Number(currentDaa) : null;

  const earlierWithHeight = efficacyData
    .map(o => {
      if (!o) return null;
      const val = extractHeightFromObs(o);
      if (val === null) return null;
      const oDate = normalizeObsDate(o.date);
      const oDaa = o.daa !== undefined && o.daa !== null && o.daa !== '' ? Number(o.daa) : null;

      // Exclude current date or any future date
      if (normCurrent && oDate) {
        if (oDate >= normCurrent) return null;
      } else if (currentDaaNum !== null && !isNaN(currentDaaNum) && oDaa !== null && !isNaN(oDaa)) {
        if (oDaa >= currentDaaNum) return null;
      } else if (normCurrent && oDate === normCurrent) {
        return null;
      }

      return { val, daa: oDaa ?? 0, date: oDate };
    })
    .filter(Boolean);

  if (earlierWithHeight.length === 0) return null;

  // Pick the most recent earlier date (or highest earlier DAA)
  earlierWithHeight.sort((a, b) => {
    if (a.date && b.date && a.date !== b.date) return b.date.localeCompare(a.date);
    return (b.daa || 0) - (a.daa || 0);
  });

  return earlierWithHeight[0];
}

/**
 * Merge all recorded observation dates across both trial cards (EfficacyDataJSON)
 * and the dedicated Firebase `massObservations` collection.
 * Returns an array sorted newest date first.
 */
export function buildRecordedDatesHistory(trialsList = [], firebaseMassObsList = [], primaryField = 'visualVigor') {
  const dateMap = new Map();

  const ensureDateBucket = (normDate, daa = null) => {
    if (!dateMap.has(normDate)) {
      dateMap.set(normDate, {
        date: normDate,
        daa: daa !== null && daa !== undefined && !isNaN(Number(daa)) ? Number(daa) : null,
        bbchStage: '',
        generalNotes: '',
        fromFirebaseCollection: false,
        entriesByTrialId: {},
      });
    }
    const bucket = dateMap.get(normDate);
    if (bucket.daa === null && daa !== null && daa !== undefined && !isNaN(Number(daa))) {
      bucket.daa = Number(daa);
    }
    return bucket;
  };

  // 1. Hydrate from each trial's EfficacyDataJSON (always available offline/legacy)
  trialsList.forEach(trial => {
    const eff = safeJsonParse(trial.EfficacyDataJSON, []);
    if (!Array.isArray(eff)) return;
    eff.forEach(obs => {
      if (!obs) return;
      const normDate = normalizeObsDate(obs.date);
      if (!normDate) return;

      const hVal = extractHeightFromObs(obs);
      const rawMetric = obs[primaryField];
      const mVal = rawMetric !== undefined && rawMetric !== null && rawMetric !== '' && !isNaN(parseFloat(rawMetric))
        ? parseFloat(rawMetric)
        : null;

      // Only include dates that actually have a height, metric, note, or rating recorded
      if (hVal === null && mVal === null && !obs.notes && !obs.bbchStage && !obs.rating) return;

      const bucket = ensureDateBucket(normDate, obs.daa);
      if (obs.bbchStage && !bucket.bbchStage) bucket.bbchStage = obs.bbchStage;

      bucket.entriesByTrialId[trial.ID] = {
        plantHeight: hVal,
        metricValue: mVal,
        rating: obs.rating || '',
        notes: obs.notes && obs.notes !== 'Mass observation entry' ? obs.notes : '',
        daa: obs.daa,
      };
    });
  });

  // 2. Merge structured Firebase `massObservations` documents (enriches generalNotes, bbchStage, entries)
  (firebaseMassObsList || []).forEach(batch => {
    if (!batch) return;
    const normDate = normalizeObsDate(batch.Date || batch.date);
    if (!normDate) return;

    const bucket = ensureDateBucket(normDate, batch.DAA ?? batch.daa);
    bucket.fromFirebaseCollection = true;
    if (batch.BBCHStage) bucket.bbchStage = batch.BBCHStage;
    if (batch.GeneralNotes) bucket.generalNotes = batch.GeneralNotes;

    const entries = batch.Entries || {};
    Object.entries(entries).forEach(([trialId, e]) => {
      if (!e) return;
      const existing = bucket.entriesByTrialId[trialId] || {};
      const hVal = e.plantHeight !== undefined && e.plantHeight !== null && e.plantHeight !== '' && !isNaN(parseFloat(e.plantHeight))
        ? parseFloat(e.plantHeight)
        : (existing.plantHeight ?? null);
      const mVal = e.metricValue !== undefined && e.metricValue !== null && e.metricValue !== '' && !isNaN(parseFloat(e.metricValue))
        ? parseFloat(e.metricValue)
        : (existing.metricValue ?? null);

      bucket.entriesByTrialId[trialId] = {
        plantHeight: hVal,
        metricValue: mVal,
        rating: e.rating || existing.rating || '',
        notes: e.notes || existing.notes || '',
        daa: bucket.daa,
      };
    });
  });

  // 3. Compute summary stats per date & sort newest first
  return Array.from(dateMap.values())
    .map(bucket => {
      const entryValues = Object.values(bucket.entriesByTrialId);
      const heights = entryValues.map(e => e.plantHeight).filter(v => v !== null && !isNaN(v));
      const metrics = entryValues.map(e => e.metricValue).filter(v => v !== null && !isNaN(v));
      return {
        ...bucket,
        plotCount: entryValues.length,
        heightCount: heights.length,
        avgHeight: heights.length > 0 ? (heights.reduce((s, v) => s + v, 0) / heights.length).toFixed(1) : null,
        minHeight: heights.length > 0 ? Math.min(...heights).toFixed(1) : null,
        maxHeight: heights.length > 0 ? Math.max(...heights).toFixed(1) : null,
        metricCount: metrics.length,
        avgMetric: metrics.length > 0 ? (metrics.reduce((s, v) => s + v, 0) / metrics.length).toFixed(1) : null,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Merge a single plot's mass observation entry into its EfficacyDataJSON array
 * strictly keyed by normalized date (never overwriting a different date's observation).
 */
export function mergePlotObservationForDate({
  trial,
  efficacyData,
  date,
  daa,
  heightVal,
  numVal,
  rating,
  entryNotes,
  generalNotes,
  bbchStage,
  primaryField,
  trialCat,
}) {
  const normDate = normalizeObsDate(date) || new Date().toISOString().split('T')[0];
  const resolvedDaa = Number(daa) || 0;
  const hasPlantHeight = heightVal !== null && heightVal !== undefined && !isNaN(heightVal);
  const hasValue = numVal !== null && numVal !== undefined && !isNaN(numVal);

  const cleanEntryNote = (entryNotes || '').trim();
  const cleanGeneralNote = (generalNotes || '').trim();
  const noteText = [cleanGeneralNote, cleanEntryNote]
    .filter(Boolean)
    .filter((v, idx, arr) => arr.indexOf(v) === idx)
    .join(' | ');

  const nextData = Array.isArray(efficacyData) ? efficacyData.map(o => ({ ...o })) : [];
  let obs = findObservationForDate(nextData, normDate, resolvedDaa);

  if (obs) {
    obs.date = normDate;
    obs.daa = resolvedDaa;
    if (hasValue) obs[primaryField] = numVal;
    if (hasPlantHeight) {
      obs['Plant Height'] = heightVal;
      obs.plantHeight = heightVal;
      obs.plant_height = heightVal;
      obs.potHeights = [heightVal];
    }
    if (trialCat === 'herbicide' && hasValue) {
      obs.weedCover = numVal;
      if (!obs.weedDetails || obs.weedDetails.length === 0) {
        obs.weedDetails = [{ species: 'Total', cover: numVal, status: '', notes: noteText }];
      } else {
        obs.weedDetails = obs.weedDetails.map(w => ({ ...w, cover: numVal }));
      }
    }
    if (noteText) {
      // Avoid duplicating identical notes when re-editing the same date
      if (!obs.notes || obs.notes === 'Mass observation entry' || obs.notes === noteText || obs.notes.includes(noteText)) {
        obs.notes = noteText;
      } else if (noteText.includes(obs.notes)) {
        obs.notes = noteText;
      } else {
        obs.notes = `${obs.notes} | ${noteText}`;
      }
    }
    if (bbchStage) obs.bbchStage = bbchStage;
    if (rating) obs.rating = rating;
    obs.source = obs.source || 'mass-observation';
    obs.updatedAt = new Date().toISOString();
  } else {
    obs = {
      daa: resolvedDaa,
      date: normDate,
      treatment: trial.FormulationName || (trial.IsControl ? 'Untreated Control' : 'Treated'),
      plot: trial.PlotNumber || trial.PotLabel || '1',
      rep: trial.Replication || 1,
      notes: noteText || '',
      bbchStage: bbchStage || '',
      source: 'mass-observation',
      recordedAt: new Date().toISOString(),
      ...(rating ? { rating } : {}),
      ...(hasPlantHeight ? {
        'Plant Height': heightVal,
        plantHeight: heightVal,
        plant_height: heightVal,
        potHeights: [heightVal],
      } : {}),
      ...(hasValue ? { [primaryField]: numVal } : {}),
      ...(trialCat === 'herbicide' && hasValue ? {
        weedCover: numVal,
        weedDetails: [{ species: 'Total', cover: numVal, status: '', notes: noteText }],
      } : {}),
    };
    nextData.push(obs);
  }

  nextData.sort((a, b) => {
    const dA = normalizeObsDate(a.date);
    const dB = normalizeObsDate(b.date);
    if (dA && dB && dA !== dB) return dA.localeCompare(dB);
    return (Number(a.daa) || 0) - (Number(b.daa) || 0);
  });

  return nextData;
}

/**
 * Build a clean Firestore `massObservations` document payload from a saved batch.
 */
export function buildMassObservationPayload({
  project,
  trialsList = [],
  date,
  daa,
  generalNotes,
  bbchStage,
  plotEntries,
  primaryField,
  mode,
  activeCategory,
}) {
  const normDate = normalizeObsDate(date) || new Date().toISOString().split('T')[0];
  const entries = {};
  const heights = [];
  const metrics = [];

  Object.entries(plotEntries || {}).forEach(([trialId, entry]) => {
    if (!entry) return;
    const hasHeight = entry.plantHeight !== '' && entry.plantHeight != null && !isNaN(parseFloat(entry.plantHeight));
    const hasMetric = entry.metricValue !== '' && entry.metricValue != null && !isNaN(parseFloat(entry.metricValue));
    const hasRating = !!entry.rating;
    const hasNotes = !!(entry.notes && entry.notes.trim());

    if (!hasHeight && !hasMetric && !hasRating && !hasNotes) return;

    const trial = trialsList.find(t => String(t.ID) === String(trialId));
    const hVal = hasHeight ? parseFloat(entry.plantHeight) : null;
    const mVal = hasMetric ? parseFloat(entry.metricValue) : null;
    if (hVal !== null) heights.push(hVal);
    if (mVal !== null) metrics.push(mVal);

    entries[trialId] = {
      trialId,
      plotLabel: trial?.PotLabel || trial?.PlotNumber || '',
      treatmentName: trial?.FormulationName || '',
      isControl: trial?.IsControl === true || trial?.IsControl === 'true',
      plantHeight: hVal,
      metricValue: mVal,
      rating: entry.rating || '',
      notes: (entry.notes || '').trim(),
    };
  });

  const projectId = String(project?.ID || trialsList[0]?.ProjectID || '');
  return {
    ProjectID: projectId,
    ProjectName: project?.Name || '',
    Category: project?.Category || activeCategory || 'herbicide',
    Date: normDate,
    DAA: Number(daa) || 0,
    Mode: mode || 'plantHeight',
    PrimaryField: primaryField || '',
    BBCHStage: (bbchStage || '').trim(),
    GeneralNotes: (generalNotes || '').trim(),
    PlotCount: Object.keys(entries).length,
    SummaryStats: {
      heightCount: heights.length,
      avgHeight: heights.length ? parseFloat((heights.reduce((s, v) => s + v, 0) / heights.length).toFixed(2)) : null,
      minHeight: heights.length ? Math.min(...heights) : null,
      maxHeight: heights.length ? Math.max(...heights) : null,
      metricCount: metrics.length,
      avgMetric: metrics.length ? parseFloat((metrics.reduce((s, v) => s + v, 0) / metrics.length).toFixed(2)) : null,
      minMetric: metrics.length ? Math.min(...metrics) : null,
      maxMetric: metrics.length ? Math.max(...metrics) : null,
    },
    Entries: entries,
    SharedWith: Array.isArray(project?.SharedWith) ? project.SharedWith : [],
  };
}
