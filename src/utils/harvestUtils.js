// src/utils/harvestUtils.js
// Standardized Multi-Harvest, Picking Logs, and Yield Extrapolations for scientific agronomic trials.

import { safeJsonParse, getPlotAreaHectares } from './helpers.js';

export const HARVEST_YIELD_UNITS = [
  // ── Inhouse, Greenhouse & Small-Scale Trials (Primary Focus) ──
  { id: 'g_pot', value: 'g/pot', label: 'g / pot (Indoor / Greenhouse Pot)', factorToKg: 0.001, isSmallScale: true },
  { id: 'g_plant', value: 'g/plant', label: 'g / plant (Single Plant Harvest)', factorToKg: 0.001, isSmallScale: true },
  { id: 'fruits_plant', value: 'fruits/plant', label: 'fruits / plant (Fruit Count per Plant)', factorToKg: null, isSmallScale: true },
  { id: 'kg_pot', value: 'kg/pot', label: 'kg / pot (Large Pot / Tub)', factorToKg: 1, isSmallScale: true },
  { id: 'kg_plant', value: 'kg/plant', label: 'kg / plant (Individual Plant)', factorToKg: 1, isSmallScale: true },
  { id: 'g_tray', value: 'g/tray', label: 'g / tray (Seedling / Bench Tray)', factorToKg: 0.001, isSmallScale: true },
  { id: 'bunches_vine', value: 'bunches/vine', label: 'bunches / vine (Climber / Vine)', factorToKg: null, isSmallScale: true },
  { id: 'g_plot', value: 'g/plot', label: 'g / plot (Micro-plot / Bench)', factorToKg: 0.001, isSmallScale: true },
  { id: 'kg_plot', value: 'kg/plot', label: 'kg / plot (Standard Small Plot)', factorToKg: 1, isSmallScale: true },

  // ── Commercial & Field Scale Trials (Secondary Option) ──
  { id: 'q_ha', value: 'q/ha', label: 'q / ha (Field Quintals / ha)', factorToKg: 100, isSmallScale: false },
  { id: 't_ha', value: 't/ha', label: 't / ha (Field Tonnes / ha)', factorToKg: 1000, isSmallScale: false },
  { id: 'kg_ha', value: 'kg/ha', label: 'kg / ha (Field kg / ha)', factorToKg: 1, isSmallScale: false },
  { id: 'cwt_acre', value: 'cwt/acre', label: 'cwt / acre (Hundredweight / acre)', factorToKg: 112.085, isSmallScale: false },
  { id: 'lbs_plot', value: 'lbs/plot', label: 'lbs / plot (Pounds / plot)', factorToKg: 0.453592, isSmallScale: false },
];

export const CULL_REASONS = [
  'None / Grade A Clean',
  'Insect Damage (Borer / Puncture)',
  'Fungal Rot / Anthracnose / Blight',
  'Blossom End Rot (Ca Deficiency)',
  'Sun Scald / Heat Necrosis',
  'Fruit Cracking / Splitting',
  'Undersized / Malformed',
  'Viral Stunting / Mosaic Mottle',
  'Bird / Rodent Pecking',
  'Other Physiological Disorder',
];

/**
 * Normalizes an individual picking record.
 */
export function normalizePickingItem(raw, idx = 0, defaultPlotAreaM2 = null) {
  if (!raw || typeof raw !== 'object') {
    return {
      id: `p_${Date.now()}_${idx}`,
      pickingNumber: idx + 1,
      harvestDate: new Date().toISOString().split('T')[0],
      cropStage: '',
      actualFruitCount: '',
      actualMarketableWeight: '',
      actualUnmarketableWeight: '',
      totalWeight: '',
      marketableRatio: '',
      yieldUnit: 'g/pot',
      plotAreaM2: defaultPlotAreaM2 || '',
      moisturePct: '',
      brixScore: '',
      cullReason: '',
      extrapolatedYieldKgHa: '',
      extrapolatedYieldQHa: '',
      extrapolatedYieldTHa: '',
      notes: '',
      photos: [],
    };
  }

  const mWeight = parseFloat(raw.actualMarketableWeight ?? raw.marketableWeight ?? 0) || 0;
  const uWeight = parseFloat(raw.actualUnmarketableWeight ?? raw.unmarketableWeight ?? 0) || 0;
  const totalWeight = mWeight + uWeight;
  const marketableRatio = totalWeight > 0 ? ((mWeight / totalWeight) * 100).toFixed(1) : (mWeight > 0 ? '100.0' : '');

  // Calculate extrapolated kg/ha, q/ha, and t/ha if plot area in m² is given or if in per-ha units
  const areaM2 = parseFloat(raw.plotAreaM2 || defaultPlotAreaM2 || 0);
  let extrapolatedKgHa = '';
  let extrapolatedQHa = '';
  let extrapolatedTHa = '';
  const unit = raw.yieldUnit || 'g/pot';

  if ((unit === 'q_ha' || unit === 'q/ha') && totalWeight > 0) {
    extrapolatedQHa = totalWeight.toFixed(2);
    extrapolatedKgHa = (totalWeight * 100).toFixed(1);
    extrapolatedTHa = (totalWeight / 10).toFixed(2);
  } else if ((unit === 't_ha' || unit === 't/ha') && totalWeight > 0) {
    extrapolatedTHa = totalWeight.toFixed(2);
    extrapolatedKgHa = (totalWeight * 1000).toFixed(1);
    extrapolatedQHa = (totalWeight * 10).toFixed(2);
  } else if ((unit === 'kg_ha' || unit === 'kg/ha') && totalWeight > 0) {
    extrapolatedKgHa = totalWeight.toFixed(1);
    extrapolatedQHa = (totalWeight / 100).toFixed(2);
    extrapolatedTHa = (totalWeight / 1000).toFixed(2);
  } else if (areaM2 > 0 && totalWeight > 0) {
    if (unit === 'kg/plot' || unit === 'kg' || unit === 'kg_plot' || unit === 'kg/pot' || unit === 'kg_pot' || unit === 'kg/plant' || unit === 'kg_plant') {
      const kgHa = (totalWeight / areaM2) * 10000;
      extrapolatedKgHa = kgHa.toFixed(1);
      extrapolatedQHa = (kgHa / 100).toFixed(2);
      extrapolatedTHa = (kgHa / 1000).toFixed(2);
    } else if (unit === 'g/plot' || unit === 'g_plot' || unit === 'g/plant' || unit === 'g_plant' || unit === 'g' || unit === 'g/pot' || unit === 'g_pot' || unit === 'g/tray' || unit === 'g_tray') {
      const kgHa = ((totalWeight / 1000) / areaM2) * 10000;
      extrapolatedKgHa = kgHa.toFixed(1);
      extrapolatedQHa = (kgHa / 100).toFixed(2);
      extrapolatedTHa = (kgHa / 1000).toFixed(2);
    } else if (unit === 'lbs_plot' || unit === 'lbs/plot') {
      const kgHa = ((totalWeight * 0.453592) / areaM2) * 10000;
      extrapolatedKgHa = kgHa.toFixed(1);
      extrapolatedQHa = (kgHa / 100).toFixed(2);
      extrapolatedTHa = (kgHa / 1000).toFixed(2);
    }
  }

  return {
    id: raw.id || `p_${Date.now()}_${idx}`,
    pickingNumber: Number(raw.pickingNumber) || (idx + 1),
    harvestDate: raw.harvestDate || raw.date || '',
    cropStage: raw.cropStage || '',
    actualFruitCount: raw.actualFruitCount !== '' && raw.actualFruitCount !== undefined ? raw.actualFruitCount : (raw.fruitCount ?? ''),
    actualMarketableWeight: raw.actualMarketableWeight !== '' && raw.actualMarketableWeight !== undefined ? raw.actualMarketableWeight : (raw.marketableWeight ?? ''),
    actualUnmarketableWeight: raw.actualUnmarketableWeight !== '' && raw.actualUnmarketableWeight !== undefined ? raw.actualUnmarketableWeight : (raw.unmarketableWeight ?? ''),
    totalWeight: totalWeight > 0 ? parseFloat(totalWeight.toFixed(2)) : '',
    marketableRatio: marketableRatio !== '' ? `${marketableRatio}%` : '',
    yieldUnit: raw.yieldUnit || 'g/pot',
    plotAreaM2: raw.plotAreaM2 || '',
    moisturePct: raw.moisturePct ?? raw.moisture ?? '',
    brixScore: raw.brixScore ?? raw.brix ?? '',
    cullReason: raw.cullReason || '',
    extrapolatedYieldKgHa: raw.extrapolatedYieldKgHa || extrapolatedKgHa,
    extrapolatedYieldQHa: raw.extrapolatedYieldQHa || extrapolatedQHa,
    extrapolatedYieldTHa: raw.extrapolatedYieldTHa || extrapolatedTHa,
    notes: raw.notes || '',
    photos: Array.isArray(raw.photos) ? raw.photos : [],
  };
}

/**
 * Calculates cumulative totals across multiple pickings.
 */
export function calculateHarvestTotals(pickingsList = [], defaultPlotAreaM2 = null) {
  let cumMarketable = 0;
  let cumUnmarketable = 0;
  let cumFruits = 0;
  let latestDate = '';
  let earliestDate = '';
  let unit = 'g/pot';

  (pickingsList || []).forEach(p => {
    const m = parseFloat(p.actualMarketableWeight ?? p.marketableWeight ?? 0) || 0;
    const u = parseFloat(p.actualUnmarketableWeight ?? p.unmarketableWeight ?? 0) || 0;
    const f = parseFloat(p.actualFruitCount ?? p.fruitCount ?? 0) || 0;
    cumMarketable += m;
    cumUnmarketable += u;
    cumFruits += f;

    if (p.yieldUnit) unit = p.yieldUnit;

    const d = p.harvestDate || '';
    if (d) {
      if (!earliestDate || d < earliestDate) earliestDate = d;
      if (!latestDate || d > latestDate) latestDate = d;
    }
  });

  const cumTotal = cumMarketable + cumUnmarketable;
  const marketablePct = cumTotal > 0 ? ((cumMarketable / cumTotal) * 100).toFixed(1) : (cumMarketable > 0 ? '100.0' : '—');
  const avgUnitWeight = cumFruits > 0 ? ((cumTotal / cumFruits) * (unit.includes('kg') ? 1000 : 1)).toFixed(1) : '—';

  // Area extrapolation
  let extrapolatedKgHa = '';
  let extrapolatedQHa = '';
  let extrapolatedTHa = '';
  const area = parseFloat(defaultPlotAreaM2 || (pickingsList[0]?.plotAreaM2) || 0);

  if ((unit === 'q_ha' || unit === 'q/ha') && cumTotal > 0) {
    extrapolatedQHa = cumTotal.toFixed(2);
    extrapolatedKgHa = (cumTotal * 100).toFixed(1);
    extrapolatedTHa = (cumTotal / 10).toFixed(2);
  } else if ((unit === 't_ha' || unit === 't/ha') && cumTotal > 0) {
    extrapolatedTHa = cumTotal.toFixed(2);
    extrapolatedKgHa = (cumTotal * 1000).toFixed(1);
    extrapolatedQHa = (cumTotal * 10).toFixed(2);
  } else if ((unit === 'kg_ha' || unit === 'kg/ha') && cumTotal > 0) {
    extrapolatedKgHa = cumTotal.toFixed(1);
    extrapolatedQHa = (cumTotal / 100).toFixed(2);
    extrapolatedTHa = (cumTotal / 1000).toFixed(2);
  } else if (area > 0 && cumTotal > 0) {
    if (unit === 'kg/plot' || unit === 'kg' || unit === 'kg_plot' || unit === 'kg/pot' || unit === 'kg_pot' || unit === 'kg/plant' || unit === 'kg_plant') {
      const kgHa = (cumTotal / area) * 10000;
      extrapolatedKgHa = kgHa.toFixed(1);
      extrapolatedQHa = (kgHa / 100).toFixed(2);
      extrapolatedTHa = (kgHa / 1000).toFixed(2);
    } else if (unit === 'g/plot' || unit === 'g_plot' || unit === 'g/plant' || unit === 'g_plant' || unit === 'g' || unit === 'g/pot' || unit === 'g_pot' || unit === 'g/tray' || unit === 'g_tray') {
      const kgHa = ((cumTotal / 1000) / area) * 10000;
      extrapolatedKgHa = kgHa.toFixed(1);
      extrapolatedQHa = (kgHa / 100).toFixed(2);
      extrapolatedTHa = (kgHa / 1000).toFixed(2);
    } else if (unit === 'lbs_plot' || unit === 'lbs/plot') {
      const kgHa = ((cumTotal * 0.453592) / area) * 10000;
      extrapolatedKgHa = kgHa.toFixed(1);
      extrapolatedQHa = (kgHa / 100).toFixed(2);
      extrapolatedTHa = (kgHa / 1000).toFixed(2);
    }
  }

  const brixScores = (pickingsList || []).map(p => parseFloat(p.brixScore)).filter(n => !isNaN(n) && n > 0);
  const moistures = (pickingsList || []).map(p => parseFloat(p.moisturePct)).filter(n => !isNaN(n) && n > 0);
  const avgBrix = brixScores.length > 0 ? brixScores.reduce((a, b) => a + b, 0) / brixScores.length : 0;
  const avgMoist = moistures.length > 0 ? moistures.reduce((a, b) => a + b, 0) / moistures.length : 0;
  const marketablePercentage = cumTotal > 0 ? (cumMarketable / cumTotal) * 100 : (cumMarketable > 0 ? 100 : 0);
  const unmarketablePercentage = cumTotal > 0 ? (cumUnmarketable / cumTotal) * 100 : 0;

  return {
    actualMarketableWeight: cumMarketable > 0 ? parseFloat(cumMarketable.toFixed(2)) : '',
    actualUnmarketableWeight: cumUnmarketable > 0 ? parseFloat(cumUnmarketable.toFixed(2)) : '',
    actualFruitCount: cumFruits > 0 ? cumFruits : '',
    cumulativeTotalYield: cumTotal > 0 ? parseFloat(cumTotal.toFixed(2)) : '',
    totalMarketableWeight: cumMarketable,
    totalUnmarketableWeight: cumUnmarketable,
    totalWeight: cumTotal,
    totalFruitCount: cumFruits,
    marketablePct: marketablePct !== '—' ? `${marketablePct}%` : '—',
    marketablePercentage,
    unmarketablePercentage,
    averageBrix: avgBrix,
    averageMoisture: avgMoist,
    averageFruitWeightG: avgUnitWeight !== '—' ? `${avgUnitWeight} g` : '—',
    extrapolatedKgHa: extrapolatedKgHa || '',
    extrapolatedQHa: extrapolatedQHa || '',
    extrapolatedTHa: extrapolatedTHa || '',
    harvestDate: latestDate || '',
    latestHarvestDate: latestDate || '',
    firstHarvestDate: earliestDate || '',
    lastHarvestDate: latestDate || '',
    pickingsCount: (pickingsList || []).length,
    yieldUnit: unit,
  };
}

/**
 * Aggregates harvest pickings and yield data across all sub-trials/plots in a project.
 */
export function aggregateProjectHarvest(subTrials = []) {
  if (!Array.isArray(subTrials) || subTrials.length === 0) {
    return {
      treatments: [],
      pickingsTable: [],
      cumulativeTable: [],
      hasData: false,
      totalPlots: 0,
      plotsWithHarvest: 0,
      totalPickingsCount: 0,
      totalMarketableWeight: 0,
      totalUnmarketableWeight: 0,
      avgMarketablePerPlot: 0,
      marketablePct: 0,
      extrapolatedMeanYieldTHa: 0,
      avgBrix: 0,
      avgMoisture: 0,
    };
  }

  const treatmentMap = {};
  const allPickings = [];

  subTrials.forEach(trial => {
    const tName = trial.FormulationName || trial.FormulationID || 'Untreated Control';
    if (!treatmentMap[tName]) {
      treatmentMap[tName] = {
        name: tName,
        trials: [],
        pickings: [],
        reps: {},
      };
    }
    treatmentMap[tName].trials.push(trial);

    const rep = trial.Replication || trial.Block || 'R1';
    const hData = safeJsonParse(trial.HarvestDataJSON, {});
    let pList = Array.isArray(hData.pickings) ? hData.pickings : [];

    // Fallback if only single harvest was recorded
    if (pList.length === 0 && (hData.actualMarketableWeight || hData.actualFruitCount || trial.YieldValue)) {
      pList = [{
        id: `p_1_${trial.ID}`,
        pickingNumber: 1,
        harvestDate: hData.harvestDate || trial.Date || '',
        actualMarketableWeight: hData.actualMarketableWeight || trial.YieldValue || '',
        actualUnmarketableWeight: hData.actualUnmarketableWeight || '',
        actualFruitCount: hData.actualFruitCount || '',
        yieldUnit: trial.YieldUnit || 'kg/plot',
        notes: hData.notes || '',
      }];
    }

    const trialPlotAreaM2 = parseFloat(trial.PlotAreaM2 || trial.NetPlotAreaM2 || trial.PlotArea || 0) ||
      (trial.PlotSize ? getPlotAreaHectares(trial.PlotSize) * 10000 : 0);

    const normList = pList.map((p, pIdx) => normalizePickingItem(p, pIdx, trialPlotAreaM2 > 0 ? trialPlotAreaM2 : null));
    treatmentMap[tName].pickings.push(...normList);

    const totals = calculateHarvestTotals(normList, trialPlotAreaM2 > 0 ? trialPlotAreaM2 : null);
    treatmentMap[tName].reps[rep] = {
      trialId: trial.ID,
      plotNumber: trial.PlotNumber || '',
      marketable: totals.actualMarketableWeight || 0,
      unmarketable: totals.actualUnmarketableWeight || 0,
      total: totals.cumulativeTotalYield || 0,
      fruitCount: totals.actualFruitCount || 0,
      marketablePct: totals.marketablePct,
      extrapolatedKgHa: totals.extrapolatedKgHa,
      extrapolatedQHa: totals.extrapolatedQHa,
      extrapolatedTHa: totals.extrapolatedTHa,
      pickingsCount: normList.length,
    };

    normList.forEach(p => {
      allPickings.push({
        ...p,
        treatmentName: tName,
        replication: rep,
        plotNumber: trial.PlotNumber || '',
        trialId: trial.ID,
      });
    });
  });

  // Calculate Treatment Means and ANOVA variance statistics across replications
  const cumulativeTable = Object.values(treatmentMap).map(trt => {
    const isControl = Boolean(trt.trials?.some(t => t.IsControl) || /control|untreated/i.test(trt.name));
    const repVals = Object.values(trt.reps);
    const n = repVals.length;
    const meanMarketable = n > 0 ? repVals.reduce((sum, r) => sum + (Number(r.marketable) || 0), 0) / n : 0;
    const meanUnmarketable = n > 0 ? repVals.reduce((sum, r) => sum + (Number(r.unmarketable) || 0), 0) / n : 0;
    const meanTotal = n > 0 ? repVals.reduce((sum, r) => sum + (Number(r.total) || 0), 0) / n : 0;
    const meanFruitCount = n > 0 ? repVals.reduce((sum, r) => sum + (Number(r.fruitCount) || 0), 0) / n : 0;
    const meanExtrapolated = n > 0 ? repVals.reduce((sum, r) => sum + (Number(r.extrapolatedKgHa) || 0), 0) / n : 0;
    const marketablePct = meanTotal > 0 ? ((meanMarketable / meanTotal) * 100).toFixed(1) : (meanMarketable > 0 ? '100.0' : '—');

    // ANOVA Variance Statistics across Replications (SD, SE, CV%)
    const mVals = repVals.map(r => Number(r.marketable) || 0);
    const varianceMarketable = n > 1
      ? mVals.reduce((acc, val) => acc + Math.pow(val - meanMarketable, 2), 0) / (n - 1)
      : 0;
    const sdMarketable = Math.sqrt(varianceMarketable);
    const seMarketable = n > 1 ? sdMarketable / Math.sqrt(n) : 0;
    const cvMarketable = meanMarketable > 0 ? (sdMarketable / meanMarketable) * 100 : 0;

    return {
      treatmentName: trt.name,
      isControl,
      replicationsCount: n,
      meanMarketable: parseFloat(meanMarketable.toFixed(2)),
      meanUnmarketable: parseFloat(meanUnmarketable.toFixed(2)),
      meanTotal: parseFloat(meanTotal.toFixed(2)),
      meanFruitCount: Math.round(meanFruitCount),
      marketablePct: marketablePct !== '—' ? `${marketablePct}%` : '—',
      meanExtrapolatedKgHa: meanExtrapolated > 0 ? parseFloat(meanExtrapolated.toFixed(1)) : '—',
      meanExtrapolatedQHa: meanExtrapolated > 0 ? parseFloat((meanExtrapolated / 100).toFixed(2)) : '—',
      meanExtrapolatedTHa: meanExtrapolated > 0 ? parseFloat((meanExtrapolated / 1000).toFixed(2)) : '—',
      sdMarketable: parseFloat(sdMarketable.toFixed(2)),
      seMarketable: parseFloat(seMarketable.toFixed(2)),
      cvMarketable: parseFloat(cvMarketable.toFixed(1)),
      reps: trt.reps,
    };
  });

  // Calculate Yield Benefit / Improvement over Untreated Control
  const controlTrt = cumulativeTable.find(t => t.isControl) || cumulativeTable.find(t => /control|untreated/i.test(t.treatmentName));
  const controlMeanTotal = controlTrt?.meanTotal || 0;
  const controlMeanMarketable = controlTrt?.meanMarketable || 0;
  const controlMeanExtrapolated = (controlTrt?.meanExtrapolatedKgHa && controlTrt.meanExtrapolatedKgHa !== '—')
    ? Number(controlTrt.meanExtrapolatedKgHa)
    : 0;

  cumulativeTable.forEach(row => {
    if (row.isControl) {
      row.yieldIncreasePct = 0.0;
      row.marketableYieldIncreasePct = 0.0;
      row.extrapolatedYieldIncreasePct = 0.0;
    } else {
      row.yieldIncreasePct = controlMeanTotal > 0
        ? parseFloat((((row.meanTotal - controlMeanTotal) / controlMeanTotal) * 100).toFixed(2))
        : null;
      row.marketableYieldIncreasePct = controlMeanMarketable > 0
        ? parseFloat((((row.meanMarketable - controlMeanMarketable) / controlMeanMarketable) * 100).toFixed(2))
        : null;
      const rowExtrap = (row.meanExtrapolatedKgHa && row.meanExtrapolatedKgHa !== '—')
        ? Number(row.meanExtrapolatedKgHa)
        : 0;
      row.extrapolatedYieldIncreasePct = (controlMeanExtrapolated > 0 && rowExtrap > 0)
        ? parseFloat((((rowExtrap - controlMeanExtrapolated) / controlMeanExtrapolated) * 100).toFixed(2))
        : null;
    }
  });

  let totalMarketable = 0;
  let totalUnmarketable = 0;
  let plotsWithHarvest = 0;
  subTrials.forEach(t => {
    const hData = safeJsonParse(t.HarvestDataJSON, {});
    const pList = Array.isArray(hData.pickings) ? hData.pickings : [];
    if (pList.length > 0 || parseFloat(t.Yield || t.YieldValue) > 0) {
      plotsWithHarvest++;
    }
  });

  allPickings.forEach(p => {
    totalMarketable += parseFloat(p.actualMarketableWeight) || 0;
    totalUnmarketable += parseFloat(p.actualUnmarketableWeight) || 0;
  });

  const totalYield = totalMarketable + totalUnmarketable;
  const avgMarketablePerPlot = plotsWithHarvest > 0 ? totalMarketable / plotsWithHarvest : 0;
  const overallMarketablePct = totalYield > 0 ? (totalMarketable / totalYield) * 100 : (totalMarketable > 0 ? 100 : 0);

  const allBrix = allPickings.map(p => parseFloat(p.brixScore)).filter(n => !isNaN(n) && n > 0);
  const allMoist = allPickings.map(p => parseFloat(p.moisturePct)).filter(n => !isNaN(n) && n > 0);
  const avgBrix = allBrix.length > 0 ? allBrix.reduce((a, b) => a + b, 0) / allBrix.length : 0;
  const avgMoisture = allMoist.length > 0 ? allMoist.reduce((a, b) => a + b, 0) / allMoist.length : 0;

  const validExtrapolated = cumulativeTable.map(t => parseFloat(t.meanExtrapolatedKgHa)).filter(n => !isNaN(n) && n > 0);
  const avgExtrapolatedKgHa = validExtrapolated.length > 0 ? validExtrapolated.reduce((a, b) => a + b, 0) / validExtrapolated.length : 0;
  const extrapolatedMeanYieldTHa = avgExtrapolatedKgHa > 0 ? avgExtrapolatedKgHa / 1000 : 0;
  const extrapolatedMeanYieldQHa = avgExtrapolatedKgHa > 0 ? avgExtrapolatedKgHa / 100 : 0;

  const hasData = allPickings.length > 0 || cumulativeTable.some(t => t.meanTotal > 0);

  return {
    treatments: Object.keys(treatmentMap),
    treatmentDetails: treatmentMap,
    pickingsTable: allPickings.sort((a, b) => (a.pickingNumber - b.pickingNumber) || (new Date(a.harvestDate) - new Date(b.harvestDate))),
    cumulativeTable,
    hasData,
    totalPlots: subTrials.length,
    plotsWithHarvest,
    totalPickingsCount: allPickings.length,
    totalMarketableWeight: totalMarketable,
    totalUnmarketableWeight: totalUnmarketable,
    avgMarketablePerPlot,
    marketablePct: overallMarketablePct,
    extrapolatedMeanYieldTHa,
    extrapolatedMeanYieldQHa,
    avgBrix,
    avgMoisture,
  };
}

/**
 * Exports harvest log as CSV.
 */
export function exportHarvestCSV(pickingsInput = [], filename = 'Harvest_Log.csv') {
  const pickings = Array.isArray(pickingsInput)
    ? pickingsInput
    : (Array.isArray(pickingsInput?.pickingsTable) ? pickingsInput.pickingsTable : []);
  if (!pickings.length) return '';
  const headers = ['PlotNumber', 'Treatment', 'IsControl', 'PickingNumber', 'HarvestDate', 'MarketableWeight', 'UnmarketableWeight', 'TotalWeight', 'MarketableRatio', 'FruitCount', 'YieldUnit', 'MoisturePct', 'BrixScore', 'CullReason', 'ExtrapolatedKgHa', 'ExtrapolatedQHa', 'Notes'];
  const rows = pickings.map(p => [
    p.plotNumber || '',
    `"${(p.treatmentName || '').replace(/"/g, '""')}"`,
    p.isControl ?? (p.treatmentName?.toLowerCase().includes('untreated') || p.treatmentName?.toLowerCase().includes('control') ? true : false),
    p.pickingNumber || '',
    p.harvestDate || '',
    p.actualMarketableWeight || '',
    p.actualUnmarketableWeight || '',
    p.totalWeight || '',
    p.marketableRatio || '',
    p.actualFruitCount || '',
    p.yieldUnit || '',
    p.moisturePct || '',
    p.brixScore || '',
    `"${(p.cullReason || '').replace(/"/g, '""')}"`,
    p.extrapolatedYieldKgHa || '',
    p.extrapolatedYieldQHa || '',
    `"${(p.notes || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  if (typeof document !== 'undefined') {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
  return csvContent;
}
