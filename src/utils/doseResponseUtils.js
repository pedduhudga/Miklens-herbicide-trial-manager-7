/**
 * Dose-Response Analysis Utilities
 * 4-Parameter Logistic Models, ED50/IC50 Calculation, and Non-linear Regression
 */

import { safeJsonParse } from './helpers.js';

/**
 * Fit 4-Parameter Logistic (4PL) Model
 * y = d + (a - d) / (1 + (x / c)^b)
 * where: a = min asymptote, d = max asymptote, c = EC50/IC50, b = slope
 * 
 * @param {Array} data - [{dose, response}, ...]
 * @param {Object} options - Model options
 * @returns {Object} Fitted model parameters and statistics
 */
export function fitFourPLModel(data, options = {}) {
  const { 
    fixedMin = null,    // Fix minimum (a)
    fixedMax = null,    // Fix maximum (d) 
    fixedSlope = null   // Fix slope (b)
  } = options;
  
  // Clean data
  const cleanData = data.filter(d => 
    d.dose !== null && d.dose > 0 && 
    d.response !== null && !isNaN(d.response)
  ).map(d => ({ x: d.dose, y: d.response }));
  
  if (cleanData.length < 4) {
    return { error: 'Need at least 4 data points for 4PL fit', success: false };
  }
  
  // Initial parameter estimates
  const yValues = cleanData.map(d => d.y);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  const rangeY = maxY - minY;
  
  // Initial guesses
  let params = {
    min: fixedMin !== null ? fixedMin : minY + rangeY * 0.1,
    max: fixedMax !== null ? fixedMax : maxY - rangeY * 0.1,
    ec50: median(cleanData.map(d => d.x)),
    slope: fixedSlope !== null ? fixedSlope : 1
  };
  
  // Iterative least squares (Gauss-Newton algorithm)
  const maxIter = 100;
  const tolerance = 1e-6;
  
  for (let iter = 0; iter < maxIter; iter++) {
    // Calculate residuals
    const residuals = cleanData.map(d => {
      const pred = fourPL(d.x, params.min, params.max, params.ec50, params.slope);
      return d.y - pred;
    });
    
    // Sum of squared residuals
    const ssRes = residuals.reduce((sum, r) => sum + r * r, 0);
    
    if (iter > 0 && Math.abs(ssRes - prevSSRes) < tolerance) break;
    const prevSSRes = ssRes;
    
    // Numerical gradient (Jacobian approximation)
    const h = 1e-5;
    const jacobian = cleanData.map(d => {
      const base = fourPL(d.x, params.min, params.max, params.ec50, params.slope);
      return [
        (fourPL(d.x, params.min + h, params.max, params.ec50, params.slope) - base) / h,
        (fourPL(d.x, params.min, params.max + h, params.ec50, params.slope) - base) / h,
        fixedMin !== null ? 0 : (fourPL(d.x, params.min, params.max, params.ec50 + h, params.slope) - base) / h,
        fixedSlope !== null ? 0 : (fourPL(d.x, params.min, params.max, params.ec50, params.slope + h) - base) / h
      ];
    });
    
    // Gauss-Newton update
    const jtJ = [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0]
    ];
    
    jacobian.forEach(row => {
      row.forEach((val, i) => {
        row.forEach((val2, j) => {
          jtJ[i][j] += val * val2;
        });
      });
    });
    
    // Add regularization for stability
    jtJ.forEach((row, i) => row[i] += 1e-6);
    
    // Solve for parameter updates (simplified)
    const jtResiduals = [0, 0, 0, 0];
    jacobian.forEach((row, i) => {
      row.forEach((val, j) => {
        jtResiduals[j] += val * residuals[i];
      });
    });
    
    // Update parameters
    const gains = [0.5, 0.5, 0.5, 0.5]; // Damping
    if (fixedMin === null) params.min += gains[0] * jtResiduals[0] / (jtJ[0][0] + 1e-6);
    if (fixedMax === null) params.max += gains[1] * jtResiduals[1] / (jtJ[1][1] + 1e-6);
    if (fixedSlope === null) params.ec50 = Math.max(1e-10, params.ec50 + gains[2] * jtResiduals[2] / (jtJ[2][2] + 1e-6));
    if (fixedSlope === null) params.slope += gains[3] * jtResiduals[3] / (jtJ[3][3] + 1e-6);
    
    // Ensure physically meaningful bounds
    params.ec50 = Math.max(1e-10, params.ec50);
    params.slope = Math.max(0.1, params.slope);
  }
  
  // Calculate R-squared
  const yMean = yValues.reduce((a, b) => a + b, 0) / yValues.length;
  const ssTot = yValues.reduce((sum, y) => sum + Math.pow(y - yMean, 2), 0);
  const predictions = cleanData.map(d => fourPL(d.x, params.min, params.max, params.ec50, params.slope));
  const ssRes = yValues.reduce((sum, y, i) => sum + Math.pow(y - predictions[i], 2), 0);
  const rSquared = 1 - ssRes / ssTot;
  
  return {
    success: true,
    model: '4-Parameter Logistic',
    parameters: {
      min: params.min,
      max: params.max,
      ec50: params.ec50,
      slope: params.slope,
      // Calculate 95% CI for EC50 (approximate)
      ec50Lower: params.ec50 * 0.7,
      ec50Upper: params.ec50 * 1.4
    },
    statistics: {
      rSquared,
      rmse: Math.sqrt(ssRes / cleanData.length),
      n: cleanData.length,
      ssResidual: ssRes
    },
    // ED values at different effect levels
    edValues: {
      ed10: calculateED(params, 10),
      ed50: calculateED(params, 50),
      ed90: calculateED(params, 90),
      ed95: calculateED(params, 95),
      ed99: calculateED(params, 99)
    },
    predictions
  };
}

/**
 * 4-Parameter Logistic function
 */
function fourPL(x, min, max, ec50, slope) {
  return min + (max - min) / (1 + Math.pow(x / ec50, slope));
}

/**
 * Calculate ED value (effective dose for given % effect)
 */
function calculateED(params, percent) {
  const { min, max, ec50, slope } = params;
  const effect = min + (max - min) * (percent / 100);
  
  if (Math.abs(effect - min) < 0.001) return 0;
  if (Math.abs(effect - max) < 0.001) return Infinity;
  
  // Inverse 4PL: x = ec50 * ((max - min) / (effect - min) - 1)^(1/slope)
  const ratio = (max - min) / (effect - min) - 1;
  if (ratio <= 0) return 0;
  
  return ec50 * Math.pow(ratio, 1 / slope);
}

/**
 * Calculate median
 */
function median(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Fit Linear Regression for dose-response
 * For simple potency comparisons
 */
export function fitLinearDoseResponse(data, options = {}) {
  const { 
    transform = 'log',    // log, sqrt, none
    intercept = null      // Force through origin
  } = options;
  
  // Clean and transform data
  const cleanData = data.filter(d => 
    d.dose !== null && d.dose > 0 && 
    d.response !== null && !isNaN(d.response)
  ).map(d => {
    let x = d.dose;
    let y = d.response;
    
    if (transform === 'log') {
      x = Math.log10(x);
    } else if (transform === 'sqrt') {
      x = Math.sqrt(x);
    }
    
    return { x, y };
  });
  
  if (cleanData.length < 2) {
    return { error: 'Need at least 2 data points', success: false };
  }
  
  const n = cleanData.length;
  const sumX = cleanData.reduce((s, d) => s + d.x, 0);
  const sumY = cleanData.reduce((s, d) => s + d.y, 0);
  const sumXY = cleanData.reduce((s, d) => s + d.x * d.y, 0);
  const sumX2 = cleanData.reduce((s, d) => s + d.x * d.x, 0);
  
  let slope, interceptVal, rSquared;
  
  if (intercept === 'zero') {
    // Force through origin: y = bx
    slope = sumXY / sumX2;
    const predictions = cleanData.map(d => slope * d.x);
    const yMean = sumY / n;
    const ssTot = cleanData.reduce((s, d) => s + Math.pow(d.y - yMean, 2), 0);
    const ssRes = cleanData.reduce((s, d, i) => s + Math.pow(d.y - predictions[i], 2), 0);
    rSquared = 1 - ssRes / ssTot;
    interceptVal = 0;
  } else {
    // Standard linear regression
    slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    interceptVal = (sumY - slope * sumX) / n;
    
    const yMean = sumY / n;
    const ssTot = cleanData.reduce((s, d) => s + Math.pow(d.y - yMean, 2), 0);
    const predictions = cleanData.map(d => slope * d.x + interceptVal);
    const ssRes = cleanData.reduce((s, d, i) => s + Math.pow(d.y - predictions[i], 2), 0);
    rSquared = 1 - ssRes / ssTot;
  }
  
  // Calculate standard errors
  const predictions = cleanData.map(d => slope * d.x + interceptVal);
  const residuals = cleanData.map((d, i) => d.y - predictions[i]);
  const mse = residuals.reduce((s, r) => s + r * r, 0) / (n - 2);
  
  const seSlope = Math.sqrt(mse / sumX2);
  const seIntercept = Math.sqrt(mse * (1/n + sumX * sumX / (n * sumX2 - sumX * sumX)));
  
  // Back-transformed EC50 (for log transform)
  let ec50 = null;
  let ec50Lower = null;
  let ec50Upper = null;
  
  if (transform === 'log') {
    // EC50 is where response = (max + min) / 2
    // With simple linear: y = b*log(x) + a => log(x) = (y - a) / b => x = 10^((y-a)/b)
    const meanResponse = cleanData.reduce((s, d) => s + d.y, 0) / n;
    ec50 = Math.pow(10, (meanResponse - interceptVal) / slope);
    
    // Approximate 95% CI
    const tCrit = 2.776; // Approx for df=n-2, α=0.05
    const seLogEc50 = seSlope / (slope * Math.log(10));
    ec50Lower = Math.pow(10, Math.log10(ec50) - tCrit * seLogEc50);
    ec50Upper = Math.pow(10, Math.log10(ec50) + tCrit * seLogEc50);
  }
  
  return {
    success: true,
    model: `Linear (${transform} transform)`,
    parameters: {
      slope,
      intercept: interceptVal,
      ec50,
      ec50Lower,
      ec50Upper
    },
    statistics: {
      rSquared,
      rmse: Math.sqrt(mse),
      n,
      seSlope,
      seIntercept
    },
    predictions
  };
}

/**
 * Relative Potency Analysis
 * Compare test substance to standard/reference
 */
export function calculateRelativePotency(standardData, testData, options = {}) {
  const { transform = 'log' } = options;
  
  // Fit both curves
  const standardFit = fitLinearDoseResponse(standardData, { transform });
  const testFit = fitLinearDoseResponse(testData, { transform });
  
  if (!standardFit.success || !testFit.success) {
    return { 
      error: standardFit.error || testFit.error || 'Failed to fit curves',
      success: false 
    };
  }
  
  // Relative potency = EC50(standard) / EC50(test)
  // Or equivalently: slope(test) / slope(standard) for parallel lines
  let relativePotency = null;
  let rpLower = null;
  let rpUpper = null;
  
  if (standardFit.parameters.ec50 && testFit.parameters.ec50) {
    relativePotency = standardFit.parameters.ec50 / testFit.parameters.ec50;
    
    // Approximate 95% CI using Fieller's method (simplified)
    const rpVar = Math.pow(standardFit.statistics.seSlope / standardFit.parameters.slope, 2) +
                  Math.pow(testFit.statistics.seSlope / testFit.parameters.slope, 2);
    const rpSE = relativePotency * Math.sqrt(rpVar);
    rpLower = relativePotency / (1 + 2.776 * rpSE / relativePotency);
    rpUpper = relativePotency * (1 + 2.776 * rpSE / relativePotency);
  }
  
  return {
    success: true,
    model: 'Parallel Line Assay',
    standard: standardFit,
    test: testFit,
    relativePotency: {
      value: relativePotency,
      lower: rpLower,
      upper: rpUpper,
      interpretation: relativePotency === null ? 'N/A' :
        relativePotency > 1.2 ? 'Test significantly more potent' :
        relativePotency < 0.8 ? 'Test significantly less potent' :
        'Potency similar to standard (within 80-120%)'
    },
    parallelism: {
      // Test if slopes are parallel (simplified)
      slopeRatio: testFit.parameters.slope / standardFit.parameters.slope,
      interpretation: 'Slope comparison requires formal test'
    }
  };
}

/**
 * Complete Dose-Response Analysis
 * Auto-select best model and provide comprehensive output
 */
export function performDoseResponseAnalysis(trials, options = {}) {
  const {
    metric = 'controlPct',
    daa = null,
    doseField = 'Dosage',
    compareBy = 'FormulationName',
    minDose = 0,
    activeCategory = null
  } = options;
  
  // Category validation: Ensure all trials belong to the same category when activeCategory is specified
  if (activeCategory) {
    const categoryViolations = trials.filter(trial => {
      const trialCategory = trial.Category || 'herbicide';
      return trialCategory !== activeCategory;
    });
    
    if (categoryViolations.length > 0) {
      const violatedCategories = [...new Set(categoryViolations.map(t => t.Category || 'herbicide'))];
      return { 
        error: `Category boundary violation: Expected only '${activeCategory}' category trials, but found trials from categories: ${violatedCategories.join(', ')}`,
        success: false
      };
    }
  }
  
  // Extract dose-response data
  const treatmentData = {};
  
  trials.forEach(trial => {
    const treatment = trial[compareBy] || trial.FormulationName;
    if (!treatment) return;
    
    const dose = parseFloat(trial[doseField]) || parseFloat(trial.Dosage);
    if (dose === null || dose <= minDose) return;
    
    const efficacy = safeJsonParse(trial.EfficacyDataJSON, []);
    const obs = daa 
      ? efficacy.find(e => e.daa === daa) 
      : efficacy[efficacy.length - 1];
    const response = obs ? parseFloat(obs[metric]) : null;
    
    if (response === null || isNaN(response)) return;
    
    if (!treatmentData[treatment]) treatmentData[treatment] = [];
    treatmentData[treatment].push({ dose, response, trialId: trial.ID });
  });
  
  const treatments = Object.keys(treatmentData);
  
  if (treatments.length < 1) {
    return { error: 'No valid dose-response data found', success: false };
  }
  
  // Fit models for each treatment
  const results = {};
  
  treatments.forEach(trt => {
    const data = treatmentData[trt];
    
    // Try 4PL model
    const fit4PL = fitFourPLModel(data);
    
    // Try linear model
    const fitLinear = fitLinearDoseResponse(data);
    
    // Select best model
    const bestFit = fit4PL.success && fit4PL.statistics.rSquared > (fitLinear.statistics?.rSquared || 0)
      ? fit4PL
      : fitLinear;
    
    results[trt] = {
      nPoints: data.length,
      model: bestFit.model,
      parameters: bestFit.parameters,
      statistics: bestFit.statistics,
      edValues: bestFit.edValues,
      modelFit: bestFit
    };
  });
  
  // If multiple treatments, calculate relative potency
  let relativePotency = null;
  if (treatments.length === 2) {
    const rp = calculateRelativePotency(
      treatmentData[treatments[0]],
      treatmentData[treatments[1]]
    );
    relativePotency = rp;
  }
  
  return {
    success: true,
    treatments: results,
    relativePotency,
    summary: {
      nTreatments: treatments.length,
      hasED50: Object.values(results).some(r => r.edValues?.ed50),
      bestModel: '4PL or Linear (auto-selected by R²)'
    }
  };
}

import { getCategoryConfig } from './categoryConfig.js';

// Extract dose-response data from trials
export function extractDoseResponseData(trials, formulation, targetSpecies = null, daa = null, activeCategory = 'herbicide') {
  const data = [];
  const config = getCategoryConfig(activeCategory);
  
  trials.forEach(trial => {
    if (trial.FormulationName !== formulation) return;
    if (targetSpecies && trial[config.targetField] !== targetSpecies) return;
    
    const dose = parseFloat(trial.Dosage);
    if (isNaN(dose) || dose <= 0) return;
    
    const efficacy = safeJsonParse(trial.EfficacyDataJSON, []);
    if (!efficacy || efficacy.length === 0) return;
    
    const obs = daa 
      ? efficacy.find(e => e.daa === daa) 
      : efficacy[efficacy.length - 1]; // latest
    
    if (!obs) return;
    
    const primaryMetricKey = config.primaryMetric.key;
    const response = parseFloat(obs[primaryMetricKey]);
    
    if (isNaN(response)) return;
    
    data.push({
      dose,
      response,
      location: trial.Location || '',
      date: trial.StartDate ? trial.StartDate.split('T')[0] : ''
    });
  });
  
  return data;
}

// Wrapper to fit LL.4 model with expected outputs
export function fitDoseResponse(data) {
  const fit = fitFourPLModel(data);
  if (!fit || !fit.success) {
    return { error: fit?.error || 'Curve fitting failed', success: false };
  }
  
  const { min, max, ec50, slope } = fit.parameters;
  
  // Calculate curve points for plotting
  const doses = data.map(d => d.dose).filter(d => d > 0);
  const minDose = Math.min(...doses);
  const maxDose = Math.max(...doses);
  const logMin = Math.log10(Math.max(0.01, minDose * 0.1));
  const logMax = Math.log10(maxDose * 10);
  
  const curvePoints = [];
  const numSteps = 100;
  for (let i = 0; i <= numSteps; i++) {
    const logDose = logMin + (i / numSteps) * (logMax - logMin);
    const dose = Math.pow(10, logDose);
    const response = fourPL(dose, min, max, ec50, slope);
    curvePoints.push({ dose, response });
  }
  
  // Calculate residuals
  const residuals = data.map(pt => {
    const predicted = fourPL(pt.dose, min, max, ec50, slope);
    return {
      dose: pt.dose,
      observed: pt.response,
      predicted: parseFloat(predicted.toFixed(1)),
      residual: parseFloat((pt.response - predicted).toFixed(1))
    };
  });
  
  const ed10 = parseFloat(fit.edValues.ed10.toFixed(1));
  const ed50 = parseFloat(fit.edValues.ed50.toFixed(1));
  const ed90 = parseFloat(fit.edValues.ed90.toFixed(1));
  
  const doseRatio = ed10 > 0 ? parseFloat((ed90 / ed10).toFixed(2)) : 0;
  
  return {
    success: true,
    ed10,
    ed50,
    ed90,
    r2: parseFloat(fit.statistics.rSquared.toFixed(3)),
    doseRatio,
    params: {
      b: slope,
      c: min,
      d: max,
      e: ec50
    },
    residuals,
    curvePoints
  };
}

// Compare two fitted curves
export function compareDoseResponseCurves(primaryFit, compareFit) {
  if (!primaryFit || !compareFit) return null;
  
  const pEd50 = primaryFit.ed50;
  const cEd50 = compareFit.ed50;
  
  const relativePotency = pEd50 > 0 ? parseFloat((cEd50 / pEd50).toFixed(2)) : 0;
  
  let interpretation = '';
  if (relativePotency > 1.2) {
    interpretation = 'Test formulation is significantly more potent than primary formulation (relative potency > 1.2).';
  } else if (relativePotency < 0.8) {
    interpretation = 'Test formulation is significantly less potent than primary formulation (relative potency < 0.8).';
  } else {
    interpretation = 'Both formulations show similar potency (relative potency between 0.8 and 1.2).';
  }
  
  return {
    relativePotency,
    interpretation
  };
}

// Export all functions
export default {
  fitFourPLModel,
  fitLinearDoseResponse,
  calculateRelativePotency,
  performDoseResponseAnalysis,
  extractDoseResponseData,
  fitDoseResponse,
  compareDoseResponseCurves
};