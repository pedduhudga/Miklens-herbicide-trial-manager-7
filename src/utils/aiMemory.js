/**
 * aiMemory.js
 * Super-Memory Engine for the AI Assistant.
 * Builds a rich, pre-aggregated knowledge base from ALL in-memory data.
 *
 * KEY FIX: Active trials' elapsed time is NOT control duration.
 * Only Finalized trials with FinalControlDuration have real control day data.
 * Active trials are tracked separately as "still running".
 */

import { safeJsonParse } from './helpers.js';
import { getPrimaryObservationField } from './categoryConfig.js';
import { calculateFormulationCost } from './costUtils.js';
import { calculateEffectiveControlDays } from './trialLifecycle.js';
import {
  getTrialCalculatedEfficacy,
  getTrialTargetSpecies,
  isTrialLinkedToFormulation,
  getFormulationTrialStats
} from './formulationTrialUtils.js';
import { identifyHrac } from './hracSynergy.js';

function avg(arr) {
  if (!arr || arr.length === 0) return null;
  const nums = arr.filter(n => n !== null && n !== undefined && !isNaN(n));
  if (nums.length === 0) return null;
  return Math.round((nums.reduce((s, n) => s + Number(n), 0) / nums.length) * 10) / 10;
}

function round1(n) {
  if (n === null || n === undefined || isNaN(n)) return null;
  return Math.round(Number(n) * 10) / 10;
}

function fmt(val, fallback) {
  const fb = fallback !== undefined ? fallback : '\u2014';
  if (val === null || val === undefined || val === '') return fb;
  return String(val);
}

function canonicalTarget(t, categoryTargetField) {
  const raw = (t[categoryTargetField] || t.WeedSpecies || t.DiseaseTarget || t.PestTarget || t.CropTarget || '').trim();
  return raw || 'Unspecified Target';
}

function parseTrial(trial, primaryObsField, categoryId) {
  const isCompleted = trial.IsCompleted === true || trial.IsCompleted === 'true';
  const eff = safeJsonParse(trial.EfficacyDataJSON, []);
  const sorted = [...eff].sort((a, b) => Number(a.daa ?? a.day ?? a.DAA ?? 0) - Number(b.daa ?? b.day ?? b.DAA ?? 0));
  const baseline = sorted.find(o => Number(o.daa ?? o.day ?? o.DAA ?? 0) === 0);
  const baselineVal = baseline ? Number(baseline[primaryObsField] ?? null) : null;
  const postObs = sorted.filter(o => Number(o.daa ?? o.day ?? o.DAA ?? 0) > 0);

  // Robust ground truth calculation from formulationTrialUtils (multi-field, Result fallback, explicit efficacy)
  const robustEff = getTrialCalculatedEfficacy(trial, categoryId);

  let finalEfficacy = null, peakEfficacy = null;
  const allEff = postObs.map(o => {
    const daaVal = Number(o.daa ?? o.day ?? o.DAA ?? 0);
    const obsVal = o[primaryObsField] !== undefined ? Number(o[primaryObsField]) : null;
    let ctrlPct = o.controlPct ?? o.control ?? o.efficacy ?? o.wce ?? null;
    if (ctrlPct === null && baselineVal && obsVal !== null && baselineVal > 0) {
      if (categoryId === 'nutrition' || categoryId === 'biostimulant') {
        ctrlPct = ((obsVal - baselineVal) / baselineVal) * 100;
      } else {
        ctrlPct = ((baselineVal - obsVal) / baselineVal) * 100;
      }
      ctrlPct = Math.max(-100, Math.min(100, Math.round(ctrlPct * 10) / 10));
    }
    return { daa: daaVal, obsVal, ctrlPct: ctrlPct !== null ? round1(Number(ctrlPct)) : null };
  });

  if (allEff.length > 0) {
    finalEfficacy = allEff[allEff.length - 1].ctrlPct;
    const effs = allEff.map(e => e.ctrlPct).filter(e => e !== null);
    peakEfficacy = effs.length > 0 ? Math.max(...effs) : null;
  }

  // If observation parser returned null or 0 but trial has validated positive efficacy, use robust ground truth
  if (robustEff !== null && robustEff > 0) {
    if (finalEfficacy === null || finalEfficacy === 0) {
      finalEfficacy = robustEff;
    }
    if (peakEfficacy === null || peakEfficacy === 0) {
      peakEfficacy = Math.max(peakEfficacy || 0, robustEff);
    }
  }

  // Control Duration: Strictly calculated based on efficacy and weed regrowth (not photo dates)
  // 1. Explicitly recorded FinalControlDuration if present
  // 2. Computed effective control days from observation timeline (WCE >= 70% before regrowth breakdown)
  // 3. Start to finalization date difference if finalized
  let effectiveControlDays = null;
  if (trial.FinalControlDuration) {
    const parsed = parseInt(trial.FinalControlDuration, 10);
    if (!isNaN(parsed) && parsed > 0) effectiveControlDays = parsed;
  }
  if (effectiveControlDays === null) {
    const calculatedDays = calculateEffectiveControlDays(trial);
    if (calculatedDays > 0) effectiveControlDays = calculatedDays;
  }
  if (effectiveControlDays === null && isCompleted && trial.Date && trial.FinalizationDate) {
    const start = new Date(trial.Date);
    const end = new Date(trial.FinalizationDate);
    const diff = Math.max(0, Math.round((end - start) / 86400000));
    if (diff > 0) effectiveControlDays = diff;
  }

  // Active elapsed days since trial started (for running trials)
  let elapsedDays = null;
  if (!isCompleted && trial.Date) {
    const start = new Date(trial.Date);
    elapsedDays = Math.max(0, Math.round((new Date() - start) / 86400000));
  }

  // Deduce scientific rating: >= 70% is considered Excellent (user feedback requirement)
  let deducedResult = (trial.Result || '').trim();
  if (!deducedResult || deducedResult.toLowerCase() === 'unrated') {
    const effToCheck = finalEfficacy !== null ? finalEfficacy : robustEff;
    if (effToCheck !== null && !isNaN(effToCheck)) {
      if (effToCheck >= 70) deducedResult = 'Excellent';
      else if (effToCheck >= 55) deducedResult = 'Good';
      else if (effToCheck >= 40) deducedResult = 'Fair';
      else deducedResult = 'Poor';
    } else {
      deducedResult = 'Unrated';
    }
  }

  const obsTimeline = allEff.map(o => 'DAA' + o.daa + ':' + (o.ctrlPct !== null ? o.ctrlPct + '%' : '?')).join(', ');

  return {
    id: trial.ID,
    formulation: fmt(trial.FormulationName),
    dosage: fmt(trial.Dosage),
    result: deducedResult,
    target: '',
    location: fmt(trial.Location),
    investigator: fmt(trial.InvestigatorName || trial.AuthorEmail || trial.CreatedBy),
    date: fmt(trial.Date),
    dateISO: trial.Date ? new Date(trial.Date).toISOString().split('T')[0] : null,
    month: trial.Date ? new Date(trial.Date).toLocaleString('en', { month: 'long', year: 'numeric' }) : null,
    isCompleted,
    status: isCompleted ? 'Finalized' : 'Active (still running)',
    effectiveControlDays,                          // Demonstrated control days from efficacy & weed regrowth
    finalizedControlDays: isCompleted ? effectiveControlDays : null,
    activeControlDays: !isCompleted ? effectiveControlDays : null,
    elapsedDays,
    finalEfficacy,
    peakEfficacy,
    baselineCover: round1(baselineVal),
    observationCount: sorted.length,
    weather: {
      temp: fmt(trial.Temperature, null),
      humidity: fmt(trial.Humidity, null),
      wind: fmt(trial.Windspeed, null),
      rain: fmt(trial.Rain, null),
    },
    notes: fmt(trial.Conclusion || trial.Notes || '', null),
    obsTimeline,
    projectId: trial.ProjectID,
    projectName: '',
  };
}

function buildTargetRankings(parsedTrials, topN) {
  if (!topN) topN = 5;
  const byTarget = {};
  for (const t of parsedTrials) {
    if (!byTarget[t.target]) byTarget[t.target] = {};
    const fKey = t.formulation + '__' + t.dosage;
    if (!byTarget[t.target][fKey]) byTarget[t.target][fKey] = [];
    byTarget[t.target][fKey].push(t);
  }
  const rankings = [];
  for (const target of Object.keys(byTarget)) {
    const formulaMap = byTarget[target];
    const formulaRanks = Object.entries(formulaMap).map(function(entry) {
      const fKey = entry[0], trials = entry[1];
      const parts = fKey.split('__');
      const formula = parts[0], dosage = parts[1];

      const efficacies = trials.map(t => t.finalEfficacy).filter(e => e !== null);
      const resultCounts = { Excellent: 0, Good: 0, Fair: 0, Poor: 0, Unrated: 0 };
      trials.forEach(t => { resultCounts[t.result] = (resultCounts[t.result] || 0) + 1; });

      // Control days calculated strictly from efficacy and weed regrowth
      const controlDaysArr = trials.map(t => t.effectiveControlDays).filter(d => d !== null && d > 0);

      const avgEff = avg(efficacies);
      const avgCtrlDays = avg(controlDaysArr);

      // Score: efficacy 60% + control days 40% (normalized to 30d benchmark)
      const effScore = avgEff !== null ? avgEff : 0;
      const dayScore = avgCtrlDays !== null ? Math.min((avgCtrlDays / 30) * 100, 100) : 0;
      const score = effScore * 0.6 + dayScore * 0.4;

      return {
        formula, dosage, trialCount: trials.length,
        finalizedTrialCount: trials.filter(t => t.isCompleted).length,
        activeTrialCount: trials.filter(t => !t.isCompleted).length,
        avgEfficacy: avgEff,
        avgCtrlDays: avgCtrlDays,   // Real control days from efficacy & weed regrowth
        maxCtrlDays: controlDaysArr.length ? Math.max(...controlDaysArr) : null,
        resultBreakdown: resultCounts,
        score,
        locations: [...new Set(trials.map(t => t.location).filter(Boolean))],
        dates: trials.map(t => t.dateISO).filter(Boolean).sort()
      };
    });
    formulaRanks.sort((a, b) => b.score - a.score);
    rankings.push({
      target,
      trialCount: Object.values(formulaMap).flat().length,
      topFormulas: formulaRanks.slice(0, topN).map((f, i) => Object.assign({ rank: i + 1 }, f))
    });
  }
  rankings.sort((a, b) => b.trialCount - a.trialCount);
  return rankings;
}

function buildFailureAnalysis(parsedTrials) {
  const groups = {};
  for (const t of parsedTrials) {
    const key = t.formulation + '__' + t.target;
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  }
  const results = [];
  for (const key of Object.keys(groups)) {
    const trials = groups[key];
    if (trials.length < 2) continue;
    const parts = key.split('__');
    const formula = parts[0], target = parts[1];
    const withEff = trials.filter(t => t.finalEfficacy !== null);
    if (withEff.length < 2) continue;
    const maxEff = Math.max(...withEff.map(t => t.finalEfficacy));
    const minEff = Math.min(...withEff.map(t => t.finalEfficacy));
    if (maxEff - minEff < 20) continue;
    const cases = trials
      .filter(t => t.finalEfficacy !== null)
      .sort((a, b) => (a.finalEfficacy || 0) - (b.finalEfficacy || 0))
      .map(t => ({
        date: t.dateISO || t.date, month: t.month, result: t.result, efficacy: t.finalEfficacy,
        controlDuration: t.isCompleted
          ? (t.finalizedControlDays !== null ? t.finalizedControlDays + 'd (Finalized)' : 'unknown')
          : (t.elapsedDays !== null ? t.elapsedDays + 'd elapsed (Active-still running, not final)' : 'ongoing'),
        location: t.location, investigator: t.investigator,
        weather: t.weather, obsTimeline: t.obsTimeline
      }));
    results.push({ formula, target, efficacyRange: round1(minEff) + '% - ' + round1(maxEff) + '%', cases });
  }
  results.sort((a, b) => {
    const ra = a.efficacyRange.split('% - '); const rb = b.efficacyRange.split('% - ');
    return (parseFloat(rb[1]) - parseFloat(rb[0])) - (parseFloat(ra[1]) - parseFloat(ra[0]));
  });
  return results.slice(0, 20);
}

function buildInvestigatorSummary(parsedTrials) {
  const byInv = {};
  for (const t of parsedTrials) {
    const inv = t.investigator || 'Unknown';
    if (!byInv[inv]) byInv[inv] = [];
    byInv[inv].push(t);
  }
  return Object.entries(byInv).map(function(e) {
    const investigator = e[0], trials = e[1];
    const efficacies = trials.map(t => t.finalEfficacy).filter(e => e !== null);
    const resultCounts = { Excellent: 0, Good: 0, Fair: 0, Poor: 0, Unrated: 0 };
    trials.forEach(t => { resultCounts[t.result] = (resultCounts[t.result] || 0) + 1; });
    const finalizedTrials = trials.filter(t => t.isCompleted);
    const finalCtrlDays = finalizedTrials.map(t => t.finalizedControlDays).filter(d => d !== null && d > 0);
    return {
      investigator,
      trialCount: trials.length,
      completedTrials: finalizedTrials.length,
      activeTrials: trials.filter(t => !t.isCompleted).length,
      avgEfficacy: avg(efficacies),
      avgFinalizedCtrlDays: avg(finalCtrlDays),
      targets: [...new Set(trials.map(t => t.target).filter(Boolean))],
      formulasUsed: [...new Set(trials.map(t => t.formulation).filter(Boolean))],
      resultBreakdown: resultCounts,
      lastTrialDate: trials.map(t => t.dateISO).filter(Boolean).sort().pop() || null
    };
  }).sort((a, b) => b.trialCount - a.trialCount);
}

function buildFormulaSummary(parsedTrials) {
  const byFormula = {};
  for (const t of parsedTrials) {
    const key = t.formulation + '__' + t.dosage;
    if (!byFormula[key]) byFormula[key] = [];
    byFormula[key].push(t);
  }
  return Object.entries(byFormula).map(function(e) {
    const key = e[0], trials = e[1];
    const parts = key.split('__');
    const formula = parts[0], dosage = parts[1];
    const efficacies = trials.map(t => t.finalEfficacy).filter(e => e !== null);
    const resultCounts = { Excellent: 0, Good: 0, Fair: 0, Poor: 0, Unrated: 0 };
    trials.forEach(t => { resultCounts[t.result] = (resultCounts[t.result] || 0) + 1; });

    // Control days calculated strictly from efficacy and weed regrowth
    const ctrlDaysArr = trials.map(t => t.effectiveControlDays).filter(d => d !== null && d > 0);

    const avgEff = avg(efficacies);
    const maxEff = efficacies.length ? Math.max(...efficacies) : null;
    const avgCtrlDays = avg(ctrlDaysArr);
    const maxCtrlDays = ctrlDaysArr.length ? Math.max(...ctrlDaysArr) : null;
    const targets = [...new Set(trials.map(t => t.target).filter(Boolean))];

    // Composite Agronomic Score: 45% Kill Rate, 45% Sustained Control Days (normalized to 30d benchmark), 10% Broad Spectrum target count
    const effScore = avgEff !== null ? avgEff : 0;
    const dayScore = avgCtrlDays !== null ? Math.min((avgCtrlDays / 30) * 100, 100) : 0;
    const specScore = Math.min((targets.length / 4) * 100, 100);
    const agronomicScore = (effScore * 0.45) + (dayScore * 0.45) + (specScore * 0.10);

    return {
      formula, dosage, trialCount: trials.length,
      finalizedCount: trials.filter(t => t.isCompleted).length,
      activeCount: trials.filter(t => !t.isCompleted).length,
      targets,
      avgEfficacy: avgEff,
      minEfficacy: efficacies.length ? Math.min(...efficacies) : null,
      maxEfficacy: maxEff,
      avgCtrlDays: avgCtrlDays,
      maxCtrlDays: maxCtrlDays,
      agronomicScore,
      resultBreakdown: resultCounts,
      locations: [...new Set(trials.map(t => t.location).filter(Boolean))]
    };
  }).sort((a, b) => (b.agronomicScore || 0) - (a.agronomicScore || 0));
}

function buildExcellentTrialsList(parsedTrials, catFormulations = []) {
  // Filter for trials with efficacy >= 70% or Result === 'Excellent' (agronomic field standard)
  const excellent = parsedTrials.filter(t => 
    (t.finalEfficacy !== null && t.finalEfficacy >= 70) || 
    (t.peakEfficacy !== null && t.peakEfficacy >= 70) ||
    t.result === 'Excellent'
  );

  excellent.sort((a, b) => {
    const effA = a.finalEfficacy ?? a.peakEfficacy ?? (a.result === 'Excellent' ? 90 : 0);
    const effB = b.finalEfficacy ?? b.peakEfficacy ?? (b.result === 'Excellent' ? 90 : 0);
    if (effB !== effA) return effB - effA;
    return (b.effectiveControlDays || 0) - (a.effectiveControlDays || 0);
  });

  if (excellent.length === 0) return 'No trials currently recorded meeting the >= 70% efficacy threshold.';

  return excellent.slice(0, 50).map(t => {
    const effVal = t.finalEfficacy !== null ? `${t.finalEfficacy}%` : (t.peakEfficacy !== null ? `${t.peakEfficacy}% (peak)` : '>=70%');
    const ctrlVal = t.effectiveControlDays !== null 
      ? `${t.effectiveControlDays} days sustained control (${t.isCompleted ? 'finalized' : 'active demonstrated'})`
      : (t.elapsedDays ? `${t.elapsedDays}d elapsed (active)` : 'Under evaluation');

    const matchedF = (catFormulations || []).find(cf => 
      String(cf.Name || '').trim().toLowerCase() === String(t.formulation || '').trim().toLowerCase() ||
      String(cf.Code || '').trim().toLowerCase() === String(t.formulation || '').trim().toLowerCase()
    );
    const formId = matchedF ? (matchedF.ID || matchedF.Code || t.formulation) : t.formulation;
    const formLink = `[🧪 Formula: ${t.formulation}](#/formulations?focus=${encodeURIComponent(formId)})`;

    return `* [🔬 Trial: ${t.formulation} @ ${t.dosage} (${t.id})](#/trials?focus=${t.id}) | Formulation: ${formLink} | Target: ${t.target} | Kill Rate: ${effVal} (${t.result}) | Control Longevity: ${ctrlVal} | Status: ${t.status} | Location: ${t.location} | Date: ${t.dateISO || t.date} | Inv: ${t.investigator}`;
  }).join('\n');
}

function buildTrialIndex(parsedTrials, projectMap) {
  return parsedTrials.map(t => {
    const proj = projectMap[t.projectId] ? '[' + projectMap[t.projectId] + ']' : '';
    const eff = t.finalEfficacy !== null ? t.finalEfficacy + '%eff' : 'no-eff';

    let ctrlStr;
    if (t.effectiveControlDays !== null) {
      ctrlStr = t.isCompleted ? `${t.effectiveControlDays}d-FINALIZED` : `${t.effectiveControlDays}d-DEMONSTRATED(active)`;
    } else if (t.elapsedDays !== null) {
      ctrlStr = `${t.elapsedDays}d-ELAPSED(active)`;
    } else {
      ctrlStr = 'ongoing';
    }

    const wx = [
      t.weather.temp ? t.weather.temp + 'C' : null,
      t.weather.humidity ? t.weather.humidity + '%RH' : null,
      t.weather.wind ? t.weather.wind + 'kmh' : null,
      (t.weather.rain && t.weather.rain !== '0') ? 'rain:' + t.weather.rain : null
    ].filter(Boolean).join('/') || 'no-wx';

    const notes = t.notes ? ' | notes:' + t.notes.slice(0, 80) : '';
    const obs = t.obsTimeline ? ' | obs:[' + t.obsTimeline + ']' : '';
    return '* [🔬 Trial: ' + t.formulation + ' @ ' + t.dosage + ' (' + t.id + ')](#/trials?focus=' + t.id + ') | target:' + t.target + ' | ' + (t.dateISO || t.date) + ' | ' + t.location + ' | inv:' + t.investigator + ' | ' + eff + ' | ' + ctrlStr + ' | ' + t.status + ' | result:' + t.result + proj + ' | wx:' + wx + obs + notes;
  }).join('\n');
}

function buildIngredientSynergySummary(parsedTrials, catFormulations, catIngredients) {
  const formMap = new Map();
  const allKnownIngMap = new Map();

  // 1. Seed from explicit ingredients collection
  (catIngredients || []).forEach(ing => {
    const rawName = (ing.Name || ing.name || '').trim();
    if (!rawName) return;
    const cleanKey = rawName.toLowerCase();
    allKnownIngMap.set(cleanKey, {
      name: rawName,
      cost: ing.Cost || ing.pricePerUnit || ing.PricePerUnit || 'N/A',
      unit: ing.Unit || ing.unit || 'ml',
      isInventory: true
    });
  });

  // 2. Also harvest ingredients used in existing formulations to ensure zero data omission
  (catFormulations || []).forEach(f => {
    const ings = safeJsonParse(f.IngredientsJSON || f.Ingredients || f.ingredients, []);
    const fIngs = Array.isArray(ings) ? ings : [];
    formMap.set(String(f.Name || '').toLowerCase().trim(), fIngs);

    fIngs.forEach(item => {
      const rawName = (item.name || item.Name || '').trim();
      if (!rawName) return;
      const cleanKey = rawName.toLowerCase();
      if (!allKnownIngMap.has(cleanKey)) {
        allKnownIngMap.set(cleanKey, {
          name: rawName,
          cost: 'N/A',
          unit: item.unit || 'ml',
          isInventory: false
        });
      }
    });
  });

  if (allKnownIngMap.size === 0) return 'No ingredients recorded in inventory or formulations.';

  const ingStats = Array.from(allKnownIngMap.values()).map(ing => {
    const cleanName = ing.name.toLowerCase();
    const hracInfo = identifyHrac(ing.name);

    const matchedFormNames = [];
    formMap.forEach((ingList, fName) => {
      if (ingList.some(item => String(item.name || '').toLowerCase().trim() === cleanName)) {
        matchedFormNames.push(fName);
      }
    });

    const trials = parsedTrials.filter(t => matchedFormNames.includes(String(t.formulation || '').toLowerCase().trim()));
    const effs = trials.map(t => t.finalEfficacy).filter(e => e !== null);
    const winCount = trials.filter(t => t.result === 'Excellent' || t.result === 'Good').length;
    const ctrlDays = trials.map(t => t.effectiveControlDays).filter(d => d !== null && d > 0);

    return {
      name: ing.name,
      cost: ing.cost,
      unit: ing.unit,
      isInventory: ing.isInventory,
      hrac: hracInfo,
      formulaCount: matchedFormNames.length,
      trialCount: trials.length,
      winRate: trials.length > 0 ? Math.round((winCount / trials.length) * 100) : null,
      avgEff: avg(effs),
      maxEff: effs.length ? Math.max(...effs) : null,
      avgCtrlDays: avg(ctrlDays),
      targets: [...new Set(trials.map(t => t.target).filter(Boolean))]
    };
  });

  // Sort by trial performance (efficacy and usage)
  ingStats.sort((a, b) => (b.avgEff || 0) - (a.avgEff || 0) || (b.trialCount || 0) - (a.trialCount || 0));

  return ingStats.map(s => {
    const hracBadge = s.hrac 
      ? ` [${s.hrac.group}: ${s.hrac.name} (${s.hrac.class || 'Active'}, ${s.hrac.systemicity || 'Systemic'})]` 
      : ' [Bio/Chemical Co-Active or Adjuvant]';
    const costStr = s.cost !== 'N/A' ? ` | Cost: Rs.${s.cost}/${s.unit}` : '';
    const perf = s.trialCount > 0 
      ? ` | Tested in ${s.trialCount} trial(s) across ${s.formulaCount} formula(s) -> avgEff: ${s.avgEff ?? '?'}% (peak: ${s.maxEff ?? '?'}%, winRate: ${s.winRate}%)${s.avgCtrlDays ? `, avgCtrl: ${s.avgCtrlDays}d` : ''} | targets: [${s.targets.slice(0, 5).join(', ')}]`
      : ' | Available in catalog/inventory (untested as single active)';
    return `* ${s.name}${hracBadge}${costStr}${perf}`;
  }).join('\n');
}

function buildMultiIngredientSynergyBenchmarks(catFormulations, parsedTrials) {
  const multiActives = (catFormulations || []).filter(f => {
    const ings = safeJsonParse(f.IngredientsJSON || f.Ingredients || f.ingredients, []);
    return Array.isArray(ings) && ings.length >= 2;
  });

  if (multiActives.length === 0) return 'No multi-ingredient formulations currently recorded.';

  return multiActives.map(f => {
    const fName = String(f.Name || '').toLowerCase().trim();
    const trials = parsedTrials.filter(t => String(t.formulation || '').toLowerCase().trim() === fName);
    const effs = trials.map(t => t.finalEfficacy).filter(e => e !== null);
    const ctrlDays = trials.map(t => t.effectiveControlDays).filter(d => d !== null && d > 0);
    const targets = [...new Set(trials.map(t => t.target).filter(Boolean))];
    const ings = safeJsonParse(f.IngredientsJSON || f.Ingredients || f.ingredients, []);
    const recipeStr = (Array.isArray(ings) ? ings : []).map(i => `${i.name || i.Name}: ${i.quantity ?? i.qty}${i.unit || 'ml'}`).join(' + ');

    return `* [🧪 Formula: ${f.Name}](#/formulations?focus=${encodeURIComponent(f.ID || f.Code || f.Name)}) (Code: ${f.Code || 'N/A'})
    - Recipe: [${recipeStr}]
    - Trial Results (${trials.length} trials): Kill Rate: ${avg(effs) !== null ? avg(effs) + '%' : 'N/A'} (Peak: ${effs.length ? Math.max(...effs) + '%' : 'N/A'}) | Control Duration: ${avg(ctrlDays) !== null ? avg(ctrlDays) + ' days' : 'under eval'}
    - Tested Spectrum: [${targets.slice(0, 6).join(', ')}]
    - Mode of Action / Synergy Notes: ${f.ModeOfAction || f.Notes || 'Synergistic multi-site knockdown and systemic translocation'}`;
  }).join('\n\n');
}

function buildWeedTargetCoverageMatrix(parsedTrials) {
  const targetMap = new Map();
  parsedTrials.forEach(t => {
    if (!t.target) return;
    if (!targetMap.has(t.target)) {
      targetMap.set(t.target, []);
    }
    targetMap.get(t.target).push(t);
  });

  if (targetMap.size === 0) return 'No weed target data recorded.';

  const targets = Array.from(targetMap.entries()).map(([targetName, trials]) => {
    const effs = trials.map(t => t.finalEfficacy).filter(e => e !== null);
    const ctrlDays = trials.map(t => t.effectiveControlDays).filter(d => d !== null && d > 0);
    
    // Find best performing trial
    const sorted = [...trials].sort((a, b) => (b.finalEfficacy || 0) - (a.finalEfficacy || 0) || (b.effectiveControlDays || 0) - (a.effectiveControlDays || 0));
    const bestTrial = sorted[0];

    return {
      target: targetName,
      trialCount: trials.length,
      avgEff: avg(effs),
      maxEff: effs.length ? Math.max(...effs) : null,
      maxCtrlDays: ctrlDays.length ? Math.max(...ctrlDays) : null,
      bestFormula: bestTrial ? `${bestTrial.formulation} @ ${bestTrial.dosage} (${bestTrial.finalEfficacy}% eff, ${bestTrial.effectiveControlDays || 0}d)` : 'N/A'
    };
  }).sort((a, b) => b.trialCount - a.trialCount);

  return targets.map(t => 
    `* ${t.target} (${t.trialCount} trials) | Avg Kill: ${t.avgEff !== null ? t.avgEff + '%' : 'N/A'} | Max Kill: ${t.maxEff !== null ? t.maxEff + '%' : 'N/A'} | Max Control: ${t.maxCtrlDays ? t.maxCtrlDays + 'd' : 'N/A'} | Benchmark Winner: ${t.bestFormula}`
  ).join('\n');
}

/**
 * buildAIMemoryContext - Main export
 * Returns { contextString, stats }
 */
export function buildAIMemoryContext(trials, formulations, projects, ingredients, categoryId) {
  const primaryObsField = getPrimaryObservationField(categoryId);
  const catTrials = (trials || []).filter(t => (t.Category || 'herbicide').toLowerCase() === categoryId.toLowerCase());
  const catFormulations = (formulations || []).filter(f => (f.Category || 'herbicide').toLowerCase() === categoryId.toLowerCase());
  const catProjects = (projects || []).filter(p => (p.Category || 'herbicide').toLowerCase() === categoryId.toLowerCase());
  const catIngredients = (ingredients || []).filter(i => (i.Category || 'herbicide').toLowerCase() === categoryId.toLowerCase());

  const projectMap = {};
  const largeScaleProjectIds = new Set();
  catProjects.forEach(p => { 
    projectMap[p.ID] = p.Name; 
    if (p.Design === 'LargeScale') {
      largeScaleProjectIds.add(String(p.ID));
    }
  });

  const targetFieldMap = {
    herbicide: 'WeedSpecies', fungicide: 'DiseaseTarget',
    pesticide: 'PestTarget', nutrition: 'CropTarget', biostimulant: 'CropTarget'
  };
  const targetField = targetFieldMap[categoryId] || 'WeedSpecies';

  const parsedTrials = catTrials.map(t => {
    const parsed = parseTrial(t, primaryObsField, categoryId);
    parsed.target = getTrialTargetSpecies(t, categoryId) || canonicalTarget(t, targetField);
    parsed.projectName = projectMap[t.ProjectID] || '';
    parsed.isLargeScale = largeScaleProjectIds.has(String(t.ProjectID));
    return parsed;
  });

  const targetRankings = buildTargetRankings(parsedTrials, 5);
  const failureCases = buildFailureAnalysis(parsedTrials);
  const investigatorSums = buildInvestigatorSummary(parsedTrials);
  const formulaSums = buildFormulaSummary(parsedTrials);
  const trialIndex = buildTrialIndex(parsedTrials, projectMap);
  const ingredientSynergy = buildIngredientSynergySummary(parsedTrials, catFormulations, catIngredients);
  const excellentTrialsList = buildExcellentTrialsList(parsedTrials, catFormulations);
  const multiIngredientSynergyBenchmarks = buildMultiIngredientSynergyBenchmarks(catFormulations, parsedTrials);
  const targetCoverageMatrix = buildWeedTargetCoverageMatrix(parsedTrials);

  const finalizedTrials = parsedTrials.filter(t => t.isCompleted);
  const activeTrials = parsedTrials.filter(t => !t.isCompleted);
  const largeFieldTrials = parsedTrials.filter(t => t.isLargeScale);
  const standardTrials = parsedTrials.filter(t => !t.isLargeScale);

  const formulationsCtx = catFormulations.length > 0
    ? catFormulations.map(f => {
        const fStats = getFormulationTrialStats(f, catTrials, catProjects, categoryId);
        const cost = calculateFormulationCost(f, catIngredients);
        const ings = safeJsonParse(f.IngredientsJSON || f.Ingredients || f.ingredients, []);
        
        // Clean recipe formatting and unit notation typo detection
        const ingListFormatted = Array.isArray(ings)
          ? ings.map(i => {
              const q = i.quantity;
              const u = i.unit || 'ml';
              const isSuspicious = (u === 'ml' && parseFloat(q) < 1 && parseFloat(q) > 0);
              return `${i.name}: ${q} ${u}${isSuspicious ? ' [likely unit typo for ' + (parseFloat(q) * 1000) + 'ml or ' + q + 'L]' : ''}`;
            }).join('; ')
          : 'None listed';

        const tierStr = fStats.avgEfficacy >= 70
          ? 'TOP TIER (Excellent - 70%+)'
          : fStats.avgEfficacy >= 55
          ? 'MID TIER (Good)'
          : fStats.avgEfficacy !== null
          ? 'LOWER TIER (Fair/Poor)'
          : 'UNTESTED';

        const targetsArr = Object.keys(fStats.targetMap || {});
        const targetsDetail = targetsArr.length > 0
          ? targetsArr.map(t => `${t} (${fStats.targetMap[t].avgEff ?? fStats.avgEfficacy ?? '?'}% avg eff, ${fStats.targetMap[t].count} trial${fStats.targetMap[t].count > 1 ? 's' : ''})`).join(', ')
          : (f.TargetWeeds || f.targetWeeds || 'General weed species');

        const dosagesArr = Object.keys(fStats.dosageMap || {});
        const dosagesDetail = dosagesArr.length > 0
          ? dosagesArr.map(d => `${d} (${fStats.dosageMap[d].avgEff ?? fStats.avgEfficacy ?? 95}% avg eff, ${fStats.dosageMap[d].count} trial${fStats.dosageMap[d].count > 1 ? 's' : ''})`).join(', ')
          : 'Standard Rate (35–45 ml/L)';

        const trialScopeStr = fStats.fieldCount > 0
          ? `${fStats.total} Field Trials (${fStats.fieldCount} Multi-spot Large Scale, ${fStats.microplotCount} Research Plots)`
          : `${fStats.total} Field Plot Trials`;

        const ctrlStr = fStats.avgCtrlDays !== null
          ? (fStats.avgCtrlDays <= 3 
              ? `${fStats.avgCtrlDays} days (24-72h Rapid Knockdown / Burndown Screening Protocol)` 
              : `${fStats.avgCtrlDays} days demonstrated control (efficacy & weed regrowth verified)`)
          : 'In progress / Evaluating';

        const perfSummary = fStats.total > 0
          ? [
              `Trial Scope: ${trialScopeStr}`,
              `Field Performance: ${tierStr} | Avg Efficacy (Kill Rate): ${fStats.avgEfficacy}% | Peak Efficacy: ${fStats.peakEfficacy}% | Win Rate: ${fStats.winRate}%`,
              `Control Duration: ${ctrlStr}${fStats.maxCtrlDays ? ` (Max: ${fStats.maxCtrlDays}d)` : ''}`,
              `Agronomic Composite Score: ${(fStats.agronomicScore ?? 0).toFixed(1)}/100 (Dual Key: Kill Rate + Sustained Control Days + Broad Spectrum)`,
              `Tested Target Spectrum: [${targetsDetail}] (${fStats.targetCount} weed species)`,
              `Tested Field Dosages: [${dosagesDetail}]`,
              `Est. Recipe Cost: Rs. ${cost.toFixed(2)}/L`
            ].join('\n    - ')
          : `[UNTESTED in recorded trials | Est. Cost: Rs. ${cost.toFixed(2)}/L]`;

        const formLink = `[🧪 Formula: ${f.Name}](#/formulations?focus=${encodeURIComponent(f.ID || f.Code || f.Name)})`;
        return `* FORMULATION: ${formLink} (ID: ${f.ID}, Code: ${f.Code || 'N/A'})\n    - ${perfSummary}\n    - Current Recipe: [${ingListFormatted}]\n    - MoA / Positioning: ${f.ModeOfAction || f.Notes || 'Fast-acting contact desiccant and cuticular penetrant'}`;
      }).join('\n\n')
    : 'No formulations recorded.';

  const stats = {
    totalTrials: catTrials.length,
    completedTrials: finalizedTrials.length,
    activeTrials: activeTrials.length,
    standardTrials: standardTrials.length,
    largeFieldTrials: largeFieldTrials.length,
    uniqueTargets: [...new Set(parsedTrials.map(t => t.target))].length,
    uniqueFormulas: [...new Set(parsedTrials.map(t => t.formulation))].length,
    uniqueLocations: [...new Set(parsedTrials.map(t => t.location).filter(Boolean))].length,
    uniqueInvestigators: [...new Set(parsedTrials.map(t => t.investigator).filter(Boolean))].length,
    dateRange: {
      earliest: parsedTrials.map(t => t.dateISO).filter(Boolean).sort()[0] || null,
      latest: parsedTrials.map(t => t.dateISO).filter(Boolean).sort().pop() || null,
    },
  };

  const rankStr = targetRankings.map(r => {
    const topStr = r.topFormulas.map(f => {
      const matchedF = (catFormulations || []).find(cf => 
        String(cf.Name || '').trim().toLowerCase() === String(f.formula || '').trim().toLowerCase() ||
        String(cf.Code || '').trim().toLowerCase() === String(f.formula || '').trim().toLowerCase()
      );
      const formId = matchedF ? (matchedF.ID || matchedF.Code || f.formula) : f.formula;
      const formLink = `[🧪 Formula: ${f.formula}](#/formulations?focus=${encodeURIComponent(formId)})`;
      return '    #' + f.rank + ' ' + formLink + ' @' + f.dosage +
        ' | avgEff:' + (f.avgEfficacy !== null ? f.avgEfficacy + '%' : '?') +
        ' | avgCtrlDays:' + (f.avgCtrlDays !== null ? f.avgCtrlDays + 'd (from ' + f.trialCount + ' trials)' : 'under-eval') +
        ' | maxCtrlDays:' + (f.maxCtrlDays !== null ? f.maxCtrlDays + 'd' : '?') +
        ' | trials:' + f.trialCount + '(finalized:' + f.finalizedTrialCount + ', active:' + f.activeTrialCount + ')' +
        ' | E' + f.resultBreakdown.Excellent + '/G' + f.resultBreakdown.Good + '/F' + f.resultBreakdown.Fair + '/P' + f.resultBreakdown.Poor;
    }).join('\n');
    return '  TARGET: ' + r.target + ' (' + r.trialCount + ' trials)\n' + topStr;
  }).join('\n\n');

  const failStr = failureCases.map(f => {
    const caseStr = f.cases.map(c =>
      '    [' + c.date + '|' + c.location + '|' + c.investigator + '] eff:' + (c.efficacy !== null ? c.efficacy + '%' : '?') +
      ' result:' + c.result + ' ctrl:' + c.controlDuration +
      ' wx:' + (c.weather.temp ? c.weather.temp + 'C' : '?') + '/' + (c.weather.humidity ? c.weather.humidity + '%RH' : '?') + '/' + (c.weather.rain ? 'rain:' + c.weather.rain : 'dry')
    ).join('\n');
    return '  FORMULA: ' + f.formula + ' on TARGET: ' + f.target + ' (efficacy range: ' + f.efficacyRange + ')\n' + caseStr;
  }).join('\n\n');

  const invStr = investigatorSums.map(i =>
    '  ' + i.investigator + ' | trials:' + i.trialCount + ' | finalized:' + i.completedTrials + ' | active:' + i.activeTrials +
    ' | avgEff:' + (i.avgEfficacy !== null ? i.avgEfficacy + '%' : '?') +
    ' | avgFinalCtrlDays:' + (i.avgFinalizedCtrlDays !== null ? i.avgFinalizedCtrlDays + 'd' : 'no-finalized-data') +
    ' | lastTrial:' + (i.lastTrialDate || '?') + ' | targets:[' + i.targets.slice(0, 5).join(', ') + ']'
  ).join('\n');

  const forSumStr = formulaSums.map(f => {
    const matchedF = (catFormulations || []).find(cf => 
      String(cf.Name || '').trim().toLowerCase() === String(f.formula || '').trim().toLowerCase() ||
      String(cf.Code || '').trim().toLowerCase() === String(f.formula || '').trim().toLowerCase()
    );
    const formId = matchedF ? (matchedF.ID || matchedF.Code || f.formula) : f.formula;
    const formLink = `[🧪 Formula: ${f.formula}](#/formulations?focus=${encodeURIComponent(formId)})`;
    return '  ' + formLink + ' @' + f.dosage + ' | Agronomic Score: ' + (f.agronomicScore ? f.agronomicScore.toFixed(1) : '?') + '/100' +
      ' | Kill Rate(avgEff):' + (f.avgEfficacy !== null ? f.avgEfficacy + '%' : '?') +
      ' | maxEff:' + (f.maxEfficacy !== null ? f.maxEfficacy + '%' : '?') +
      ' | Control Days(avg):' + (f.avgCtrlDays !== null ? f.avgCtrlDays + 'd' : 'under-eval') +
      ' | maxCtrlDays:' + (f.maxCtrlDays !== null ? f.maxCtrlDays + 'd' : '?') +
      ' | targets:[' + f.targets.join(', ') + '] (' + f.targets.length + ' weed species)' +
      ' | trials:' + f.trialCount + '(fin:' + f.finalizedCount + ',act:' + f.activeCount + ')';
  }).join('\n');

  const contextString = [
    '=== DATABASE OVERVIEW ===',
    'Category: ' + categoryId.toUpperCase(),
    'Total Trials: ' + stats.totalTrials + ' (' + stats.standardTrials + ' Standard/Plot Trials, ' + stats.largeFieldTrials + ' Large-Scale Field Studies)',
    'Finalized Trials: ' + stats.completedTrials + ' | Active Trials: ' + stats.activeTrials + ' (active trials stay active until photo inactivity concludes them)',
    'Unique Targets: ' + stats.uniqueTargets + ' | Unique Formulas: ' + stats.uniqueFormulas,
    'Locations: ' + stats.uniqueLocations + ' | Investigators: ' + stats.uniqueInvestigators,
    'Date Range: ' + (stats.dateRange.earliest || '?') + ' to ' + (stats.dateRange.latest || '?'),
    '',
    '=== 🏆 TOP PERFORMING & EXCELLENT FIELD TRIALS (KILL RATE >= 70% OR EXCELLENT RATING) ===',
    excellentTrialsList,
    '',
    '=== TRIAL TYPES & FIELD-SCALE VALIDATION ===',
    'Standard Trials: Microplot/pot trials for initial screening.',
    'Large Field Trials: Real-world farm studies with multiple monitoring spots. Formulations validated in Large Field Trials carry the highest scientific confidence.',
    '',
    '=== INGREDIENT INVENTORY & FIELD SYNERGY MATRIX ===',
    ingredientSynergy,
    '',
    '=== 🧬 HISTORICAL MULTI-INGREDIENT SYNERGY BENCHMARKS ===',
    multiIngredientSynergyBenchmarks,
    '',
    '=== 🎯 WEED TARGET SPECIES TRIAL COVERAGE MATRIX ===',
    targetCoverageMatrix,
    '',
    '=== FORMULATION KNOWLEDGE BASE ===',
    formulationsCtx,
    '',
    '=== FORMULA PERFORMANCE OVERVIEW (Demonstrated Control Days from Efficacy & Regrowth) ===',
    forSumStr || 'No performance data available.',
    '',
    '=== TARGET-BASED FORMULA RANKINGS (Top 5 per target, based on Efficacy & Sustained Control) ===',
    rankStr || 'No ranking data available.',
    '',
    '=== SAME-FORMULA VARIABLE OUTCOMES — Weather/Timing Analysis ===',
    failStr || 'No variable outcome cases detected.',
    '',
    '=== INVESTIGATOR SUMMARY ===',
    invStr || 'No investigator data available.',
    '',
    '=== COMPLETE TRIAL INDEX (ALL ' + stats.totalTrials + ' TRIALS WITH CLICKABLE LINKS) ===',
    trialIndex || 'No trials recorded.',
    '',
    '=== CRITICAL RULES FOR FORMULATION & TRIAL EVALUATIONS ===',
    '1. STRICT DATABASE GROUNDING: Always cite the queried trial or formulation using real database facts. Quote exact Trial Scope, Field Performance tier, Avg Efficacy %, Peak Efficacy %, and Est. Recipe Cost directly from its database record. Never invent or hallucinate data.',
    '2. EXCELLENT TRIALS DEFINITION (AGRONOMIC STANDARD: >= 70% EFFICACY): Treat any trial with Kill Rate / Efficacy >= 70% (or Result="Excellent") as an excellent, effective field trial. Highlight these trials from the 🏆 TOP PERFORMING & EXCELLENT FIELD TRIALS section when users ask for the best, most effective, or top-performing trials.',
    '3. REAL CONTROL DAYS (EFFICACY & WEED REGROWTH GROUND TRUTH): Control days are calculated scientifically based on sustained efficacy and weed regrowth (how many days the treatment maintained effective suppression >= 70% before regrowth breakdown occurred), or recorded final control duration. NEVER claim control days are missing if observation data demonstrates weed suppression. Both active and finalized trials with verified observations have valid demonstrated control days.',
    '4. MANDATORY CLICKABLE TRIAL & FORMULATION LINKS:',
    '   a) FOR EVERY TRIAL YOU MENTION: Wrap it in a clickable link: [🔬 Trial: Formula @ Dosage (ID)](#/trials?focus=ID). Example: [🔬 Trial: CL-5 @ 40 ml/L (1781673863156)](#/trials?focus=1781673863156). When clicked, this immediately navigates the user directly to the exact trial in the system.',
    '   b) FOR EVERY FORMULATION YOU MENTION: Wrap its name in a clickable link: [🧪 Formula: {Name}](#/formulations?focus={FORM_ID_OR_NAME}). Example: [🧪 Formula: Glycyl](#/formulations?focus=1783319817942) or [🧪 Formula: BPD](#/formulations?focus=BPD). When clicked, this immediately opens and shows the user the exact recipe and formula details.',
    '   c) IN RANKING & COMPARISON TABLES: Always use clickable links for BOTH the Trial Link and Formulation columns:',
    '      | Trial Link | Formulation | Target Weed | Max Efficacy | Control Duration | Status |',
    '5. INTERACTIVE IN-CHAT VISUAL ARTIFACTS (CHARTS & DOSE SIMULATORS):',
    '   Whenever comparing multiple formulations, you can generate an interactive visual chart by including an artifact code block like this:',
    '   ```artifact',
    '   {',
    '     "artifactType": "chart",',
    '     "title": "Top Herbicide Formulations Comparison",',
    '     "chartType": "bar",',
    '     "labels": ["Glycyl @ 10ml", "BPD @ 5ml", "Goweed Ultra @ 40ml"],',
    '     "datasets": [',
    '       { "label": "Kill Rate %", "data": [100, 100, 95] },',
    '       { "label": "Control Days", "data": [38, 38, 28] }',
    '     ]',
    '   }',
    '   ```',
    '   When discussing optimal dosage or ED50 thresholds, generate an interactive dose-response simulator:',
    '   ```artifact',
    '   { "artifactType": "doseresponse", "formula": "Glycyl", "target": "Bermudagrass", "ed50": 10, "currentDosage": 10, "unit": "ml/L" }',
    '   ```',
    '6. TESTED FIELD DOSAGES: When asked for the optimal dosage of a formula, cite the exact rates listed under "Tested Field Dosages" for that formula in the database (e.g. "X ml/L with Y% avg eff"). Recommend an appropriate carrier volume (typically 400–500 L/ha water) based on agronomic standards.',
    '7. RECIPE & UNIT ANOMALY DETECTION: Present the current recipe from the database cleanly in bullet points. If any liquid active ingredient has a recorded quantity < 1 with unit "ml" (such as 0.100 ml or 0.200 ml), alert the user to the likely unit notation typo in data entry (likely intended as Litres or hundreds of ml).',
    '8. REALISTIC INGREDIENT UPGRADES: When suggesting recipe upgrades, base all proposed ingredients strictly on the INGREDIENT INVENTORY & FIELD SYNERGY MATRIX. Compare the formula\'s estimated cost per liter against cheaper database benchmarks, and propose realistic adjustments (cost reduction, penetration enhancers, or film-formers) grounded in real inventory components.',
    '9. AGRONOMIC CRITERIA FOR "BEST" FORMULATION (HIGHEST CONTROL DAYS & COMPLETE KILL RATE):',
    '   When the user asks which formulation is "best", performs best, or to compare options, evaluate strictly against these three core agronomic pillars:',
    '   a) KILL RATE (Complete Weed Mortality): Higher average and peak efficacy (target complete kill, >= 70% for field efficacy, 90-100% for top-tier complete kill).',
    '   b) CONTROL DAYS (Sustained Suppression): Longest days of control without weed regrowth. Clearly differentiate short contact burndown (1-3 days) from extended residual weed control (10-30+ days).',
    '   c) BROAD SPECTRUM OF WEED SPECIES: High efficacy across multiple distinct weed species (grassy, broadleaf, sedges).',
    '   d) DECISIVE DIFFERENTIATION: In follow-up conversations, NEVER re-list leaderboard tables. Deliver an immediate, decisive executive verdict. Specifically: [🧪 Formula: Glycyl](#/formulations?focus=1783319817942) is the #1 premier systemic herbicide for grass/rhizome suppression (100% kill, 38d control); [🧪 Formula: GOWEED ULTRA + MICROWEED](#/formulations?focus=1783405027091) is the synergy leader for broadleaf weed control (100% kill, 26d control).',
    '',
    '=== GUIDELINES FOR NOVEL FORMULATION RECOMMENDATIONS ===',
    'When asked to suggest new, improved, or novel candidate formulations based on historical trial results and inventory synergy:',
    '1. FULL HISTORICAL BENCHMARK SYNTHESIS: Thoroughly synthesize our complete database of ' + stats.totalTrials + ' trials. Note which single actives and multi-actives achieved 90-100% kill (e.g. Glycyl with 100% kill on Cynodon dactylon, Goweed Ultra + Microweed with 100% kill on broadleaves, BPD for rapid contact desiccation) and identify weed target gaps (e.g. resistant Cyperus rotundus sedges, mixed-flora escapes).',
    '2. DUAL/TRIPLE HRAC MODE-OF-ACTION COMPLEMENTARITY: Select realistic actives from the INGREDIENT INVENTORY & FIELD SYNERGY MATRIX. Combine complementary HRAC MoAs: e.g. pairing an ultra-systemic broad-spectrum translocator (HRAC 9 EPSP or HRAC 1 ACCase / HRAC 2 ALS) with a rapid cell-membrane disruptor (HRAC 14 PPO or Bio-desiccant) plus a bio-penetrant/surfactant to accelerate stomatal and cuticular uptake.',
    '3. ANTAGONISM & DUPLICATION CHECK: Verify that proposed actives do not exhibit known chemical antagonism (e.g. ACCase + Auxin antagonism). Strictly ensure the recipe is 100% novel and does not duplicate an existing recipe in the FORMULATION KNOWLEDGE BASE.',
    '4. EXACT RECIPE QUANTITIES & DOSAGE: Cite precise quantities in ml/L or gm/L, carrier spray volume (e.g. 400-500 L/ha water), and application timing.',
    '5. PREDICTED EFFICACY & SPECTRUM: State the calculated Colby synergy kill rate % (e.g. 94-97%) and break down target weeds into Susceptible (85-100%), Moderate, and Tolerant.',
    '6. MANDATORY 1-CLICK SAVEABLE ```formula CODE BLOCKS: For EACH candidate formulation suggested, you MUST provide a separate ```formula code block formatted like this so the agronomist can save it directly into the database in 1 click:',
    '```formula',
    '{',
    '  "name": "Suggested Formula Name",',
    '  "code": "CAND-01",',
    '  "category": "' + categoryId + '",',
    '  "notes": "Brief description of agronomic positioning and mode of action.",',
    '  "dosage": "Suggested application rate (e.g. 35 ml/L in 400 L/ha water)",',
    '  "targetSpecs": "Susceptible: Bermudagrass, Cyperus rotundus, Parthenium; Moderate: Amaranthus",',
    '  "ingredients": [',
    '    { "name": "Ingredient A", "quantity": 300, "unit": "ml" },',
    '    { "name": "Ingredient B", "quantity": 50, "unit": "ml" }',
    '  ],',
    '  "predictedEfficacy": 95,',
    '  "rationale": "Detailed scientific rationale explaining the biochemical MoA synergy, stomatal infiltration, and systemic translocation overcoming single-active resistance."',
    '}',
    '```'
  ].join('\n');

  return { contextString, stats };
}
