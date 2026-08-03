/**
 * aiMemory.js
 * Super-Memory Engine for the AI Assistant.
 * Builds a rich, pre-aggregated knowledge base from ALL in-memory data.
 */

import { safeJsonParse } from './helpers.js';
import { getPrimaryObservationField } from './categoryConfig.js';

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

  let finalEfficacy = null, peakEfficacy = null;
  const allEff = postObs.map(o => {
    const daaVal = Number(o.daa ?? o.day ?? o.DAA ?? 0);
    const obsVal = o[primaryObsField] !== undefined ? Number(o[primaryObsField]) : null;
    let ctrlPct = o.controlPct ?? o.control ?? o.efficacy ?? null;
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

  let controlDays = null;
  if (trial.FinalControlDuration) {
    controlDays = parseInt(trial.FinalControlDuration, 10);
    if (isNaN(controlDays)) controlDays = null;
  } else if (trial.Date) {
    const start = new Date(trial.Date);
    const end = isCompleted && trial.FinalizationDate ? new Date(trial.FinalizationDate) : new Date();
    controlDays = Math.max(0, Math.round((end - start) / 86400000));
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
    status: isCompleted ? 'Finalized' : 'Active',
    controlDays,
    finalEfficacy,
    peakEfficacy,
    baselineCover: round1(baselineVal),
    weather: {
      temp: fmt(trial.Temperature, null),
      humidity: fmt(trial.Humidity, null),
      wind: fmt(trial.Windspeed, null),
      rain: fmt(trial.Rain, null),
    },
    notes: fmt(trial.Conclusion || trial.Notes || '', null),
    obsTimeline,
    observationCount: sorted.length,
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
      const controlDaysArr = trials.map(t => t.controlDays).filter(d => d !== null && d > 0);
      const resultCounts = { Excellent: 0, Good: 0, Fair: 0, Poor: 0, Unrated: 0 };
      trials.forEach(t => { resultCounts[t.result] = (resultCounts[t.result] || 0) + 1; });
      const avgEff = avg(efficacies);
      const avgDays = avg(controlDaysArr);
      const effScore = avgEff !== null ? avgEff : 0;
      const dayScore = avgDays !== null ? Math.min(avgDays / 60 * 100, 100) : 0;
      const score = effScore * 0.6 + dayScore * 0.4;
      return { formula, dosage, trialCount: trials.length, avgEfficacy: avgEff, avgControlDays: avgDays, resultBreakdown: resultCounts, score, locations: [...new Set(trials.map(t => t.location).filter(Boolean))], dates: trials.map(t => t.dateISO).filter(Boolean).sort() };
    });
    formulaRanks.sort((a, b) => b.score - a.score);
    rankings.push({ target, trialCount: Object.values(formulaMap).flat().length, topFormulas: formulaRanks.slice(0, topN).map((f, i) => Object.assign({ rank: i + 1 }, f)) });
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
    const cases = trials.filter(t => t.finalEfficacy !== null).sort((a, b) => (a.finalEfficacy || 0) - (b.finalEfficacy || 0)).map(t => ({
      date: t.dateISO || t.date, month: t.month, result: t.result, efficacy: t.finalEfficacy,
      controlDays: t.controlDays, location: t.location, investigator: t.investigator,
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
    return {
      investigator, trialCount: trials.length, completedTrials: trials.filter(t => t.isCompleted).length,
      avgEfficacy: avg(efficacies), targets: [...new Set(trials.map(t => t.target).filter(Boolean))],
      formulasUsed: [...new Set(trials.map(t => t.formulation).filter(Boolean))],
      resultBreakdown: resultCounts, lastTrialDate: trials.map(t => t.dateISO).filter(Boolean).sort().pop() || null
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
    const controlDaysArr = trials.map(t => t.controlDays).filter(d => d !== null && d > 0);
    const resultCounts = { Excellent: 0, Good: 0, Fair: 0, Poor: 0, Unrated: 0 };
    trials.forEach(t => { resultCounts[t.result] = (resultCounts[t.result] || 0) + 1; });
    return {
      formula, dosage, trialCount: trials.length,
      targets: [...new Set(trials.map(t => t.target).filter(Boolean))],
      avgEfficacy: avg(efficacies),
      minEfficacy: efficacies.length ? Math.min(...efficacies) : null,
      maxEfficacy: efficacies.length ? Math.max(...efficacies) : null,
      avgControlDays: avg(controlDaysArr),
      maxControlDays: controlDaysArr.length ? Math.max(...controlDaysArr) : null,
      resultBreakdown: resultCounts,
      completedTrials: trials.filter(t => t.isCompleted).length,
      activeTrials: trials.filter(t => !t.isCompleted).length,
      locations: [...new Set(trials.map(t => t.location).filter(Boolean))]
    };
  }).sort((a, b) => (b.avgEfficacy || 0) - (a.avgEfficacy || 0));
}

function buildTrialIndex(parsedTrials, projectMap) {
  return parsedTrials.map(t => {
    const proj = projectMap[t.projectId] ? '[' + projectMap[t.projectId] + ']' : '';
    const eff = t.finalEfficacy !== null ? t.finalEfficacy + '%eff' : 'no-eff';
    const days = t.controlDays !== null ? t.controlDays + 'd' : '?d';
    const wx = [t.weather.temp ? t.weather.temp + '\u00b0C' : null, t.weather.humidity ? t.weather.humidity + '%RH' : null, t.weather.wind ? t.weather.wind + 'km/h' : null, (t.weather.rain && t.weather.rain !== '0') ? 'rain:' + t.weather.rain : null].filter(Boolean).join('/') || 'no-wx';
    const notes = t.notes ? ' | notes:' + t.notes.slice(0, 80) : '';
    const obs = t.obsTimeline ? ' | obs:[' + t.obsTimeline + ']' : '';
    return '* [' + t.id + '] ' + t.formulation + ' @' + t.dosage + ' | target:' + t.target + ' | ' + (t.dateISO || t.date) + ' | ' + t.location + ' | inv:' + t.investigator + ' | ' + eff + ' | ' + days + 'ctrl | ' + t.status + ' | result:' + t.result + proj + ' | wx:' + wx + obs + notes;
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
  catProjects.forEach(p => { projectMap[p.ID] = p.Name; });

  const targetFieldMap = { herbicide: 'WeedSpecies', fungicide: 'DiseaseTarget', pesticide: 'PestTarget', nutrition: 'CropTarget', biostimulant: 'CropTarget' };
  const targetField = targetFieldMap[categoryId] || 'WeedSpecies';

  const parsedTrials = catTrials.map(t => {
    const parsed = parseTrial(t, primaryObsField, categoryId);
    parsed.target = canonicalTarget(t, targetField);
    parsed.projectName = projectMap[t.ProjectID] || '';
    return parsed;
  });

  const targetRankings = buildTargetRankings(parsedTrials, 5);
  const failureCases = buildFailureAnalysis(parsedTrials);
  const investigatorSums = buildInvestigatorSummary(parsedTrials);
  const formulaSums = buildFormulaSummary(parsedTrials);
  const trialIndex = buildTrialIndex(parsedTrials, projectMap);

  const ingredientsCtx = catIngredients.length > 0
    ? catIngredients.map(i => (i.name || i.Name) + ' | ' + (i.quantity || i.Quantity) + (i.unit || i.Unit) + ' @ Rs.' + (i.pricePerUnit || i.PricePerUnit) + '/' + (i.unit || i.Unit)).join('\n')
    : 'No ingredients recorded.';

  const formulationsCtx = catFormulations.length > 0
    ? catFormulations.map(f => {
        const ings = safeJsonParse(f.Ingredients || f.ingredients, []);
        const ingStr = Array.isArray(ings) ? ings.map(i => i.name + ' ' + i.quantity + i.unit).join('+') : '';
        return f.Name + ' | MoA:' + (f.ModeOfAction || '?') + ' | targets:' + (f.TargetWeeds || f.targetWeeds || '?') + ' | ingredients:[' + ingStr + ']';
      }).join('\n')
    : 'No formulations recorded.';

  const stats = {
    totalTrials: catTrials.length,
    completedTrials: parsedTrials.filter(t => t.isCompleted).length,
    activeTrials: parsedTrials.filter(t => !t.isCompleted).length,
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
      '    #' + f.rank + ' ' + f.formula + ' @' + f.dosage + ' | avgEff:' + (f.avgEfficacy !== null ? f.avgEfficacy + '%' : '?') + ' | avgCtrlDays:' + (f.avgControlDays !== null ? f.avgControlDays : '?') + 'd | trials:' + f.trialCount + ' | E' + f.resultBreakdown.Excellent + '/G' + f.resultBreakdown.Good + '/F' + f.resultBreakdown.Fair + '/P' + f.resultBreakdown.Poor
    ).join('\n');
    return '  TARGET: ' + r.target + ' (' + r.trialCount + ' trials)\n' + topStr;
  }).join('\n\n');

  const failStr = failureCases.map(f => {
    const caseStr = f.cases.map(c =>
      '    [' + c.date + '|' + c.location + '|' + c.investigator + '] eff:' + (c.efficacy !== null ? c.efficacy + '%' : '?') + ' result:' + c.result + ' ctrl:' + (c.controlDays !== null ? c.controlDays + 'd' : '?') + ' wx:' + (c.weather.temp ? c.weather.temp + 'C' : '?') + '/' + (c.weather.humidity ? c.weather.humidity + '%RH' : '?') + '/' + (c.weather.rain ? 'rain:' + c.weather.rain : 'dry')
    ).join('\n');
    return '  FORMULA: ' + f.formula + ' on TARGET: ' + f.target + ' (efficacy range: ' + f.efficacyRange + ')\n' + caseStr;
  }).join('\n\n');

  const invStr = investigatorSums.map(i =>
    '  ' + i.investigator + ' | trials:' + i.trialCount + ' | completed:' + i.completedTrials + ' | avgEff:' + (i.avgEfficacy !== null ? i.avgEfficacy + '%' : '?') + ' | lastTrial:' + (i.lastTrialDate || '?') + ' | targets:[' + i.targets.slice(0, 5).join(', ') + ']'
  ).join('\n');

  const forSumStr = formulaSums.map(f =>
    '  ' + f.formula + ' @' + f.dosage + ' | trials:' + f.trialCount + ' | avgEff:' + (f.avgEfficacy !== null ? f.avgEfficacy + '%' : '?') + ' | maxEff:' + (f.maxEfficacy !== null ? f.maxEfficacy + '%' : '?') + ' | avgCtrlDays:' + (f.avgControlDays !== null ? f.avgControlDays : '?') + 'd | maxCtrlDays:' + (f.maxControlDays !== null ? f.maxControlDays : '?') + 'd | targets:[' + f.targets.slice(0, 5).join(', ') + ']'
  ).join('\n');

  const contextString = [
    '=== DATABASE OVERVIEW ===',
    'Category: ' + categoryId.toUpperCase(),
    'Total Trials: ' + stats.totalTrials + ' (Completed: ' + stats.completedTrials + ' | Active: ' + stats.activeTrials + ')',
    'Unique Targets: ' + stats.uniqueTargets + ' | Unique Formulas: ' + stats.uniqueFormulas + ' | Locations: ' + stats.uniqueLocations + ' | Investigators: ' + stats.uniqueInvestigators,
    'Date Range: ' + (stats.dateRange.earliest || '?') + ' to ' + (stats.dateRange.latest || '?'),
    '',
    '=== FORMULATION KNOWLEDGE BASE ===',
    formulationsCtx,
    '',
    '=== INGREDIENT INVENTORY ===',
    ingredientsCtx,
    '',
    '=== FORMULA PERFORMANCE OVERVIEW (ALL TRIALS) ===',
    forSumStr || 'No performance data available.',
    '',
    '=== TARGET-BASED FORMULA RANKINGS (Top 5 per target, computed from ALL trials) ===',
    rankStr || 'No ranking data available.',
    '',
    '=== SAME-FORMULA VARIABLE OUTCOMES - Weather/Timing Analysis ===',
    'Cases where the SAME formula on the SAME target produced DIFFERENT results:',
    failStr || 'No variable outcome cases detected.',
    '',
    '=== INVESTIGATOR SUMMARY ===',
    invStr || 'No investigator data available.',
    '',
    '=== COMPLETE TRIAL INDEX (ALL ' + stats.totalTrials + ' TRIALS) ===',
    'Format: [ID] Formula @Dosage | target | date | location | inv:investigator | efficacy | controlDays | status | result | wx:weather | obs:timeline | notes',
    trialIndex || 'No trials recorded.',
  ].join('\n');

  return { contextString, stats };
}
