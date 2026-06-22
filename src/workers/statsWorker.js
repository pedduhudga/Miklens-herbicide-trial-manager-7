/**
 * Statistical Calculations Web Worker
 * Offloads ANOVA, Tukey HSD, and other heavy statistical calculations from the main thread
 */

// Import jStat for statistical functions (will be bundled with worker)
import jStat from 'jstat';

// Timeout for calculations (30 seconds)
const CALCULATION_TIMEOUT = 30000;

/**
 * Log Gamma function for p-value calculation
 */
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

/**
 * Regularized incomplete beta function
 */
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
  let f = 1.0; let c = 1.0; let d = 0.0;
  for (let m = 0; m <= max_iter; m++) {
    let numerator;
    if (m === 0) numerator = 1.0;
    else if (m % 2 === 0) {
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
    if (Math.abs(delta - 1.0) < f_eps) break;
  }
  return front * (f - 1.0);
}

/**
 * Approximate p-value from F-distribution
 */
function approximatePValue(f, df1, df2) {
  if (f <= 0 || isNaN(f)) return 1.0;
  const x = (df1 * f) / (df1 * f + df2);
  const pVal = 1 - regularizedIncompleteBeta(x, df1 / 2, df2 / 2);
  return isNaN(pVal) ? 1.0 : Math.max(0, Math.min(1, pVal));
}

/**
 * Get Student's t critical value
 */
function getStudentTCritical(alpha, df) {
  // Approximation using jStat or fallback
  try {
    if (jStat && jStat.studentt) {
      return jStat.studentt.inv(1 - alpha / 2, df);
    }
  } catch (e) {
    // Fall back to approximation
  }
  
  // Simple approximation for common alpha values
  if (alpha === 0.05) {
    if (df >= 120) return 1.98;
    if (df >= 60) return 2.00;
    if (df >= 40) return 2.02;
    if (df >= 30) return 2.04;
    if (df >= 20) return 2.09;
    if (df >= 10) return 2.23;
    if (df >= 5) return 2.57;
    return 2.78;
  }
  if (alpha === 0.01) {
    if (df >= 120) return 2.62;
    if (df >= 60) return 2.66;
    if (df >= 40) return 2.70;
    if (df >= 30) return 2.75;
    if (df >= 20) return 2.85;
    if (df >= 10) return 3.17;
    if (df >= 5) return 4.03;
    return 4.78;
  }
  return 1.96; // Default to z-score
}

/**
 * Perform RCB ANOVA
 */
function calculateAnovaRCB(data, metricKey) {
  const values = [];
  const trtGroups = {};
  const repGroups = {};
  
  data.forEach(obs => {
    const val = parseFloat(obs[metricKey]);
    const trt = parseInt(obs.treatmentNumber || obs.treatment || obs.Treatment || 1);
    const rep = parseInt(obs.replication || obs.rep || obs.Replication || 1);
    if (!isNaN(val)) {
      values.push(val);
      if (!trtGroups[trt]) trtGroups[trt] = [];
      trtGroups[trt].push(val);
      if (!repGroups[rep]) repGroups[rep] = [];
      repGroups[rep].push(val);
    }
  });

  const N = values.length;
  const t = Object.keys(trtGroups).length;
  const b = Object.keys(repGroups).length;

  if (N < 4 || t < 2 || b < 2) {
    return { error: 'Insufficient data for RCB ANOVA.' };
  }

  const grandMean = values.reduce((a, b) => a + b, 0) / N;
  
  // SSTotal
  let ssTotal = 0;
  values.forEach(y => { ssTotal += Math.pow(y - grandMean, 2); });

  // SSTreatments
  let ssTreatments = 0;
  Object.keys(trtGroups).forEach(trt => {
    const trtVals = trtGroups[trt];
    const trtMean = trtVals.reduce((a, b) => a + b, 0) / trtVals.length;
    ssTreatments += trtVals.length * Math.pow(trtMean - grandMean, 2);
  });

  // SSBlocks
  let ssBlocks = 0;
  Object.keys(repGroups).forEach(rep => {
    const repVals = repGroups[rep];
    const repMean = repVals.reduce((a, b) => a + b, 0) / repVals.length;
    ssBlocks += repVals.length * Math.pow(repMean - grandMean, 2);
  });

  // SSError
  let ssError = Math.max(0, ssTotal - ssTreatments - ssBlocks);

  // Degrees of freedom
  const dfTreatments = t - 1;
  const dfBlocks = b - 1;
  const dfError = dfTreatments * dfBlocks;
  const dfTotal = N - 1;

  // Mean squares
  const msTreatments = ssTreatments / dfTreatments;
  const msBlocks = ssBlocks / dfBlocks;
  const msError = ssError / dfError;

  // F-statistics
  const fStatistic = msError > 0 ? msTreatments / msError : 0;
  const fBlock = msError > 0 ? msBlocks / msError : 0;

  // P-values
  const pValue = approximatePValue(fStatistic, dfTreatments, dfError);
  const pBlock = approximatePValue(fBlock, dfBlocks, dfError);

  // Post-hoc statistics
  const tCritical5 = getStudentTCritical(0.05, dfError);
  const tCritical1 = getStudentTCritical(0.01, dfError);
  const lsd = tCritical5 * Math.sqrt((2 * msError) / (b || 1));
  const lsd1 = tCritical1 * Math.sqrt((2 * msError) / (b || 1));
  const sem = Math.sqrt(msError / (b || 1));
  const cv = grandMean > 0 ? (Math.sqrt(msError) / grandMean) * 100 : 0;

  // Treatment means
  const treatmentMeans = {};
  Object.keys(trtGroups).forEach(trt => {
    const trtVals = trtGroups[trt];
    const trtMean = trtVals.reduce((a, b) => a + b, 0) / trtVals.length;
    const trtVar = trtVals.length > 1 ? trtVals.reduce((a, b) => a + Math.pow(b - trtMean, 2), 0) / (trtVals.length - 1) : 0;
    const trtSD = Math.sqrt(trtVar);
    const trtSE = trtSD / Math.sqrt(trtVals.length || 1);
    
    treatmentMeans[trt] = {
      mean: trtMean,
      sd: trtSD,
      se: trtSE,
      ci_lower: trtMean - 1.96 * trtSE,
      ci_upper: trtMean + 1.96 * trtSE,
      group: 'a'
    };
  });

  // LSD grouping
  const sortedTrts = Object.keys(treatmentMeans).map(t => parseInt(t)).sort((a, b) => treatmentMeans[b].mean - treatmentMeans[a].mean);
  let currentGroupChar = 97;
  const groups = {};
  sortedTrts.forEach((trt, idx) => {
    if (idx === 0) {
      groups[trt] = String.fromCharCode(currentGroupChar);
    } else {
      const prevTrt = sortedTrts[idx - 1];
      const diff = treatmentMeans[prevTrt].mean - treatmentMeans[trt].mean;
      if (diff > lsd) {
        currentGroupChar++;
      }
      groups[trt] = String.fromCharCode(currentGroupChar);
    }
  });
  
  Object.keys(treatmentMeans).forEach(trt => {
    treatmentMeans[trt].group = groups[trt] || 'a';
  });

  return {
    ss_treatment: ssTreatments,
    df_treatment: dfTreatments,
    ms_treatment: msTreatments,
    f_value: fStatistic,
    p_value: pValue,

    ss_block: ssBlocks,
    df_block: dfBlocks,
    ms_block: msBlocks,
    f_block: fBlock,
    p_block: pBlock,

    ss_error: ssError,
    df_error: dfError,
    ms_error: msError,

    ss_total: ssTotal,
    df_total: dfTotal,

    cv,
    sem,
    lsd,
    lsd1,
    
    control_group: treatmentMeans[1]?.group || 'a',
    treatment_group: treatmentMeans[2]?.group || 'a',

    control_mean: treatmentMeans[1]?.mean || 0,
    control_sd: treatmentMeans[1]?.sd || 0,
    control_se: treatmentMeans[1]?.se || 0,

    treatment_mean: treatmentMeans[2]?.mean || 0,
    treatment_sd: treatmentMeans[2]?.sd || 0,
    treatment_se: treatmentMeans[2]?.se || 0,

    treatmentMeans
  };
}

/**
 * Run calculation with timeout
 */
function runWithTimeout(fn, timeout = CALCULATION_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Calculation timed out after ${timeout}ms`));
    }, timeout);
    
    try {
      const result = fn();
      clearTimeout(timeoutId);
      resolve(result);
    } catch (error) {
      clearTimeout(timeoutId);
      reject(error);
    }
  });
}

// Message handler
self.onmessage = async function(e) {
  const { type, payload, id } = e.data;
  
  try {
    let result;
    let progress = 0;
    
    switch (type) {
      case 'ANOVA': {
        // Send progress update
        self.postMessage({ type: 'PROGRESS', id, progress: 10 });
        
        const { data, metricKey } = payload;
        
        result = await runWithTimeout(() => {
          progress = 50;
          self.postMessage({ type: 'PROGRESS', id, progress });
          
          const anovaResult = calculateAnovaRCB(data, metricKey);
          
          progress = 100;
          self.postMessage({ type: 'PROGRESS', id, progress });
          
          return anovaResult;
        }, CALCULATION_TIMEOUT);
        
        break;
      }
      
      case 'BATCH_ANOVA': {
        const { datasets } = payload;
        const results = {};
        
        for (let i = 0; i < datasets.length; i++) {
          const { key, data } = datasets[i];
          
          results[key] = calculateAnovaRCB(data, key);
          
          // Report progress
          progress = Math.round(((i + 1) / datasets.length) * 100);
          self.postMessage({ type: 'PROGRESS', id, progress });
          
          // Yield to prevent blocking
          if (i % 5 === 0) {
            await new Promise(r => setTimeout(r, 0));
          }
        }
        
        result = results;
        break;
      }
      
      case 'TUKEY_HSD': {
        const { data, metricKey } = payload;
        
        result = await runWithTimeout(() => {
          // Get treatment groups
          const groups = {};
          data.forEach(obs => {
            const val = parseFloat(obs[metricKey]);
            const trt = obs.treatmentNumber || obs.treatment || 1;
            if (!isNaN(val)) {
              if (!groups[trt]) groups[trt] = [];
              groups[trt].push(val);
            }
          });
          
          // Calculate pairwise comparisons
          const comparisons = [];
          const trtKeys = Object.keys(groups);
          
          for (let i = 0; i < trtKeys.length; i++) {
            for (let j = i + 1; j < trtKeys.length; j++) {
              const trt1 = groups[trtKeys[i]];
              const trt2 = groups[trtKeys[j]];
              
              const mean1 = trt1.reduce((a, b) => a + b, 0) / trt1.length;
              const mean2 = trt2.reduce((a, b) => a + b, 0) / trt2.length;
              
              // Pooled standard error
              const n1 = trt1.length;
              const n2 = trt2.length;
              const sp = Math.sqrt(((n1 - 1) * Math.pow(jStat.stdev(trt1, true), 2) + 
                                   (n2 - 1) * Math.pow(jStat.stdev(trt2, true), 2)) / (n1 + n2 - 2));
              
              const se = sp * Math.sqrt(1/n1 + 1/n2);
              const diff = mean2 - mean1;
              
              comparisons.push({
                treatment1: trtKeys[i],
                treatment2: trtKeys[j],
                mean1,
                mean2,
                difference: diff,
                se,
                significant: Math.abs(diff) > se * getStudentTCritical(0.05, n1 + n2 - 2)
              });
            }
          }
          
          return { comparisons };
        }, CALCULATION_TIMEOUT);
        
        break;
      }
      
      default:
        throw new Error(`Unknown calculation type: ${type}`);
    }
    
    self.postMessage({ type: 'RESULT', id, result });
    
  } catch (error) {
    self.postMessage({ 
      type: 'ERROR', 
      id, 
      error: { message: error.message, stack: error.stack } 
    });
  }
};

// Signal that worker is ready
self.postMessage({ type: 'READY' });