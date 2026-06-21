/**
 * Advanced Statistical Analysis Utilities
 * ANOVA, Tukey HSD, Dunnett's Test, and other agricultural trial statistics
 */

import { safeJsonParse } from './helpers.js';
import { getObservationPrimaryValue } from './categoryConfig.js';

/**
 * Calculate basic statistics: mean, variance, std dev
 */
export function calculateStats(values) {
  const n = values.length;
  if (n === 0) return { mean: 0, variance: 0, stdDev: 0, n: 0 };
  
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / (n - 1);
  const stdDev = Math.sqrt(variance);
  
  return { mean, variance, stdDev, n, min: Math.min(...values), max: Math.max(...values) };
}

const T_TABLE_05 = {
  1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571,
  6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228,
  11: 2.201, 12: 2.179, 13: 2.160, 14: 2.145, 15: 2.131,
  16: 2.120, 17: 2.110, 18: 2.101, 19: 2.093, 20: 2.086,
  21: 2.080, 22: 2.074, 23: 2.069, 24: 2.064, 25: 2.060,
  26: 2.056, 27: 2.052, 28: 2.048, 29: 2.045, 30: 2.042,
  40: 2.021, 60: 2.000, 120: 1.980, inf: 1.960
};

const T_TABLE_01 = {
  1: 63.657, 2: 9.925, 3: 5.841, 4: 4.604, 5: 4.032,
  6: 3.707, 7: 3.499, 8: 3.355, 9: 3.250, 10: 3.169,
  11: 3.106, 12: 3.055, 13: 3.012, 14: 2.977, 15: 2.947,
  16: 2.921, 17: 2.898, 18: 2.878, 19: 2.861, 20: 2.845,
  21: 2.831, 22: 2.819, 23: 2.807, 24: 2.797, 25: 2.787,
  26: 2.779, 27: 2.771, 28: 2.763, 29: 2.756, 30: 2.750,
  40: 2.704, 60: 2.660, 120: 2.617, inf: 2.576
};

export function getStudentTCritical(alpha, df) {
  const table = (alpha <= 0.01) ? T_TABLE_01 : T_TABLE_05;
  if (df <= 0) return 1.96;
  
  const dfKeys = Object.keys(table).map(key => key === "inf" ? Infinity : parseInt(key));
  dfKeys.sort((a, b) => a - b);
  
  let lowerDf = 1;
  let upperDf = Infinity;
  
  for (let i = 0; i < dfKeys.length; i++) {
    if (dfKeys[i] <= df) {
      lowerDf = dfKeys[i];
    }
    if (dfKeys[i] >= df) {
      upperDf = dfKeys[i];
      break;
    }
  }
  
  const lowerKey = lowerDf === Infinity ? "inf" : lowerDf;
  const upperKey = upperDf === Infinity ? "inf" : upperDf;
  
  const lowerVal = table[lowerKey];
  const upperVal = table[upperKey];
  
  if (lowerDf === upperDf) return lowerVal;
  if (upperDf === Infinity) return lowerVal;
  
  // Linear interpolation
  const weight = (df - lowerDf) / (upperDf - lowerDf);
  return lowerVal + weight * (upperVal - lowerVal);
}

/**
 * One-way ANOVA for RCBD (Randomized Complete Block Design)
 * Returns complete ANOVA table and significance test
 */
// Internal helper to calculate ANOVA sums of squares, means, df and ms
function computeAnovaInternal(treatments, design) {
  const treatmentNames = Object.keys(treatments);
  const blockIds = [...new Set(treatmentNames.flatMap(trt => Object.keys(treatments[trt])))];
  
  const grandSum = [];
  const treatmentMeans = {};
  const blockRawValues = {};
  const trtRepCounts = {};
  
  blockIds.forEach(block => {
    blockRawValues[block] = [];
  });
  
  treatmentNames.forEach(trt => {
    const trtValues = [];
    blockIds.forEach(block => {
      const vals = treatments[trt][block] || [];
      trtValues.push(...vals);
      grandSum.push(...vals);
      if (vals.length > 0) {
        blockRawValues[block].push(...vals);
      }
    });
    trtRepCounts[trt] = trtValues.length;
    if (trtValues.length > 0) {
      treatmentMeans[trt] = trtValues.reduce((a, b) => a + b, 0) / trtValues.length;
    } else {
      treatmentMeans[trt] = 0;
    }
  });

  const grandMean = grandSum.length > 0 ? (grandSum.reduce((a, b) => a + b, 0) / grandSum.length) : 0;
  const N = grandSum.length;
  const t = treatmentNames.length;
  const b = blockIds.length;
  
  let ssTotal = 0;
  let ssTreatments = 0;
  let ssBlocks = 0;
  
  grandSum.forEach(y => {
    ssTotal += Math.pow(y - grandMean, 2);
  });
  
  treatmentNames.forEach(trt => {
    ssTreatments += trtRepCounts[trt] * Math.pow(treatmentMeans[trt] - grandMean, 2);
  });
  
  const blockMeans = {};
  if (design !== 'CRD') {
    blockIds.forEach(block => {
      const vals = blockRawValues[block] || [];
      if (vals.length > 0) {
        const blockMean = vals.reduce((a, b) => a + b, 0) / vals.length;
        blockMeans[block] = blockMean;
        ssBlocks += vals.length * Math.pow(blockMean - grandMean, 2);
      } else {
        blockMeans[block] = 0;
      }
    });
  }
  
  const ssError = Math.max(0, ssTotal - ssTreatments - ssBlocks);
  const dfTreatments = t - 1;
  const dfBlocks = design === 'CRD' ? 0 : b - 1;
  const dfError = design === 'CRD' ? N - t : Math.max(1, N - t - b + 1);
  const dfTotal = N - 1;
  
  const msTreatments = ssTreatments / (dfTreatments || 1);
  const msBlocks = dfBlocks > 0 ? ssBlocks / dfBlocks : 0;
  const msError = ssError / (dfError || 1);
  
  return {
    ssTotal, ssTreatments, ssBlocks, ssError,
    dfTreatments, dfBlocks, dfError, dfTotal,
    msTreatments, msBlocks, msError,
    treatmentMeans, blockMeans, grandMean, N, t, b,
    trtRepCounts, blockIds, treatmentNames, grandSum, blockRawValues
  };
}

/**
 * One-way ANOVA for RCBD (Randomized Complete Block Design)
 * Returns complete ANOVA table and significance test
 */
export function performANOVA(trials, options = {}) {
  const { metric = 'controlPct', daa = null, species = null, design = 'RCBD', excludeOutliers = false } = options;
  
  // Group trials by treatment
  const treatments = {};
  const blocks = new Set();
  
  trials.forEach(trial => {
    const trt = trial.FormulationName || 'Unknown';
    const blockId = trial.BlockID || trial.Replication || '1';
    blocks.add(blockId);
    
    if (!treatments[trt]) treatments[trt] = {};
    if (!treatments[trt][blockId]) treatments[trt][blockId] = [];
    
    // Extract value from efficacy data
    const efficacy = safeJsonParse(trial.EfficacyDataJSON, []);
    const observations = daa 
      ? efficacy.filter(e => e.daa === daa || e.daysAfterApplication === daa)
      : efficacy;
    
    if (observations.length > 0) {
      const latest = observations[observations.length - 1];
      const category = trial.Category || 'herbicide';
      let value = latest[metric] ?? latest[metric === 'yield' ? 'yieldKgPlot' : metric] ?? latest.controlPct ?? latest.wce ?? getObservationPrimaryValue(category, latest) ?? latest.diseaseSeverity ?? latest.pestCount ?? latest.yieldKgPlot ?? latest.overallVigor;
      if (metric === 'yield' && (value === null || value === undefined || value === '')) {
        value = trial.Yield ?? trial.YieldValue;
      }
      if (value !== null && value !== undefined && !isNaN(value)) {
        treatments[trt][blockId].push(parseFloat(value));
      }
    }
  });

  const treatmentNames = Object.keys(treatments);
  if (treatmentNames.length < 2) {
    return { error: 'Need at least 2 treatments for ANOVA', fStatistic: null, pValue: null };
  }

  // First pass ANOVA to find residuals and run Studentized Residuals outlier detection
  const firstPass = computeAnovaInternal(treatments, design);
  if (firstPass.N === 0) {
    return { error: 'No observations found for ANOVA.', fStatistic: null, pValue: null };
  }

  const detectedOutliers = [];
  let outliersFound = false;

  if (firstPass.N > 2 && firstPass.msError > 0) {
    treatmentNames.forEach(trt => {
      Object.keys(treatments[trt]).forEach(blockId => {
        const vals = treatments[trt][blockId];
        const newVals = vals.filter(v => {
          const meanT = firstPass.treatmentMeans[trt];
          const meanB = firstPass.blockMeans[blockId] || firstPass.grandMean;
          const residual = v - (design === 'CRD' ? meanT : (meanT + meanB - firstPass.grandMean));
          
          const r = firstPass.trtRepCounts[trt] || 1;
          const leverage = design === 'CRD' ? (1 / r) : (1 / r + 1 / firstPass.b - 1 / firstPass.N);
          const seRes = Math.sqrt(firstPass.msError * Math.max(0, 1 - leverage));
          
          const studRes = seRes > 0 ? (residual / seRes) : 0;
          
          if (Math.abs(studRes) > 2.5) {
            detectedOutliers.push({
              treatment: trt,
              block: blockId,
              value: v,
              zScore: studRes
            });
            outliersFound = true;
            return !excludeOutliers;
          }
          return true;
        });
        treatments[trt][blockId] = newVals;
      });
    });
  }

  // Second pass (if outliers excluded) or use first pass results
  const finalPass = (outliersFound && excludeOutliers)
    ? computeAnovaInternal(treatments, design)
    : firstPass;

  if (finalPass.N === 0) {
    return { error: 'No observations remaining for ANOVA after outlier exclusion.', fStatistic: null, pValue: null };
  }

  const {
    ssTotal, ssTreatments, ssBlocks, ssError,
    dfTreatments, dfBlocks, dfError, dfTotal,
    msTreatments, msBlocks, msError,
    treatmentMeans, grandMean, N, t, b,
    trtRepCounts, blockIds, grandSum
  } = finalPass;

  // F-statistics
  const fStatistic = msError > 0 ? msTreatments / msError : 0;
  const fBlock = (design !== 'CRD' && msError > 0 && dfBlocks > 0) ? msBlocks / msError : 0;
  
  // Approximate p-values
  const pValue = approximatePValue(fStatistic, dfTreatments, dfError);
  const pBlock = (design !== 'CRD' && dfBlocks > 0) ? approximatePValue(fBlock, dfBlocks, dfError) : null;
  
  // Design Balance warning
  let isBalanced = true;
  let expectedCount = -1;
  for (const trt of treatmentNames) {
    for (const block of blockIds) {
      const count = treatments[trt][block]?.length || 0;
      if (expectedCount === -1) {
        expectedCount = count;
      } else if (count !== expectedCount) {
        isBalanced = false;
      }
    }
  }
  const balanceWarning = isBalanced ? null : "Warning: Experimental design is unbalanced. Some treatment/block combinations have missing or multiple observations. ANOVA calculations may be statistically biased.";

  // Calculate residuals for assumptions validation
  const residuals = [];
  treatmentNames.forEach(trt => {
    blockIds.forEach(block => {
      const vals = treatments[trt][block] || [];
      if (vals.length > 0) {
        const mean = treatmentMeans[trt];
        vals.forEach(v => {
          residuals.push(v - mean);
        });
      }
    });
  });

  const normalityResult = checkNormality(residuals);
  
  const groupsForLevene = {};
  treatmentNames.forEach(trt => {
    groupsForLevene[trt] = Object.values(treatments[trt]).flat();
  });
  const leveneResult = checkLeveneTest(groupsForLevene);

  let recommendation = null;
  if (!normalityResult.normalityPassed || !leveneResult.variancePassed) {
    recommendation = "Warning: ANOVA assumptions violated. ";
    if (!normalityResult.normalityPassed) recommendation += "Residuals are not normally distributed (p < 0.05). ";
    if (!leveneResult.variancePassed) recommendation += "Variances are not homogeneous (Levene's test p < 0.05). ";
    recommendation += "Consider running the Kruskal-Wallis non-parametric test.";
  }

  // Calculate SEm, CD (LSD), CV
  const rValues = Object.values(trtRepCounts);
  const isRBalanced = rValues.every(val => val === rValues[0]);
  const rHarmonic = isRBalanced ? rValues[0] : (rValues.length / rValues.reduce((sum, rVal) => sum + 1 / (rVal || 1), 0));
  
  const cv = grandMean > 0 ? (Math.sqrt(msError) / grandMean) * 100 : 0;
  
  const tCritical5 = getStudentTCritical(0.05, dfError);
  const tCritical1 = getStudentTCritical(0.01, dfError);
  
  const semGlobal = Math.sqrt(msError / rHarmonic);
  const cd5 = tCritical5 * Math.sqrt(2 * msError / rHarmonic);
  const cd1 = tCritical1 * Math.sqrt(2 * msError / rHarmonic);
  
  const treatmentSems = {};
  treatmentNames.forEach(trt => {
    const r = trtRepCounts[trt] || 1;
    treatmentSems[trt] = Math.sqrt(msError / r);
  });

  return {
    anovaTable: {
      source: design === 'CRD' ? ['Treatments', 'Error', 'Total'] : ['Treatments', 'Blocks', 'Error', 'Total'],
      ss: design === 'CRD' ? [ssTreatments, ssError, ssTotal] : [ssTreatments, ssBlocks, ssError, ssTotal],
      df: design === 'CRD' ? [dfTreatments, dfError, dfTotal] : [dfTreatments, dfBlocks, dfError, dfTotal],
      ms: design === 'CRD' ? [msTreatments, msError, null] : [msTreatments, msBlocks, msError, null],
      f: design === 'CRD' ? [fStatistic, null, null] : [fStatistic, fBlock, null, null],
      p: design === 'CRD' ? [pValue, null, null] : [pValue, pBlock, null, null]
    },
    fStatistic,
    pValue,
    significant: pValue < 0.05,
    treatmentMeans,
    grandMean,
    treatments: treatmentNames,
    blocks: design === 'CRD' ? [] : blockIds,
    trtRepCounts,
    balanceWarning,
    design,
    cv,
    semGlobal,
    treatmentSems,
    cd5,
    cd1,
    detectedOutliers,
    assumptions: {
      normalityPassed: normalityResult.normalityPassed,
      normalityP: normalityResult.pValue,
      variancePassed: leveneResult.variancePassed,
      varianceP: leveneResult.pValue,
      recommendation
    }
  };
}

export function performTukeyHSD(trials, options = {}) {
  const { metric = 'controlPct', alpha = 0.05, anova: precalculatedAnova = null } = options;
  
  const anova = precalculatedAnova || performANOVA(trials, options);
  if (anova.error) return anova;
  
  const { treatmentMeans, anovaTable, trtRepCounts } = anova;
  const errIdx = anovaTable.source.indexOf('Error');
  const msError = errIdx !== -1 ? anovaTable.ms[errIdx] : (anovaTable.source.includes('Blocks') ? anovaTable.ms[2] : anovaTable.ms[1]); // Error MS
  const dfError = errIdx !== -1 ? anovaTable.df[errIdx] : (anovaTable.source.includes('Blocks') ? anovaTable.df[2] : anovaTable.df[1]);
  const n = anovaTable.df[0] + 1; // Number of treatments
  
  // Get critical q value from Studentized Range Distribution
  const qCritical = getStudentizedRangeCritical(alpha, n, dfError);
  
  // Pairwise comparisons using Tukey-Kramer adjustment
  const comparisons = [];
  const trtNames = Object.keys(treatmentMeans);
  
  // Calculate harmonic mean of replication sizes for a representative single HSD value
  const rValues = Object.values(trtRepCounts);
  const sumInvR = rValues.reduce((sum, rVal) => sum + 1 / (rVal || 1), 0);
  const rHarmonic = rValues.length / (sumInvR || 1);
  const globalHsd = qCritical * Math.sqrt(msError / rHarmonic);
  
  for (let i = 0; i < trtNames.length; i++) {
    for (let j = i + 1; j < trtNames.length; j++) {
      const trtA = trtNames[i];
      const trtB = trtNames[j];
      const meanA = treatmentMeans[trtA];
      const meanB = treatmentMeans[trtB];
      const diff = Math.abs(meanA - meanB);
      
      const rA = trtRepCounts[trtA] || 1;
      const rB = trtRepCounts[trtB] || 1;
      // Tukey-Kramer adjustment for unequal replications
      const pairHsd = qCritical * Math.sqrt((msError / 2) * (1 / rA + 1 / rB));
      
      comparisons.push({
        treatmentA: trtA,
        treatmentB: trtB,
        meanA,
        meanB,
        difference: diff,
        significant: diff > pairHsd,
        hsd: pairHsd
      });
    }
  }
  
  // Group treatments (letter display)
  const groups = assignLetterGroups(trtNames, treatmentMeans, comparisons);
  
  return {
    ...anova,
    hsd: globalHsd,
    qCritical,
    comparisons,
    groups,
    test: 'Tukey HSD',
    alpha
  };
}

/**
 * Dunnett's Test - Compare all treatments vs control (adjusted for unequal sample sizes)
 */
export function performDunnettTest(trials, controlName, options = {}) {
  const { metric = 'controlPct', alpha = 0.05 } = options;
  
  const anova = performANOVA(trials, options);
  if (anova.error) return anova;
  
  const { treatmentMeans, anovaTable, trtRepCounts } = anova;
  const msError = anovaTable.source.includes('Blocks') ? anovaTable.ms[2] : anovaTable.ms[1];
  const dfError = anovaTable.source.includes('Blocks') ? anovaTable.df[2] : anovaTable.df[1];
  
  const k = Object.keys(treatmentMeans).length - 1; // Number of treatments excluding control
  const dCritical = getDunnettCritical(alpha, k, dfError);
  
  // Calculate Dunnett's difference using harmonic mean for general display
  const rValues = Object.values(trtRepCounts);
  const sumInvR = rValues.reduce((sum, rVal) => sum + 1 / (rVal || 1), 0);
  const rHarmonic = rValues.length / (sumInvR || 1);
  const globalDsd = dCritical * Math.sqrt(2 * msError / rHarmonic);
  
  const comparisons = [];
  const controlMean = treatmentMeans[controlName];
  const rCtrl = trtRepCounts[controlName] || 1;
  
  Object.keys(treatmentMeans).forEach(trt => {
    if (trt !== controlName) {
      const trtMean = treatmentMeans[trt];
      const diff = trtMean - controlMean;
      const rTrt = trtRepCounts[trt] || 1;
      
      // Dunnett's test statistic and critical difference adjusted for unequal sample sizes
      const pairStdError = Math.sqrt(msError * (1 / rTrt + 1 / rCtrl));
      const tStatistic = diff / (pairStdError || 1);
      const pairDsd = dCritical * pairStdError;
      
      comparisons.push({
        treatment: trt,
        control: controlName,
        treatmentMean: trtMean,
        controlMean,
        difference: diff,
        tStatistic,
        significant: Math.abs(tStatistic) > dCritical,
        dsd: pairDsd,
        percentChange: controlMean > 0 ? ((diff / controlMean) * 100).toFixed(1) : '0'
      });
    }
  });
  
  return {
    ...anova,
    controlName,
    controlMean,
    dCritical,
    dsd: globalDsd,
    comparisons,
    test: "Dunnett's Test",
    alpha
  };
}

/**
 * Assign letter groups for treatment means display
 */
function assignLetterGroups(treatments, treatmentMeans, comparisons) {
  // Sort treatments by mean descending
  const sortedTrts = [...treatments].sort((a, b) => (treatmentMeans[b] || 0) - (treatmentMeans[a] || 0));
  
  if (sortedTrts.length === 0) return {};
  if (sortedTrts.length === 1) return { [sortedTrts[0]]: 'a' };

  // Create a helper to check if two treatments are significantly different
  const isSig = (t1, t2) => {
    if (t1 === t2) return false;
    const comp = comparisons.find(c => 
      (c.treatmentA === t1 && c.treatmentB === t2) || 
      (c.treatmentA === t2 && c.treatmentB === t1)
    );
    return comp ? comp.significant : false;
  };

  // Find homogenous groups (maximal cliques of non-significance)
  const groups = [];
  
  for (let i = 0; i < sortedTrts.length; i++) {
    const trt = sortedTrts[i];
    const clique = [trt];
    for (let j = i + 1; j < sortedTrts.length; j++) {
      const candidate = sortedTrts[j];
      let canAdd = true;
      for (const member of clique) {
        if (isSig(member, candidate)) {
          canAdd = false;
          break;
        }
      }
      if (canAdd) {
        clique.push(candidate);
      }
    }
    
    // Check if this clique is a subset of any already found clique
    let isSubset = false;
    for (const existing of groups) {
      if (clique.every(val => existing.includes(val))) {
        isSubset = true;
        break;
      }
    }
    if (!isSubset) {
      groups.push(clique);
    }
  }

  // Now assign letters to groups.
  // Group 0 gets 'a', Group 1 gets 'b', etc.
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  const trtLetters = {};
  sortedTrts.forEach(t => {
    trtLetters[t] = '';
  });

  groups.forEach((clique, groupIdx) => {
    const letter = letters[groupIdx] || '*';
    clique.forEach(trt => {
      trtLetters[trt] += letter;
    });
  });

  return trtLetters;
}

/**
 * Studentized Range Q-tables (Studentized Range Distribution)
 */
const Q_TABLE_05 = {
  1: [17.97, 26.98, 32.82, 37.08, 40.41, 43.12, 45.40, 47.36, 49.07, 50.59, 51.96, 53.20, 54.33, 55.36, 56.32, 57.22, 58.04, 58.83, 59.56],
  2: [6.08, 8.33, 9.80, 10.88, 11.74, 12.44, 13.03, 13.54, 13.99, 14.39, 14.75, 15.08, 15.38, 15.65, 15.91, 16.14, 16.37, 16.57, 16.77],
  3: [4.50, 5.91, 6.82, 7.50, 8.04, 8.48, 8.85, 9.18, 9.46, 9.72, 9.95, 10.15, 10.35, 10.52, 10.69, 10.84, 10.98, 11.11, 11.24],
  4: [3.93, 5.04, 5.76, 6.29, 6.71, 7.05, 7.35, 7.60, 7.83, 8.03, 8.21, 8.37, 8.52, 8.66, 8.79, 8.91, 9.03, 9.13, 9.23],
  5: [3.64, 4.60, 5.22, 5.67, 6.03, 6.33, 6.58, 6.80, 6.99, 7.17, 7.32, 7.47, 7.60, 7.72, 7.83, 7.93, 8.03, 8.12, 8.21],
  6: [3.46, 4.34, 4.90, 5.30, 5.63, 5.90, 6.12, 6.32, 6.49, 6.65, 6.79, 6.92, 7.03, 7.14, 7.24, 7.34, 7.43, 7.51, 7.59],
  7: [3.34, 4.16, 4.68, 5.06, 5.36, 5.61, 5.82, 6.00, 6.16, 6.30, 6.43, 6.55, 6.66, 6.76, 6.85, 6.94, 7.02, 7.10, 7.17],
  8: [3.26, 4.04, 4.53, 4.89, 5.17, 5.40, 5.60, 5.77, 5.92, 6.05, 6.18, 6.29, 6.39, 6.48, 6.57, 6.65, 6.73, 6.80, 6.87],
  9: [3.20, 3.95, 4.41, 4.76, 5.02, 5.24, 5.43, 5.59, 5.74, 5.87, 5.98, 6.09, 6.19, 6.28, 6.36, 6.44, 6.51, 6.58, 6.64],
  10: [3.15, 3.88, 4.33, 4.65, 4.91, 5.12, 5.30, 5.46, 5.60, 5.72, 5.83, 5.93, 6.03, 6.11, 6.19, 6.27, 6.34, 6.40, 6.47],
  11: [3.11, 3.82, 4.26, 4.57, 4.82, 5.03, 5.20, 5.35, 5.49, 5.61, 5.71, 5.81, 5.90, 5.98, 6.06, 6.13, 6.20, 6.27, 6.33],
  12: [3.08, 3.77, 4.20, 4.51, 4.75, 4.95, 5.12, 5.27, 5.39, 5.51, 5.61, 5.71, 5.80, 5.88, 5.95, 6.02, 6.09, 6.15, 6.21],
  13: [3.06, 3.73, 4.15, 4.45, 4.69, 4.88, 5.05, 5.19, 5.32, 5.43, 5.53, 5.63, 5.71, 5.79, 5.86, 5.93, 5.99, 6.05, 6.11],
  14: [3.03, 3.70, 4.11, 4.41, 4.64, 4.83, 4.99, 5.13, 5.25, 5.36, 5.46, 5.55, 5.64, 5.71, 5.79, 5.85, 5.91, 5.97, 6.03],
  15: [3.01, 3.67, 4.08, 4.37, 4.59, 4.78, 4.94, 5.08, 5.20, 5.31, 5.40, 5.49, 5.57, 5.65, 5.72, 5.78, 5.85, 5.90, 5.96],
  16: [3.00, 3.65, 4.05, 4.33, 4.56, 4.74, 4.90, 5.03, 5.15, 5.26, 5.35, 5.44, 5.52, 5.59, 5.66, 5.73, 5.79, 5.84, 5.90],
  17: [2.98, 3.63, 4.02, 4.30, 4.52, 4.70, 4.86, 4.99, 5.11, 5.21, 5.31, 5.39, 5.47, 5.54, 5.61, 5.67, 5.73, 5.79, 5.84],
  18: [2.97, 3.61, 4.00, 4.28, 4.49, 4.67, 4.82, 4.96, 5.07, 5.17, 5.27, 5.35, 5.43, 5.50, 5.57, 5.63, 5.69, 5.74, 5.79],
  19: [2.96, 3.59, 3.98, 4.25, 4.47, 4.65, 4.79, 4.92, 5.04, 5.14, 5.23, 5.31, 5.39, 5.46, 5.53, 5.59, 5.65, 5.70, 5.75],
  20: [2.95, 3.58, 3.96, 4.23, 4.45, 4.62, 4.77, 4.90, 5.01, 5.11, 5.20, 5.28, 5.36, 5.43, 5.49, 5.55, 5.61, 5.67, 5.71],
  24: [2.92, 3.53, 3.90, 4.17, 4.37, 4.54, 4.68, 4.81, 4.92, 5.01, 5.10, 5.18, 5.25, 5.32, 5.38, 5.44, 5.49, 5.55, 5.59],
  30: [2.89, 3.49, 3.85, 4.10, 4.30, 4.46, 4.60, 4.72, 4.82, 4.92, 5.00, 5.08, 5.15, 5.21, 5.27, 5.33, 5.38, 5.43, 5.47],
  40: [2.86, 3.44, 3.79, 4.04, 4.23, 4.39, 4.52, 4.63, 4.73, 4.82, 4.90, 4.98, 5.04, 5.11, 5.16, 5.22, 5.27, 5.31, 5.36],
  60: [2.83, 3.40, 3.74, 3.98, 4.16, 4.31, 4.44, 4.55, 4.65, 4.73, 4.81, 4.88, 4.94, 5.00, 5.06, 5.11, 5.15, 5.20, 5.24],
  120: [2.80, 3.36, 3.68, 3.92, 4.10, 4.24, 4.36, 4.47, 4.56, 4.64, 4.71, 4.78, 4.84, 4.90, 4.95, 5.00, 5.04, 5.09, 5.13],
  "inf": [2.77, 3.31, 3.63, 3.86, 4.03, 4.17, 4.29, 4.39, 4.47, 4.55, 4.62, 4.68, 4.74, 4.80, 4.85, 4.89, 4.94, 4.98, 5.01]
};

const Q_TABLE_01 = {
  1: [90.03, 135.0, 164.3, 185.6, 202.2, 215.8, 227.2, 237.0, 245.6, 253.2, 260.1, 266.2, 271.8, 277.0, 281.7, 286.1, 290.2, 294.1, 297.7],
  2: [14.04, 19.02, 22.29, 24.72, 26.63, 28.20, 29.53, 30.68, 31.69, 32.59, 33.40, 34.13, 34.81, 35.43, 36.00, 36.53, 37.03, 37.50, 37.95],
  3: [8.26, 10.62, 12.17, 13.33, 14.24, 15.00, 15.64, 16.20, 16.69, 17.13, 17.53, 17.89, 18.22, 18.52, 18.81, 19.07, 19.32, 19.55, 19.77],
  4: [6.51, 8.12, 9.17, 9.96, 10.58, 11.10, 11.55, 11.93, 12.27, 12.57, 12.84, 13.09, 13.32, 13.53, 13.73, 13.91, 14.08, 14.24, 14.40],
  5: [5.70, 6.98, 7.80, 8.42, 8.91, 9.32, 9.67, 9.97, 10.24, 10.48, 10.70, 10.89, 11.08, 11.24, 11.40, 11.55, 11.68, 11.81, 11.93],
  6: [5.24, 6.33, 7.03, 7.56, 7.97, 8.32, 8.61, 8.87, 9.10, 9.30, 9.48, 9.65, 9.81, 9.95, 10.08, 10.21, 10.32, 10.43, 10.54],
  7: [4.95, 5.92, 6.54, 7.01, 7.37, 7.68, 7.94, 8.17, 8.37, 8.55, 8.71, 8.86, 9.00, 9.12, 9.24, 9.35, 9.46, 9.55, 9.65],
  8: [4.75, 5.64, 6.20, 6.62, 6.96, 7.24, 7.47, 7.68, 7.86, 8.03, 8.18, 8.31, 8.44, 8.55, 8.66, 8.76, 8.85, 8.94, 9.03],
  9: [4.60, 5.43, 5.96, 6.35, 6.66, 6.91, 7.13, 7.33, 7.49, 7.65, 7.78, 7.91, 8.03, 8.13, 8.23, 8.33, 8.41, 8.49, 8.57],
  10: [4.48, 5.27, 5.77, 6.14, 6.43, 6.67, 6.87, 7.05, 7.21, 7.36, 7.48, 7.60, 7.71, 7.81, 7.91, 7.99, 8.08, 8.15, 8.23],
  11: [4.39, 5.15, 5.62, 5.97, 6.25, 6.48, 6.67, 6.84, 6.99, 7.13, 7.25, 7.36, 7.46, 7.56, 7.65, 7.73, 7.81, 7.88, 7.95],
  12: [4.32, 5.05, 5.50, 5.84, 6.10, 6.32, 6.51, 6.67, 6.81, 6.94, 7.06, 7.17, 7.26, 7.36, 7.44, 7.52, 7.59, 7.66, 7.73],
  13: [4.26, 4.96, 5.40, 5.73, 5.98, 6.19, 6.37, 6.53, 6.67, 6.79, 6.90, 7.01, 7.10, 7.19, 7.27, 7.35, 7.42, 7.48, 7.55],
  14: [4.21, 4.89, 5.32, 5.63, 5.88, 6.08, 6.26, 6.41, 6.54, 6.66, 6.77, 6.87, 6.96, 7.05, 7.13, 7.20, 7.27, 7.33, 7.39],
  15: [4.17, 4.84, 5.25, 5.56, 5.80, 5.99, 6.16, 6.31, 6.44, 6.55, 6.66, 6.76, 6.84, 6.93, 7.00, 7.07, 7.14, 7.20, 7.26],
  16: [4.13, 4.79, 5.19, 5.49, 5.72, 5.92, 6.08, 6.22, 6.35, 6.46, 6.56, 6.66, 6.74, 6.82, 6.90, 6.97, 7.03, 7.09, 7.15],
  17: [4.10, 4.74, 5.14, 5.43, 5.66, 5.85, 6.01, 6.15, 6.27, 6.38, 6.48, 6.57, 6.66, 6.73, 6.81, 6.87, 6.94, 7.00, 7.05],
  18: [4.07, 4.70, 5.09, 5.38, 5.60, 5.79, 5.94, 6.08, 6.20, 6.31, 6.41, 6.50, 6.58, 6.65, 6.73, 6.79, 6.85, 6.91, 6.97],
  19: [4.05, 4.67, 5.05, 5.33, 5.55, 5.73, 5.89, 6.02, 6.14, 6.25, 6.34, 6.43, 6.51, 6.58, 6.65, 6.72, 6.78, 6.83, 6.89],
  20: [4.02, 4.64, 5.01, 5.29, 5.51, 5.69, 5.84, 5.97, 6.09, 6.19, 6.28, 6.37, 6.45, 6.52, 6.59, 6.65, 6.71, 6.77, 6.82],
  24: [3.96, 4.55, 4.91, 5.17, 5.37, 5.54, 5.69, 5.81, 5.92, 6.02, 6.11, 6.19, 6.26, 6.33, 6.39, 6.45, 6.51, 6.56, 6.61],
  30: [3.89, 4.45, 4.80, 5.05, 5.24, 5.40, 5.54, 5.65, 5.76, 5.85, 5.93, 6.01, 6.08, 6.14, 6.20, 6.26, 6.31, 6.36, 6.41],
  40: [3.82, 4.37, 4.70, 4.93, 5.11, 5.26, 5.39, 5.50, 5.60, 5.69, 5.76, 5.83, 5.90, 5.96, 6.02, 6.07, 6.12, 6.16, 6.21],
  60: [3.76, 4.28, 4.59, 4.82, 4.99, 5.13, 5.25, 5.36, 5.45, 5.53, 5.60, 5.67, 5.73, 5.78, 5.84, 5.89, 5.93, 5.97, 6.02],
  120: [3.70, 4.20, 4.50, 4.71, 4.87, 5.01, 5.12, 5.21, 5.30, 5.37, 5.44, 5.50, 5.56, 5.61, 5.66, 5.71, 5.75, 5.79, 5.83],
  "inf": [3.64, 4.12, 4.40, 4.60, 4.76, 4.88, 4.99, 5.08, 5.16, 5.23, 5.29, 5.35, 5.40, 5.45, 5.49, 5.54, 5.57, 5.61, 5.65]
};

/**
 * Returns the critical value q(alpha, k, df) from the Studentized Range Distribution.
 * Supports alpha=0.05 and alpha=0.01 with interpolation.
 */
function getStudentizedRangeCritical(alpha, k, df) {
  const useTable = (alpha <= 0.01) ? Q_TABLE_01 : Q_TABLE_05;
  
  // Clamp k to table range (2 to 20)
  const kIndex = Math.min(Math.max(Math.round(k), 2), 20) - 2;
  
  // Find df entries for interpolation
  const dfKeys = Object.keys(useTable).map(key => key === "inf" ? Infinity : parseInt(key));
  dfKeys.sort((a, b) => a - b);
  
  let lowerDf = 1;
  let upperDf = Infinity;
  
  for (let i = 0; i < dfKeys.length; i++) {
    if (dfKeys[i] <= df) {
      lowerDf = dfKeys[i];
    }
    if (dfKeys[i] >= df) {
      upperDf = dfKeys[i];
      break;
    }
  }
  
  const lowerKey = lowerDf === Infinity ? "inf" : lowerDf;
  const upperKey = upperDf === Infinity ? "inf" : upperDf;
  
  const lowerVal = useTable[lowerKey][kIndex];
  const upperVal = useTable[upperKey][kIndex];
  
  if (lowerDf === upperDf) return lowerVal;
  if (upperDf === Infinity) return lowerVal;
  
  // Linear interpolation
  const weight = (df - lowerDf) / (upperDf - lowerDf);
  return lowerVal + weight * (upperVal - lowerVal);
}

/**
 * Simplified Dunnett's critical values (one-sided, alpha=0.05)
 */
const DUNNETT_TABLE_05 = {
  5: [2.57, 3.03, 3.29, 3.48, 3.62, 3.73, 3.82, 3.9, 3.97],
  6: [2.45, 2.86, 3.1, 3.26, 3.39, 3.49, 3.57, 3.64, 3.71],
  7: [2.36, 2.75, 2.97, 3.12, 3.24, 3.33, 3.41, 3.47, 3.53],
  8: [2.31, 2.67, 2.88, 3.02, 3.13, 3.22, 3.29, 3.35, 3.41],
  9: [2.26, 2.61, 2.81, 2.95, 3.05, 3.14, 3.2, 3.26, 3.32],
  10: [2.23, 2.57, 2.76, 2.89, 2.99, 3.07, 3.14, 3.19, 3.24],
  11: [2.2, 2.53, 2.72, 2.84, 2.94, 3.02, 3.08, 3.14, 3.19],
  12: [2.18, 2.5, 2.68, 2.81, 2.9, 2.98, 3.04, 3.09, 3.14],
  13: [2.16, 2.48, 2.65, 2.77, 2.87, 2.94, 3, 3.06, 3.1],
  14: [2.14, 2.46, 2.63, 2.75, 2.84, 2.91, 2.97, 3.02, 3.07],
  15: [2.13, 2.44, 2.61, 2.73, 2.82, 2.89, 2.95, 3, 3.05],
  16: [2.12, 2.42, 2.59, 2.71, 2.8, 2.87, 2.92, 2.98, 3.02],
  17: [2.11, 2.41, 2.58, 2.69, 2.78, 2.85, 2.9, 2.96, 3],
  18: [2.1, 2.4, 2.56, 2.68, 2.76, 2.83, 2.89, 2.94, 2.98],
  19: [2.09, 2.39, 2.55, 2.66, 2.75, 2.81, 2.87, 2.92, 2.97],
  20: [2.09, 2.38, 2.54, 2.65, 2.73, 2.8, 2.86, 2.9, 2.95],
  30: [2.04, 2.32, 2.47, 2.58, 2.66, 2.72, 2.77, 2.82, 2.86],
  40: [2.02, 2.29, 2.44, 2.54, 2.62, 2.68, 2.73, 2.78, 2.82],
  60: [2, 2.27, 2.41, 2.51, 2.58, 2.64, 2.69, 2.73, 2.77],
  120: [1.98, 2.24, 2.38, 2.47, 2.55, 2.6, 2.65, 2.69, 2.73],
  "inf": [1.96, 2.21, 2.35, 2.44, 2.51, 2.57, 2.61, 2.65, 2.69]
};
function getDunnettCritical(alpha, k, df) {
  const table = alpha <= 0.01 ? DUNNETT_TABLE_01 : DUNNETT_TABLE_05;
  const dfKey = df >= 120 ? "inf" : (df >= 60 ? 60 : (df >= 40 ? 40 : (df >= 30 ? 30 : (df >= 20 ? 20 : (df >= 15 ? 15 : (df >= 12 ? 12 : (df >= 10 ? 10 : (df >= 9 ? 9 : (df >= 8 ? 8 : (df >= 7 ? 7 : (df >= 6 ? 6 : 5)))))))))));
  const kIndex = Math.min(Math.max(k - 1, 0), 8);
  const dfEntry = table[dfKey] || table["inf"];
  return dfEntry ? dfEntry[kIndex] : 2.5;
}

const DUNNETT_TABLE_01 = {
  5: [4.03, 4.63, 4.98, 5.22, 5.41, 5.56, 5.69, 5.8, 5.89],
  6: [3.71, 4.22, 4.51, 4.71, 4.87, 5, 5.1, 5.2, 5.28],
  7: [3.5, 3.95, 4.21, 4.39, 4.53, 4.64, 4.74, 4.82, 4.89],
  8: [3.36, 3.77, 4, 4.17, 4.29, 4.4, 4.48, 4.56, 4.62],
  9: [3.25, 3.63, 3.85, 4.01, 4.12, 4.22, 4.3, 4.37, 4.43],
  10: [3.17, 3.53, 3.74, 3.88, 3.99, 4.08, 4.16, 4.22, 4.28],
  11: [3.11, 3.45, 3.65, 3.79, 3.89, 3.98, 4.05, 4.11, 4.16],
  12: [3.05, 3.39, 3.58, 3.71, 3.81, 3.89, 3.96, 4.02, 4.07],
  13: [3.01, 3.33, 3.52, 3.65, 3.74, 3.82, 3.89, 3.94, 3.99],
  14: [2.98, 3.29, 3.47, 3.59, 3.69, 3.76, 3.83, 3.88, 3.93],
  15: [2.95, 3.25, 3.43, 3.55, 3.64, 3.71, 3.78, 3.83, 3.88],
  16: [2.92, 3.22, 3.39, 3.51, 3.6, 3.67, 3.73, 3.78, 3.83],
  17: [2.9, 3.19, 3.36, 3.47, 3.56, 3.63, 3.69, 3.74, 3.79],
  18: [2.88, 3.17, 3.33, 3.44, 3.53, 3.6, 3.66, 3.71, 3.75],
  19: [2.86, 3.15, 3.31, 3.42, 3.5, 3.57, 3.63, 3.68, 3.72],
  20: [2.85, 3.13, 3.29, 3.4, 3.48, 3.55, 3.6, 3.65, 3.69],
  30: [2.75, 3.01, 3.15, 3.25, 3.33, 3.39, 3.44, 3.49, 3.52],
  40: [2.7, 2.95, 3.09, 3.19, 3.26, 3.32, 3.37, 3.41, 3.44],
  60: [2.66, 2.9, 3.03, 3.12, 3.19, 3.25, 3.29, 3.33, 3.37],
  120: [2.62, 2.86, 2.98, 3.07, 3.14, 3.2, 3.24, 3.28, 3.31],
  "inf": [2.58, 2.81, 2.93, 3.02, 3.09, 3.14, 3.18, 3.22, 3.25]
};

function logGamma(z) {
  const g = 7;
  const c = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7
  ];
  if (z < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function regularizedIncompleteBeta(x, a, b) {
  if (x < 0 || x > 1) return NaN;
  if (x === 0) return 0;
  if (x === 1) return 1;

  if (x > (a + 1) / (a + b + 2)) {
    return 1 - regularizedIncompleteBeta(1 - x, b, a);
  }

  const lbeta = logGamma(a) + logGamma(b) - logGamma(a + b);
  const front = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - lbeta) / a;

  const f_eps = 1e-15;
  const max_iter = 100;
  
  let f = 1.0;
  let c = 1.0;
  let d = 0.0;
  
  for (let m = 0; m <= max_iter; m++) {
    let numerator;
    if (m === 0) {
      numerator = 1.0;
    } else if (m % 2 === 0) {
      const k = m / 2;
      numerator = (k * (b - k) * x) / ((a + 2 * k - 1) * (a + 2 * k));
    } else {
      const k = (m - 1) / 2;
      numerator = -((a + k) * (a + b + k) * x) / ((a + 2 * k) * (a + 2 * k + 1));
    }
    
    d = 1.0 + numerator * d;
    if (Math.abs(d) < f_eps) d = f_eps;
    d = 1.0 / d;
    
    c = 1.0 + numerator / c;
    if (Math.abs(c) < f_eps) c = f_eps;
    
    const delta = c * d;
    f = f * delta;
    
    if (Math.abs(delta - 1.0) < f_eps) {
      break;
    }
  }
  
  return front * (f - 1.0);
}

/**
 * Approximate p-value from F-distribution using regularized incomplete beta function
 */
function approximatePValue(f, df1, df2) {
  if (f <= 0) return 1;
  const x = (df1 * f) / (df1 * f + df2);
  const pVal = 1 - regularizedIncompleteBeta(x, df1 / 2, df2 / 2);
  return isNaN(pVal) ? 1.0 : Math.max(0, Math.min(1, pVal));
}

export function performDuncanMRT(trials, options = {}) {
  const { metric = 'controlPct', alpha = 0.05 } = options;
  
  const anova = performANOVA(trials, options);
  if (anova.error) return anova;
  
  const { treatmentMeans, anovaTable, trtRepCounts } = anova;
  const isCrd = anovaTable.source.includes('Error') && !anovaTable.source.includes('Blocks');
  const errorIdx = isCrd ? 1 : 2;
  const msError = anovaTable.ms[errorIdx];
  const dfError = anovaTable.df[errorIdx];
  
  // Calculate harmonic mean of replication sizes for critical ranges
  const rValues = Object.values(trtRepCounts);
  const sumInvR = rValues.reduce((sum, rVal) => sum + 1 / (rVal || 1), 0);
  const rHarmonic = rValues.length / (sumInvR || 1);
  
  const sortedTrts = Object.keys(treatmentMeans).sort((a, b) => treatmentMeans[b] - treatmentMeans[a]);
  const k = sortedTrts.length;
  
  // Calculate critical ranges for steps p = 2 to k
  const criticalRanges = {};
  for (let p = 2; p <= Math.min(k, 10); p++) {
    const qCrit = getDuncanCriticalRange(alpha, p, dfError);
    criticalRanges[p] = qCrit * Math.sqrt(msError / rHarmonic);
  }

  // Duncan's test logic: Treatments are compared step-wise
  const significantPairs = new Set();
  const comparisons = [];

  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      const trtA = sortedTrts[i];
      const trtB = sortedTrts[j];
      const diff = treatmentMeans[trtA] - treatmentMeans[trtB];
      const step = j - i + 1;
      const rCrit = criticalRanges[step] || criticalRanges[Math.min(step, 10)] || 0;
      
      const sig = diff > rCrit;
      if (sig) {
        significantPairs.add(`${trtA}_${trtB}`);
        significantPairs.add(`${trtB}_${trtA}`);
      }

      comparisons.push({
        treatmentA: trtA,
        treatmentB: trtB,
        meanA: treatmentMeans[trtA],
        meanB: treatmentMeans[trtB],
        difference: diff,
        significant: sig,
        range: rCrit
      });
    }
  }

  // Group treatments (letter display)
  const isSig = (t1, t2) => significantPairs.has(`${t1}_${t2}`);
  const groups = assignLetterGroups(sortedTrts, treatmentMeans, comparisons.map(c => ({
    treatmentA: c.treatmentA,
    treatmentB: c.treatmentB,
    significant: isSig(c.treatmentA, c.treatmentB)
  })));

  return {
    ...anova,
    criticalRanges,
    comparisons,
    groups,
    test: "Duncan's MRT",
    alpha
  };
}

const DUNCAN_TABLE_05 = {
  5: [3.64, 3.74, 3.79, 3.83, 3.85, 3.86, 3.87, 3.88, 3.89],
  10: [3.15, 3.30, 3.37, 3.43, 3.46, 3.47, 3.48, 3.49, 3.50],
  15: [3.01, 3.16, 3.25, 3.31, 3.35, 3.37, 3.39, 3.40, 3.41],
  20: [2.95, 3.10, 3.18, 3.25, 3.29, 3.32, 3.34, 3.35, 3.36],
  30: [2.89, 3.04, 3.12, 3.18, 3.22, 3.25, 3.27, 3.28, 3.29],
  60: [2.83, 2.98, 3.06, 3.12, 3.16, 3.19, 3.21, 3.22, 3.23],
  "inf": [2.77, 2.92, 3.00, 3.06, 3.10, 3.13, 3.15, 3.17, 3.18]
};

function getDuncanCriticalRange(alpha, p, df) {
  const dfKey = df >= 120 ? "inf" : (df >= 60 ? 60 : (df >= 30 ? 30 : (df >= 20 ? 20 : (df >= 15 ? 15 : (df >= 10 ? 10 : 5)))));
  const pIndex = Math.min(Math.max(p, 2), 10) - 2;
  const dfEntry = DUNCAN_TABLE_05[dfKey] || DUNCAN_TABLE_05["inf"];
  return dfEntry[pIndex] || 3.0;
}

export function performTwoWayANOVA(trials, options = {}) {
  const { metric = 'controlPct', daa = null, species = null, excludeOutliers = false } = options;
  
  const rawDataPoints = [];
  
  trials.forEach(trial => {
    let factorA = (trial.MainFactor || '').trim();
    let factorB = (trial.SubFactor || '').trim();
    
    // Fallback if empty but it is a factorial trial
    if (!factorA && !factorB) {
      const parts = (trial.FormulationName || '').split(/\s*[xX]\s*/);
      factorA = (parts[0] || 'A').trim();
      factorB = (parts[1] || 'B').trim();
    }
    
    const blockId = trial.BlockID || trial.Replication || '1';
    
    const efficacy = safeJsonParse(trial.EfficacyDataJSON, []);
    const observations = daa 
      ? efficacy.filter(e => e.daa === daa || e.daysAfterApplication === daa)
      : efficacy;
    
    if (observations.length > 0) {
      const latest = observations[observations.length - 1];
      const category = trial.Category || 'herbicide';
      let value = latest[metric] ?? latest[metric === 'yield' ? 'yieldKgPlot' : metric] ?? latest.controlPct ?? latest.wce ?? getObservationPrimaryValue(category, latest) ?? latest.diseaseSeverity ?? latest.pestCount ?? latest.yieldKgPlot ?? latest.overallVigor;
      if (metric === 'yield' && (value === null || value === undefined || value === '')) {
        value = trial.Yield ?? trial.YieldValue;
      }
      if (value !== null && value !== undefined && !isNaN(value)) {
        const valNum = parseFloat(value);
        rawDataPoints.push({
          y: valNum,
          factorA,
          factorB,
          block: blockId,
          trial
        });
      }
    }
  });

  const detectedOutliers = [];
  const cellGroups = {};
  rawDataPoints.forEach((dp, idx) => {
    const key = `${dp.factorA} x ${dp.factorB}`;
    if (!cellGroups[key]) cellGroups[key] = [];
    cellGroups[key].push({ dp, idx });
  });

  const dataPoints = [];
  Object.keys(cellGroups).forEach(key => {
    const items = cellGroups[key];
    const vals = items.map(item => item.dp.y);
    if (vals.length > 2) {
      const stats = calculateStats(vals);
      items.forEach(item => {
        if (stats.stdDev === 0) {
          dataPoints.push(item.dp);
          return;
        }
        const z = (item.dp.y - stats.mean) / stats.stdDev;
        if (Math.abs(z) > 2.5) {
          detectedOutliers.push({
            treatment: key,
            block: item.dp.block,
            value: item.dp.y,
            zScore: z
          });
          if (!excludeOutliers) {
            dataPoints.push(item.dp);
          }
        } else {
          dataPoints.push(item.dp);
        }
      });
    } else {
      items.forEach(item => dataPoints.push(item.dp));
    }
  });

  const factorALevels = new Set(dataPoints.map(dp => dp.factorA));
  const factorBLevels = new Set(dataPoints.map(dp => dp.factorB));
  const blocks = new Set(dataPoints.map(dp => dp.block));
  
  const listA = [...factorALevels];
  const listB = [...factorBLevels];
  const listBlocks = [...blocks];
  const N = dataPoints.length;
  if (N === 0) {
    return { error: 'No observations remaining for Two-Way ANOVA after filtering.' };
  }
  
  if (listA.length < 2 || listB.length < 2) {
    return { error: 'Need at least 2 levels for each factor to perform Two-Way ANOVA' };
  }
  
  const grandTotal = dataPoints.reduce((sum, dp) => sum + dp.y, 0);
  const grandMean = grandTotal / N;
  const CF = (grandTotal * grandTotal) / N;
  
  const ssTotal = dataPoints.reduce((sum, dp) => sum + dp.y * dp.y, 0) - CF;
  
  let ssA = 0;
  listA.forEach(levelA => {
    const filtered = dataPoints.filter(dp => dp.factorA === levelA);
    const sum = filtered.reduce((s, dp) => s + dp.y, 0);
    const count = filtered.length;
    if (count > 0) ssA += (sum * sum) / count;
  });
  ssA -= CF;
  
  let ssB = 0;
  listB.forEach(levelB => {
    const filtered = dataPoints.filter(dp => dp.factorB === levelB);
    const sum = filtered.reduce((s, dp) => s + dp.y, 0);
    const count = filtered.length;
    if (count > 0) ssB += (sum * sum) / count;
  });
  ssB -= CF;
  
  let ssCells = 0;
  listA.forEach(levelA => {
    listB.forEach(levelB => {
      const filtered = dataPoints.filter(dp => dp.factorA === levelA && dp.factorB === levelB);
      const sum = filtered.reduce((s, dp) => s + dp.y, 0);
      const count = filtered.length;
      if (count > 0) ssCells += (sum * sum) / count;
    });
  });
  ssCells -= CF;
  
  const ssAB = Math.max(0, ssCells - ssA - ssB);
  
  let ssBlocks = 0;
  listBlocks.forEach(blk => {
    const filtered = dataPoints.filter(dp => dp.block === blk);
    const sum = filtered.reduce((s, dp) => s + dp.y, 0);
    const count = filtered.length;
    if (count > 0) ssBlocks += (sum * sum) / count;
  });
  ssBlocks -= CF;
  
  const ssError = Math.max(0, ssTotal - ssA - ssB - ssAB - ssBlocks);
  
  const dfA = listA.length - 1;
  const dfB = listB.length - 1;
  const dfAB = dfA * dfB;
  const dfBlocks = Math.max(0, listBlocks.length - 1);
  const dfTotal = N - 1;
  const dfError = Math.max(1, dfTotal - dfA - dfB - dfAB - dfBlocks);
  
  const msA = ssA / dfA;
  const msB = ssB / dfB;
  const msAB = ssAB / dfAB;
  const msBlocks = dfBlocks > 0 ? ssBlocks / dfBlocks : 0;
  const msError = ssError / dfError;
  
  const fA = msError > 0 ? msA / msError : 0;
  const fB = msError > 0 ? msB / msError : 0;
  const fAB = msError > 0 ? msAB / msError : 0;
  const fBlocks = (dfBlocks > 0 && msError > 0) ? msBlocks / msError : 0;
  
  const pA = msError > 0 ? approximatePValue(fA, dfA, dfError) : 1;
  const pB = msError > 0 ? approximatePValue(fB, dfB, dfError) : 1;
  const pAB = msError > 0 ? approximatePValue(fAB, dfAB, dfError) : 1;
  const pBlocks = (dfBlocks > 0 && msError > 0) ? approximatePValue(fBlocks, dfBlocks, dfError) : 1;
  
  const cv = grandMean > 0 ? (Math.sqrt(msError) / grandMean) * 100 : 0;
  
  return {
    anovaTable: {
      source: ['Factor A', 'Factor B', 'Interaction A x B', 'Blocks', 'Error', 'Total'],
      ss: [ssA, ssB, ssAB, ssBlocks, ssError, ssTotal],
      df: [dfA, dfB, dfAB, dfBlocks, dfError, dfTotal],
      ms: [msA, msB, msAB, msBlocks, msError, null],
      f: [fA, fB, fAB, fBlocks, null, null],
      p: [pA, pB, pAB, pBlocks, null, null]
    },
    factorA: { name: options.mainFactorName || 'Factor A', levels: listA, ss: ssA, df: dfA, ms: msA, f: fA, p: pA },
    factorB: { name: options.subFactorName || 'Factor B', levels: listB, ss: ssB, df: dfB, ms: msB, f: fB, p: pB },
    interaction: { ss: ssAB, df: dfAB, ms: msAB, f: fAB, p: pAB },
    blocks: { ss: ssBlocks, df: dfBlocks, ms: msBlocks, f: fBlocks, p: pBlocks },
    error: { ss: ssError, df: dfError, ms: msError },
    total: { ss: ssTotal, df: dfTotal },
    grandMean,
    cv,
    detectedOutliers,
    isTwoWay: true
  };
}

export function detectOutliers(values, threshold = 1.5) {
  const n = values.length;
  if (n < 3) return [];
  
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.map(v => Math.pow(v - mean, 2)).reduce((a, b) => a + b, 0) / (n - 1);
  const stdDev = Math.sqrt(variance);
  
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[Math.floor(n / 2)];
  const absoluteDeviations = values.map(v => Math.abs(v - median));
  const sortedAD = [...absoluteDeviations].sort((a, b) => a - b);
  const mad = sortedAD[Math.floor(n / 2)] || 1e-6;
  
  if (stdDev === 0) return [];
  
  const outliers = [];
  values.forEach((v, idx) => {
    const z = (v - mean) / stdDev;
    const modZ = (0.6745 * (v - median)) / mad;
    
    if (Math.abs(z) > threshold || Math.abs(modZ) > 2.0) {
      outliers.push({ index: idx, value: v, zScore: z, modifiedZScore: modZ });
    }
  });
  return outliers;
}

/**
 * One-way ANCOVA (Analysis of Covariance)
 * Adjusts primary treatment metric using a covariate (e.g. baseline or temperature).
 */
export function performANCOVA(trials, covariateMetric, options = {}) {
  const { metric = 'controlPct', alpha = 0.05, daa = null } = options;
  
  // Gather data pairs (Y = dependent variable, X = covariate) grouped by treatment
  const treatments = {};
  const allX = [];
  const allY = [];
  
  trials.forEach(trial => {
    const trt = trial.FormulationName || 'Unknown';
    const efficacy = safeJsonParse(trial.EfficacyDataJSON, []);
    const observations = daa 
      ? efficacy.filter(e => e.daa === daa || e.daysAfterApplication === daa)
      : efficacy;
    
    if (observations.length > 0) {
      const latest = observations[observations.length - 1];
      const category = trial.Category || 'herbicide';
      const yVal = latest[metric] ?? latest.controlPct ?? latest.wce ?? getObservationPrimaryValue(category, latest) ?? latest.overallVigor;
      const xVal = latest[covariateMetric] ?? trial[covariateMetric] ?? 0;
      
      if (yVal !== null && !isNaN(yVal) && xVal !== null && !isNaN(xVal)) {
        if (!treatments[trt]) treatments[trt] = [];
        const xFloat = parseFloat(xVal);
        const yFloat = parseFloat(yVal);
        treatments[trt].push({ x: xFloat, y: yFloat });
        allX.push(xFloat);
        allY.push(yFloat);
      }
    }
  });

  const trtNames = Object.keys(treatments);
  if (trtNames.length < 2 || allX.length < 4) {
    return { error: 'Insufficient data for ANCOVA. Need at least 2 treatments and multiple observations.' };
  }

  const N = allY.length;
  const k = trtNames.length;

  const meanX = allX.reduce((a, b) => a + b, 0) / N;
  const meanY = allY.reduce((a, b) => a + b, 0) / N;

  // Compute Sum of Squares and Cross-Products
  let ssTotalX = 0, ssTotalY = 0, spTotal = 0;
  allX.forEach((xVal, i) => {
    const yVal = allY[i];
    ssTotalX += Math.pow(xVal - meanX, 2);
    ssTotalY += Math.pow(yVal - meanY, 2);
    spTotal += (xVal - meanX) * (yVal - meanY);
  });

  let ssTreatX = 0, ssTreatY = 0, spTreat = 0;
  const trtMeans = {};
  trtNames.forEach(trt => {
    const pts = treatments[trt];
    const nTrt = pts.length;
    if (nTrt === 0) return;
    const tMeanX = pts.reduce((sum, p) => sum + p.x, 0) / nTrt;
    const tMeanY = pts.reduce((sum, p) => sum + p.y, 0) / nTrt;
    trtMeans[trt] = { meanX: tMeanX, meanY: tMeanY, count: nTrt };

    ssTreatX += nTrt * Math.pow(tMeanX - meanX, 2);
    ssTreatY += nTrt * Math.pow(tMeanY - meanY, 2);
    spTreat += nTrt * (tMeanX - meanX) * (tMeanY - meanY);
  });

  const ssErrorX = Math.max(0, ssTotalX - ssTreatX);
  const ssErrorY = Math.max(0, ssTotalY - ssTreatY);
  const spError = spTotal - spTreat;

  // Slopes (Beta coefficients)
  const beta = ssErrorX > 0 ? spError / ssErrorX : 0;

  // Adjusted sums of squares
  const ssTotalY_adj = Math.max(0, ssTotalY - (spTotal * spTotal) / (ssTotalX || 1));
  const ssErrorY_adj = Math.max(0, ssErrorY - (spError * spError) / (ssErrorX || 1));
  const ssTreatY_adj = Math.max(0, ssTotalY_adj - ssErrorY_adj);

  const dfTreat = k - 1;
  const dfError = N - k - 1;
  const dfTotal = N - 2;

  const msTreat = dfTreat > 0 ? ssTreatY_adj / dfTreat : 0;
  const msError = dfError > 0 ? ssErrorY_adj / dfError : 0;

  const fVal = msError > 0 ? msTreat / msError : 0;
  const pVal = msError > 0 ? approximatePValue(fVal, dfTreat, dfError) : 1;

  // Calculate adjusted treatment means: Y_adj = Y_bar - beta * (X_bar_trt - X_bar_grand)
  const adjustedMeans = {};
  trtNames.forEach(trt => {
    const stats = trtMeans[trt];
    adjustedMeans[trt] = stats.meanY - beta * (stats.meanX - meanX);
  });

  return {
    anovaTable: {
      source: ['Adjusted Treatments', 'Error (adjusted)', 'Total (adjusted)'],
      ss: [ssTreatY_adj, ssErrorY_adj, ssTotalY_adj],
      df: [dfTreat, dfError, dfTotal],
      ms: [msTreat, msError, null],
      f: [fVal, null, null],
      p: [pVal, null, null]
    },
    fStatistic: fVal,
    pValue: pVal,
    significant: pVal < alpha,
    treatmentMeans: adjustedMeans,
    unadjustedMeans: trtMeans,
    beta,
    covariateMean: meanX,
    test: 'ANCOVA',
    alpha
  };
}

/**
 * Combined Multi-Trial Meta-Analysis
 * Run combined ANOVA across multiple projects (locations) to identify Treatment, Location, and Treatment x Location effects.
 */
export function performMetaAnalysis(projects, allTrials, options = {}) {
  const { metric = 'controlPct', alpha = 0.05, daa = null } = options;

  const dataPoints = [];
  const locations = new Set();
  const treatments = new Set();
  const blocks = new Set();

  projects.forEach(project => {
    const projTrials = allTrials.filter(t => String(t.ProjectID) === String(project.ID));
    projTrials.forEach(trial => {
      const trt = trial.FormulationName || 'Unknown';
      const blockId = trial.BlockID || trial.Replication || '1';
      const loc = project.Location || project.Name || 'Unknown Location';

      const efficacy = safeJsonParse(trial.EfficacyDataJSON, []);
      const observations = daa 
        ? efficacy.filter(e => e.daa === daa || e.daysAfterApplication === daa)
        : efficacy;
      
      if (observations.length > 0) {
        const latest = observations[observations.length - 1];
        const value = latest[metric] ?? latest.controlPct ?? latest.wce ?? latest.weedCover ?? latest.overallVigor;
        if (value !== null && !isNaN(value)) {
          dataPoints.push({
            y: parseFloat(value),
            trt,
            loc,
            block: blockId
          });
          locations.add(loc);
          treatments.add(trt);
          blocks.add(blockId);
        }
      }
    });
  });

  const listLocs = [...locations];
  const listTrts = [...treatments];
  const N = dataPoints.length;

  if (listLocs.length < 2 || listTrts.length < 2 || N < 6) {
    return { error: 'Insufficient data for Meta-Analysis. Need at least 2 locations, 2 treatments, and multiple replication plots.' };
  }

  const grandTotal = dataPoints.reduce((sum, dp) => sum + dp.y, 0);
  const grandMean = grandTotal / N;
  const CF = (grandTotal * grandTotal) / N;

  const ssTotal = dataPoints.reduce((sum, dp) => sum + dp.y * dp.y, 0) - CF;

  // SS Locations
  let ssLoc = 0;
  listLocs.forEach(loc => {
    const pts = dataPoints.filter(dp => dp.loc === loc);
    const sum = pts.reduce((s, dp) => s + dp.y, 0);
    if (pts.length > 0) ssLoc += (sum * sum) / pts.length;
  });
  ssLoc -= CF;

  // SS Treatments
  let ssTrt = 0;
  listTrts.forEach(trt => {
    const pts = dataPoints.filter(dp => dp.trt === trt);
    const sum = pts.reduce((s, dp) => s + dp.y, 0);
    if (pts.length > 0) ssTrt += (sum * sum) / pts.length;
  });
  ssTrt -= CF;

  // SS Interaction (Treat x Loc)
  let ssCells = 0;
  listLocs.forEach(loc => {
    listTrts.forEach(trt => {
      const pts = dataPoints.filter(dp => dp.loc === loc && dp.trt === trt);
      const sum = pts.reduce((s, dp) => s + dp.y, 0);
      if (pts.length > 0) ssCells += (sum * sum) / pts.length;
    });
  });
  ssCells -= CF;

  const ssTrtLoc = Math.max(0, ssCells - ssLoc - ssTrt);

  // SS Error
  const ssError = Math.max(0, ssTotal - ssLoc - ssTrt - ssTrtLoc);

  const dfLoc = listLocs.length - 1;
  const dfTrt = listTrts.length - 1;
  const dfTrtLoc = dfLoc * dfTrt;
  const dfTotal = N - 1;
  const dfError = Math.max(1, dfTotal - dfLoc - dfTrt - dfTrtLoc);

  const msLoc = ssLoc / dfLoc;
  const msTrt = ssTrt / dfTrt;
  const msTrtLoc = ssTrtLoc / dfTrtLoc;
  const msError = ssError / dfError;

  // F-values (using Error mean square as denominator)
  const fTrt = msError > 0 ? msTrt / msError : 0;
  const fLoc = msError > 0 ? msLoc / msError : 0;
  const fTrtLoc = msError > 0 ? msTrtLoc / msError : 0;

  const pTrt = msError > 0 ? approximatePValue(fTrt, dfTrt, dfError) : 1;
  const pLoc = msError > 0 ? approximatePValue(fLoc, dfLoc, dfError) : 1;
  const pTrtLoc = msError > 0 ? approximatePValue(fTrtLoc, dfTrtLoc, dfError) : 1;

  // Compute treatment means
  const treatmentMeans = {};
  listTrts.forEach(t => {
    const pts = dataPoints.filter(dp => dp.trt === t);
    treatmentMeans[t] = pts.reduce((s, dp) => s + dp.y, 0) / (pts.length || 1);
  });

  return {
    anovaTable: {
      source: ['Locations', 'Treatments', 'Interaction (Trt x Loc)', 'Error', 'Total'],
      ss: [ssLoc, ssTrt, ssTrtLoc, ssError, ssTotal],
      df: [dfLoc, dfTrt, dfTrtLoc, dfError, dfTotal],
      ms: [msLoc, msTrt, msTrtLoc, msError, null],
      f: [fLoc, fTrt, fTrtLoc, null, null],
      p: [pLoc, pTrt, pTrtLoc, null, null]
    },
    fStatistic: fTrt,
    pValue: pTrt,
    significant: pTrt < alpha,
    treatmentMeans,
    test: 'Meta-Analysis',
    alpha
  };
}

/**
 * Export window bindings
 */
// Solves A * x = B using Gaussian elimination with pivoting
function solveLinearSystem(A, B) {
  const n = A.length;
  const M = new Array(n);
  for (let i = 0; i < n; i++) {
    M[i] = new Array(n + 1);
    for (let j = 0; j < n; j++) M[i][j] = A[i][j];
    M[i][n] = B[i];
  }
  for (let i = 0; i < n; i++) {
    let maxEl = Math.abs(M[i][i]);
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(M[k][i]) > maxEl) {
        maxEl = Math.abs(M[k][i]);
        maxRow = k;
      }
    }
    const tmp = M[maxRow];
    M[maxRow] = M[i];
    M[i] = tmp;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(M[i][i]) < 1e-12) return null;
      const c = -M[k][i] / M[i][i];
      for (let j = i; j <= n; j++) {
        M[k][j] = i === j ? 0 : M[k][j] + c * M[i][j];
      }
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    if (Math.abs(M[i][i]) < 1e-12) return null;
    x[i] = M[i][n] / M[i][i];
    for (let k = i - 1; k >= 0; k--) {
      M[k][n] -= M[k][i] * x[i];
    }
  }
  return x;
}

// Fits a linear regression model Y = X * Beta and returns the residual sum of squares
function fitRegression(X, Y) {
  const n = X.length;
  const p = X[0].length;
  const XtX = Array.from({ length: p }, () => new Array(p).fill(0));
  const XtY = new Array(p).fill(0);
  for (let i = 0; i < p; i++) {
    for (let j = 0; j < p; j++) {
      let sum = 0;
      for (let k = 0; k < n; k++) sum += X[k][i] * X[k][j];
      XtX[i][j] = sum;
    }
    let sumY = 0;
    for (let k = 0; k < n; k++) sumY += X[k][i] * Y[k];
    XtY[i] = sumY;
  }
  const beta = solveLinearSystem(XtX, XtY);
  if (!beta) return { beta: null, ssError: null };
  let ssError = 0;
  for (let k = 0; k < n; k++) {
    let pred = 0;
    for (let j = 0; j < p; j++) pred += X[k][j] * beta[j];
    ssError += Math.pow(Y[k] - pred, 2);
  }
  return { beta, ssError };
}

// Approximate p-value from F-distribution using regularized incomplete beta function (declared in this file)
// We declare performTypeIIIANOVA:
export function performTypeIIIANOVA(trials, options = {}) {
  const { metric = 'controlPct', daa = null } = options;
  const data = [];
  const trtSet = new Set();
  const blockSet = new Set();
  
  trials.forEach(trial => {
    const trt = trial.FormulationName || 'Unknown';
    const blockId = trial.BlockID || trial.Replication || '1';
    const efficacy = safeJsonParse(trial.EfficacyDataJSON, []);
    const observations = daa 
      ? efficacy.filter(e => e.daa === daa || e.daysAfterApplication === daa)
      : efficacy;
    
    if (observations.length > 0) {
      const latest = observations[observations.length - 1];
      const value = latest[metric] ?? 
                    latest[metric === 'yield' ? 'yieldKgPlot' : metric] ?? 
                    latest.controlPct ?? 
                    latest.wce ?? 
                    latest.weedCover ?? 
                    latest.diseaseSeverity ?? 
                    latest.pestCount ?? 
                    latest.yieldKgPlot ?? 
                    latest.overallVigor;
      if (value !== null && !isNaN(value)) {
        data.push({ trt, blockId, value: parseFloat(value) });
        trtSet.add(trt);
        blockSet.add(blockId);
      }
    }
  });

  const N = data.length;
  const trts = [...trtSet];
  const blocks = [...blockSet];
  const t = trts.length;
  const b = blocks.length;

  if (N < 4 || t < 2 || b < 2) {
    return { error: 'Insufficient data points for Type III ANOVA' };
  }

  const getFullRow = (trt, blockId) => {
    const row = [1];
    const tIdx = trts.indexOf(trt);
    if (tIdx < t - 1) {
      for (let i = 0; i < t - 1; i++) row.push(i === tIdx ? 1 : 0);
    } else {
      for (let i = 0; i < t - 1; i++) row.push(-1);
    }
    const bIdx = blocks.indexOf(blockId);
    if (bIdx < b - 1) {
      for (let i = 0; i < b - 1; i++) row.push(i === bIdx ? 1 : 0);
    } else {
      for (let i = 0; i < b - 1; i++) row.push(-1);
    }
    return row;
  };

  const getNoTrtRow = (trt, blockId) => {
    const row = [1];
    const bIdx = blocks.indexOf(blockId);
    if (bIdx < b - 1) {
      for (let i = 0; i < b - 1; i++) row.push(i === bIdx ? 1 : 0);
    } else {
      for (let i = 0; i < b - 1; i++) row.push(-1);
    }
    return row;
  };

  const getNoBlkRow = (trt, blockId) => {
    const row = [1];
    const tIdx = trts.indexOf(trt);
    if (tIdx < t - 1) {
      for (let i = 0; i < t - 1; i++) row.push(i === tIdx ? 1 : 0);
    } else {
      for (let i = 0; i < t - 1; i++) row.push(-1);
    }
    return row;
  };

  const Y = data.map(d => d.value);
  const X_full = data.map(d => getFullRow(d.trt, d.blockId));
  const X_no_trt = data.map(d => getNoTrtRow(d.trt, d.blockId));
  const X_no_blk = data.map(d => getNoBlkRow(d.trt, d.blockId));

  const fit_full = fitRegression(X_full, Y);
  const fit_no_trt = fitRegression(X_no_trt, Y);
  const fit_no_blk = fitRegression(X_no_blk, Y);

  if (fit_full.ssError === null || fit_no_trt.ssError === null || fit_no_blk.ssError === null) {
    return { error: 'Collinearity in design matrix. Regression failed.' };
  }

  const ssError = fit_full.ssError;
  const ssTreatments = fit_no_trt.ssError - fit_full.ssError;
  const ssBlocks = fit_no_blk.ssError - fit_full.ssError;

  const grandMean = Y.reduce((a, b) => a + b, 0) / N;
  let ssTotal = 0;
  Y.forEach(y => { ssTotal += Math.pow(y - grandMean, 2); });

  const dfTreatments = t - 1;
  const dfBlocks = b - 1;
  const dfError = N - t - b + 1;
  const dfTotal = N - 1;

  if (dfError <= 0) {
    return { error: 'No degrees of freedom left for Error' };
  }

  const msTreatments = ssTreatments / dfTreatments;
  const msBlocks = ssBlocks / dfBlocks;
  const msError = ssError / dfError;

  const fStatistic = msTreatments / msError;
  const fBlock = msBlocks / msError;

  const pValue = approximatePValue(fStatistic, dfTreatments, dfError);
  const pBlock = approximatePValue(fBlock, dfBlocks, dfError);

  const treatmentMeans = {};
  trts.forEach(trt => {
    const vals = data.filter(d => d.trt === trt).map(d => d.value);
    treatmentMeans[trt] = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
  });

  const residuals = [];
  data.forEach(d => {
    residuals.push(d.value - treatmentMeans[d.trt]);
  });
  const normalityResult = checkNormality(residuals);
  
  const groupsForLevene = {};
  trts.forEach(trt => {
    groupsForLevene[trt] = data.filter(d => d.trt === trt).map(d => d.value);
  });
  const leveneResult = checkLeveneTest(groupsForLevene);

  let recommendation = null;
  if (!normalityResult.normalityPassed || !leveneResult.variancePassed) {
    recommendation = "Warning: ANOVA assumptions violated. ";
    if (!normalityResult.normalityPassed) recommendation += "Residuals are not normally distributed (p < 0.05). ";
    if (!leveneResult.variancePassed) recommendation += "Variances are not homogeneous (Levene's test p < 0.05). ";
    recommendation += "Consider running the Kruskal-Wallis non-parametric test.";
  }

  return {
    anovaTable: {
      source: ['Treatments', 'Blocks', 'Error', 'Total'],
      ss: [Math.max(0, ssTreatments), Math.max(0, ssBlocks), Math.max(0, ssError), ssTotal],
      df: [dfTreatments, dfBlocks, dfError, dfTotal],
      ms: [msTreatments, msBlocks, msError, null],
      f: [fStatistic, fBlock, null, null],
      p: [pValue, pBlock, null, null]
    },
    fStatistic,
    pValue,
    significant: pValue < 0.05,
    treatmentMeans,
    grandMean,
    treatments: trts,
    blocks: blocks,
    isTypeIII: true,
    assumptions: {
      normalityPassed: normalityResult.normalityPassed,
      normalityP: normalityResult.pValue,
      variancePassed: leveneResult.variancePassed,
      varianceP: leveneResult.pValue,
      recommendation
    }
  };
}

export function checkNormality(residuals) {
  const n = residuals.length;
  if (n < 4) return { normalityPassed: true, pValue: 1.0, score: 0 };
  const mean = residuals.reduce((a, b) => a + b, 0) / n;
  const variance = residuals.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (n - 1);
  const stdDev = Math.sqrt(variance);
  if (stdDev === 0) return { normalityPassed: true, pValue: 1.0, score: 0 };

  const m3 = residuals.reduce((sum, v) => sum + Math.pow(v - mean, 3), 0) / n;
  const m4 = residuals.reduce((sum, v) => sum + Math.pow(v - mean, 4), 0) / n;

  const skewness = m3 / Math.pow(stdDev, 3);
  const kurtosis = (m4 / Math.pow(stdDev, 4)) - 3;

  // Jarque-Bera test statistic
  const jb = (n / 6) * (Math.pow(skewness, 2) + Math.pow(kurtosis, 2) / 4);
  // JB follows Chi-Square(2). p-value approximation: exp(-jb / 2)
  const pVal = Math.exp(-jb / 2);
  
  return {
    normalityPassed: pVal >= 0.05,
    pValue: pVal,
    skewness,
    kurtosis,
    statistic: jb
  };
}

export function checkLeveneTest(groups) {
  const trtKeys = Object.keys(groups);
  const k = trtKeys.length;
  if (k < 2) return { variancePassed: true, pValue: 1.0 };

  const absoluteDeviations = {};
  const allDeviations = [];
  
  trtKeys.forEach(trt => {
    const vals = groups[trt];
    const mean = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
    absoluteDeviations[trt] = vals.map(v => Math.abs(v - mean));
    allDeviations.push(...absoluteDeviations[trt]);
  });

  const N = allDeviations.length;
  if (N - k <= 0) return { variancePassed: true, pValue: 1.0 };

  const grandMeanDev = allDeviations.reduce((a, b) => a + b, 0) / N;

  let ssTreatments = 0;
  trtKeys.forEach(trt => {
    const devs = absoluteDeviations[trt];
    const meanDev = devs.reduce((a, b) => a + b, 0) / (devs.length || 1);
    ssTreatments += devs.length * Math.pow(meanDev - grandMeanDev, 2);
  });

  let ssTotal = 0;
  allDeviations.forEach(d => {
    ssTotal += Math.pow(d - grandMeanDev, 2);
  });

  const ssError = Math.max(0, ssTotal - ssTreatments);

  const dfTreatments = k - 1;
  const dfError = N - k;

  const msTreatments = ssTreatments / dfTreatments;
  const msError = ssError / dfError;

  const fStatistic = msError > 0 ? msTreatments / msError : 0;
  const pValue = approximatePValue(fStatistic, dfTreatments, dfError);

  return {
    variancePassed: pValue >= 0.05,
    pValue,
    fStatistic
  };
}

export function performKruskalWallis(trials, options = {}) {
  const { metric = 'controlPct', daa = null } = options;
  
  const groups = {};
  trials.forEach(trial => {
    const trt = trial.FormulationName || 'Unknown';
    const efficacy = safeJsonParse(trial.EfficacyDataJSON, []);
    const observations = daa 
      ? efficacy.filter(e => e.daa === daa || e.daysAfterApplication === daa)
      : efficacy;
    
    if (observations.length > 0) {
      const latest = observations[observations.length - 1];
      const category = trial.Category || 'herbicide';
      let value = latest[metric] ?? latest[metric === 'yield' ? 'yieldKgPlot' : metric] ?? latest.controlPct ?? latest.wce ?? getObservationPrimaryValue(category, latest) ?? latest.diseaseSeverity ?? latest.pestCount ?? latest.yieldKgPlot ?? latest.overallVigor;
      if (metric === 'yield' && (value === null || value === undefined || value === '')) {
        value = trial.Yield ?? trial.YieldValue;
      }
      if (value !== null && value !== undefined && !isNaN(value)) {
        if (!groups[trt]) groups[trt] = [];
        groups[trt].push({ value: parseFloat(value), trt });
      }
    }
  });

  const trtKeys = Object.keys(groups);
  const k = trtKeys.length;
  if (k < 2) {
    return { error: 'Need at least 2 treatments for Kruskal-Wallis test' };
  }

  const allItems = [];
  trtKeys.forEach(trt => {
    groups[trt].forEach(item => allItems.push(item));
  });

  allItems.sort((a, b) => a.value - b.value);

  let i = 0;
  const N = allItems.length;
  const ranks = new Array(N);
  let tieSum = 0;

  while (i < N) {
    let j = i + 1;
    while (j < N && allItems[j].value === allItems[i].value) {
      j++;
    }
    const rankSum = ((i + 1) + j) * (j - i) / 2;
    const avgRank = rankSum / (j - i);
    for (let m = i; m < j; m++) {
      ranks[m] = avgRank;
    }
    if (j - i > 1) {
      const t = j - i;
      tieSum += (Math.pow(t, 3) - t);
    }
    i = j;
  }

  for (let m = 0; m < N; m++) {
    allItems[m].rank = ranks[m];
  }

  const rankSums = {};
  const counts = {};
  trtKeys.forEach(trt => {
    rankSums[trt] = 0;
    counts[trt] = groups[trt].length;
  });

  allItems.forEach(item => {
    rankSums[item.trt] += item.rank;
  });

  let sumSqR = 0;
  trtKeys.forEach(trt => {
    sumSqR += Math.pow(rankSums[trt], 2) / counts[trt];
  });

  let H = (12 / (N * (N + 1))) * sumSqR - 3 * (N + 1);

  const C = 1 - (tieSum / (Math.pow(N, 3) - N));
  if (C > 0 && C < 1) {
    H /= C;
  }

  const df = k - 1;
  const pValue = approximatePValue(H / df, df, 999999);

  const treatmentMeans = {};
  trtKeys.forEach(trt => {
    const vals = groups[trt].map(g => g.value);
    treatmentMeans[trt] = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
  });

  return {
    statistic: H,
    df,
    pValue,
    significant: pValue < 0.05,
    treatmentMeans,
    test: 'Kruskal-Wallis',
    counts
  };
}

if (typeof window !== 'undefined') {
  window.performANOVA = performANOVA;
  window.performTukeyHSD = performTukeyHSD;
  window.performDuncanMRT = performDuncanMRT;
  window.performDunnettTest = performDunnettTest;
  window.calculateStats = calculateStats;
  window.performTwoWayANOVA = performTwoWayANOVA;
  window.detectOutliers = detectOutliers;
  window.performANCOVA = performANCOVA;
  window.performMetaAnalysis = performMetaAnalysis;
  window.performTypeIIIANOVA = performTypeIIIANOVA;
  window.checkNormality = checkNormality;
  window.checkLeveneTest = checkLeveneTest;
  window.performKruskalWallis = performKruskalWallis;
}

export default {
  performANOVA,
  performTukeyHSD,
  performDuncanMRT,
  performDunnettTest,
  calculateStats,
  performTwoWayANOVA,
  detectOutliers,
  performANCOVA,
  performMetaAnalysis,
  performTypeIIIANOVA,
  checkNormality,
  checkLeveneTest,
  performKruskalWallis
};

