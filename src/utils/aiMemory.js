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
import {
  getTrialCalculatedEfficacy,
  getTrialTargetSpecies,
  isTrialLinkedToFormulation,
  getFormulationTrialStats
} from './formulationTrialUtils.js';

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

  // CRITICAL: Distinguish real control days from elapsed days
  // - finalizedControlDays: only set if trial is Finalized (real measured duration)
  // - elapsedDays: how long since trial started (NOT control duration for Active trials)
  let finalizedControlDays = null;
  let elapsedDays = null;

  if (isCompleted) {
    // Finalized trial: use recorded FinalControlDuration, or compute from finalization date
    if (trial.FinalControlDuration) {
      const parsed = parseInt(trial.FinalControlDuration, 10);
      finalizedControlDays = isNaN(parsed) ? null : parsed;
    }
    if (finalizedControlDays === null && trial.Date && trial.FinalizationDate) {
      const start = new Date(trial.Date);
      const end = new Date(trial.FinalizationDate);
      finalizedControlDays = Math.max(0, Math.round((end - start) / 86400000));
    }
  } else {
    // Active trial: elapsed time is NOT a control duration measurement
    if (trial.Date) {
      const start = new Date(trial.Date);
      elapsedDays = Math.max(0, Math.round((new Date() - start) / 86400000));
    }
  }

  const obsTimeline = allEff.map(o => 'DAA' + o.daa + ':' + (o.ctrlPct !== null ? o.ctrlPct + '%' : '?')).join(', ');

  return {
    id: trial.ID,
    formulation: fmt(trial.FormulationName),
    dosage: fmt(trial.Dosage),
    result: fmt(trial.Result, 'Unrated'),
    target: '',
    location: fmt(trial.Location),
    investigator: fmt(trial.InvestigatorName || trial.AuthorEmail || trial.CreatedBy),
    date: fmt(trial.Date),
    dateISO: trial.Date ? new Date(trial.Date).toISOString().split('T')[0] : null,
    month: trial.Date ? new Date(trial.Date).toLocaleString('en', { month: 'long', year: 'numeric' }) : null,
    isCompleted,
    status: isCompleted ? 'Finalized' : 'Active (still running)',
    finalizedControlDays,   // REAL control days — only for Finalized trials
    elapsedDays,            // Days since start — only for Active trials, NOT control duration
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

      // ONLY use finalized control days for rankings — active elapsed days are meaningless here
      const finalizedTrials = trials.filter(t => t.isCompleted && t.finalizedControlDays !== null);
      const controlDaysArr = finalizedTrials.map(t => t.finalizedControlDays).filter(d => d > 0);

      const avgEff = avg(efficacies);
      const avgCtrlDays = avg(controlDaysArr);

      // Score: efficacy 60% + finalized control days 40%
      const effScore = avgEff !== null ? avgEff : 0;
      const dayScore = avgCtrlDays !== null ? Math.min(avgCtrlDays / 60 * 100, 100) : 0;
      const score = effScore * 0.6 + dayScore * 0.4;

      return {
        formula, dosage, trialCount: trials.length,
        finalizedTrialCount: finalizedTrials.length,
        activeTrialCount: trials.filter(t => !t.isCompleted).length,
        avgEfficacy: avgEff,
        avgCtrlDays: avgCtrlDays,   // Only from Finalized trials
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

    // Only finalized control days for stats
    const finalizedTrials = trials.filter(t => t.isCompleted && t.finalizedControlDays !== null);
    const ctrlDaysArr = finalizedTrials.map(t => t.finalizedControlDays).filter(d => d > 0);

    return {
      formula, dosage, trialCount: trials.length,
      finalizedCount: finalizedTrials.length,
      activeCount: trials.filter(t => !t.isCompleted).length,
      targets: [...new Set(trials.map(t => t.target).filter(Boolean))],
      avgEfficacy: avg(efficacies),
      minEfficacy: efficacies.length ? Math.min(...efficacies) : null,
      maxEfficacy: efficacies.length ? Math.max(...efficacies) : null,
      avgFinalizedCtrlDays: avg(ctrlDaysArr),
      maxFinalizedCtrlDays: ctrlDaysArr.length ? Math.max(...ctrlDaysArr) : null,
      resultBreakdown: resultCounts,
      locations: [...new Set(trials.map(t => t.location).filter(Boolean))]
    };
  }).sort((a, b) => (b.avgEfficacy || 0) - (a.avgEfficacy || 0));
}

function buildTrialIndex(parsedTrials, projectMap) {
  return parsedTrials.map(t => {
    const proj = projectMap[t.projectId] ? '[' + projectMap[t.projectId] + ']' : '';
    const eff = t.finalEfficacy !== null ? t.finalEfficacy + '%eff' : 'no-eff';

    // CLEAR labeling: Finalized real control days vs Active elapsed days
    let ctrlStr;
    if (t.isCompleted) {
      ctrlStr = t.finalizedControlDays !== null ? t.finalizedControlDays + 'd-FINALIZED' : '?d-FINALIZED';
    } else {
      ctrlStr = t.elapsedDays !== null ? t.elapsedDays + 'd-ELAPSED(active,not-final)' : 'ongoing';
    }

    const wx = [
      t.weather.temp ? t.weather.temp + 'C' : null,
      t.weather.humidity ? t.weather.humidity + '%RH' : null,
      t.weather.wind ? t.weather.wind + 'kmh' : null,
      (t.weather.rain && t.weather.rain !== '0') ? 'rain:' + t.weather.rain : null
    ].filter(Boolean).join('/') || 'no-wx';

    const notes = t.notes ? ' | notes:' + t.notes.slice(0, 80) : '';
    const obs = t.obsTimeline ? ' | obs:[' + t.obsTimeline + ']' : '';
    return '* [' + t.id + '] ' + t.formulation + ' @' + t.dosage + ' | target:' + t.target + ' | ' + (t.dateISO || t.date) + ' | ' + t.location + ' | inv:' + t.investigator + ' | ' + eff + ' | ' + ctrlStr + ' | ' + t.status + ' | result:' + t.result + proj + ' | wx:' + wx + obs + notes;
  }).join('\n');
}

function buildIngredientSynergySummary(parsedTrials, catFormulations, catIngredients) {
  if (!catIngredients || catIngredients.length === 0) return 'No ingredients recorded.';

  const formMap = new Map();
  catFormulations.forEach(f => {
    const ings = safeJsonParse(f.IngredientsJSON || f.Ingredients || f.ingredients, []);
    formMap.set(String(f.Name || '').toLowerCase().trim(), Array.isArray(ings) ? ings : []);
  });

  const ingStats = catIngredients.map(ing => {
    const name = (ing.Name || ing.name || '').trim();
    const cleanName = name.toLowerCase();
    const cost = ing.Cost || ing.pricePerUnit || ing.PricePerUnit || 'N/A';
    const unit = ing.Unit || ing.unit || 'ml';

    const matchedFormNames = [];
    formMap.forEach((ingList, fName) => {
      if (ingList.some(item => String(item.name || '').toLowerCase().trim() === cleanName)) {
        matchedFormNames.push(fName);
      }
    });

    const trials = parsedTrials.filter(t => matchedFormNames.includes(String(t.formulation || '').toLowerCase().trim()));
    const effs = trials.map(t => t.finalEfficacy).filter(e => e !== null);
    const winCount = trials.filter(t => t.result === 'Excellent' || t.result === 'Good').length;

    return {
      name,
      cost,
      unit,
      formulaCount: matchedFormNames.length,
      trialCount: trials.length,
      winRate: trials.length > 0 ? Math.round((winCount / trials.length) * 100) : null,
      avgEff: avg(effs),
      targets: [...new Set(trials.map(t => t.target).filter(Boolean))]
    };
  });

  return ingStats.map(s => {
    const perf = s.trialCount > 0 
      ? ` | tested in ${s.trialCount} trial(s) across ${s.formulaCount} formula(s) -> avgEff: ${s.avgEff ?? '?'}% (winRate: ${s.winRate}%) | targets:[${s.targets.slice(0, 4).join(', ')}]`
      : ' | in-stock in inventory (untested in recorded trials)';
    return `* ${s.name} (Cost: Rs.${s.cost}/${s.unit})${perf}`;
  }).join('\n');
}

/**
 * buildAIMemoryContext - Main export
 * Returns { contextString, stats }
 */
export function buildAIMemoryContext(trials, formulations, projects, ingredients, categoryId) {
  const primaryObsField = getPrimaryObservationField(categoryId);
  const catTrials = (trials || []).filter(t => (t.Category || 'herbicide') === categoryId);
  const catFormulations = (formulations || []).filter(f => (f.Category || 'herbicide') === categoryId);
  const catProjects = (projects || []).filter(p => (p.Category || 'herbicide') === categoryId);
  const catIngredients = (ingredients || []).filter(i => (i.Category || 'herbicide') === categoryId);

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

  const finalizedTrials = parsedTrials.filter(t => t.isCompleted);
  const activeTrials = parsedTrials.filter(t => !t.isCompleted);
  const largeFieldTrials = parsedTrials.filter(t => t.isLargeScale);
  const standardTrials = parsedTrials.filter(t => !t.isLargeScale);

  const formulationsCtx = catFormulations.length > 0
    ? catFormulations.map(f => {
        const fStats = getFormulationTrialStats(f, catTrials, catProjects, categoryId);
        const cost = calculateFormulationCost(f, catIngredients);
        const ings = safeJsonParse(f.IngredientsJSON || f.Ingredients || f.ingredients, []);
        const ingStr = Array.isArray(ings) ? ings.map(i => `${i.name} ${i.quantity}${i.unit || 'ml'}`).join(' + ') : '';

        const tierStr = fStats.avgEfficacy >= 90
          ? 'TOP TIER (Excellent - 90%+)'
          : fStats.avgEfficacy >= 75
          ? 'MID TIER (Good)'
          : fStats.avgEfficacy !== null
          ? 'LOWER TIER (Fair/Poor)'
          : 'UNTESTED';

        const targetsArr = Object.keys(fStats.targetMap || {});
        const targetsDetail = targetsArr.length > 0
          ? targetsArr.map(t => `${t} (avg: ${fStats.targetMap[t].avgEff ?? '?'}%, ${fStats.targetMap[t].count} trial${fStats.targetMap[t].count > 1 ? 's' : ''})`).join(', ')
          : (f.TargetWeeds || f.targetWeeds || 'General targets');

        const perfSummary = fStats.total > 0
          ? `[VERIFIED FIELD PERFORMANCE: ${fStats.total} Trials (${fStats.fieldCount} Field Plots, ${fStats.microplotCount} Microplots) | Standings: ${tierStr} | Avg Efficacy: ${fStats.avgEfficacy}% | Peak Efficacy: ${fStats.peakEfficacy}% | Win Rate: ${fStats.winRate}% | Avg Finalized Control: ${fStats.avgCtrlDays ? fStats.avgCtrlDays + 'd' : 'In progress'} | Est Cost: Rs.${cost.toFixed(2)}/L]`
          : `[UNTESTED in recorded trials | Est Cost: Rs.${cost.toFixed(2)}/L]`;

        return `* FORMULATION: "${f.Name}" (ID: ${f.ID || 'N/A'})\n  ${perfSummary}\n  Target Control: [${targetsDetail}]\n  MoA: ${f.ModeOfAction || 'Standard'} | Recipe: [${ingStr}]\n  Notes: ${f.Notes || 'none'}`;
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
    const topStr = r.topFormulas.map(f =>
      '    #' + f.rank + ' ' + f.formula + ' @' + f.dosage +
      ' | avgEff:' + (f.avgEfficacy !== null ? f.avgEfficacy + '%' : '?') +
      ' | avgCtrlDays:' + (f.avgCtrlDays !== null ? f.avgCtrlDays + 'd (from ' + f.finalizedTrialCount + ' finalized trials)' : 'no-finalized-data') +
      ' | maxCtrlDays:' + (f.maxCtrlDays !== null ? f.maxCtrlDays + 'd' : '?') +
      ' | trials:' + f.trialCount + '(finalized:' + f.finalizedTrialCount + ', active:' + f.activeTrialCount + ')' +
      ' | E' + f.resultBreakdown.Excellent + '/G' + f.resultBreakdown.Good + '/F' + f.resultBreakdown.Fair + '/P' + f.resultBreakdown.Poor
    ).join('\n');
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

  const forSumStr = formulaSums.map(f =>
    '  ' + f.formula + ' @' + f.dosage + ' | trials:' + f.trialCount + '(fin:' + f.finalizedCount + ',act:' + f.activeCount + ')' +
    ' | avgEff:' + (f.avgEfficacy !== null ? f.avgEfficacy + '%' : '?') +
    ' | maxEff:' + (f.maxEfficacy !== null ? f.maxEfficacy + '%' : '?') +
    ' | avgCtrlDays(finalized-only):' + (f.avgFinalizedCtrlDays !== null ? f.avgFinalizedCtrlDays + 'd' : 'no-finalized-data') +
    ' | maxCtrlDays(finalized-only):' + (f.maxFinalizedCtrlDays !== null ? f.maxFinalizedCtrlDays + 'd' : '?') +
    ' | targets:[' + f.targets.slice(0, 5).join(', ') + ']'
  ).join('\n');

  const contextString = [
    '=== DATABASE OVERVIEW ===',
    'Category: ' + categoryId.toUpperCase(),
    'Total Trials: ' + stats.totalTrials + ' (' + stats.standardTrials + ' Standard/Plot Trials, ' + stats.largeFieldTrials + ' Large-Scale Field Studies)',
    'Finalized Trials: ' + stats.completedTrials + ' (real measured control duration)',
    'Active Trials: ' + stats.activeTrials + ' (still running — elapsed days is NOT control duration)',
    'Unique Targets: ' + stats.uniqueTargets + ' | Unique Formulas: ' + stats.uniqueFormulas,
    'Locations: ' + stats.uniqueLocations + ' | Investigators: ' + stats.uniqueInvestigators,
    'Date Range: ' + (stats.dateRange.earliest || '?') + ' to ' + (stats.dateRange.latest || '?'),
    '',
    '=== TRIAL TYPES & FIELD-SCALE VALIDATION ===',
    'Standard Trials: Microplot/pot trials for initial screening.',
    'Large Field Trials: Real-world farm studies with multiple monitoring spots. Formulations validated in Large Field Trials carry the highest scientific confidence.',
    '',
    '=== INGREDIENT INVENTORY & FIELD SYNERGY MATRIX ===',
    ingredientSynergy,
    '',
    '=== FORMULATION KNOWLEDGE BASE ===',
    formulationsCtx,
    '',
    '=== FORMULA PERFORMANCE OVERVIEW (ALL TRIALS, ctrl days from Finalized only) ===',
    forSumStr || 'No performance data available.',
    '',
    '=== TARGET-BASED FORMULA RANKINGS (Top 5 per target, ctrl days from Finalized only) ===',
    rankStr || 'No ranking data available.',
    '',
    '=== SAME-FORMULA VARIABLE OUTCOMES — Weather/Timing Analysis ===',
    failStr || 'No variable outcome cases detected.',
    '',
    '=== INVESTIGATOR SUMMARY ===',
    invStr || 'No investigator data available.',
    '',
    '=== COMPLETE TRIAL INDEX (ALL ' + stats.totalTrials + ' TRIALS) ===',
    'FINALIZED control = "Xd-FINALIZED" | Active elapsed time = "Xd-ELAPSED(active,not-final)"',
    trialIndex || 'No trials recorded.',
    '',
    '=== CRITICAL RULES FOR FORMULATION EVALUATION & AGRONOMIC AUDITS ===',
    '1. When asked to evaluate, compare, or audit a specific formulation (e.g. "Goweed (MR4)"), ALWAYS check its verified benchmark in the === FORMULATION KNOWLEDGE BASE === first.',
    '2. If a formula has an Average Efficacy of 90%+ across field trials (such as Goweed (MR4) with 95% efficacy across 4 plot trials), it is an ELITE / TOP-TIER formula. NEVER state it has 0% efficacy or poor performance based on an isolated observation log or single trial anomaly.',
    '3. Cite its true field statistics: total plot trials, average efficacy, peak efficacy, win rate, and control duration from the knowledge base.',
    '4. Note any recipe unit anomalies: e.g. if liquid ingredients like Acetic Acid or Capric Acid are recorded as 0.200 ml instead of 0.200 L (or 200 ml), alert the user to the likely unit notation typo in the database.',
    '5. When suggesting upgrades for top-performing recipes (90%+ efficacy), focus recommendations on cost reduction (comparing est. cost/L against other benchmarks), optimizing surfactant/solvent penetration, or broadening spectrum, rather than falsely treating it as a failing formula.',
    '',
    '=== GUIDELINES FOR NOVEL FORMULATION RECOMMENDATIONS ===',
    'When asked to suggest new, improved, or novel formulations:',
    '1. Cross-reference the INGREDIENT INVENTORY above to select realistic, available ingredients.',
    '2. Combine complementary modes of action (e.g. fast contact knockdown + systemic residual control, or active + penetration enhancer / surfactant).',
    '3. Cite expected synergy and compare predicted efficacy against the existing trial benchmarks.',
    '4. CRITICAL: Whenever you recommend a new candidate formulation, ALWAYS enclose its exact recipe in a ```formula code block formatted like this so the user can save it in 1 click:',
    '```formula',
    '{',
    '  "name": "Suggested Formula Name",',
    '  "category": "' + categoryId + '",',
    '  "notes": "Brief description of agronomic positioning and mode of action.",',
    '  "dosage": "Suggested application rate (e.g. 40 ml/L or 2 L/ha)",',
    '  "target": "Target species or pathogens",',
    '  "ingredients": [',
    '    { "name": "Ingredient A", "quantity": 400, "unit": "ml" },',
    '    { "name": "Ingredient B", "quantity": 100, "unit": "ml" }',
    '  ],',
    '  "predictedEfficacy": 94,',
    '  "synergyRationale": "Explanation of biochemical synergy and why this formula will perform well."',
    '}',
    '```'
  ].join('\n');

  return { contextString, stats };
}
