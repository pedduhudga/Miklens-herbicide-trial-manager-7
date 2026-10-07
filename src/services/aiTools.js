// src/services/aiTools.js
// Agentic Agronomic Tool Engine for AI Assistant
// Provides executable functions for statistical ANOVA, spray window forecasting,
// Colby synergy & cost calculation, trial doctor auditing, and field scouting.

import { performANOVA } from '../utils/statsUtils.js';
import { analyzeSprayWindow } from './sprayAdvisor.js';
import { fitFourPLModel } from '../utils/doseResponseUtils.js';
import { predictFormulaFeasibility } from '../utils/feasibilityEngine.js';
import { calculateFormulationCost } from '../utils/costUtils.js';
import { findDuplicateFormulation } from '../utils/formulationDuplicateUtils.js';
import { parseVoiceObservation } from '../utils/voiceParser.js';
import { safeJsonParse } from '../utils/helpers.js';
import { identifyHrac } from '../utils/hracSynergy.js';

/**
 * 1. RUN ANOVA STATISTICAL ANALYSIS TOOL
 * Performs one-way ANOVA across formulations for a specific weed target or metric.
 */
export async function toolRunAnova({ target, metric = 'controlPct', design = 'RCBD' }, context) {
  const { trials = [], activeCategory = 'herbicide' } = context;
  const filteredTrials = trials.filter(t => {
    const cat = (t.Category || 'herbicide').toLowerCase();
    if (cat !== activeCategory.toLowerCase()) return false;
    if (!target) return true;
    const weed = (t.WeedSpecies || t.WeedTarget || t.Target || t.DiseaseTarget || t.PestTarget || '').toLowerCase();
    return weed.includes(target.toLowerCase());
  });

  if (filteredTrials.length < 3) {
    return {
      success: false,
      error: `Insufficient trials (${filteredTrials.length}) found for target "${target || 'all'}" to perform valid ANOVA. Need at least 3 trials.`
    };
  }

  try {
    const anovaResult = performANOVA(filteredTrials, {
      metric,
      design,
      activeCategory
    });

    if (anovaResult.error) {
      return { success: false, error: anovaResult.error };
    }

    const treatments = Object.entries(anovaResult.treatmentMeans || {}).map(([name, mean]) => ({
      name,
      mean: Math.round(mean * 10) / 10,
      reps: anovaResult.trtRepCounts ? (anovaResult.trtRepCounts[name] || 1) : 1
    })).sort((a, b) => b.mean - a.mean);

    const fStat = anovaResult.fStatistic !== null ? Number(anovaResult.fStatistic).toFixed(2) : 'N/A';
    const pVal = anovaResult.pValue !== null ? Number(anovaResult.pValue).toFixed(4) : 'N/A';
    const isSignificant = anovaResult.pValue !== null && anovaResult.pValue < 0.05;

    return {
      success: true,
      data: {
        fStatistic: fStat,
        pValue: pVal,
        isSignificant,
        significanceText: isSignificant ? 'Statistically Significant (p < 0.05)' : 'Not Statistically Significant (p ≥ 0.05)',
        treatments,
        grandMean: Math.round((anovaResult.grandMean || 0) * 10) / 10,
        dfTreatments: anovaResult.dfTreatments,
        dfError: anovaResult.dfError,
        trialCount: filteredTrials.length,
        target: target || 'All Targets',
        metric
      },
      artifact: {
        artifactType: 'anova',
        target: target || 'All Targets',
        metric,
        fStatistic: fStat,
        pValue: pVal,
        isSignificant,
        treatments,
        grandMean: Math.round((anovaResult.grandMean || 0) * 10) / 10,
        trialCount: filteredTrials.length
      }
    };
  } catch (err) {
    return { success: false, error: `ANOVA execution failed: ${err.message}` };
  }
}

/**
 * 2. LIVE SPRAY WINDOW WEATHER ADVISOR TOOL
 * Fetches Open-Meteo biometeorological conditions (Delta-T, wind, rain, temp)
 */
export async function toolCheckSprayWindow({ location, lat, lon, targetDate = null }, context) {
  const { trials = [] } = context;

  let useLat = lat ? parseFloat(lat) : null;
  let useLon = lon ? parseFloat(lon) : null;
  let locName = location || 'Field Site';

  // If no lat/lon, try resolving from existing trials
  if (useLat === null || useLon === null || isNaN(useLat) || isNaN(useLon)) {
    const trialWithLoc = trials.find(t => t.Location && (t.Latitude || t.Lat || t.LocationLat));
    if (trialWithLoc) {
      useLat = parseFloat(trialWithLoc.Latitude || trialWithLoc.Lat || trialWithLoc.LocationLat);
      useLon = parseFloat(trialWithLoc.Longitude || trialWithLoc.Lon || trialWithLoc.LocationLon);
      locName = trialWithLoc.Location || locName;
    } else {
      // Standard agricultural test coordinates (Pune Agricultural Research Zone default)
      useLat = 18.5204;
      useLon = 73.8567;
      locName = location || 'Research Farm (Pune Regional Zone)';
    }
  }

  try {
    const analysis = await analyzeSprayWindow(useLat, useLon, targetDate);
    if (!analysis || analysis.error) {
      return { success: false, error: analysis?.error || 'Weather forecast currently unreachable.' };
    }

    const best = analysis.bestWindow || null;
    const currentScore = best ? best.score : (analysis.currentScore || 70);
    const topWindows = (analysis.windows || []).slice(0, 5).map(w => ({
      hour: `${w.hour}:00`,
      score: w.score,
      verdict: w.riskLevel?.label || 'Fair',
      temp: `${Math.round(w.conditions.temperature)}°C`,
      wind: `${Math.round(w.conditions.windSpeed)} km/h`,
      humidity: `${Math.round(w.conditions.humidity)}%`,
      deltaT: Number(w.deltaT).toFixed(1),
      rain: `${w.conditions.precipitation || 0} mm`,
      issues: w.issues || []
    }));

    return {
      success: true,
      data: {
        location: locName,
        bestWindow: best ? {
          hour: `${best.hour}:00`,
          score: best.score,
          label: best.riskLevel?.label || 'Good',
          temp: `${Math.round(best.conditions.temperature)}°C`,
          wind: `${Math.round(best.conditions.windSpeed)} km/h`,
          humidity: `${Math.round(best.conditions.humidity)}%`,
          deltaT: Number(best.deltaT).toFixed(1)
        } : null,
        topWindows,
        summary: best && best.score >= 80
          ? `Optimal spraying window detected at ${best.hour}:00 with Delta-T of ${Number(best.deltaT).toFixed(1)} and wind ${Math.round(best.conditions.windSpeed)} km/h.`
          : 'Caution advised: High Delta-T or wind gusts present in upcoming forecast.'
      },
      artifact: {
        artifactType: 'spray_window',
        location: locName,
        currentScore,
        bestWindow: best ? {
          hour: `${best.hour}:00`,
          score: best.score,
          label: best.riskLevel?.label || 'Good',
          temp: `${Math.round(best.conditions.temperature)}°C`,
          wind: `${Math.round(best.conditions.windSpeed)} km/h`,
          deltaT: Number(best.deltaT).toFixed(1)
        } : null,
        topWindows
      }
    };
  } catch (err) {
    return { success: false, error: `Spray advisor failed: ${err.message}` };
  }
}

/**
 * 3. COLBY SYNERGY & INVENTORY RECIPE COST TOOL
 * Calculates Colby expected synergy for tank mixes, checks HRAC antagonism,
 * and derives commercial production cost per liter from ingredient stock.
 */
export async function toolEvaluateColbyAndCost({ ingredients, targetSpecies = '' }, context) {
  const { trials = [], ingredients: inventory = [], formulations = [] } = context;

  const rawIngs = Array.isArray(ingredients) ? ingredients : [];
  if (rawIngs.length === 0) {
    return { success: false, error: 'No ingredients provided for synergy evaluation.' };
  }

  // 1. Feasibility & Colby synergy analysis
  const feasibility = predictFormulaFeasibility(rawIngs, trials, targetSpecies);

  // 2. Cost derivation using current inventory rates
  const costReport = calculateFormulationCost(rawIngs, inventory);

  // 3. HRAC Mode of Action & Antagonism Check
  const hracTags = [];
  let hasAntagonism = false;
  let antagonismReason = '';

  for (const ing of rawIngs) {
    const info = identifyHrac(ing.name || ing.Name);
    if (info && info.code && info.code !== 'Adjuvant') {
      hracTags.push({ name: ing.name, group: info.code, moa: info.moa });
    }
  }

  // Check classic Herbicide Antagonism: ACCase Graminicide (Group 1) + Synthetic Auxin (Group 4)
  const hasGroup1 = hracTags.some(t => t.group === '1' || t.group === 'A');
  const hasGroup4 = hracTags.some(t => t.group === '4' || t.group === 'O');
  if (hasGroup1 && hasGroup4) {
    hasAntagonism = true;
    antagonismReason = 'Known biochemical antagonism between ACCase Graminicides and Synthetic Auxins (2,4-D/Dicamba) can reduce grass control by up to 25%.';
  }

  // 4. Duplicate Check
  const duplicate = findDuplicateFormulation(rawIngs, formulations);

  return {
    success: true,
    data: {
      predictedEfficacyMin: feasibility.predictedEfficacyMin,
      predictedEfficacyMax: feasibility.predictedEfficacyMax,
      predictedEfficacyAvg: feasibility.predictedEfficacyAvg,
      overallRating: feasibility.overallRating,
      confidence: feasibility.confidence,
      susceptibleWeeds: feasibility.susceptibleWeeds,
      moderateWeeds: feasibility.moderateWeeds,
      tolerantWeeds: feasibility.tolerantWeeds,
      costPerLiter: costReport.totalCostPerLiter ? `₹${costReport.totalCostPerLiter.toFixed(2)} / L` : 'N/A',
      costSummary: costReport.summary || '',
      hasAntagonism,
      antagonismReason,
      isDuplicate: !!duplicate,
      duplicateName: duplicate ? duplicate.Name : null,
      groundingTrialsCount: feasibility.groundingTrialsCount
    },
    artifact: {
      artifactType: 'feasibility',
      formulaName: 'Candidate Formulation',
      predictedEfficacyAvg: feasibility.predictedEfficacyAvg,
      predictedEfficacyMin: feasibility.predictedEfficacyMin,
      predictedEfficacyMax: feasibility.predictedEfficacyMax,
      confidence: feasibility.confidence,
      overallRating: feasibility.overallRating,
      susceptibleWeeds: feasibility.susceptibleWeeds,
      moderateWeeds: feasibility.moderateWeeds,
      tolerantWeeds: feasibility.tolerantWeeds,
      costPerLiter: costReport.totalCostPerLiter ? `₹${costReport.totalCostPerLiter.toFixed(2)}/L` : null,
      hasAntagonism,
      antagonismReason,
      isDuplicate: !!duplicate,
      duplicateOf: duplicate ? duplicate.Name : null,
      groundingTrialsCount: feasibility.groundingTrialsCount
    }
  };
}

/**
 * 4. PROACTIVE "TRIAL DOCTOR" & ANOMALY WATCHDOG TOOL
 * Audits all trial records in the active category for:
 * - Data Entry Inconsistencies (sudden jump in efficacy, missing baseline, etc.)
 * - Weather Failure Correlations (high temp / low humidity links to poor control)
 * - Herbicide Resistance Watchdog (repeated HRAC mode of action warnings)
 */
export async function toolAuditTrialDoctor(options = {}, context) {
  const { trials = [], activeCategory = 'herbicide' } = context;

  const catTrials = trials.filter(t => (t.Category || 'herbicide').toLowerCase() === activeCategory.toLowerCase());

  if (catTrials.length === 0) {
    return {
      success: false,
      error: `No trials found in the ${activeCategory} database to audit.`
    };
  }

  const issues = [];
  let criticalCount = 0;
  let warningCount = 0;
  let insightCount = 0;

  // --- CHECK 1: DATA INCONSISTENCIES ---
  for (const trial of catTrials) {
    const rawEff = safeJsonParse(trial.EfficacyDataJSON, []);
    const sorted = [...rawEff].sort((a, b) => Number(a.daa ?? 0) - Number(b.daa ?? 0));
    
    // Missing baseline DAA 0
    const hasBaseline = sorted.some(o => Number(o.daa ?? 0) === 0);
    if (sorted.length > 1 && !hasBaseline) {
      issues.push({
        id: `missing-baseline-${trial.ID}`,
        trialId: trial.ID,
        trialName: trial.FormulationName || trial.ID,
        severity: 'warning',
        title: 'Missing DAA 0 Baseline Assessment',
        description: `Trial has ${sorted.length} observations but lacks an initial DAA 0 baseline. Weed control calculations may be skewed.`,
        actionPrompt: `Add DAA 0 baseline for trial ${trial.ID}`
      });
      warningCount++;
    }

    // Sudden abnormal efficacy spike (>50% jump in 1 day without repeat spray)
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      const prevEff = Number(prev.controlPct ?? prev.efficacy ?? 0);
      const currEff = Number(curr.controlPct ?? curr.efficacy ?? 0);
      const dayDiff = Number(curr.daa ?? 0) - Number(prev.daa ?? 0);

      if (dayDiff <= 1 && currEff - prevEff > 55) {
        issues.push({
          id: `spike-${trial.ID}-${curr.daa}`,
          trialId: trial.ID,
          trialName: trial.FormulationName || trial.ID,
          severity: 'critical',
          title: `Suspicious Efficacy Jump (+${currEff - prevEff}%) at DAA ${curr.daa}`,
          description: `Control jumped from ${prevEff}% to ${currEff}% within ${dayDiff} day(s). Verify if this was a typo or a second spray application.`,
          actionPrompt: `Review observation timeline for trial ${trial.ID}`
        });
        criticalCount++;
      }
    }

    // Contradictory result (Rating is Excellent but final efficacy < 40%)
    const finalEff = sorted.length > 0 ? Number(sorted[sorted.length - 1].controlPct ?? sorted[sorted.length - 1].efficacy ?? 0) : null;
    const rating = String(trial.Result || '').toLowerCase();
    if (finalEff !== null && finalEff < 40 && rating === 'excellent') {
      issues.push({
        id: `rating-mismatch-${trial.ID}`,
        trialId: trial.ID,
        trialName: trial.FormulationName || trial.ID,
        severity: 'critical',
        title: 'Rating & Efficacy Metric Conflict',
        description: `Trial is labeled "Excellent" but recorded final efficacy is only ${finalEff}%. Rating should be updated to "Poor".`,
        actionPrompt: `Update rating for trial ${trial.ID} to Poor`
      });
      criticalCount++;
    }
  }

  // --- CHECK 2: WEATHER FAILURE CORRELATIONS ---
  const failedTrials = catTrials.filter(t => {
    const rawEff = safeJsonParse(t.EfficacyDataJSON, []);
    const last = rawEff[rawEff.length - 1];
    const eff = last ? Number(last.controlPct ?? last.efficacy ?? 0) : null;
    return eff !== null && eff < 60;
  });

  const highTempFailures = failedTrials.filter(t => parseFloat(t.Temperature) >= 32);
  const lowHumidityFailures = failedTrials.filter(t => parseFloat(t.Humidity) <= 40);
  const rainwashFailures = failedTrials.filter(t => String(t.Rain || '').toLowerCase().includes('yes') || parseFloat(t.Rain) > 0);

  if (highTempFailures.length >= 2) {
    const formulas = [...new Set(highTempFailures.map(t => t.FormulationName))].join(', ');
    issues.push({
      id: 'weather-heat-stress',
      severity: 'insight',
      title: `High Heat Stress Correlation (${highTempFailures.length} Trials Failed)`,
      description: `${highTempFailures.length} trial(s) involving [${formulas}] failed when temperature was ≥32°C at spray time. Recommend adding organosilicone penetrant or spraying early morning.`,
      actionPrompt: 'How can we adjust carrier volume or adjuvants for high heat spraying?'
    });
    insightCount++;
  }

  if (rainwashFailures.length >= 2) {
    issues.push({
      id: 'weather-rainwash',
      severity: 'warning',
      title: `Rain Washoff Vulnerability (${rainwashFailures.length} Trials Affected)`,
      description: `${rainwashFailures.length} trials recorded rain within 24 hours of application, causing premature efficacy breakdown.`,
      actionPrompt: 'Recommend rainfastness additives or stickers for these formulas.'
    });
    warningCount++;
  }

  // --- CHECK 3: HERBICIDE RESISTANCE WATCHDOG ---
  // Group by Location/Block
  const blockMap = {};
  for (const trial of catTrials) {
    const blockKey = trial.BlockId || trial.Location || 'Default Block';
    if (!blockMap[blockKey]) blockMap[blockKey] = [];
    blockMap[blockKey].push(trial);
  }

  for (const [block, blockTrials] of Object.entries(blockMap)) {
    if (blockTrials.length >= 2) {
      const hracUsage = blockTrials.map(t => {
        const h = identifyHrac(t.FormulationName);
        return h ? h.code : null;
      }).filter(Boolean);

      // Check if same HRAC group used 2+ consecutive times
      for (let i = 1; i < hracUsage.length; i++) {
        if (hracUsage[i] === hracUsage[i - 1] && hracUsage[i] !== 'Adjuvant') {
          issues.push({
            id: `resistance-${block}-${hracUsage[i]}`,
            severity: 'critical',
            title: `Repeated HRAC Group ${hracUsage[i]} at ${block}`,
            description: `Consecutive treatments of the same Mode of Action (HRAC Group ${hracUsage[i]}) applied at ${block}. High risk of selecting resistant weed biotypes!`,
            actionPrompt: `Suggest rotational MoA partners for ${block}`
          });
          criticalCount++;
          break;
        }
      }
    }
  }

  return {
    success: true,
    data: {
      auditedTrialsCount: catTrials.length,
      criticalCount,
      warningCount,
      insightCount,
      issues: issues.slice(0, 8),
      healthScore: Math.max(0, 100 - (criticalCount * 15 + warningCount * 5))
    },
    artifact: {
      artifactType: 'trial_doctor',
      auditedTrialsCount: catTrials.length,
      healthScore: Math.max(0, 100 - (criticalCount * 15 + warningCount * 5)),
      criticalCount,
      warningCount,
      insightCount,
      issues: issues.slice(0, 8)
    }
  };
}

/**
 * 5. PARSE & VALIDATE FIELD VOICE SCOUT NOTE TOOL
 * Turns freeform speech transcript into a structured observation record.
 */
export function toolParseVoiceScout({ transcript, trialId = null }, context) {
  const { trials = [] } = context;

  const parsed = parseVoiceObservation(transcript);
  
  // Try matching to a target trial if not provided
  let matchedTrial = null;
  if (trialId) {
    matchedTrial = trials.find(t => t.ID === trialId);
  } else if (parsed.formulation) {
    matchedTrial = trials.find(t =>
      (t.FormulationName || '').toLowerCase().includes(parsed.formulation.toLowerCase())
    );
  }

  const observationData = {
    plot: parsed.plot || 'Plot 1',
    daa: parsed.daa !== null ? parsed.daa : 7,
    efficacy: parsed.efficacy !== null ? parsed.efficacy : 80,
    phytotoxicityPct: parsed.phytotoxicityPct || 0,
    cropInjury: parsed.cropInjury || 'None',
    notes: parsed.notes || transcript,
    formulation: parsed.formulation || (matchedTrial ? matchedTrial.FormulationName : 'Candidate Formula'),
    matchedTrialId: matchedTrial ? matchedTrial.ID : null
  };

  return {
    success: true,
    data: observationData,
    artifact: {
      artifactType: 'voice_scout',
      ...observationData
    }
  };
}

/**
 * Tool Intent Detector & Direct Executor
 * Automatically determines if a user message should trigger an agronomic tool.
 */
export async function detectAndExecuteAgronomicTool(userMessage, context) {
  const q = String(userMessage || '').toLowerCase();

  // 1. ANOVA / Statistics request
  if (q.includes('anova') || q.includes('f-statistic') || q.includes('tukey') || q.includes('variance analysis') || q.includes('statistical significance')) {
    // Extract target weed if mentioned
    let target = '';
    const targets = ['bermuda', 'cynodon', 'cyperus', 'nutsedge', 'parthenium', 'echinochloa', 'goosegrass', 'crabgrass', 'broadleaf'];
    for (const t of targets) {
      if (q.includes(t)) {
        target = t;
        break;
      }
    }
    const result = await toolRunAnova({ target }, context);
    return { toolName: 'run_anova_analysis', result };
  }

  // 2. Live Spray Window request
  if (q.includes('spray window') || q.includes('when to spray') || q.includes('can i spray') || q.includes('delta-t') || q.includes('weather window') || q.includes('spray forecast')) {
    const result = await toolCheckSprayWindow({}, context);
    return { toolName: 'check_spray_window', result };
  }

  // 3. Trial Doctor / Anomaly Audit request
  if (q.includes('trial doctor') || q.includes('audit trials') || q.includes('data check') || q.includes('anomaly') || q.includes('audit database') || q.includes('resistance check')) {
    const result = await toolAuditTrialDoctor({}, context);
    return { toolName: 'audit_trial_doctor', result };
  }

  // 4. Tank-mix Colby Synergy / Cost request
  if (q.includes('colby') || q.includes('synergy') || q.includes('tank mix') || (q.includes('cost') && q.includes('recipe')) || q.includes('antagonism')) {
    // Try building test ingredients from known context
    const testIngredients = [
      { name: 'Glyphosate 41% IPA', quantity: 300, unit: 'ml' },
      { name: 'Microweed Bio-Penetrant', quantity: 50, unit: 'ml' }
    ];
    const result = await toolEvaluateColbyAndCost({ ingredients: testIngredients }, context);
    return { toolName: 'evaluate_colby_synergy', result };
  }

  return null;
}
